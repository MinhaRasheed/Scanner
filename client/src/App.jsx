import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import DeviceCard from './components/DeviceCard'
import StatsBar from './components/StatsBar'
import ScanAnimation from './components/ScanAnimation'
import FilterBar from './components/FilterBar'
import AuthPage from './pages/AuthPage'
import AdminPage from './pages/AdminPage'
import { useAuth } from './context/AuthContext'
import './App.css'

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function App() {
  const { user, loading, logout, loginMode } = useAuth()
  const [page, setPage] = useState('dashboard')

  // Auto-open admin panel when user logged in via admin portal
  useEffect(() => {
    if (user && loginMode === 'admin') setPage('admin')
    else if (!user) setPage('dashboard')
  }, [user, loginMode])

  if (loading) return <div className="app-loading"><span className="auth-spin">⟳</span></div>
  if (!user) return <AuthPage />

  return <Dashboard user={user} logout={logout} page={page} setPage={setPage} />
}

function Dashboard({ user, logout, page, setPage }) {
  const [devices, setDevices] = useState([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [scanning, setScanning] = useState(false)
  const [connected, setConnected] = useState(false)
  const [subnet, setSubnet] = useState('')
  const [ifaceName, setIfaceName] = useState('')
  const [allInterfaces, setAllInterfaces] = useState([])
  const [lastScan, setLastScan] = useState(null)
  const [notifications, setNotifications] = useState([])
  const socketRef = useRef(null)
  const notifId = useRef(0)

  useEffect(() => {
    const socket = io(SOCKET_URL)
    socketRef.current = socket
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('device_list', (list) => { setDevices(list); setScanning(false); setLastScan(Date.now()) })
    socket.on('interface_info', (data) => {
      if (data.active) {
        setSubnet(data.active.subnet)
        setIfaceName(data.active.name)
      }
      if (data.available) {
        setAllInterfaces(data.available)
      }
    })
    socket.on('device_update', ({ type, device }) => {
      setDevices(prev => {
        const idx = prev.findIndex(d => d.ip === device.ip)
        if (idx >= 0) { const u = [...prev]; u[idx] = device; return u }
        return [...prev, device]
      })
      addNotification(type, device)
    })

    fetch(`${SOCKET_URL}/api/subnet`)
      .then(r => r.json())
      .then(d => {
        setSubnet(d.subnet)
        setIfaceName(d.interfaceName || 'WiFi')
        if (d.allInterfaces) setAllInterfaces(d.allInterfaces)
      })
      .catch(() => {})

    return () => socket.disconnect()
  }, [])

  function addNotification(type, device) {
    const id = ++notifId.current
    const devName = device.hostname || device.ip
    const msg = type === 'new'
      ? `🟢 Device connected: ${devName}`
      : type === 'reconnected'
      ? `🔄 Reconnected: ${devName}`
      : `🔴 Disconnected: ${devName}`
    const color = type === 'disconnected' ? '#ef4444' : '#22c55e'
    setNotifications(prev => [ { id, msg, color }, ...prev.slice(0, 4) ])
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000)
  }

  function triggerScan() {
    setScanning(true)
    socketRef.current?.emit('manual_scan')
  }

  function handleInterfaceChange(name) {
    setIfaceName(name)
    setScanning(true)
    socketRef.current?.emit('select_interface', name)
  }

  const filtered = devices
    .filter(d => filter === 'all' || d.status === filter)
    .filter(d => {
      const q = search.toLowerCase()
      return !q || d.ip.includes(q) || d.hostname?.toLowerCase().includes(q) || d.mac?.toLowerCase().includes(q) || d.vendor?.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (a.status === 'online' && b.status !== 'online') return -1
      if (b.status === 'online' && a.status !== 'online') return 1
      return a.ip.localeCompare(b.ip, undefined, { numeric: true })
    })

  const online = devices.filter(d => d.status === 'online').length
  const offline = devices.filter(d => d.status === 'offline').length

  return (
    <div className="app">
      <div className="bg-grid" />

      <div className="notifications">
        {notifications.map(n => (
          <div key={n.id} className="notif" style={{ borderLeftColor: n.color }}>
            <span className="notif-dot" style={{ background: n.color }} />
            {n.msg}
          </div>
        ))}
      </div>

      <header className="header">
        <div className="header-left">
          <div className="logo">
            <div className="logo-icon">
              <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
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
              <h1 className="logo-title">NetScan Pro</h1>
              <p className="logo-sub">Live Network Device Monitor</p>
            </div>
          </div>

          {/* Nav tabs */}
          <nav className="nav-tabs">
            <button className={`nav-tab ${page === 'dashboard' ? 'nav-tab-active' : ''}`} onClick={() => setPage('dashboard')}>
              🌐 Live Dashboard
            </button>
            {user.role === 'admin' && (
              <button className={`nav-tab ${page === 'admin' ? 'nav-tab-active' : ''}`} onClick={() => setPage('admin')}>
                🛡️ Admin
              </button>
            )}
          </nav>
        </div>

        <div className="header-right">
          <div className={`connection-badge ${connected ? 'badge-live' : 'badge-offline'}`}>
            <span className={`pulse-dot ${connected ? 'pulse-green' : 'pulse-red'}`} />
            {connected ? 'Live' : 'Offline'}
          </div>

          {/* Network Interface selector */}
          {allInterfaces.length > 1 ? (
            <select
              value={ifaceName}
              onChange={e => handleInterfaceChange(e.target.value)}
              className="interface-select"
              title="Select network interface"
            >
              {allInterfaces.map(i => (
                <option key={i.name} value={i.name}>
                  {i.name} ({i.address})
                </option>
              ))}
            </select>
          ) : (
            <div className="subnet-badge">{ifaceName || 'WiFi'} ({subnet}.0/24)</div>
          )}

          {lastScan && <div className="last-scan-time">{new Date(lastScan).toLocaleTimeString()}</div>}
          {page === 'dashboard' && (
            <button className={`scan-btn ${scanning ? 'scan-btn-active' : ''}`} onClick={triggerScan} disabled={scanning}>
              <span className={scanning ? 'spin' : ''}>⟳</span>
              {scanning ? 'Scanning...' : 'Scan Now'}
            </button>
          )}
          <div className="user-menu">
            <div className="user-avatar" style={{ background: user.role === 'admin' ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : undefined }}>
              {(user.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role}</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Sign out">⏻</button>
          </div>
        </div>
      </header>

      <main className="main">
        {page === 'admin' ? (
          <AdminPage />
        ) : (
          <>
            <StatsBar online={online} offline={offline} total={devices.length} scanning={scanning} />
            {scanning && <ScanAnimation subnet={subnet} />}
            <FilterBar filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} />
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">{scanning ? '📡' : devices.length === 0 ? '🔍' : '🔎'}</div>
                <p className="empty-text">
                  {scanning ? 'Scanning active Wi-Fi network...' : devices.length === 0 ? 'Searching for live devices on this network...' : 'No devices match your filter.'}
                </p>
              </div>
            ) : (
              <div className="device-grid">
                {filtered.map(device => <DeviceCard key={device.ip} device={device} />)}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
