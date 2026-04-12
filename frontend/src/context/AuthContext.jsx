import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)
const API = import.meta.env.VITE_API_URL || 'http://localhost:5173'

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const user = profile
  const role = profile?.role ?? null

  const authFetch = useCallback(async (path, options = {}) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No active session')

    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        ...options.headers,
      },
    })

    if (res.status === 204) return null
    const json = await res.json()
    if (!res.ok) throw new Error(json.detail || `API error ${res.status}`)
    return json
  }, [])

  const fetchProfile = useCallback(async () => {
    try {
      const data = await authFetch('/api/auth/me')
      setProfile(data)
    } catch (err) {
      console.warn('[AuthContext] /me failed:', err.message)
      setProfile(null)
    }
  }, [authFetch])

  const registerSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No session after OAuth redirect')

    const res = await fetch(`${API}/api/auth/session`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || 'Session registration failed')
    }

    const data = await res.json()
    setProfile(data)
    return data
  }, [])

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return
      if (session?.access_token) await fetchProfile()
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT' || !session) setProfile(null)
      }
    )

    return () => { cancelled = true; subscription.unsubscribe() }
  }, [fetchProfile])

  async function loginWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) throw error
  }

  async function logout() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{
      user, role, profile, loading,
      loginWithGoogle, registerSession,
      logout, authFetch, fetchProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}