const DAY_MS = 24 * 60 * 60 * 1000
const WORDS_FOR_DAYS = 30

// "today", "yesterday", "2 days ago", then a date.
export function relativeDay(iso, now = new Date()) {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < WORDS_FOR_DAYS) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}
