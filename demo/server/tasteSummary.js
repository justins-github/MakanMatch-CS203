// "Claude's take" (CSD-56): one or two sentences summing up a user's recent trends
// and offering to lean into them. Claude sees only the trend lines; without it (no
// key, no answer, an unusable answer) the template in suggestion.js says the same
// thing plainly. write() never throws.
import { templateSummary } from './suggestion.js'

const MAX_LENGTH = 300
const MAX_WORDS = 45 // asked for under 35; anything far over didn't follow the brief

const SYSTEM = `You write a short, friendly note for a Singapore food app about how one diner's taste has been changing lately.

Use only the trend lines you are given: don't mention dishes, places or anything else they don't say, and don't use numbers (the app already shows them). Write one or two short sentences in second person ("you"), under 35 words in all: sum up the trends, then ask whether they'd like their matches to lean that way a bit more. Plain, warm words; no emoji.`

const SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary'],
  additionalProperties: false,
}

// Words only: the numbers are on screen already, and Claude tended to recite them.
const line = (c) => `${c.headline} (over the last ${c.reviews} reviews)`

export function createSummaryWriter({ ai }) {
  return {
    async write(suggestion) {
      const template = { summary: templateSummary(suggestion), writtenBy: 'template' }
      if (!ai?.available) return template
      const answer = await ai.json({ system: SYSTEM, prompt: suggestion.changes.map(line).join('\n'), schema: SCHEMA, maxTokens: 1024 })
      const summary = typeof answer?.summary === 'string' ? answer.summary.trim() : ''
      const followedBrief = summary && summary.length <= MAX_LENGTH && summary.split(/\s+/).length <= MAX_WORDS && !/\d/.test(summary)
      if (!followedBrief) return template
      return { summary, writtenBy: 'ai' }
    },
  }
}
