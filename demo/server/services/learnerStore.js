// Loads and saves each user's learning state: { profile, reviews, rankings, decisions }.
//   memoryLearnerStore - no database; kept in this process, lost on restart
//   dbLearnerStore     - Postgres (taste schema); survives restarts
// Same interface for both:
//   read(userId, name)            a copy of the user's state (a new user gets starter(name))
//   update(userId, name, change)  runs change(state) -> { result, review?, tasteVector?, undone?, decided? },
//                                 saves the state, returns result (undone = the latest
//                                 review was just undone; decided = new trend decisions)
//   reset(userId)                 forgets everything the user taught the AI
// And across users, newest first, each row { userId, ...review }. These leave out undone
// reviews, reviews with no verdict and profileBefore, which is private:
//   recentReviewsAt(venueIds, since)            since an ISO time; venueIds null = every venue
//   reviewsAtVenue(venueId, limit)
//   reviewsByPeople(userIds, { limit, since })  since optional
//   peopleFacts(userIds)                        Map of user id -> { profile, reviewCount }
// Updates for one user run one at a time, so two quick reviews can't overwrite
// each other's profile changes.
import { createState } from '../learn.js'
import { rankingRepository } from '../repositories/rankingRepository.js'
import { reviewRepository } from '../repositories/reviewRepository.js'
import { tasteProfileHistoryRepository } from '../repositories/tasteProfileHistoryRepository.js'
import { tasteProfileRepository } from '../repositories/tasteProfileRepository.js'
import { trendDecisionRepository } from '../repositories/trendDecisionRepository.js'

const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

function profileChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after)
}

function recordMemorySnapshot(history, userId, profile, recordedAt = new Date()) {
  const snapshots = history.get(userId) ?? new Map()
  const snapshotDate = recordedAt.toISOString().slice(0, 10)
  snapshots.set(snapshotDate, { profile: structuredClone(profile), recordedAt })
  const cutoff = recordedAt.getTime() - HISTORY_WINDOW_MS
  for (const [date, snapshot] of snapshots) {
    if (snapshot.recordedAt.getTime() < cutoff) snapshots.delete(date)
  }
  history.set(userId, snapshots)
}

export function memoryLearnerStore({ starter }) {
  const states = new Map()
  const histories = new Map()
  const oneAtATime = perUserQueue()
  const current = (userId, name) => states.get(userId) ?? createState(starter(name))
  // Every shareable review, newest first; of two at the same moment, the later-written first.
  const shared = () =>
    [...states]
      .flatMap(([userId, state]) =>
        state.reviews
          .filter((r) => !r.undone && r.sentiment)
          .map(({ profileBefore, ...review }) => ({ userId, ...structuredClone(review) })))
      .reverse()
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  return {
    kind: 'memory',
    async recentReviewsAt(venueIds, since) {
      return shared().filter((r) => (!venueIds || venueIds.includes(r.venueId)) && Date.parse(r.at) >= Date.parse(since))
    },
    async reviewsAtVenue(venueId, limit) {
      return shared().filter((r) => r.venueId === venueId).slice(0, limit)
    },
    async reviewsByPeople(userIds, { limit, since = null }) {
      return shared()
        .filter((r) => userIds.includes(r.userId) && (!since || Date.parse(r.at) >= Date.parse(since)))
        .slice(0, limit)
    },
    async peopleFacts(userIds) {
      return new Map(userIds.filter((id) => states.has(id)).map((id) => {
        const { profile, reviews } = states.get(id)
        return [id, { profile: structuredClone(profile), reviewCount: reviews.filter((r) => !r.undone).length }]
      }))
    },
    async read(userId, name) {
      return structuredClone(current(userId, name))
    },
    update(userId, name, change) {
      return oneAtATime(userId, async () => {
        const state = structuredClone(current(userId, name))
        const previousProfile = structuredClone(state.profile)
        const { result } = await change(state)
        states.set(userId, state)
        if (profileChanged(previousProfile, state.profile)) {
          recordMemorySnapshot(histories, userId, state.profile)
        }
        return result
      })
    },
    async history(userId) {
      const cutoff = Date.now() - HISTORY_WINDOW_MS
      return [...(histories.get(userId)?.values() ?? [])]
        .filter((snapshot) => snapshot.recordedAt.getTime() >= cutoff)
        .sort((a, b) => a.recordedAt - b.recordedAt)
        .map((snapshot) => structuredClone(snapshot))
    },
    async reset(userId) {
      await oneAtATime(userId, async () => {
        states.delete(userId)
        histories.delete(userId)
      })
    },
  }
}

export function dbLearnerStore({ db, starter }) {
  const oneAtATime = perUserQueue()
  async function read(userId, name) {
    const [profile, reviews, rankings, decisions] = await Promise.all([
      tasteProfileRepository(db).get(userId),
      reviewRepository(db).listForUser(userId),
      rankingRepository(db).get(userId),
      trendDecisionRepository(db).list(userId),
    ])
    return { profile: profile ?? starter(name), reviews, rankings, decisions }
  }
  async function history(userId) {
    return tasteProfileHistoryRepository(db).listRecent(userId)
  }
  return {
    kind: 'postgres',
    read,
    history,
    recentReviewsAt: (venueIds, since) => reviewRepository(db).listRecentAtVenues(venueIds, since),
    reviewsAtVenue: (venueId, limit) => reviewRepository(db).listAtVenue(venueId, limit),
    reviewsByPeople: (userIds, options) => reviewRepository(db).listByUsers(userIds, options),
    async peopleFacts(userIds) {
      const [profiles, counts] = await Promise.all([
        tasteProfileRepository(db).getMany(userIds),
        reviewRepository(db).countByUsers(userIds),
      ])
      return new Map([...profiles].map(([id, profile]) => [id, { profile, reviewCount: counts.get(id) ?? 0 }]))
    },
    update(userId, name, change) {
      return oneAtATime(userId, async () => {
        const state = await read(userId, name)
        const previousProfile = structuredClone(state.profile)
        const { result, review, tasteVector, undone, decided } = await change(state)
        await db.tx(async (tx) => {
          await tasteProfileRepository(tx).save(userId, state.profile)
          await rankingRepository(tx).replace(userId, state.rankings)
          if (review) await reviewRepository(tx).insert(userId, review)
          if (undone) await reviewRepository(tx).markLatestUndone(userId)
          if (decided?.length) await trendDecisionRepository(tx).insert(userId, decided)
          if (tasteVector !== undefined) await tasteProfileRepository(tx).saveVector(userId, tasteVector)
          if (profileChanged(previousProfile, state.profile)) {
            await tasteProfileHistoryRepository(tx).saveSnapshot(userId, state.profile)
          }
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
          await tasteProfileHistoryRepository(tx).deleteForUser(userId)
          await trendDecisionRepository(tx).deleteForUser(userId)
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
