// Loads and saves each user's learning state: { profile, reviews, rankings }.
//   memoryLearnerStore - no database; kept in this process, lost on restart
//   dbLearnerStore     - Postgres (taste schema); survives restarts
// Same interface for both:
//   read(userId, name)            a copy of the user's state (a new user gets starter(name))
//   update(userId, name, change)  runs change(state) -> { result, review?, tasteVector? },
//                                 saves the state, returns result
//   reset(userId)                 forgets everything the user taught the AI
// Updates for one user run one at a time, so two quick reviews can't overwrite
// each other's profile changes.
import { createState } from '../learn.js'
import { rankingRepository } from '../repositories/rankingRepository.js'
import { reviewRepository } from '../repositories/reviewRepository.js'
import { tasteProfileRepository } from '../repositories/tasteProfileRepository.js'

export function memoryLearnerStore({ starter }) {
  const states = new Map()
  const oneAtATime = perUserQueue()
  const current = (userId, name) => states.get(userId) ?? createState(starter(name))
  return {
    kind: 'memory',
    async read(userId, name) {
      return structuredClone(current(userId, name))
    },
    update(userId, name, change) {
      return oneAtATime(userId, async () => {
        const state = structuredClone(current(userId, name))
        const { result } = await change(state)
        states.set(userId, state)
        return result
      })
    },
    async reset(userId) {
      await oneAtATime(userId, async () => states.delete(userId))
    },
  }
}

export function dbLearnerStore({ db, starter }) {
  const oneAtATime = perUserQueue()
  async function read(userId, name) {
    const [profile, reviews, rankings] = await Promise.all([
      tasteProfileRepository(db).get(userId),
      reviewRepository(db).listForUser(userId),
      rankingRepository(db).get(userId),
    ])
    return { profile: profile ?? starter(name), reviews, rankings }
  }
  return {
    kind: 'postgres',
    read,
    update(userId, name, change) {
      return oneAtATime(userId, async () => {
        const state = await read(userId, name)
        const { result, review, tasteVector } = await change(state)
        await db.tx(async (tx) => {
          await tasteProfileRepository(tx).save(userId, state.profile)
          await rankingRepository(tx).replace(userId, state.rankings)
          if (review) await reviewRepository(tx).insert(userId, review)
          if (tasteVector !== undefined) await tasteProfileRepository(tx).saveVector(userId, tasteVector)
        })
        return result
      })
    },
    async reset(userId) {
      await oneAtATime(userId, () =>
        db.tx(async (tx) => {
          await reviewRepository(tx).deleteForUser(userId)
          await rankingRepository(tx).deleteForUser(userId)
          await tasteProfileRepository(tx).deleteForUser(userId)
        }),
      )
    },
  }
}

// Chains work per key so it runs sequentially; different keys run in parallel.
function perUserQueue() {
  const tails = new Map()
  return (key, work) => {
    const run = (tails.get(key) ?? Promise.resolve()).then(work, work)
    const tail = run.catch(() => {})
    tails.set(key, tail)
    tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key)
    })
    return run
  }
}
