import Avatar from './kakis/Avatar.jsx'

// Line icons drawn on a 24px grid, in the text colour.
const ICONS = {
  forYou: (
    <>
      <path d="M6 3v6a3 3 0 0 0 6 0V3" />
      <path d="M9 3v18" />
      <path d="M18 3c-1.6 1.2-2.5 3.6-2.5 6.5 0 1.6.9 2.5 2.5 2.5v9" />
    </>
  ),
  kakis: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 14.3c2 .7 3.3 2.7 3.3 5.2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  dna: (
    <>
      <path d="M8 3c0 5 8 4.5 8 9s-8 4-8 9" />
      <path d="M16 3c0 5-8 4.5-8 9s8 4 8 9" />
      <path d="M9.5 6h5M9.5 18h5" />
    </>
  ),
  me: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.6 18.4c1.4-1.9 3.2-2.9 5.4-2.9s4 1 5.4 2.9" />
    </>
  ),
}

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

export const TABS = [
  ['feed', 'For you', 'forYou'],
  ['kakis', 'Kakis', 'kakis'],
  ['rate', 'Review', 'plus'],
  ['dna', 'Taste DNA', 'dna'],
  ['me', 'Me', 'me'],
]

// The weather on the left, you on the right; your avatar opens Me. Admins also get the
// Demo controls (`demo`) beside it.
export function TopBar({ weather, demo = null, me, onOpenMe }) {
  return (
    <header className="topbar">
      {weather}
      <div className="topbar-end">
        {demo}
        <button type="button" className="topbar-me" onClick={onOpenMe} aria-label="Me" title={`Signed in as ${me.email}`}>
          <Avatar id="you" name={me.displayName} />
        </button>
      </div>
    </header>
  )
}

// The same five tabs for everyone; owner and admin tools open from Me. Review is
// the raised + in the middle, since rating dishes is what teaches the AI.
export function BottomNav({ active, onSelect }) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map(([id, label, icon]) => (
        <button
          key={id}
          type="button"
          className={`nav-item${id === 'rate' ? ' nav-review' : ''}`}
          aria-current={active === id ? 'page' : undefined}
          onClick={() => onSelect(id)}
        >
          <span className={id === 'rate' ? 'nav-fab' : 'nav-icon'}>
            <Icon name={icon} />
          </span>
          {label}
        </button>
      ))}
    </nav>
  )
}
