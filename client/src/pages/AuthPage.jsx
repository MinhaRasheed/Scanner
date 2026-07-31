import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import './AuthPage.css'

export default function AuthPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'admin'
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setError('')
  }

  function switchMode(newMode) {
    setMode(newMode)
    setError('')
    setForm({ name: '', email: '', password: '' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (mode === 'register') {
        await register(form.name, form.email, form.password)
      } else if (mode === 'admin') {
        const user = await login(form.email, form.password, 'admin')
        if (user.role !== 'admin') {
          localStorage.removeItem('netscan_token')
          throw new Error('Access denied — this account does not have admin privileges.')
        }
      } else {
        await login(form.email, form.password, 'dashboard')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isAdmin = mode === 'admin'

  return (
    <div className={`auth-page ${isAdmin ? 'auth-page-admin' : ''}`}>
      <div className="auth-bg">
        <div className="auth-bg-grid" />
        <div className={`auth-orb orb-1 ${isAdmin ? 'orb-admin-1' : ''}`} />
        <div className={`auth-orb orb-2 ${isAdmin ? 'orb-admin-2' : ''}`} />
        <div className="auth-orb orb-3" />
      </div>

      <div className="auth-nodes">
        {[...Array(8)].map((_, i) => (
          <div key={i} className={`auth-node ${isAdmin ? 'auth-node-admin' : ''}`} style={{ '--i': i }} />
        ))}
      </div>

      <div className={`auth-card ${isAdmin ? 'auth-card-admin' : ''}`}>
        {/* Logo */}
        <div className="auth-logo">
          <div className={`auth-logo-icon ${isAdmin ? 'auth-logo-icon-admin' : ''}`}>
            {isAdmin ? (
              <svg viewBox="0 0 40 40" fill="none">
                <path d="M20 4L6 10v10c0 8.3 5.9 16 14 18 8.1-2 14-9.7 14-18V10L20 4z" stroke="#a855f7" strokeWidth="2" fill="rgba(168,85,247,0.1)" />
                <path d="M14 20l4 4 8-8" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="18" stroke="#00d4ff" strokeWidth="2" />
                <circle cx="20" cy="20" r="10" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="4 2" />
                <circle cx="20" cy="20" r="3" fill="#00d4ff" />
                <line x1="20" y1="2" x2="20" y2="8" stroke="#00d4ff" strokeWidth="2" />
                <line x1="20" y1="32" x2="20" y2="38" stroke="#00d4ff" strokeWidth="2" />
                <line x1="2" y1="20" x2="8" y2="20" stroke="#00d4ff" strokeWidth="2" />
                <line x1="32" y1="20" x2="38" y2="20" stroke="#00d4ff" strokeWidth="2" />
              </svg>
            )}
          </div>
          <div>
            <div className={`auth-brand ${isAdmin ? 'auth-brand-admin' : ''}`}>
              {isAdmin ? 'Admin Portal' : 'NetScan Pro'}
            </div>
            <div className="auth-tagline">
              {isAdmin ? 'Restricted Access · Admins Only' : 'Network Device Scanner'}
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'auth-tab-active' : ''}`} onClick={() => switchMode('login')}>
            Sign In
          </button>
          <button className={`auth-tab ${mode === 'register' ? 'auth-tab-active' : ''}`} onClick={() => switchMode('register')}>
            Register
          </button>
          <button className={`auth-tab auth-tab-admin ${mode === 'admin' ? 'auth-tab-admin-active' : ''}`} onClick={() => switchMode('admin')}>
            🛡️ Admin
          </button>
        </div>

        {/* Admin warning banner */}
        {isAdmin && (
          <div className="admin-login-banner">
            <span className="admin-banner-icon">⚠️</span>
            <span>This portal is restricted to administrators only. Unauthorized access attempts are logged.</span>
          </div>
        )}

        <div className="auth-form-header">
          <h2>
            {mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create account' : 'Admin Sign In'}
          </h2>
          <p>
            {mode === 'login'
              ? 'Sign in to monitor your network'
              : mode === 'register'
              ? 'Start monitoring your network today'
              : 'Enter your administrator credentials'}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="auth-field">
              <label>Full Name</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">👤</span>
                <input
                  type="text"
                  name="name"
                  placeholder="Enter your name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  autoComplete="name"
                />
              </div>
            </div>
          )}

          <div className="auth-field">
            <label>{isAdmin ? 'Admin Email' : 'Email Address'}</label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon">{isAdmin ? '🛡️' : '✉️'}</span>
              <input
                type="email"
                name="email"
                placeholder={isAdmin ? 'Enter admin email' : 'Enter your email'}
                value={form.email}
                onChange={handleChange}
                required
                autoComplete="email"
                className={isAdmin ? 'input-admin' : ''}
              />
            </div>
          </div>

          <div className="auth-field">
            <label>{isAdmin ? 'Admin Password' : 'Password'}</label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon">🔒</span>
              <input
                type="password"
                name="password"
                placeholder={mode === 'register' ? 'Min. 6 characters' : isAdmin ? 'Enter admin password' : 'Enter your password'}
                value={form.password}
                onChange={handleChange}
                required
                autoComplete={mode === 'login' || mode === 'admin' ? 'current-password' : 'new-password'}
                className={isAdmin ? 'input-admin' : ''}
              />
            </div>
          </div>

          {error && (
            <div className={`auth-error ${isAdmin ? 'auth-error-admin' : ''}`}>
              <span>{isAdmin ? '🚫' : '⚠️'}</span> {error}
            </div>
          )}

          <button className={`auth-submit ${isAdmin ? 'auth-submit-admin' : ''}`} type="submit" disabled={loading}>
            {loading ? (
              <><span className="auth-spin">⟳</span> {isAdmin ? 'Verifying...' : mode === 'login' ? 'Signing in...' : 'Creating account...'}</>
            ) : (
              isAdmin ? '🛡️ Access Admin Panel' : mode === 'login' ? '→ Sign In' : '→ Create Account'
            )}
          </button>
        </form>

        {!isAdmin && (
          <div className="auth-switch">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            <button onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Register' : 'Sign In'}
            </button>
          </div>
        )}

        {isAdmin && (
          <div className="auth-switch">
            Not an admin?
            <button onClick={() => switchMode('login')}>User Sign In</button>
          </div>
        )}

        <div className="auth-footer">
          <span className="auth-secure-badge">
            {isAdmin ? '🔐 Admin sessions are monitored and logged' : '🛡️ Secured with JWT · Passwords encrypted with bcrypt'}
          </span>
        </div>
      </div>
    </div>
  )
}
