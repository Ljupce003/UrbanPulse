import {useState, useEffect} from 'react'
import {useAuth} from '../context/AuthContext'

const API = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '')

export default function Status() {
    const {authFetch} = useAuth()
    const [status, setStatus] = useState(null)
    const [analyzerHealth, setAnalyzerHealth] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [lastUpdated, setLastUpdated] = useState(null)

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                setLoading(true)
                setError(null)

                // Fetch main status
                const statusRes = await fetch(`${API}/health`)
                if (!statusRes.ok) {
                    setError(`Status fetch failed: ${statusRes.status}`)
                    setLoading(false)
                    return
                }
                const statusData = await statusRes.json()
                setStatus(statusData)

                // Fetch analyzer health
                try {
                    const analyzerRes = await authFetch('/api/analyzer/cause/health')
                    setAnalyzerHealth(analyzerRes)
                } catch {
                    setAnalyzerHealth({status: 'unavailable', message: 'Could not fetch analyzer health'})
                }

                setLastUpdated(new Date())
            } catch (err) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }

        fetchStatus()
        const interval = setInterval(fetchStatus, 30000) // Refresh every 30s
        return () => clearInterval(interval)
    }, [authFetch])

    const formatTime = (date) => {
        if (!date) return '—'
        return date.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', second: '2-digit'})
    }

    const formatRoute = (route) => {
        if (route.startsWith('/api')) return route
        return `${route}`
    }

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; }
        body {
          margin: 0;
          overflow-x: hidden !important;
        }
        .status-page {
          min-height: 100vh; background: #080c14;
          padding: 80px 0 60px; font-family: 'DM Sans', sans-serif;
          position: relative;
        }
        .status-bg-grid {
          position: absolute; inset: 0; pointer-events: none; opacity: 0.04;
          background-image:
            linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .status-content {
          position: relative; z-index: 1;
          max-width: 1100px; margin: 0 auto; padding: 0 32px;
        }
        .status-header {
          padding: 48px 0 32px;
          display: flex; justify-content: space-between; align-items: flex-end;
          border-bottom: 1px solid rgba(59,130,246,0.08); margin-bottom: 40px;
        }
        .header-eyebrow {
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.25em;
          color: #3b82f6; margin-bottom: 10px;
          display: flex; align-items: center; gap: 8px;
        }
        .header-eyebrow::before { content: ''; width: 24px; height: 1px; background: #3b82f6; opacity: 0.6; }
        .header-title {
          font-family: 'Space Mono', monospace; font-size: 32px; font-weight: 700;
          color: #f0f4ff; letter-spacing: -0.03em; line-height: 1.1;
        }
        .header-sub {
          font-size: 12px; color: rgba(148,163,184,0.5); margin-top: 6px;
        }

        .status-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 20px; margin-bottom: 40px;
        }

        .status-card {
          background: rgba(10,16,28,0.7); border: 1px solid rgba(59,130,246,0.1);
          border-radius: 4px; padding: 24px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .status-card:hover { border-color: rgba(59,130,246,0.25); }

        .card-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 16px;
        }
        .card-title {
          font-family: 'Space Mono', monospace; font-size: 12px; letter-spacing: 0.15em;
          color: #e2e8f0; font-weight: 700;
        }
        .status-dot {
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        }
        .status-dot.ok { background: #10b981; }
        .status-dot.warning { background: #f59e0b; }
        .status-dot.error { background: #ef4444; }
        .status-dot.unknown { background: rgba(100,116,139,0.4); }

        .card-content {
          display: flex; flex-direction: column; gap: 12px;
        }
        .info-row {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 13px; color: rgba(148,163,184,0.75);
          padding: 8px; background: rgba(0,0,0,0.3); border-radius: 3px;
        }
        .info-label {
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.1em;
          color: rgba(100,116,139,0.6);
        }
        .info-value {
          font-family: 'Space Mono', monospace; font-size: 12px; font-weight: 700;
          color: #e2e8f0;
        }

        .routes-list {
          display: flex; flex-direction: column; gap: 8px;
          max-height: 420px; overflow-y: auto;
          padding-right: 4px;
        }
        .route-item {
          padding: 10px 12px;
          background: rgba(59,130,246,0.06);
          border-left: 2px solid rgba(59,130,246,0.3);
          border-radius: 2px;
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          line-height: 1.45;
          letter-spacing: 0.02em;
          color: rgba(203,213,225,0.9);
          overflow-wrap: anywhere;
          word-break: break-word;
          white-space: normal;
        }

        .loading-spinner {
          width: 32px; height: 32px; border-radius: 50%;
          border: 2px solid rgba(59,130,246,0.2);
          border-top: 2px solid #3b82f6;
          animation: spin 0.8s linear infinite;
          margin: 40px auto;
        }
        @keyframes spin { to { transform: rotate(360deg) } }

        .error-msg {
          padding: 16px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
          border-radius: 4px; color: #fca5a5; font-family: 'Space Mono', monospace; font-size: 12px;
          margin: 20px 0;
        }

        .refresh-note {
          font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 0.15em;
          color: rgba(100,116,139,0.5); text-align: center; margin-top: 40px;
        }

        /* Scrollbar */
        .routes-list::-webkit-scrollbar {
          width: 6px;
        }
        .routes-list::-webkit-scrollbar-track {
          background: rgba(59,130,246,0.05);
          border-radius: 3px;
        }
        .routes-list::-webkit-scrollbar-thumb {
          background: rgba(59,130,246,0.3);
          border-radius: 3px;
        }
        .routes-list::-webkit-scrollbar-thumb:hover {
          background: rgba(59,130,246,0.5);
        }
      `}</style>

            <div className="status-page">
                <div className="status-bg-grid"/>
                <div className="status-content">

                    <div className="status-header">
                        <div>
                            <div className="header-eyebrow">SYSTEM OVERVIEW</div>
                            <h1 className="header-title">SYSTEM STATUS</h1>
                            {lastUpdated && (
                                <div className="header-sub">Last updated: {formatTime(lastUpdated)}</div>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="error-msg">⚠ Failed to fetch status: {error}</div>
                    )}

                    {loading ? (
                        <div className="loading-spinner"/>
                    ) : (
                        <>
                            <div className="status-grid">
                                {/* API Server Status */}
                                <div className="status-card">
                                    <div className="card-header">
                                        <div className="card-title">API SERVER</div>
                                        <div className={`status-dot ${status?.status === 'ok' ? 'ok' : 'unknown'}`}/>
                                    </div>
                                    <div className="card-content">
                                        <div className="info-row">
                                            <span className="info-label">STATUS</span>
                                            <span className="info-value">{status?.status === 'ok' ? '🟢 ONLINE' : '⚪ UNKNOWN'}</span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">ROUTES</span>
                                            <span className="info-value">{status?.routes?.length || 0}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Analyzer Health */}
                                <div className="status-card">
                                    <div className="card-header">
                                        <div className="card-title">ML ANALYZER</div>
                                        <div className={`status-dot ${
                                            analyzerHealth?.status === 'ready' ? 'ok' :
                                                analyzerHealth?.status === 'loading' ? 'warning' : 'error'
                                        }`}/>
                                    </div>
                                    <div className="card-content">
                                        <div className="info-row">
                                            <span className="info-label">STATUS</span>
                                            <span className="info-value">
                                                {analyzerHealth?.status === 'ready' ? '🟢 READY' :
                                                    analyzerHealth?.status === 'loading' ? '🟡 LOADING' : '🔴 ERROR'}
                                            </span>
                                        </div>
                                        {analyzerHealth?.version && (
                                            <div className="info-row">
                                                <span className="info-label">VERSION</span>
                                                <span className="info-value">{analyzerHealth.version}</span>
                                            </div>
                                        )}
                                        {analyzerHealth?.message && (
                                            <div className="info-row">
                                                <span className="info-label">MESSAGE</span>
                                                <span className="info-value" style={{fontSize: '10px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                                    {analyzerHealth.message}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Available Routes */}
                            {status?.routes && status.routes.length > 0 && (
                                <div className="status-card">
                                    <div className="card-header">
                                        <div className="card-title">AVAILABLE ENDPOINTS ({status.routes.length})</div>
                                    </div>
                                    <div className="routes-list">
                                        {status.routes.map((route, idx) => (
                                            <div key={idx} className="route-item" title={route}>
                                                {formatRoute(route)}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="refresh-note">
                                This page refreshes every 30 seconds
                            </div>
                        </>
                    )}

                </div>
            </div>
        </>
    )
}

