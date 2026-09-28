import { useEffect, useState } from 'react'
import { changePassword, myClaims, updateMe, withdrawClaim } from '../../api/accountApi.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import ClaimVenue from './ClaimVenue.jsx'
import DietaryPicker, { NO_DIETARY_NEEDS, sameDietaryNeeds } from './DietaryPicker.jsx'
import './account.css'

const ROLE_LABEL = { USER: 'Diner', OWNER: 'Owner', ADMIN: 'Admin' }
const CLAIM_LABEL = { PENDING: 'Waiting for an admin', APPROVED: 'Approved', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn' }

function DetailsForm() {
  const { me, reloadMe } = useAuth()
  const [displayName, setDisplayName] = useState(me.displayName)
  const [username, setUsername] = useState(me.username ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const changed = displayName.trim() !== me.displayName || username.trim() !== (me.username ?? '')

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await updateMe({ displayName: displayName.trim(), username: username.trim() })
      await reloadMe()
      setMessage({ ok: true, text: 'Saved.' })
    } catch (err) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel" onSubmit={save}>
      <div className="panel-title">Your details</div>
      <label className="field">
        <span>Display name</span>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} required />
      </label>
      <label className="field">
        <span>Username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={20}
          autoCapitalize="none"
          spellCheck="false"
          placeholder="optional"
        />
        <small>Sign in with this instead of your email. 3-20 letters, digits or _, starting with a letter.</small>
      </label>
      {message && <div className={message.ok ? 'ok-note' : 'error'}>{message.text}</div>}
      <div className="row-actions">
        <button type="submit" className="btn go" disabled={!changed || busy}>
          {busy ? 'Saving…' : 'Save details'}
        </button>
      </div>
    </form>
  )
}

function DietaryForm() {
  const { me, reloadMe } = useAuth()
  const saved = me.dietary ?? NO_DIETARY_NEEDS
  const [dietary, setDietary] = useState(saved)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const changed = !sameDietaryNeeds(dietary, saved)

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await updateMe({ dietary })
      await reloadMe()
      setMessage({ ok: true, text: 'Saved.' })
    } catch (err) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel" onSubmit={save}>
      <div className="panel-title">Dietary needs</div>
      <DietaryPicker
        value={dietary}
        onChange={(next) => {
          setDietary(next)
          setMessage(null)
        }}
      />
      {message && <div className={message.ok ? 'ok-note' : 'error'}>{message.text}</div>}
      <div className="row-actions">
        <button type="submit" className="btn go" disabled={!changed || busy}>
          {busy ? 'Saving…' : 'Save dietary needs'}
        </button>
      </div>
    </form>
  )
}

function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await changePassword(current, next)
      setCurrent('')
      setNext('')
      setMessage({ ok: true, text: 'Password changed.' })
    } catch (err) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel" onSubmit={save}>
      <div className="panel-title">Change password</div>
      <label className="field">
        <span>Current password</span>
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label className="field">
        <span>New password</span>
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        <small>At least 8 characters, with a letter and a number.</small>
      </label>
      {message && <div className={message.ok ? 'ok-note' : 'error'}>{message.text}</div>}
      <div className="row-actions">
        <button type="submit" className="btn go" disabled={!current || !next || busy}>
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </div>
    </form>
  )
}

function Claims() {
  const { me, reloadMe } = useAuth()
  const [claims, setClaims] = useState(null)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState(null)

  const load = () =>
    myClaims()
      .then(setClaims)
      .catch((err) => setError(err.message))

  useEffect(() => {
    load()
  }, [])

  const withdraw = async (claim) => {
    try {
      await withdrawClaim(claim.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const claimed = async () => {
    setClaiming(false)
    await Promise.all([load(), reloadMe()])
  }

  return (
    <section className="panel">
      <div className="panel-title">Venues you run</div>
      {me.ownedVenues.length > 0 ? (
        <ul className="plain-list">
          {me.ownedVenues.map((v) => (
            <li key={v.venueId}>
              <span className="pill approved">Owner</span> {v.venueName}
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel-note">
          Run a hawker stall, café or restaurant? Claim it to post status updates and keep its menu and prices right.
        </p>
      )}

      {claims?.length > 0 && (
        <ul className="claim-list">
          {claims.map((c) => (
            <li key={c.id} className="claim-item">
              <div className="claim-head">
                <span className="claim-venue">{c.venueName}</span>
                <span className={`pill ${c.status.toLowerCase()}`}>{CLAIM_LABEL[c.status]}</span>
              </div>
              {c.status === 'REJECTED' && c.rejectReason && <div className="claim-reason">“{c.rejectReason}”</div>}
              {c.status === 'PENDING' && (
                <button type="button" className="back-link" onClick={() => withdraw(c)}>
                  Withdraw claim
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <div className="error">{error}</div>}

      {claiming ? (
        <ClaimVenue onClaimed={claimed} onCancel={() => setClaiming(false)} />
      ) : (
        <div className="row-actions">
          <button type="button" className="btn" onClick={() => setClaiming(true)}>
            Claim a venue
          </button>
        </div>
      )}
    </section>
  )
}

export default function Profile() {
  const { me } = useAuth()
  return (
    <main className="account">
      <header className="account-head">
        <h2 className="step-title">{me.displayName}</h2>
        <div className="account-meta">
          {me.email}
          {me.username && <> · @{me.username}</>}
        </div>
        <div className="account-roles">
          <span className="pill role">{ROLE_LABEL[me.effectiveRole]}</span>
          {me.admin && me.effectiveRole !== 'ADMIN' && <span className="pill quiet">Admin account</span>}
        </div>
      </header>
      <DetailsForm />
      <DietaryForm />
      <Claims />
      <PasswordForm />
    </main>
  )
}
