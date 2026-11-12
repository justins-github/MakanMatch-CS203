// Small rules behind the demo's Month switch (App.jsx), kept apart so they can be tested.

// What a venue search depends on besides its words: the month that's loaded and, on a
// later month, the gone places you said are still open. Search results from one scope
// must never be shown in another (a "Closed" tag would follow you back to August).
export function searchScope(month, stillOpen) {
  return month ? `${month}|${[...stillOpen].sort().join(',')}` : ''
}

// "It's still open", once per place: the same list back when it's already on it.
export function addStillOpen(ids, id) {
  return ids.includes(id) ? ids : [...ids, id]
}

// For requests that can overlap (two quick taps, or leaving before the answer lands):
// take a ticket with begin(), and only use the answer if isCurrent(ticket) still holds.
export function latestOnly() {
  let current = 0
  return {
    begin: () => ++current,
    isCurrent: (ticket) => ticket === current,
    cancel: () => {
      current += 1
    },
  }
}

// The line above the picks while a later month is loaded. `month` comes with the picks:
// { label, since } always, plus on your own Find { left: [{ name, reason }], arrived }:
// which of your picks left and how many new places made it in. Null on the first month.
export function monthNote(month) {
  if (!month) return null
  const showing = `Showing ${month.label}.`
  if (!month.left) return showing
  const since = month.since.split(' ')[0] // "August 2026" -> "August"
  const { left, arrived } = month
  if (left.length === 0 && arrived === 0) {
    return `${showing} Your picks are the same as in ${since}: none of them left, and no new place beats them yet.`
  }
  const names = left.map((v) => `${v.name} (${v.reason === 'closed' ? 'closed' : 'no longer listed'})`)
  const gone = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  const newPlaces = `${arrived} new place${arrived === 1 ? '' : 's'}`
  if (left.length === 0) return `${showing} Since ${since}, ${newPlaces} made it into your picks.`
  return `${showing} Since ${since}, ${gone} left your picks${arrived > 0 ? ` and ${newPlaces} made it in` : ''}.`
}
