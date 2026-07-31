import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import './AuthPage.css'

export default function AuthPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (mode === 'login') {
        await login(form.email, form.password)
      } else {
        await register(form.name, form.email, form.password)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function switchMode() {
    setMode(m => m === 'login' ? 'register' : 'login')
    setError('')
    setForm({ name: '', email: '', password: '' })
  }

  return (
    <div className="auth-page">
      {/* Animated background */}
      <div className="auth-bg">
        <div className="auth-bg-grid" />
        <div className="auth-orb orb-1" />
        <div className="auth-orb orb-2" />
        <div className="auth-orb orb-3" />
      </div>

      {/* Floating network nodes */}
      <div className="auth-nodes">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="auth-node" style={{ '--i': i }} />
        ))}
      </div>

      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <svg viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="18" stroke="#00d4ff" strokeWidth="2" />
              <circle cx="20" cy="20" r="10" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="4 2" />
              <circle cx="20" cy="20" r="3" fill="#00d4ff" />
              <line x1="20" y1="2" x2="20" y2="8" stroke="#00d4ff" strokeWidth="2" />
              <line x1="20" y1="32" x2="20" y2="38" stroke="#00d4ff" strokeWidth="2" />
              <line x1="2" y1="20" x2="8" y2="20" stroke="#00d4ff" strokeWidth="2" />
              <line x1="32" y1="20" x2="38" y2="20" stroke="#00d4ff" strokeWidth="2" />
            </svg>
          </div>
          <div>
            <div className="auth-brand">NetScan Pro</div>
            <div className="auth-tagline">Network Device Scanner</div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'auth-tab-active' : ''}`} onClick={() => { setMode('login'); setError('') }}>
            Sign In
          </button>
          <button className={`auth-tab ${mode === 'register' ? 'auth-tab-active' : ''}`} onClick={() => { setMode('register'); setError('') }}>
            Register
          </button>
        </div>

        <div className="auth-form-header">
          <h2>{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
          <p>{mode === 'login' ? 'Sign in to monitor your network' : 'Start monitoring your network today'}</p>
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
            <label>Email Address</label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon">✉️</span>
              <input
                type="email"
                name="email"
                placeholder="Enter your email"
                value={form.email}
                onChange={handleChange}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="auth-field">
            <label>Password</label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon">🔒</span>
              <input
                type="password"
                name="password"
                placeholder={mode === 'register' ? 'Min. 6 characters' : 'Enter your password'}
                value={form.password}
                onChange={handleChange}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
          </div>

          {error && (
            <div className="auth-error">
              <span>⚠️</span> {error}
            </div>
          )}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? (
              <><span className="auth-spin">⟳</span> {mode === 'login' ? 'Signing in...' : 'Creating account...'}</>
            ) : (
              mode === 'login' ? '→ Sign In' : '→ Create Account'
            )}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          <button onClick={switchMode}>{mode === 'login' ? 'Register' : 'Sign In'}</button>
        </div>

        <div className="auth-footer">
          <span className="auth-secure-badge">🛡️ Secured with JWT · Passwords encrypted with bcrypt</span>
        </div>
      </div>
    </div>
  )
}
