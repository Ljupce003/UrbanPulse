// Called after Google OAuth redirect. Registers session with backend ONCE,
// then navigates to home

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AuthCallback() {
  const { registerSession } = useAuth()
  const navigate  = useNavigate()
  const [error, setError]   = useState(null)
  const called    = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    async function run() {
      try {
        await new Promise(r => setTimeout(r, 300))
        await registerSession()         // POST /api/auth/session
        navigate('/', { replace: true })
      } catch (err) {
        console.error('[AuthCallback] failed:', err.message)
        setError(err.message)
      }
    }

    run()
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', background: '#080c14',
      fontFamily: "'Space Mono', monospace", gap: 20,
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {error ? (
        <>
          <div style={{
            color: '#fca5a5', fontSize: 13, letterSpacing: '0.05em',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            padding: '12px 20px', borderRadius: 4, maxWidth: 400, textAlign: 'center',
          }}>
            ⚠ {error}
          </div>
          <button
            onClick={() => window.location.href = '/login'}
            style={{
              marginTop: 8, padding: '8px 20px', background: 'transparent',
              border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6',
              fontFamily: "'Space Mono', monospace", fontSize: 11,
              letterSpacing: '0.15em', cursor: 'pointer', borderRadius: 3,
            }}
          >
            ← BACK TO LOGIN
          </button>
        </>
      ) : (
        <>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '2px solid rgba(59,130,246,0.15)',
            borderTop: '2px solid #3b82f6',
            animation: 'spin 0.7s linear infinite',
          }} />
          <p style={{
            color: 'rgba(148,163,184,0.5)', fontSize: 12,
            letterSpacing: '0.2em', margin: 0,
          }}>
            SIGNING YOU IN...
          </p>
        </>
      )}
    </div>
  )
}