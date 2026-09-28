// The Taste DNA view: the six dimensions the AI has learned for one user.
import { getAccuracy } from '../learn.js'

export function createProfileService({ learners }) {
  return {
    async tasteDna(user) {
      const state = await learners.read(user.id, user.me.displayName)
      const profile = { ...state.profile, name: user.me.displayName }
      const affinities = Object.values(profile.cuisineAffinity)
      const breadth = affinities.length ? affinities.reduce((a, b) => a + b, 0) / affinities.length : 0
      return {
        user: profile,
        dimensions: [
          { key: 'cuisine', label: 'Cuisine breadth', value: Number(breadth.toFixed(2)) },
          { key: 'price', label: 'Price comfort', value: Number((profile.priceComfort / 2).toFixed(2)) },
          { key: 'spice', label: 'Spice', value: Number(profile.spicePref.toFixed(2)) },
          { key: 'richness', label: 'Richness', value: Number(profile.richnessPref.toFixed(2)) },
          { key: 'location', label: 'Willing to travel', value: 0.45 },
          { key: 'adventurousness', label: 'Adventurousness', value: Number(profile.adventurousness.toFixed(2)) },
        ],
        accuracy: getAccuracy(state),
      }
    },
  }
}
