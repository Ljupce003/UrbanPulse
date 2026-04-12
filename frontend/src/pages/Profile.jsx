import {useAuth} from '../context/AuthContext'
import {useNavigate} from 'react-router-dom'

const ROLE_CONFIG = {
    admin: {label: 'Administrator', color: '#f59e0b', desc: 'Full access — user management, data, analytics'},
    analyst: {label: 'Analyst', color: '#10b981', desc: 'Data upload, model tuning, analytics access'},
    general_user: {label: 'General User', color: '#3b82f6', desc: 'View-only access to dashboards and reports'},
}

export default function Profile() {
    const {profile, role, logout} = useAuth()
    const navigate = useNavigate()
    const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.general_user

    const initials = profile?.full_name
        ? profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
        : profile?.email?.[0]?.toUpperCase() || '?'

    const joinedDate = profile?.created_at
        ? new Date(profile.created_at).toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric'})
        : null

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap');

        .profile-page {
          min-height: 100vh; background: #080c14;
          display: flex; align-items: center; justify-content: center;
          padding: 80px 24px 40px;
          font-family: 'DM Sans', sans-serif;
          position: relative; overflow: hidden;
        }

        .profile-bg-blob {
          position: absolute; border-radius: 50%; pointer-events: none;
        }

        .profile-card {
          position: relative; z-index: 10;
          width: 100%; max-width: 480px;
          background: rgba(10, 16, 28, 0.85);
          border: 1px solid rgba(59,130,246,0.15);
          border-radius: 4px;
          backdrop-filter: blur(24px);
          box-shadow: 0 32px 64px rgba(0,0,0,0.5);
          overflow: hidden;
        }

        .profile-header {
          padding: 40px 40px 32px;
          border-bottom: 1px solid rgba(59,130,246,0.08);
          display: flex; align-items: center; gap: 24px;
        }

        .profile-avatar {
          width: 72px; height: 72px; border-radius: 50%;
          border: 2px solid rgba(59,130,246,0.3);
          flex-shrink: 0; overflow: hidden;
          display: flex; align-items: center; justify-content: center;
          background: rgba(59,130,246,0.1);
          font-family: 'Space Mono', monospace;
          font-size: 24px; font-weight: 700; color: #3b82f6;
          box-shadow: 0 0 24px rgba(59,130,246,0.15);
        }
        .profile-avatar img { width: 100%; height: 100%; object-fit: cover; }

        .profile-name-block {}
        .profile-tag {
          font-family: 'Space Mono', monospace;
          font-size: 9px; letter-spacing: 0.25em;
          color: #3b82f6; opacity: 0.7; margin-bottom: 6px;
        }
        .profile-name {
          font-family: 'Space Mono', monospace;
          font-size: 20px; font-weight: 700;
          color: #f0f4ff; letter-spacing: -0.02em;
          line-height: 1.2;
        }
        .profile-email {
          font-size: 13px; color: rgba(148,163,184,0.55);
          margin-top: 4px; font-weight: 300;
        }

        .profile-body { padding: 32px 40px; display: flex; flex-direction: column; gap: 24px; }

        .profile-field {}
        .profile-field-label {
          font-family: 'Space Mono', monospace;
          font-size: 9px; letter-spacing: 0.2em;
          color: rgba(100,116,139,0.6); margin-bottom: 8px;
        }
        .profile-field-value {
          font-size: 14px; color: #e2e8f0; font-weight: 400;
        }

        .role-chip {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 14px; border-radius: 3px; border: 1px solid;
        }
        .role-dot { width: 6px; height: 6px; border-radius: 50%; }
        .role-label {
          font-family: 'Space Mono', monospace;
          font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
        }
        .role-desc {
          font-size: 12px; color: rgba(148,163,184,0.5);
          margin-top: 8px; font-weight: 300; line-height: 1.5;
        }

        .profile-divider {
          height: 1px; background: rgba(59,130,246,0.08); margin: 0 -40px;
        }

        .profile-actions { display: flex; gap: 10px; }

        .btn {
          flex: 1; padding: 12px;
          border-radius: 3px; border: 1px solid;
          font-family: 'Space Mono', monospace;
          font-size: 10px; letter-spacing: 0.15em;
          cursor: pointer; transition: all 0.2s ease;
        }
        .btn-secondary {
          background: transparent;
          border-color: rgba(59,130,246,0.2);
          color: rgba(148,163,184,0.7);
        }
        .btn-secondary:hover {
          border-color: rgba(59,130,246,0.4);
          color: #e2e8f0; background: rgba(59,130,246,0.06);
        }
        .btn-danger {
          background: transparent;
          border-color: rgba(239,68,68,0.2);
          color: rgba(239,68,68,0.7);
        }
        .btn-danger:hover {
          border-color: rgba(239,68,68,0.4);
          color: #fca5a5; background: rgba(239,68,68,0.06);
        }

        .corner { position: absolute; width: 10px; height: 10px; border-color: rgba(59,130,246,0.4); border-style: solid; }
        .c-tl { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
        .c-tr { top: -1px; right: -1px; border-width: 2px 2px 0 0; }
        .c-bl { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; }
        .c-br { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }
      `}</style>

            <div className="profile-page">
                <div className="profile-bg-blob" style={{
                    top: '-15%', right: '-10%', width: 400, height: 400,
                    background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
                }}/>
                <div className="profile-bg-blob" style={{
                    bottom: '-10%', left: '-10%', width: 350, height: 350,
                    background: `radial-gradient(circle, ${cfg.color}14 0%, transparent 70%)`,
                }}/>

                <div className="profile-card">
                    <div className="corner c-tl"/>
                    <div className="corner c-tr"/>
                    <div className="corner c-bl"/>
                    <div className="corner c-br"/>

                    {/* Header */}
                    <div className="profile-header">
                        <div className="profile-avatar">
                            {profile?.avatar_url
                                ? <img src={profile.avatar_url} alt="avatar"/>
                                : initials}
                        </div>
                        <div className="profile-name-block">
                            <div className="profile-tag">USER_PROFILE</div>
                            <div className="profile-name">{profile?.full_name || 'Anonymous'}</div>
                            <div className="profile-email">{profile?.email}</div>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="profile-body">

                        {/* Role */}
                        <div className="profile-field">
                            <div className="profile-field-label">ACCESS LEVEL</div>
                            <div
                                className="role-chip"
                                style={{borderColor: cfg.color + '40', background: cfg.color + '10'}}
                            >
                                <div className="role-dot" style={{background: cfg.color}}/>
                                <span className="role-label" style={{color: cfg.color}}>{cfg.label}</span>
                            </div>
                            <div className="role-desc">{cfg.desc}</div>
                        </div>

                        {/* Auth provider */}
                        <div className="profile-field">
                            <div className="profile-field-label">AUTHENTICATION</div>
                            <div className="profile-field-value"
                                 style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                    <path
                                        d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                                        fill="#4285F4"/>
                                    <path
                                        d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24z"
                                        fill="#34A853"/>
                                    <path
                                        d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"
                                        fill="#FBBC05"/>
                                    <path
                                        d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                                        fill="#EA4335"/>
                                </svg>
                                Google OAuth 2.0
                            </div>
                        </div>

                        {joinedDate && (
                            <div className="profile-field">
                                <div className="profile-field-label">MEMBER SINCE</div>
                                <div className="profile-field-value">{joinedDate}</div>
                            </div>
                        )}

                        <div className="profile-divider"/>

                        {/* Actions */}
                        <div className="profile-actions">
                            <button className="btn btn-secondary" onClick={() => navigate(-1)}>
                                ← BACK
                            </button>
                            <button className="btn btn-danger" onClick={logout}>
                                → SIGN OUT
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        </>
    )
}