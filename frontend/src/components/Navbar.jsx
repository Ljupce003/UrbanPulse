import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ROLE_BADGE = {
  admin:        { label: 'ADMIN',    color: '#f59e0b' },
  analyst:      { label: 'ANALYST',  color: '#10b981' },
  general_user: { label: 'VIEWER',   color: '#3b82f6' },
}

export default function Navbar() {
  const { profile, role, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const badge = ROLE_BADGE[role] || ROLE_BADGE.general_user
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : profile?.email?.[0]?.toUpperCase() || '?'

  const navLinks = [
    { to: '/',         label: 'DASHBOARD' },
    { to: '/analyzer', label: 'ANALYZER'  },
    { to: '/simulate', label: 'SIMULATOR' },
    ...(role === 'analyst' || role === 'admin'
      ? [{ to: '/data', label: 'DATA' }] : []),
    ...(role === 'admin'
      ? [{ to: '/admin/users', label: 'USERS' }] : []),
  ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap');

        .navbar {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          height: 56px;
          background: rgba(8, 12, 20, 0.92);
          border-bottom: 1px solid rgba(59,130,246,0.1);
          backdrop-filter: blur(16px);
          display: flex; align-items: center;
          padding: 0 24px;
          gap: 0;
          font-family: 'Space Mono', monospace;
        }

        .nb-brand {
          font-size: 15px; font-weight: 700;
          color: #f0f4ff; letter-spacing: -0.02em;
          text-decoration: none; margin-right: 40px;
          display: flex; align-items: center; gap: 8px;
          flex-shrink: 0;
        }
        .nb-brand span { color: #3b82f6; }
        .nb-dot {
          width: 6px; height: 6px; background: #3b82f6; border-radius: 50%;
          animation: nbpulse 2s ease-in-out infinite;
        }
        @keyframes nbpulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

        .nb-links {
          display: flex; align-items: center; gap: 4px; flex: 1;
        }
        .nb-link {
          font-size: 10px; letter-spacing: 0.15em;
          color: rgba(148,163,184,0.5);
          text-decoration: none;
          padding: 6px 12px; border-radius: 2px;
          transition: all 0.15s ease;
          border: 1px solid transparent;
        }
        .nb-link:hover {
          color: #e2e8f0;
          background: rgba(59,130,246,0.06);
          border-color: rgba(59,130,246,0.15);
        }
        .nb-link.active {
          color: #3b82f6;
          background: rgba(59,130,246,0.08);
          border-color: rgba(59,130,246,0.2);
        }

        .nb-right {
          display: flex; align-items: center; gap: 12px; flex-shrink: 0;
        }

        .nb-badge {
          font-size: 9px; letter-spacing: 0.2em; font-weight: 700;
          padding: 3px 8px; border-radius: 2px;
          border: 1px solid;
        }

        .nb-avatar {
          width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700; cursor: pointer;
          border: 1px solid rgba(59,130,246,0.3);
          transition: all 0.2s ease; position: relative;
          overflow: hidden; flex-shrink: 0;
          background: rgba(59,130,246,0.1);
          color: #3b82f6;
          font-family: 'Space Mono', monospace;
        }
        .nb-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .nb-avatar:hover {
          border-color: #3b82f6;
          box-shadow: 0 0 12px rgba(59,130,246,0.3);
        }

        .nb-dropdown {
          position: absolute; top: calc(100% + 8px); right: 0;
          width: 200px;
          background: rgba(10,16,28,0.98);
          border: 1px solid rgba(59,130,246,0.15);
          border-radius: 4px;
          padding: 8px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.6);
        }
        .nb-dropdown-header {
          padding: 8px 10px 10px;
          border-bottom: 1px solid rgba(59,130,246,0.08);
          margin-bottom: 6px;
        }
        .nb-dd-name {
          font-size: 12px; color: #e2e8f0; font-weight: 700; letter-spacing: 0.05em;
        }
        .nb-dd-email {
          font-size: 10px; color: rgba(148,163,184,0.5); margin-top: 2px;
          letter-spacing: 0.03em; word-break: break-all;
          font-family: 'DM Sans', sans-serif;
        }
        .nb-dd-btn {
          width: 100%; text-align: left; background: none; border: none;
          color: rgba(148,163,184,0.6); font-family: 'Space Mono', monospace;
          font-size: 10px; letter-spacing: 0.12em; padding: 8px 10px;
          cursor: pointer; border-radius: 2px;
          transition: all 0.15s ease; display: flex; align-items: center; gap: 8px;
        }
        .nb-dd-btn:hover { background: rgba(59,130,246,0.08); color: #e2e8f0; }
        .nb-dd-btn.danger:hover { background: rgba(239,68,68,0.08); color: #fca5a5; }

        .nb-avatar-wrap { position: relative; }
      `}</style>

      <nav className="navbar">
        {/* Brand */}
        <NavLink to="/" className="nb-brand">
          <div className="nb-dot" />
          Urban<span>Pulse</span>
        </NavLink>

        {/* Nav links — filtered by role */}
        <div className="nb-links">
          {navLinks.map(({ to, label }) => (
            <NavLink
              key={to} to={to}
              className={({ isActive }) => `nb-link${isActive ? ' active' : ''}`}
              end={to === '/'}
            >
              {label}
            </NavLink>
          ))}
        </div>

        <div className="nb-right">
          <div
            className="nb-badge"
            style={{ color: badge.color, borderColor: badge.color + '40', background: badge.color + '12' }}
          >
            {badge.label}
          </div>

          <div className="nb-avatar-wrap">
            <div
              className="nb-avatar"
              onClick={() => setMenuOpen(o => !o)}
              title={profile?.email}
            >
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="avatar" />
                : initials
              }
            </div>

            {menuOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                  onClick={() => setMenuOpen(false)}
                />
                <div className="nb-dropdown" style={{ zIndex: 100 }}>
                  <div className="nb-dropdown-header">
                    <div className="nb-dd-name">{profile?.full_name || 'User'}</div>
                    <div className="nb-dd-email">{profile?.email}</div>
                  </div>

                  <button className="nb-dd-btn" onClick={() => { navigate('/profile'); setMenuOpen(false) }}>
                    ↗ VIEW PROFILE
                  </button>

                  {role === 'admin' && (
                    <button className="nb-dd-btn" onClick={() => { navigate('/admin/users'); setMenuOpen(false) }}>
                      ⚙ MANAGE USERS
                    </button>
                  )}

                  <button
                    className="nb-dd-btn danger"
                    onClick={() => { setMenuOpen(false); logout() }}
                  >
                    → SIGN OUT
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>
    </>
  )
}