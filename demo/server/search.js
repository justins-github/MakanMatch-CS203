// In-memory typeahead index over venue names and metadata, with highlight ranges.

const MIN_QUERY_CHARS = 2
const DEFAULT_LIMIT = 8

// Text tiers, sized to blend with the personal match score (5-99).
const TIER = {
  namePrefix: 40, // query token is a prefix of the whole name
  wordPrefix: 30, // prefix of a later word in the name
  metaPrefix: 20, // prefix of an area/address/cuisine word
  substring: 10, // mid-word occurrence in the name
}

const foldChar = (ch) => ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const isWordChar = (ch) => /[\p{L}\p{N}]/u.test(ch)

// Splits text into normalized tokens, mapping each char back to its original offset.
function tokenize(text) {
  const tokens = []
  let norm = ''
  let map = []
  let i = 0
  const flush = () => {
    if (norm) tokens.push({ norm, map })
    norm = ''
    map = []
  }
  for (const ch of text) {
    if (isWordChar(ch)) {
      for (const f of foldChar(ch)) {
        norm += f
        map.push(i)
      }
    } else {
      flush()
    }
    i += ch.length
  }
  flush()
  return tokens
}

// Normalized tokens of a query string.
export function normalizeQuery(query) {
  return tokenize(String(query ?? '')).map((t) => t.norm)
}

// Canonical form for whole-name equality.
export function normalizeName(name) {
  return normalizeQuery(name).join(' ')
}

// Builds the index once at startup.
export function buildSearchIndex(venues) {
  return venues.map((venue) => ({
    venue,
    nameTokens: tokenize(venue.name ?? ''),
    metaTokens: tokenize(
      [venue.area, venue.address, venue.cuisine ? venue.cuisine.replace(/-/g, ' ') : '']
        .filter(Boolean)
        .join(' '),
    ).map((t) => t.norm),
  }))
}

// Best match of one query token against one venue: { tier, range } or null.
function matchToken(entry, qt) {
  for (let ti = 0; ti < entry.nameTokens.length; ti++) {
    const { norm, map } = entry.nameTokens[ti]
    if (norm.startsWith(qt)) {
      return {
        tier: ti === 0 ? TIER.namePrefix : TIER.wordPrefix,
        range: { start: map[0], len: map[qt.length - 1] - map[0] + 1 },
      }
    }
  }
  if (entry.metaTokens.some((m) => m.startsWith(qt))) {
    return { tier: TIER.metaPrefix, range: null }
  }
  for (const { norm, map } of entry.nameTokens) {
    const at = norm.indexOf(qt)
    if (at > 0) {
      return {
        tier: TIER.substring,
        range: { start: map[at], len: map[at + qt.length - 1] - map[at] + 1 },
      }
    }
  }
  return null
}

// Sorted, de-duplicated highlight ranges.
function dedupRanges(ranges) {
  const seen = new Set()
  return ranges
    .filter((r) => {
      const key = `${r.start}:${r.len}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.start - b.start)
}

// Searches the index; scoreFn(venue) supplies the personal match score for tie-breaking.
export function searchVenues(index, query, { limit = DEFAULT_LIMIT, scoreFn } = {}) {
  const queryTokens = normalizeQuery(query)
  if (queryTokens.join('').length < MIN_QUERY_CHARS) return []

  const candidates = []
  for (const entry of index) {
    let textScore = 0
    const ranges = []
    let failed = false
    for (const qt of queryTokens) {
      const m = matchToken(entry, qt)
      if (!m) {
        failed = true
        break
      }
      textScore += m.tier
      if (m.range) ranges.push(m.range)
    }
    if (failed) continue
    candidates.push({ venue: entry.venue, textScore, highlight: dedupRanges(ranges) })
  }

  candidates.sort((a, b) => b.textScore - a.textScore)
  // Score only a pool that could plausibly surface.
  const pool = candidates.slice(0, Math.max(limit * 6, 500))
  if (scoreFn) for (const c of pool) c.matchScore = scoreFn(c.venue)
  pool.sort(
    (a, b) =>
      b.textScore + (b.matchScore ?? 0) - (a.textScore + (a.matchScore ?? 0)) ||
      (b.venue.overtureConfidence ?? 0) - (a.venue.overtureConfidence ?? 0),
  )
  return pool.slice(0, limit)
}
