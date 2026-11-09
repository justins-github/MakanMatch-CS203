// How a list of places changed: which are new to it, and which moved up or down.
// venue id -> { kind: 'new' } | { kind: 'up' | 'down', places }; unmoved places aren't in it.
export function movesBetween(beforeIds, venues) {
  const before = new Map(beforeIds.map((id, i) => [id, i]))
  const moves = new Map()
  venues.forEach(({ id }, now) => {
    if (!before.has(id)) moves.set(id, { kind: 'new' })
    else if (before.get(id) > now) moves.set(id, { kind: 'up', places: before.get(id) - now })
    else if (before.get(id) < now) moves.set(id, { kind: 'down', places: now - before.get(id) })
  })
  return moves
}
