import { useEffect, useState } from 'react'
import { changePassword, myClaims, updateMe, withdrawClaim } from '../../api/accountApi.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Accordion, Fold, Unsaved } from '../Accordion.jsx'
import ClaimVenue from './ClaimVenue.jsx'
import DietaryPicker, { NO_DIETARY_NEEDS, dietaryLabels, sameDietaryNeeds } from './DietaryPicker.jsx'
import './account.css'

const ROLE_LABEL = { USER: 'Diner', OWNER: 'Owner', ADMIN: 'Admin' }
const CLAIM_LABEL = { PENDING: 'Waiting for an admin', APPROVED: 'Approved', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn' }

// Name, username and dietary needs, saved together; only what changed is sent.
function DetailsForm() {
  const { me, reloadMe } = useAuth()
  const savedDietary = me.dietary ?? NO_DIETARY_NEEDS
  const [displayName, setDisplayName] = useState(me.displayName)
  const [username, setUsername] = useState(me.username ?? '')
  const [dietary, setDietary] = useState(savedDietary)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const namesChanged = displayName.trim() !== me.displayName || username.trim() !== (me.username ?? '')
  const dietaryChanged = !sameDietaryNeeds(dietary, savedDietary)
  const changed = namesChanged || dietaryChanged

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await updateMe({
        ...(namesChanged ? { displayName: displayName.trim(), username: username.trim() } : {}),
        ...(dietaryChanged ? { dietary } : {}),
      })
      await reloadMe()
      setMessage({ ok: true, text: 'Saved.' })
    } catch (err) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const edit = (set) => (e) => {
    set(e.target.value)
    setMessage(null)
  }

  const who = me.username ? `${me.displayName} · @${me.username}` : me.displayName
  const needs = dietaryLabels(savedDietary).join(', ') || 'no dietary needs'

  return (
    <Fold id="details" title="Your details" summary={`${who} · ${needs}`} onSubmit={save}>
      <label className="field">
        <span>Display name</span>
        <input value={displayName} onChange={edit(setDisplayName)} maxLength={40} required />
      </label>
      <label className="field">
        <span>Username</span>
        <input
          value={username}
          onChange={edit(setUsername)}
          maxLength={20}
          autoCapitalize="none"
          spellCheck="false"
          placeholder="optional"
        />
        <small>Sign in with this instead of your email. 3-20 letters, digits or _, starting with a letter.</small>
      </label>
      <div className="field">
        <span>Dietary needs</span>
        <DietaryPicker
          folded
          value={dietary}
          onChange={(next) => {
            setDietary(next)
            setMessage(null)
          }}
        />
      </div>
      {message && <div className={message.ok ? 'ok-note' : 'error'}>{message.text}</div>}
      <div className="row-actions">
        <button type="submit" className="btn go" disabled={!changed || busy}>
          {busy ? 'Saving…' : 'Save details'}
        </button>
      </div>
      <Unsaved when={changed} />
    </Fold>
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
    <Fold id="password" title="Password" summary="Change your password" onSubmit={save}>
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
      <Unsaved when={current !== '' || next !== ''} />
    </Fold>
  )
}

function Claims() {
  const { me, role, reloadMe } = useAuth()
  const [claims, setClaims] = useState(null)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)
  // An admin viewing as a diner sees what a diner would: a plain diner runs no
  // venue, so has no venues here and no approved claims.
  const asDiner = me.admin && role === 'USER'
  const owned = asDiner ? [] : me.ownedVenues
  const shownClaims = asDiner ? claims?.filter((c) => c.status !== 'APPROVED') : claims

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

  // An admin's own claim is approved at once, so say where the venue went.
  const claimed = async (claim) => {
    setClaiming(false)
    if (claim?.status === 'APPROVED') {
      setNote(
        asDiner
          ? `${claim.venueName} is yours straight away, since you're an admin. Switch View as to Owner or Admin to manage it.`
          : `${claim.venueName} is yours straight away, since you're an admin. It's in My venues.`,
      )
    }
    await Promise.all([load(), reloadMe()])
  }

  const waiting = claims?.filter((c) => c.status === 'PENDING').length ?? 0
  const summary = [
    owned.map((v) => v.venueName).join(', '),
    waiting > 0 && `${waiting} claim${waiting === 1 ? '' : 's'} waiting`,
  ].filter(Boolean).join(' · ') || 'None yet'

  return (
    <Fold id="venues" title="Venues you run" summary={summary}>
      {owned.length > 0 ? (
        <ul className="plain-list">
          {owned.map((v) => (
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

      {shownClaims?.length > 0 && (
        <ul className="claim-list">
          {shownClaims.map((c) => (
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

      {note && <div className="ok-note">{note}</div>}
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
    </Fold>
  )
}

// A labelled group of rows in one card, so the page reads as a few sections.
export function MeSection({ label, children }) {
  return (
    <section className="me-section" aria-label={label}>
      <h3 className="me-section-label">{label}</h3>
      <div className="me-group">{children}</div>
    </section>
  )
}

// Who you are, then Account and Venues. `venueTools` is the row into the owner screens;
// children is what Me adds below (the admin section, log out).
export default function Profile({ venueTools = null, children }) {
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
      <Accordion>
        <MeSection label="Account">
          <DetailsForm />
          <PasswordForm />
        </MeSection>
        <MeSection label="Venues">
          <Claims />
          {venueTools}
        </MeSection>
        {children}
      </Accordion>
    </main>
  )
}
