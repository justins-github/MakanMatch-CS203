// Lexicon of taste signals in review text; evidence counts scale the learner's nudges.

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

// Signals present in one review text.
export function matchSignals(text) {
  if (!text) return []
  return SIGNALS.filter((s) => s.re.test(text))
}

// Counts corpus texts carrying this signal.
export function countEvidence(corpusTexts, signal) {
  return corpusTexts.filter((t) => t && signal.re.test(t)).length
}
