// The Week 13 review bomb: three spice-shy demo accounts (scripts/lib/personas.mjs) pan
// one dish at once, so Find shows other people's reviews moving your match. An admin drops
// it on any place with a menu from its card (services/reviewBombService.js);
// scripts/seed-review-bomb.mjs drops it from the command line. With no place named, it's
// Turk's Kebab. `dishes` names the dish to pan where it matters; elsewhere it's the first
// dish on the menu with a known spice level.
export const REVIEW_BOMB = {
  venueId: 'turks-kebab',
  dishes: { 'turks-kebab': 'chicken-doner-wrap' }, // still on the menu after seed-changes
  bombers: [
    { username: 'weiling_mild', text: 'SUPER SPICY. Could not finish it.' },
    { username: 'hafiz_nospice', text: 'Way too spicy, my mouth is on fire.' },
    { username: 'nadia_mild', text: 'SUPER SPICY, not for me.' },
  ],
}

// The dish to pan at a venue, from its menu: the one named in `preferred`, else the first
// with a known spice level (a "too spicy" review moves spice there), else the first.
// Null when there's no menu.
export function bombDish(menu, venueId, preferred = REVIEW_BOMB.dishes) {
  return menu.find((d) => d.id === preferred[venueId]) ?? menu.find((d) => d.spice != null) ?? menu[0] ?? null
}

// A bomber's standing bomb review: their newest review with their bomb line that isn't
// undone, or null. Works on a profile's list (newest first) or stored order (oldest first).
export function standingBomb(reviews, text) {
  return reviews
    .filter((r) => r.text === text && !r.undone)
    .reduce((newest, r) => (!newest || Date.parse(r.at) > Date.parse(newest.at) ? r : newest), null)
}
