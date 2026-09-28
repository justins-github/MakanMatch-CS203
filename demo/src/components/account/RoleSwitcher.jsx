import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'
import './account.css'

const ROLES = [
  { id: 'user', label: 'User' },
  { id: 'owner', label: 'Owner' },
  { id: 'admin', label: 'Admin' },
]

// Admins only: see the app exactly as a user or an owner would. The server
// applies that role's permissions too, so this is a real test, not a costume.
export default function RoleSwitcher() {
  const { me, actAs, setActAs } = useAuth()
  const [busy, setBusy] = useState(false)
  if (!me?.admin) return null

  const current = actAs ?? 'admin'
  const choose = async (role) => {
    if (role === current || busy) return
    setBusy(true)
    try {
      await setActAs(role)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="role-switch" role="group" aria-label="View the app as">
      <span className="role-switch-label">View as</span>
      {ROLES.map((r) => (
        <button
          key={r.id}
          type="button"
          className="role-chip"
          aria-pressed={current === r.id}
          disabled={busy}
          onClick={() => choose(r.id)}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

// Caution tape across the header while an admin is acting as someone else.
export function ActingAsTape() {
  const { me, actAs } = useAuth()
  if (!me?.admin || !actAs) return null
  return (
    <div className="acting-tape" role="status">
      <span>
        Acting as {actAs === 'owner' ? 'an owner' : 'a user'}: the server treats you exactly like one
      </span>
    </div>
  )
}
