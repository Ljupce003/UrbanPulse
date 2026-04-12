import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function GridBackground() {
  return (
    <svg
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        opacity: 0.07, pointerEvents: 'none',
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#3b82f6" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  )
}

function DataBlobs() {
  return (
    <>
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%',
        width: 500, height: 500,
        background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'pulse1 6s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-20%', left: '-10%',
        width: 600, height: 600,
        background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'pulse2 8s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
    </>
  )
}

function Sparklines() {
  const lines = [
    { d: 'M0,40 C20,35 40,20 60,25 S100,10 120,15 S160,5 180,8 S220,20 240,15', delay: 0 },
    { d: 'M0,30 C30,40 50,15 80,20 S110,35 140,25 S170,10 200,18 S230,30 260,22', delay: 1.5 },
    { d: 'M0,20 C15,30 35,10 55,15 S90,5 110,10 S145,25 165,18 S195,8 220,12', delay: 3 },
  ]
  return (
    <div style={{
      position: 'absolute', bottom: 40, left: 0, right: 0,
      display: 'flex', justifyContent: 'center', opacity: 0.15,
      pointerEvents: 'none',
    }}>
      <svg width="260" height="60" viewBox="0 0 260 60">
        {lines.map((l, i) => (
          <path
            key={i} d={l.d}
            fill="none" stroke="#3b82f6" strokeWidth="1.5"
            strokeLinecap="round"
            style={{
              animation: `dash 4s ease-in-out ${l.delay}s infinite alternate`,
              strokeDasharray: 300,
              strokeDashoffset: 300,
            }}
          />
        ))}
      </svg>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" fill="#4285F4"/>
      <path d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24z" fill="#34A853"/>
      <path d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z" fill="#FBBC05"/>
      <path d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" fill="#EA4335"/>
    </svg>
  )
}

export default function Login() {
  const { loginWithGoogle, user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setTimeout(() => setMounted(true), 50)
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  async function handleGoogleLogin() {
    try {
      setError(null)
      setLoading(true)
      await loginWithGoogle()
      // browser redirects to Google, nothing else runs here
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body { background: #080c14; }

        @keyframes pulse1 {
          0%, 100% { transform: scale(1) translate(0, 0); }
          50% { transform: scale(1.1) translate(-20px, 20px); }
        }
        @keyframes pulse2 {
          0%, 100% { transform: scale(1) translate(0, 0); }
          50% { transform: scale(1.08) translate(15px, -15px); }
        }
        @keyframes dash {
          from { stroke-dashoffset: 300; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #080c14;
          font-family: 'DM Sans', sans-serif;
          position: relative;
          overflow: hidden;
        }

        .card {
          position: relative;
          z-index: 10;
          width: 420px;
          background: rgba(10, 16, 28, 0.85);
          border: 1px solid rgba(59, 130, 246, 0.15);
          border-radius: 4px;
          padding: 48px 44px;
          backdrop-filter: blur(24px);
          box-shadow:
            0 0 0 1px rgba(59,130,246,0.05),
            0 32px 64px rgba(0,0,0,0.6),
            inset 0 1px 0 rgba(255,255,255,0.04);
          opacity: ${mounted ? 1 : 0};
          transform: ${mounted ? 'translateY(0)' : 'translateY(20px)'};
          transition: opacity 0.6s ease, transform 0.6s ease;
        }

        .corner {
          position: absolute;
          width: 12px;
          height: 12px;
          border-color: rgba(59, 130, 246, 0.5);
          border-style: solid;
        }
        .corner-tl { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
        .corner-tr { top: -1px; right: -1px; border-width: 2px 2px 0 0; }
        .corner-bl { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; }
        .corner-br { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

        .tag {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.2em;
          color: #3b82f6;
          opacity: 0.7;
          margin-bottom: 32px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .tag::before {
          content: '';
          display: inline-block;
          width: 6px;
          height: 6px;
          background: #3b82f6;
          border-radius: 50%;
          animation: blink 2s ease-in-out infinite;
        }

        .title {
          font-family: 'Space Mono', monospace;
          font-size: 28px;
          font-weight: 700;
          color: #f0f4ff;
          letter-spacing: -0.02em;
          line-height: 1.1;
          margin-bottom: 8px;
        }
        .title span {
          color: #3b82f6;
        }

        .subtitle {
          font-size: 14px;
          color: rgba(148, 163, 184, 0.7);
          font-weight: 300;
          margin-bottom: 40px;
          line-height: 1.5;
        }

        .divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 28px;
        }
        .divider-line {
          flex: 1;
          height: 1px;
          background: rgba(59, 130, 246, 0.1);
        }
        .divider-text {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          color: rgba(100, 116, 139, 0.6);
          letter-spacing: 0.15em;
        }

        .google-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 14px 20px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 3px;
          color: #e2e8f0;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          letter-spacing: 0.01em;
          position: relative;
          overflow: hidden;
        }
        .google-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(59,130,246,0.08), transparent);
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .google-btn:hover {
          border-color: rgba(59, 130, 246, 0.35);
          background: rgba(255, 255, 255, 0.07);
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }
        .google-btn:hover::before { opacity: 1; }
        .google-btn:active { transform: translateY(0); }
        .google-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(59,130,246,0.2);
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        .error-box {
          margin-top: 16px;
          padding: 12px 14px;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 3px;
          color: #fca5a5;
          font-size: 13px;
          font-family: 'Space Mono', monospace;
          letter-spacing: 0.02em;
        }

        .footer-note {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid rgba(59, 130, 246, 0.08);
          font-size: 11px;
          color: rgba(100, 116, 139, 0.5);
          text-align: center;
          font-family: 'Space Mono', monospace;
          letter-spacing: 0.08em;
          line-height: 1.8;
        }

        .stat-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 32px;
          padding: 14px 0;
          border-top: 1px solid rgba(59,130,246,0.08);
          border-bottom: 1px solid rgba(59,130,246,0.08);
        }
        .stat {
          text-align: center;
        }
        .stat-value {
          font-family: 'Space Mono', monospace;
          font-size: 16px;
          font-weight: 700;
          color: #3b82f6;
        }
        .stat-label {
          font-size: 10px;
          color: rgba(100,116,139,0.5);
          letter-spacing: 0.1em;
          margin-top: 2px;
          font-family: 'Space Mono', monospace;
        }
      `}</style>

      <div className="login-page">
        <GridBackground />
        <DataBlobs />
        <Sparklines />

        <div className="card">
          <div className="corner corner-tl" />
          <div className="corner corner-tr" />
          <div className="corner corner-bl" />
          <div className="corner corner-br" />

          <div className="tag">URBAN_PULSE</div>

          <h1 className="title">
            Urban<span>Pulse</span>
          </h1>
          <p className="subtitle">
            City intelligence platform: traffic, air quality & weather analytics
          </p>

          <div className="stat-row">
            <div className="stat">
              <div className="stat-value">3</div>
              <div className="stat-label">DATA FEEDS</div>
            </div>
            <div className="stat">
              <div className="stat-value">24H</div>
              <div className="stat-label">COVERAGE</div>
            </div>
            <div className="stat">
              <div className="stat-value">ML</div>
              <div className="stat-label">POWERED</div>
            </div>
          </div>

          <div className="divider">
            <div className="divider-line" />
            <span className="divider-text">SIGN IN TO CONTINUE</span>
            <div className="divider-line" />
          </div>

          <button
            className="google-btn"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="spinner" />
                Redirecting to Google...
              </>
            ) : (
              <>
                <GoogleIcon />
                Continue with Google
              </>
            )}
          </button>

          {error && <div className="error-box">⚠ {error}</div>}

          <div className="footer-note">
            ACCESS RESTRICTED TO AUTHORIZED USERS<br />
            CONTACT ADMIN TO REQUEST ANALYST / ADMIN ROLES
          </div>
        </div>
      </div>
    </>
  )
}