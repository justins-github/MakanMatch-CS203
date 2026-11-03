import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'
import AdminPanel from '../admin/AdminPanel.jsx'
import MyVenues from '../owner/MyVenues.jsx'
import DeleteAccount from './DeleteAccount.jsx'
import Profile from './Profile.jsx'
import RoleSwitcher from './RoleSwitcher.jsx'
import './account.css'

function MeRow({ title, detail, onClick }) {
  return (
    <button type="button" className="me-row" onClick={onClick}>
      <span className="me-row-text">
        <span className="me-row-title">{title}</span>
        <span className="me-row-detail">{detail}</span>
      </span>
      <span aria-hidden="true">›</span>
    </button>
  )
}

// Your profile, and the doors to owner and admin tools, so the tab bar is the
// same five tabs for everyone. "View as" lives here too, for admins.
export default function Me({ onResetTaste }) {
  const { role, logout } = useAuth()
  const [view, setView] = useState('me') // me | venues | admin
  const runsVenues = role === 'OWNER' || role === 'ADMIN'
  const isAdmin = role === 'ADMIN'

  if (view === 'venues' && runsVenues) {
    return (
      <>
        <button className="back-link me-back" onClick={() => setView('me')}>
          ← Me
        </button>
        <MyVenues />
      </>
    )
  }
  if (view === 'admin' && isAdmin) {
    return (
      <>
        <button className="back-link me-back" onClick={() => setView('me')}>
          ← Me
        </button>
        <AdminPanel />
      </>
    )
  }

  return (
    <Profile>
      {(runsVenues || isAdmin) && (
        <div className="me-rows">
          {runsVenues && <MeRow title="My venues" detail="Status, hours, menu and prices" onClick={() => setView('venues')} />}
          {isAdmin && <MeRow title="Admin" detail="Venue claims, people and roles" onClick={() => setView('admin')} />}
        </div>
      )}
      <RoleSwitcher />
      <div className="row-actions">
        <button type="button" className="btn quiet" onClick={onResetTaste} title="Forget what you've taught the AI">
          Reset my taste
        </button>
        <button type="button" className="btn quiet" onClick={logout}>
          Log out
        </button>
      </div>
      <DeleteAccount />
    </Profile>
  )
}
