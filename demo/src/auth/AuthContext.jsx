import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as accounts from '../api/accountApi.js'
import { configureHttp, setAccessToken, setActAsHeader } from '../api/http.js'
import { signOut } from './signOut.js'

// The signed-in account for the whole app.
//   status: 'loading' | 'signedOut' | 'signedIn'
//   me:     GET /api/me - who you are, the role you're being served as
//           (effectiveRole), and the venues you manage
//   actAs:  an admin's "view as" choice: 'user' | 'owner' | null (= admin)
// The access token lives only in memory (see api/http.js); a page reload
// recovers the session from the httpOnly refresh cookie.

const AuthContext = createContext(null)
const ACT_AS_KEY = 'mm-act-as'

function storedActAs() {
  try {
    const value = sessionStorage.getItem(ACT_AS_KEY)
    return value === 'user' || value === 'owner' ? value : null
  } catch {
    return null
  }
}

function storeActAs(value) {
  try {
    if (value) sessionStorage.setItem(ACT_AS_KEY, value)
    else sessionStorage.removeItem(ACT_AS_KEY)
  } catch {
    // storage blocked: the choice just won't survive a reload
  }
}

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading')
  const [me, setMe] = useState(null)
  const [actAs, setActAsState] = useState(storedActAs)

  const signedOut = useCallback(() => {
    setAccessToken(null)
    setMe(null)
    setStatus('signedOut')
  }, [])

  // Swap the refresh cookie for a new access token. Used on page load and by
  // api/http.js whenever a request comes back 401.
  const refreshToken = useCallback(async () => {
    try {
      const session = await accounts.refreshSession()
      setAccessToken(session.accessToken)
      return true
    } catch {
      return false
    }
  }, [])

  const reloadMe = useCallback(async () => {
    const next = await accounts.getMe()
    setMe(next)
    return next
  }, [])

  // Admin's act-as choice only means something for admins.
  const adoptSession = useCallback(async (session) => {
    setAccessToken(session.accessToken)
    if (!session.me.admin) {
      storeActAs(null)
      setActAsState(null)
      setActAsHeader(null)
      setMe(session.me)
    } else if (storedActAs()) {
      await reloadMe()
    } else {
      setMe(session.me)
    }
    setStatus('signedIn')
  }, [reloadMe])

  // Restore the session once per page load. The ref survives React StrictMode's
  // double-run of effects, so the single-use refresh token is spent only once.
  const restoring = useRef(null)
  useEffect(() => {
    setActAsHeader(storedActAs())
    configureHttp({ refresh: refreshToken, onSignedOut: signedOut })
    restoring.current ??= refreshToken().then(async (ok) => {
      if (!ok) return false
      try {
        await reloadMe()
        return true
      } catch {
        return false
      }
    })
    let cancelled = false
    restoring.current.then((ok) => {
      if (cancelled) return
      if (ok) setStatus('signedIn')
      else signedOut()
    })
    return () => {
      cancelled = true
    }
  }, [refreshToken, reloadMe, signedOut])

  const value = useMemo(() => ({
    status,
    me,
    actAs,
    role: me?.effectiveRole ?? null, // 'USER' | 'OWNER' | 'ADMIN'
    async login(identifier, password) {
      await adoptSession(await accounts.login(identifier, password))
    },
    async signup(email, password, displayName, dietary) {
      await adoptSession(await accounts.signup(email, password, displayName, dietary))
    },
    // Throws, still signed in, when the server couldn't end the session (see signOut.js).
    async logout({ force = false } = {}) {
      await signOut({
        endSession: accounts.logout,
        clearLocal: () => {
          storeActAs(null)
          setActAsState(null)
          setActAsHeader(null)
          signedOut()
        },
        force,
      })
    },
    // role: 'user' | 'owner' | 'admin'
    async setActAs(role) {
      const next = role === 'user' || role === 'owner' ? role : null
      storeActAs(next)
      setActAsState(next)
      setActAsHeader(next)
      await reloadMe()
    },
    reloadMe,
  }), [status, me, actAs, adoptSession, reloadMe, signedOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
