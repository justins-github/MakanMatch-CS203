import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'
import '../login.css'

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/

export default function Register({ onHaveAccount }) {
  const { signup } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const passwordOk = PASSWORD_RULE.test(password)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (!passwordOk) {
      setError('Use at least 8 characters, with a letter and a number.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await signup(email.trim(), password, displayName.trim())
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login-brand">
        <div className="eyebrow">New here</div>
        <h1>
          Join <span className="accent">MakanMatch</span>
        </h1>
        <p className="login-tagline">
          Your Taste DNA starts neutral. Every dish you rank teaches it what you like.
        </p>
      </div>

      <form className="login-form" onSubmit={submit}>
        <label className="login-field">
          <span>What should we call you?</span>
          <input
            type="text"
            name="nickname"
            autoComplete="nickname"
            maxLength={40}
            placeholder="Mei"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoFocus
          />
        </label>

        <label className="login-field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@smu.edu.sg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="login-field">
          <span>Password</span>
          <div className="login-password">
            <input
              type={showPassword ? 'text' : 'password'}
              name="new-password"
              autoComplete="new-password"
              placeholder="8+ characters, a letter and a number"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-describedby="password-rule"
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
          <small id="password-rule" className={`login-hint${password && !passwordOk ? ' bad' : ''}`}>
            At least 8 characters, with a letter and a number.
          </small>
        </label>

        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="login-submit" disabled={busy}>
          {busy ? 'Creating your account…' : 'Create account'}
        </button>

        <div className="login-links">
          <button type="button" className="login-link" onClick={onHaveAccount}>
            I already have an account
          </button>
        </div>
      </form>
    </div>
  )
}
