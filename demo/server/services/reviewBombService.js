// Admins' review bomb for the Week 13 demo (the bomb itself is reviewBomb.js): three demo
// accounts pan one dish at a chosen place through the normal review path - Claude reads
// each one - and Undo takes them back. One place at a time. The engine signs in as those three seeded accounts
// with SEED_PERSONA_PASSWORD, and never as anyone else.
import { badRequest, conflict, forbidden, notFound, unavailable } from '../errors.js'
import { REVIEW_BOMB, bombDish, standingBomb } from '../reviewBomb.js'

const SET_UP = 'Set SEED_PERSONA_PASSWORD in .env, then run npm run seed:personas and npm run seed:review-bomb -- --prepare.'
// account-service allows 10 sign-ins per username per 5 minutes, and the Demo panel asks
// for the status on every page load: a sign-in that failed waits this long to be retried.
const RETRY_MS = 60_000

function assertAdmin(user) {
  if (user.me.effectiveRole !== 'ADMIN') throw forbidden('The review bomb is for admins')
}

export function createReviewBombService({ accounts, reviews, learners, registry, password, bomb = REVIEW_BOMB, now = Date.now }) {
  const signedIn = new Map() // username -> { id, me }, once a sign-in has worked
  const failed = new Map() // username -> { error, until }
  let running = false

  async function signIn(username) {
    if (!password) throw unavailable(`The review bomb isn't set up. ${SET_UP}`)
    const token = await accounts.signIn(username, password)
    const me = token ? await accounts.me(token) : null
    if (!me) throw unavailable(`Couldn't sign in as @${username}. ${SET_UP}`)
    return { id: me.id, me }
  }

  async function demoAccount(username) {
    if (signedIn.has(username)) return signedIn.get(username)
    const miss = failed.get(username)
    if (miss && miss.until > now()) throw miss.error
    try {
      const user = await signIn(username)
      signedIn.set(username, user)
      failed.delete(username)
      return user
    } catch (error) {
      if (error.status === 503) failed.set(username, { error, until: now() + RETRY_MS })
      throw error
    }
  }

  // Each bomber, with their bomb review if it still counts: their latest of the dish, not
  // undone. They sign in one at a time, so the first that can't stops the rest trying.
  async function bombers() {
    const users = []
    for (const { username } of bomb.bombers) users.push(await demoAccount(username))
    // A bomb review is the bomber's own line. Any that isn't undone counts in Find, so the
    // newest such one is standing, even under an undone one (it then can't be undone).
    return Promise.all(bomb.bombers.map(async ({ text }, i) => {
      const user = users[i]
      const { reviews: theirs } = await learners.read(user.id, user.me.displayName)
      return { user, text, standing: standingBomb(theirs, text) }
    }))
  }

  // Where the bomb stands now, from the reviews themselves.
  function about(list) {
    const standing = list.map((b) => b.standing).find(Boolean)
    return {
      posted: list.filter((b) => b.standing).length,
      of: bomb.bombers.length,
      venueId: standing?.venueId ?? null,
      venueName: standing ? registry.venueById.get(standing.venueId)?.name ?? standing.venueId : null,
      dishName: standing?.dishName ?? null,
    }
  }

  async function status() {
    try {
      return { ready: true, ...about(await bombers()) }
    } catch (err) {
      if (err.status !== 503) throw err
      return { ready: false, ...about([]), why: err.message }
    }
  }

  // The dish to pan at a venue (reviewBomb.js bombDish, which the CLI uses too).
  async function dishAt(venueId, asBomber) {
    const { dishes } = await reviews.venueDishes(asBomber, venueId)
    const dish = bombDish(dishes, venueId, bomb.dishes ?? {})
    if (!dish) throw badRequest(`${registry.venueById.get(venueId).name} has no dishes on record to review`)
    return dish
  }

  // Takes back these standing bomb reviews; a bomber who has reviewed past theirs can't
  // be undone (undo is for someone's latest review), and the admin is told whose.
  async function takeBack(standing) {
    const stuck = []
    await Promise.all(standing.map(async ({ user: bomber, standing: review }) => {
      try {
        await reviews.undoLatest(bomber, { dishId: review.dishId, at: review.at })
      } catch (err) {
        if (err.status !== 409) throw err
        stuck.push(bomber.me.displayName)
      }
    }))
    if (stuck.length) throw conflict(`Couldn't take back ${stuck.join(' and ')}'s review: they've reviewed something since`)
  }

  // One drop or undo at a time, so a double tap can't post twice.
  async function exclusively(work) {
    if (running) throw conflict('The review bomb is already on its way - give it a moment')
    running = true
    try {
      return await work()
    } finally {
      running = false
    }
  }

  return {
    // { ready, posted, of, venueId, venueName, dishName, why? (when not ready) }
    async status(user) {
      assertAdmin(user)
      return status()
    },

    // Drops it on { venueId } (Turk's Kebab when none): every bomber whose review there
    // isn't standing pans the same dish, all at once. Standing somewhere else, it moves:
    // those reviews are taken back first. Then the status.
    async drop(user, { venueId = bomb.venueId } = {}) {
      assertAdmin(user)
      if (!registry.venueById.has(venueId)) throw notFound('No such venue')
      return exclusively(async () => {
        let list = await bombers()
        const elsewhere = list.filter((b) => b.standing && b.standing.venueId !== venueId)
        if (elsewhere.length) {
          await takeBack(elsewhere)
          list = await bombers()
        }
        const toPost = list.filter((b) => !b.standing)
        if (toPost.length) {
          const dish = await dishAt(venueId, toPost[0].user)
          await Promise.all(toPost.map(async ({ user: bomber, text }) => {
            const insertIndex = (await reviews.rankings(bomber)).length // at the bottom: they hated it
            await reviews.submitBeli(bomber, { dishId: dish.id, sentiment: 'disliked', insertIndex, duels: [], text })
          }))
        }
        return status()
      })
    },

    // Takes back every standing bomb review.
    async undo(user) {
      assertAdmin(user)
      return exclusively(async () => {
        await takeBack((await bombers()).filter((b) => b.standing))
        return status()
      })
    },
  }
}
