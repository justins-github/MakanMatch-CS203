import { useState } from 'react'
import './login.css'

// Mock sign-in screen. There is no backend yet: any email + password
// combination is accepted and hands the (display-only) user up to App.
export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    // Small delay so the button visibly "does something" in the demo.
    setTimeout(() => {
      onLogin({ email: email.trim(), name: displayName(email) })
    }, 450)
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
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            placeholder="you@smu.edu.sg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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

        <button type="submit" className="login-submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="login-links">
          <button type="button" className="login-link">
            Forgot password?
          </button>
          <button type="button" className="login-link">
            Create account
          </button>
        </div>
      </form>

      <p className="login-note">
        Demo build: no accounts yet, so any email and password will sign you in.
      </p>
    </div>
  )
}

function displayName(email) {
  const local = email.split('@')[0] || 'you'
  return local.charAt(0).toUpperCase() + local.slice(1)
}
