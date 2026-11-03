// The Taste DNA view: the six dimensions the AI has learned for one user, which
// of them have been moving steadily lately (trends.js), and "Claude's take" on
// those trends with an offer to lean into them (suggestion.js, tasteSummary.js).
import { badRequest, conflict } from '../errors.js'
import { getAccuracy } from '../learn.js'
import { applySuggestion, suggestionFor } from '../suggestion.js'
import { createSummaryWriter } from '../tasteSummary.js'
import { findTrends } from '../trends.js'

function dimensionsFor(profile) {
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

const currentSuggestion = (state) => suggestionFor(findTrends(state.reviews, state.profile), state.decisions ?? [])

export function createProfileService({ learners, summaries = createSummaryWriter({ ai: null }) }) {
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
      const profile = { ...state.profile, name: user.me.displayName }
      return {
        user: profile,
        dimensions: dimensionsFor(profile),
        history: history.map(({ profile: snapshot, recordedAt }) => ({
          recordedAt: new Date(recordedAt).toISOString(),
          dimensions: dimensionsFor(snapshot),
        })),
        trends: findTrends(state.reviews, state.profile),
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
  }
}
