import { useState } from 'react'
import ClaimQueue from './ClaimQueue.jsx'
import UserList from './UserList.jsx'
import './admin.css'

const SECTIONS = [
  { id: 'claims', label: 'Venue claims', note: 'Check the proof, then approve or reject. Approving makes the claimant an owner of that venue.' },
  { id: 'users', label: 'Accounts', note: 'Promote admins, disable accounts, and revoke venue ownership.' },
]

export default function AdminPanel() {
  const [section, setSection] = useState('claims')
  const current = SECTIONS.find((s) => s.id === section)
  return (
    <main className="admin">
      <nav className="admin-nav" aria-label="Admin sections">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className="admin-nav-btn" aria-current={section === s.id} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </nav>
      <p className="panel-note">{current.note}</p>
      {section === 'claims' ? <ClaimQueue /> : <UserList />}
    </main>
  )
}
