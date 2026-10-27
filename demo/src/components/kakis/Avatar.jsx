import './kakis.css'

const TINTS = ['kunyit', 'pandan', 'monsoon', 'dim']

// "Jia Hui Tan" -> "JH"
export function initials(name) {
  return (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join('') || '?'
}

// The colour comes from the id, so each person keeps theirs everywhere.
function tintFor(id = '') {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return TINTS[hash % TINTS.length]
}

export default function Avatar({ id, name, small = false, large = false }) {
  return (
    <span className={`kaki-avatar tint-${tintFor(id)}${small ? ' small' : ''}${large ? ' large' : ''}`} aria-hidden="true">
      {initials(name)}
    </span>
  )
}
