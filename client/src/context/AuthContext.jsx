import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

const API = 'http://localhost:3001/api/auth'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loginMode, setLoginMode] = useState('dashboard') // 'dashboard' | 'admin'

  useEffect(() => {
    const token = localStorage.getItem('netscan_token')
    if (!token) { setLoading(false); return }
    fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data.user) {
          setUser(data.user)
        } else {
          localStorage.removeItem('netscan_token')
        }
      })
      .catch(() => {
        localStorage.removeItem('netscan_token')
      })
      .finally(() => setLoading(false))
  }, [])

  async function login(email, password, mode = 'dashboard') {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Login failed')
    localStorage.setItem('netscan_token', data.token)
    setLoginMode(mode)
    setUser(data.user)
    return data.user
  }

  async function register(name, email, password) {
    const res = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Registration failed')
    
    // Auto-login upon successful registration
    if (data.token && data.user) {
      localStorage.setItem('netscan_token', data.token)
      setUser(data.user)
      if (data.user.role === 'admin') {
        setLoginMode('admin')
      } else {
        setLoginMode('dashboard')
      }
    }
    return data.user
  }

  function logout() {
    localStorage.removeItem('netscan_token')
    setUser(null)
    setLoginMode('dashboard')
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginMode, setLoginMode, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
