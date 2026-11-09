// Lexicon of taste signals in review text: the fallback reader when Claude is off
// (reviewReader.js), and how reviews saved before AI reading count as evidence.

export const SIGNALS = [
  {
    id: 'spice-love',
    label: 'loving the spice',
    dim: 'spice',
    dir: 1,
    re: /(love|loving|enjoy|crave|amazing|perfect|great|good)[^.!?\n]{0,30}(spice|spicy|spici|heat|chilli|chili|sambal)|(spice|spicy|heat)[^.!?\n]{0,20}(is|was)[^.!?\n]{0,15}(amazing|perfect|great|shiok)/i,
  },
  {
    id: 'spice-too-much',
    label: 'it being too spicy',
    dim: 'spice',
    dir: -1,
    re: /(too|way too|overly)[^.!?\n]{0,12}(spicy|hot)|can'?t (handle|take)[^.!?\n]{0,20}(spice|heat)/i,
  },
  {
    id: 'spice-intense',
    label: 'it being too spicy',
    dim: 'spice',
    dir: -1,
    // Not after "not"/"n't": "not very spicy" says it was milder.
    re: /(?<!(?:\bnot|n't)\s)\b(super|very|so|crazy|insanely|extremely)\s+(spicy|hot)\b/i,
    // "Super spicy" alone doesn't say whether that was good: the verdict decides.
    onlyIf: (sentiment) => sentiment === 'fine' || sentiment === 'disliked',
  },
  {
    id: 'too-rich',
    label: 'it being oily or heavy',
    dim: 'richness',
    dir: -1,
    re: /\b(oily|greasy|jelak|too heavy|too rich|cloying)\b/i,
  },
  {
    id: 'love-light',
    label: 'loving light, fresh food',
    dim: 'richness',
    dir: -1, // toward lighter food
    re: /(so|really|nice and|love how|refreshingly)[^.!?\n]{0,15}(light|fresh|clean)/i,
  },
  {
    id: 'worth-it',
    label: 'good value',
    dim: 'price',
    dir: 1,
    re: /\b(worth (it|every)|great value|good value|so cheap|steal|would pay more)\b/i,
  },
  {
    id: 'overpriced',
    label: 'it being overpriced',
    dim: 'price',
    dir: -1,
    re: /\b(overpriced|too (pricey|expensive)|not worth|rip.?off)\b/i,
  },
  {
    id: 'adventurous',
    label: 'trying something new',
    dim: 'adventure',
    dir: 1,
    re: /\b(never (had|tried)|first time|something new|so unique|adventurous)\b/i,
  },
]

const DIMENSION = { spice: 'spice', richness: 'richness', price: 'price', adventure: 'adventurousness' }

// One review text read by the lexicon, in the reader's shape (see reviewReader.js).
// It can't tell why you felt something, so blame is always "overall".
export function keywordReading(text, sentiment = null) {
  if (!text?.trim()) return { readBy: null, blame: 'overall', signals: [] }
  const signals = SIGNALS.filter((s) => s.re.test(text) && (!s.onlyIf || s.onlyIf(sentiment))).map((s) => ({
    dimension: DIMENSION[s.dim],
    direction: s.dir > 0 ? 'up' : 'down',
    strength: 2,
    quote: text.match(s.re)[0],
    why: s.label,
  }))
  return { readBy: 'keywords', blame: 'overall', signals }
}
