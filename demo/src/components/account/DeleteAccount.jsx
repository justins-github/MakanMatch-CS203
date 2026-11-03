import { useEffect, useRef, useState } from 'react'
import { checkDeleteAccount, deleteAccount } from '../../api/accountApi.js'
import { forgetMyContributions } from '../../api/catalogApi.js'
import { postReset } from '../../api/engineApi.js'
import { useAuth } from '../../auth/AuthContext.jsx'

const COUNTDOWN_SECONDS = 10
export const DELETED_KEY = 'mm-account-deleted' // read once by Login for a goodbye note

// "Delete my account": a native <dialog> (Escape and Cancel close it) whose red
// button stays locked for a 10-second countdown. Every step can be repeated, so if
// one fails part-way, pressing the button again finishes the job.
export default function DeleteAccount() {
  const { logout } = useAuth()
  const dialog = useRef(null)
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [left, setLeft] = useState(COUNTDOWN_SECONDS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open || left <= 0) return
    const tick = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(tick)
  }, [open, left])

  const show = () => {
    setPassword('')
    setError(null)
    setLeft(COUNTDOWN_SECONDS)
    setOpen(true)
    dialog.current.showModal()
  }

  const close = () => {
    if (busy) return
    dialog.current.close()
  }

  const remove = async (e) => {
    e.preventDefault()
    if (left > 0 || !password || busy) return
    setBusy(true)
    setError(null)
    try {
      await checkDeleteAccount(password) // wrong password or last admin: stops here, nothing gone
      await postReset() // engine: reviews, rankings, Taste DNA
      await forgetMyContributions() // catalog: keeps prices and reports, drops your name
      await deleteAccount(password) // account-service: profile, kakis, claims, venues, login
    } catch (err) {
      setError(err.message)
      setBusy(false)
      return
    }
    try {
      sessionStorage.setItem(DELETED_KEY, '1')
    } catch {
      // no goodbye note, that's all
    }
    await logout()
  }

  const ready = left <= 0 && password !== '' && !busy

  return (
    <>
      <button type="button" className="btn quiet delete-account-open" onClick={show}>
        Delete my account
      </button>
      <dialog
        ref={dialog}
        className="delete-account"
        aria-labelledby="delete-account-title"
        onClose={() => setOpen(false)}
        onCancel={(e) => busy && e.preventDefault()}
      >
        <form onSubmit={remove}>
          <h3 id="delete-account-title">Delete your account?</h3>
          <p>This can&apos;t be undone. It removes:</p>
          <ul>
            <li>your profile, kakis and saved groups</li>
            <li>your venue claims, and any venues you run</li>
            <li>everything you&apos;ve taught the AI: reviews, rankings and Taste DNA</li>
          </ul>
          <p className="delete-account-kept">
            Prices and venue updates you added stay for other diners, but no longer say they came from you.
          </p>
          <label className="field">
            <span>Your password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              required
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="row-actions">
            <button type="button" className="btn quiet" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn stop" disabled={!ready}>
              {busy ? 'Deleting…' : left > 0 ? `Delete account (${left})` : 'Delete account'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
