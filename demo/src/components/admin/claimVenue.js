// Which place a venue claim is really for. A claim carries a venue id and a venue
// name, and the name is whatever the claimant sent; approving goes by the id. So the
// admin queue looks the id up in the catalog and shows that place, not the typed name.
//
// lookup: null while loading, then { venue } | { missing: true } | { failed: true }.
// Returns { name, address, problem }: the name to show and approve under, and a line
// to warn the admin with (null when the claim checks out or isn't checked yet).
// The queue only offers Approve once the lookup has found the place.
const loosely = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase()

export function claimVenueCheck(claim, lookup) {
  const typed = { name: claim.venueName, address: null }
  if (!lookup) return { ...typed, problem: null }
  if (lookup.missing) {
    return { ...typed, problem: "This claim isn't for any place we list, so it can't be approved." }
  }
  if (!lookup.venue) {
    return { ...typed, problem: "Couldn't check which place this claim is for. Close and reopen it to try again." }
  }
  const { name, address = null } = lookup.venue
  const problem = loosely(name) === loosely(claim.venueName)
    ? null
    : `This claim calls the place “${claim.venueName.trim()}”, but it is for “${name}”. Approving makes them the owner of ${name}.`
  return { name, address, problem }
}
