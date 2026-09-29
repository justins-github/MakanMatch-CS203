import { useEffect, useState } from 'react'
import { listUsers, revokeOwnership, updateUser } from '../../api/accountApi.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Accordion, Fold } from '../Accordion.jsx'

const day = (iso) => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })

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
  const badges = (
    <>
      {user.admin && <span className="pill role">Admin</span>}
      {user.ownedVenues.length > 0 && <span className="pill approved">Owner</span>}
      {user.disabled && <span className="pill rejected">Disabled</span>}
    </>
  )
  return (
    <li>
      <Fold
        id={user.id}
        sub
        className={user.disabled ? 'disabled' : ''}
        title={name}
        summary={user.username ? `${user.email} · @${user.username}` : user.email}
        aside={badges}
      >
        <div className="venue-row-meta">
          {user.createdAt && `Joined ${day(user.createdAt)} · `}
          {user.lastSignInAt ? `last signed in ${day(user.lastSignInAt)}` : 'never signed in'}
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
      </Fold>
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

  const q = query.trim()
  const summary = users && (q ? `${users.length} matching “${q}”` : `${users.length} account${users.length === 1 ? '' : 's'}`)

  return (
    <Fold id="users" title="Accounts" summary={summary} onOpen={() => load()}>
      <p className="panel-note">Promote admins, disable accounts, and revoke venue ownership.</p>
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
        <Accordion>
          <ul className="fold-list">
            {users.map((u) => (
              <UserRow key={u.id} user={u} isMe={u.id === me.id} onChanged={() => load()} />
            ))}
          </ul>
        </Accordion>
      )}
    </Fold>
  )
}
