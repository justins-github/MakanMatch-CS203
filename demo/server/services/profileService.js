// The Taste DNA view: the six dimensions the AI has learned for one user, which
// of them have been moving steadily lately (trends.js), and "Claude's take" on
// those trends with an offer to lean into them (suggestion.js, tasteSummary.js).
import { badRequest, conflict, forbidden } from '../errors.js'
import { getAccuracy, starterProfile } from '../learn.js'
import { applySuggestion, suggestionFor } from '../suggestion.js'
import { applyDials, dialsOf, venuesPerCuisine } from '../tasteDials.js'
import { createSummaryWriter } from '../tasteSummary.js'
import { findTrends } from '../trends.js'

export function dimensionsFor(profile) {
  const affinities = Object.values(profile.cuisineAffinity)
  const breadth = affinities.length ? affinities.reduce((a, b) => a + b, 0) / affinities.length : 0
  return [
    { key: 'cuisine', label: 'Cuisine breadth', value: Number(breadth.toFixed(2)) },
    { key: 'price', label: 'Price comfort', value: Number((profile.priceComfort / 2).toFixed(2)) },
    { key: 'spice', label: 'Spice', value: Number(profile.spicePref.toFixed(2)) },
    { key: 'richness', label: 'Richness', value: Number(profile.richnessPref.toFixed(2)) },
    { key: 'location', label: 'Willing to travel', value: 0.45 },
    { key: 'adventurousness', label: 'Adventurousness', value: Number(profile.adventurousness.toFixed(2)) },
  ]
}

// A taste set by hand (Taste DNA sliders) jumped in one step, so it isn't a trend: none
// until a review hands the taste back to learning.
const trendsOf = (state) => (state.profile.setByHand ? [] : findTrends(state.reviews, state.profile))
const currentSuggestion = (state) => suggestionFor(trendsOf(state), state.decisions ?? [])

// Setting your taste by hand is for admins, and not while viewing as someone else.
function assertAdmin(user) {
  if (user.me.effectiveRole !== 'ADMIN') throw forbidden('Setting your taste by hand is for admins')
}

export function createProfileService({ learners, summaries = createSummaryWriter({ ai: null }), registry = { venues: [] } }) {
  let venueCounts = null
  const countsOf = () => (venueCounts ??= venuesPerCuisine(registry.venues))
  // `${userId}|${signature}` -> Promise<{ summary, writtenBy }>: one Claude call per
  // suggestion, shared by visits that overlap. Only the user's current suggestion is
  // kept, and a template (Claude didn't answer) isn't, so the next visit tries again.
  const written = new Map()
  function summaryFor(userId, suggestion) {
    const key = `${userId}|${suggestion.signature}`
    if (!written.has(key)) {
      for (const old of written.keys()) if (old.startsWith(`${userId}|`)) written.delete(old)
      const pending = summaries.write(suggestion)
      written.set(key, pending)
      pending.then((w) => w.writtenBy === 'ai' || written.delete(key), () => written.delete(key))
    }
    return written.get(key)
  }

  // Accept or dismiss, under the user's lock, only if the suggestion they saw is still current.
  async function decide(user, body, decision) {
    const { signature } = body ?? {}
    if (typeof signature !== 'string') throw badRequest('signature is required')
    return learners.update(user.id, user.me.displayName, async (state) => {
      const suggestion = currentSuggestion(state)
      if (suggestion?.signature !== signature) throw conflict('That suggestion has changed - reload your Taste DNA')
      const applied = decision === 'accepted' ? applySuggestion(state.profile, suggestion) : []
      const decided = suggestion.changes.map(({ key, direction }) => ({ key, direction, decision }))
      state.decisions = [...(state.decisions ?? []), ...decided]
      return { result: { decision, applied, profile: state.profile }, decided }
    })
  }

  return {
    async tasteDna(user) {
      const [state, history] = await Promise.all([
        learners.read(user.id, user.me.displayName),
        learners.history(user.id),
      ])
      const { setByHand, ...learned } = state.profile
      const profile = { ...learned, name: user.me.displayName }
      return {
        user: profile,
        setByHand: Boolean(setByHand),
        dimensions: dimensionsFor(profile),
        history: history.map(({ profile: snapshot, recordedAt }) => ({
          recordedAt: new Date(recordedAt).toISOString(),
          dimensions: dimensionsFor(snapshot),
        })),
        trends: trendsOf(state),
        accuracy: getAccuracy(state),
      }
    },

    // Kept apart from tasteDna so the page doesn't wait for Claude.
    async suggestion(user) {
      const suggestion = currentSuggestion(await learners.read(user.id, user.me.displayName))
      if (!suggestion) return { suggestion: null }
      const changes = suggestion.changes.map(({ key, label, step }) => ({ key, label, step }))
      return { suggestion: { signature: suggestion.signature, changes, ...(await summaryFor(user.id, suggestion)) } }
    },

    acceptSuggestion: (user, body) => decide(user, body, 'accepted'),
    dismissSuggestion: (user, body) => decide(user, body, 'dismissed'),

    // The sliders: your taste now, and `starter` - a brand-new account's - for the
    // editor's "Reset to a new account".
    async dials(user) {
      assertAdmin(user)
      const { profile } = await learners.read(user.id, user.me.displayName)
      const { setByHand, ...starter } = dialsOf(starterProfile(user.me.displayName), countsOf())
      return { ...dialsOf(profile, countsOf()), starter }
    },

    // Saves the sliders into your real taste: { dials: { spicePref, richnessPref,
    // priceComfort, adventurousness, cuisineAffinity } }, any of them. It's marked set by
    // hand, so Find takes the embedding from the sliders until your next review.
    async tune(user, body) {
      assertAdmin(user)
      const { dials } = body ?? {}
      if (dials == null) throw badRequest('Send the sliders to save')
      return learners.update(user.id, user.me.displayName, async (state) => {
        state.profile = { ...applyDials(state.profile, dials), setByHand: true }
        return { result: dialsOf(state.profile, countsOf()) }
      })
    },
  }
}
