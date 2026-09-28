import { useEffect, useState } from 'react'
import { listUsers, revokeOwnership, updateUser } from '../../api/accountApi.js'
import { useAuth } from '../../auth/AuthContext.jsx'

function UserRow({ user, isMe, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const run = async (action, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    setError(null)
    try {
      await action()
      await onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const name = user.displayName ?? user.email
  return (
    <li className={`user-row${user.disabled ? ' disabled' : ''}`}>
      <div className="user-head">
        <span className="user-name">{name}</span>
        <span className="user-badges">
          {user.admin && <span className="pill role">Admin</span>}
          {user.ownedVenues.length > 0 && <span className="pill approved">Owner</span>}
          {user.disabled && <span className="pill rejected">Disabled</span>}
        </span>
      </div>
      <div className="venue-row-meta">
        {user.email}
        {user.username && ` · @${user.username}`}
      </div>

      {user.ownedVenues.length > 0 && (
        <ul className="owned-list">
          {user.ownedVenues.map((v) => (
            <li key={v.venueId}>
              {v.venueName}
              <button
                type="button"
                className="back-link"
                disabled={busy}
                onClick={() => run(() => revokeOwnership(user.id, v.venueId), `Stop ${name} managing ${v.venueName}?`)}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {isMe ? (
        <p className="panel-note">That's you. Another admin can change your account.</p>
      ) : (
        <div className="row-actions">
          <button
            type="button"
            className="btn quiet"
            disabled={busy}
            onClick={() => run(() => updateUser(user.id, { admin: !user.admin }), user.admin ? `Remove ${name}'s admin rights?` : `Make ${name} an admin? Admins can manage every account.`)}
          >
            {user.admin ? 'Remove admin' : 'Make admin'}
          </button>
          <button
            type="button"
            className={`btn ${user.disabled ? 'go' : 'stop'}`}
            disabled={busy}
            onClick={() => run(() => updateUser(user.id, { disabled: !user.disabled }), user.disabled ? null : `Disable ${name}? They'll be signed out and can't sign back in.`)}
          >
            {user.disabled ? 'Enable account' : 'Disable account'}
          </button>
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </li>
  )
}

export default function UserList() {
  const { me } = useAuth()
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState(null)
  const [error, setError] = useState(null)

  const load = (q = query) =>
    listUsers(q.trim())
      .then(setUsers)
      .catch((err) => setError(err.message))

  useEffect(() => {
    const timer = setTimeout(() => load(query), 250)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <section className="admin-section">
      <input
        className="search-input"
        type="search"
        placeholder="Search by name, email or username"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search accounts"
      />
      {error && <div className="error">{error}</div>}
      {!users && !error && <div className="loading">Loading accounts…</div>}
      {users?.length === 0 && <p className="panel-note">No accounts match "{query}".</p>}
      {users?.length > 0 && (
        <ul className="user-list">
          {users.map((u) => (
            <UserRow key={u.id} user={u} isMe={u.id === me.id} onChanged={() => load()} />
          ))}
        </ul>
      )}
    </section>
  )
}
