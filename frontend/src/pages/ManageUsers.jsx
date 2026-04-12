import {useState, useEffect, useCallback, useRef} from 'react'
import {useAuth} from '../context/AuthContext'

const ROLES = ['general_user', 'analyst', 'admin']

const ROLE_CONFIG = {
    admin: {label: 'Admin', color: '#f59e0b'},
    analyst: {label: 'Analyst', color: '#10b981'},
    general_user: {label: 'General User', color: '#3b82f6'},
}

// Role selector dropdown
function RoleDropdown({userId, currentRole, onChanged}) {
    const {authFetch} = useAuth()
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const wrapRef = useRef(null)

    useEffect(() => {
        if (!open) return

        function onClickOutside(e) {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) {
                setOpen(false)
            }
        }

        document.addEventListener('mousedown', onClickOutside, true)
        return () => document.removeEventListener('mousedown', onClickOutside, true)
    }, [open])

    async function changeRole(newRole) {
        if (newRole === currentRole) {
            setOpen(false);
            return
        }
        setLoading(true)
        setOpen(false)
        try {
            await authFetch(`/api/auth/users/${userId}/role`, {
                method: 'PATCH',
                body: JSON.stringify({role: newRole}),
            })
            onChanged(userId, newRole)
        } catch (err) {
            alert(`Failed to change role: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    const cfg = ROLE_CONFIG[currentRole] || ROLE_CONFIG.general_user

    return (
        <div ref={wrapRef} style={{position: 'relative', userSelect: 'none'}}>

            <button
                onClick={() => !loading && setOpen(o => !o)}
                disabled={loading}
                style={{
                    width: 148, display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 8,
                    padding: '7px 12px', borderRadius: 3,
                    border: `1px solid ${cfg.color}40`,
                    background: cfg.color + '10',
                    cursor: loading ? 'wait' : 'pointer',
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 10, letterSpacing: '0.1em',
                }}
            >
        <span style={{display: 'flex', alignItems: 'center', gap: 6}}>
          <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: loading ? 'rgba(148,163,184,0.4)' : cfg.color,
              flexShrink: 0,
          }}/>
          <span style={{color: loading ? 'rgba(148,163,184,0.4)' : cfg.color}}>
            {loading ? 'SAVING...' : cfg.label.toUpperCase()}
          </span>
        </span>
                <span style={{opacity: 0.35, color: '#e2e8f0', fontSize: 9}}>
          {open ? '▴' : '▾'}
        </span>
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0,
                    zIndex: 200,
                    background: '#0d1526',
                    border: '1px solid rgba(59,130,246,0.25)',
                    borderRadius: 4, overflow: 'hidden',
                    minWidth: 148,
                    boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
                    pointerEvents: 'all',
                }}>
                    {ROLES.map(r => {
                        const c = ROLE_CONFIG[r]
                        const sel = r === currentRole
                        return (
                            <button
                                key={r}
                                onMouseDown={e => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    changeRole(r)
                                }}
                                style={{
                                    width: '100%', padding: '10px 14px',
                                    border: 'none',
                                    borderLeft: sel ? `2px solid ${c.color}` : '2px solid transparent',
                                    cursor: 'pointer', textAlign: 'left',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    fontFamily: "'Space Mono', monospace",
                                    fontSize: 10, letterSpacing: '0.1em',
                                    color: sel ? c.color : 'rgba(148,163,184,0.65)',
                                    background: sel ? c.color + '14' : 'transparent',
                                }}
                                onMouseEnter={e => {
                                    if (!sel) e.currentTarget.style.background = c.color + '18'
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = sel ? c.color + '14' : 'transparent'
                                }}
                            >
                                <span style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: c.color,
                                    flexShrink: 0
                                }}/>
                                {c.label.toUpperCase()}
                                {sel && <span style={{marginLeft: 'auto', opacity: 0.45, fontSize: 11}}>✓</span>}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// Main component
export default function UserManagement() {
    const {authFetch, profile: currentUser} = useAuth()
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const fetchUsers = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await authFetch('/api/auth/users')
            setUsers(data)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [authFetch])

    useEffect(() => {
        fetchUsers()
    }, [fetchUsers])

    function handleRoleChanged(userId, newRole) {
        setUsers(prev => prev.map(u => u.id === userId ? {...u, role: newRole} : u))
    }

    async function handleDelete(user) {
        if (user.id === currentUser?.id) {
            alert("You can't delete your own account.")
            return
        }
        if (!window.confirm(`Permanently delete ${user.full_name || user.email}?\nThis removes their account from Auth and cannot be undone.`)) return

        try {
            await authFetch(`/api/auth/users/${user.id}`, {method: 'DELETE'})
            setUsers(prev => prev.filter(u => u.id !== user.id))
        } catch (err) {
            alert(`Delete failed: ${err.message}`)
        }
    }

    function formatDate(iso) {
        if (!iso) return '—'
        return new Date(iso).toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'})
    }

    function initials(user) {
        const name = user.full_name || user.email || '?'
        return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
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
        .admin-page {
          min-height: 100vh; background: #080c14;
          padding: 80px 0 60px; font-family: 'DM Sans', sans-serif;
          position: relative;
        }
        .admin-bg-grid {
          position: absolute; inset: 0; pointer-events: none; opacity: 0.04;
          background-image:
            linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .admin-content {
          position: relative; z-index: 1;
          max-width: 1100px; margin: 0 auto; padding: 0 32px;
        }
        .admin-header {
          padding: 48px 0 32px;
          display: flex; justify-content: space-between; align-items: flex-end;
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
        .user-count {
          font-family: 'Space Mono', monospace; font-size: 11px; letter-spacing: 0.15em;
          color: rgba(148,163,184,0.4); margin-top: 6px;
        }

        .user-list { display: flex; flex-direction: column; gap: 10px; }

        .user-row {
          background: rgba(10,16,28,0.7);
          border: 1px solid rgba(59,130,246,0.1);
          border-radius: 4px; padding: 18px 24px;
          display: flex; align-items: center; justify-content: space-between; gap: 20px;
          transition: border-color 0.2s ease, transform 0.15s ease;
        }
        // .user-row:hover { border-color: rgba(59,130,246,0.25); transform: translateX(3px); }
        .user-row.is-self { border-color: rgba(59,130,246,0.3); }

        .user-info { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; }
        .user-avatar {
          width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
          border: 1px solid rgba(59,130,246,0.3);
          background: rgba(59,130,246,0.1);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Space Mono', monospace; font-size: 14px; font-weight: 700; color: #3b82f6;
          overflow: hidden;
        }
        .user-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .user-name {
          font-family: 'Space Mono', monospace; font-size: 13px; font-weight: 700;
          color: #f0f4ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .user-email { font-size: 12px; color: rgba(148,163,184,0.55); margin-top: 3px; }
        .you-tag {
          font-family: 'Space Mono', monospace; font-size: 8px; letter-spacing: 0.15em;
          color: #3b82f6; border: 1px solid rgba(59,130,246,0.3);
          padding: 2px 6px; border-radius: 2px; margin-left: 8px; vertical-align: middle;
        }

        .user-meta { display: flex; align-items: center; gap: 24px; flex-shrink: 0; }
        .user-date {
          font-family: 'Space Mono', monospace; font-size: 10px;
          color: rgba(100,116,139,0.5); letter-spacing: 0.05em; white-space: nowrap;
        }

        .user-actions { display: flex; gap: 8px; align-items: center; }
        .btn-action {
          padding: 7px 12px; border-radius: 3px; border: 1px solid;
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.1em;
          cursor: pointer; transition: all 0.15s ease; background: transparent;
        }
        .btn-edit { border-color: rgba(59,130,246,0.2); color: rgba(148,163,184,0.7); }
        .btn-edit:hover { border-color: rgba(59,130,246,0.4); color: #e2e8f0; }
        .btn-delete { border-color: rgba(239,68,68,0.2); color: rgba(239,68,68,0.6); }
        .btn-delete:hover { border-color: #ef4444; color: #fca5a5; background: rgba(239,68,68,0.08); }
        .btn-delete:disabled { opacity: 0.3; cursor: not-allowed; }

        .state-msg {
          text-align: center; padding: 60px 0;
          font-family: 'Space Mono', monospace; font-size: 12px; letter-spacing: 0.15em;
          color: rgba(100,116,139,0.5);
        }
        .error-msg { color: #fca5a5; }
      `}</style>

            <div className="admin-page">
                <div className="admin-bg-grid"/>
                <div className="admin-content">

                    <div className="admin-header">
                        <div>
                            <div className="header-eyebrow">SYSTEM SETTINGS</div>
                            <h1 className="header-title">USER MANAGEMENT</h1>
                            {!loading && <div className="user-count">{users.length} REGISTERED
                                USER{users.length !== 1 ? 'S' : ''}</div>}
                        </div>
                    </div>

                    {loading && <div className="state-msg">LOADING USERS...</div>}
                    {error && <div className="state-msg error-msg">⚠ {error}</div>}

                    {!loading && !error && (
                        <div className="user-list">
                            {users.map(user => {
                                const isSelf = user.id === currentUser?.id

                                return (
                                    <div key={user.id} className={`user-row${isSelf ? ' is-self' : ''}`}>

                                        <div className="user-info">
                                            <div className="user-avatar">
                                                {user.avatar_url
                                                    ? <img src={user.avatar_url} alt=""/>
                                                    : initials(user)
                                                }
                                            </div>
                                            <div style={{minWidth: 0}}>
                                                <div className="user-name">
                                                    {user.full_name || 'Anonymous'}
                                                    {isSelf && <span className="you-tag">YOU</span>}
                                                </div>
                                                <div className="user-email">{user.email}</div>
                                            </div>
                                        </div>

                                        <div className="user-meta">
                                            <div className="user-date">
                                                JOINED {formatDate(user.created_at)}
                                            </div>

                                            <RoleDropdown
                                                userId={user.id}
                                                currentRole={user.role}
                                                onChanged={handleRoleChanged}
                                            />

                                            <div className="user-actions">
                                                <button
                                                    className="btn-action btn-delete"
                                                    onClick={() => handleDelete(user)}
                                                    disabled={isSelf}
                                                    title={isSelf ? "Can't delete your own account" : `Delete ${user.email}`}
                                                >
                                                    DROP
                                                </button>
                                            </div>
                                        </div>

                                    </div>
                                )
                            })}

                            {users.length === 0 && (
                                <div className="state-msg">NO USERS FOUND</div>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </>
    )
}