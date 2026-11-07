// "Which was better?": a binary search for where a new dish sits in your ranking,
// asking at most three questions. Each answer keeps the state it came from as
// `previous`, so going back is just stepping to it. insertIndex is set once the
// questions are over.
const MAX_QUESTIONS = 3

export const startDuel = (opponents) => ({
  opponents,
  lo: 0,
  hi: opponents.length,
  count: 0,
  pairs: [],
  previous: null,
  insertIndex: null,
})

const midpoint = ({ lo, hi }) => Math.floor((lo + hi) / 2)

export const currentOpponent = (duel) => duel.opponents[midpoint(duel)]

// answer: 'won' or 'lost' for the new dish, or 'tie' for too close to call.
export function answerDuel(duel, dishId, answer) {
  const mid = midpoint(duel)
  if (answer === 'tie') return { ...duel, previous: duel, insertIndex: mid }

  const won = answer === 'won'
  const opponentId = duel.opponents[mid].dishId
  const pairs = [...duel.pairs, won ? { winnerId: dishId, loserId: opponentId } : { winnerId: opponentId, loserId: dishId }]
  const lo = won ? duel.lo : mid + 1
  const hi = won ? mid : duel.hi
  const count = duel.count + 1
  if (lo >= hi || count >= MAX_QUESTIONS) return { ...duel, pairs, previous: duel, insertIndex: lo }
  return { ...duel, lo, hi, count, pairs, previous: duel }
}
