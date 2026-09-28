import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import './login.css'

// Sign in with an email, or with a username once you've set one in Profile.
export default function Login({ onCreateAccount }) {
  const { login } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [showReset, setShowReset] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await login(identifier.trim(), password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login-brand">
        <div className="eyebrow">The AI that learns your taste</div>
        <h1>
          Makan<span className="accent">Match</span>
        </h1>
        <p className="login-tagline">Sign in to pick up where your tastebuds left off.</p>
      </div>

      <form className="login-form" onSubmit={submit}>
        <label className="login-field">
          <span>Email or username</span>
          <input
            type="text"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck="false"
            placeholder="you@smu.edu.sg"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoFocus
          />
        </label>

        <label className="login-field">
          <span>Password</span>
          <div className="login-password">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="login-eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>

        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="login-submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="login-links">
          <button type="button" className="login-link" onClick={() => setShowReset((v) => !v)}>
            Forgot password?
          </button>
          <button type="button" className="login-link" onClick={onCreateAccount}>
            Create account
          </button>
        </div>
      </form>

      {showReset && (
        <p className="login-note">
          Password resets aren't self-service yet. Ask a MakanMatch admin to send you a reset email.
        </p>
      )}
    </div>
  )
}
