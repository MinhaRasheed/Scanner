import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import DeviceCard from './components/DeviceCard'
import StatsBar from './components/StatsBar'
import ScanAnimation from './components/ScanAnimation'
import FilterBar from './components/FilterBar'
import AuthPage from './pages/AuthPage'
import AdminPage from './pages/AdminPage'
import HistoryPage from './pages/HistoryPage'
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
  const [currentNetwork, setCurrentNetwork] = useState(null)
  const [allNetworks, setAllNetworks] = useState([])
  const [selectedNetwork, setSelectedNetwork] = useState('active') // 'active' | 'all' | network_id
  const [lastScan, setLastScan] = useState(null)
  const [notifications, setNotifications] = useState([])
  const socketRef = useRef(null)
  const notifId = useRef(0)

  useEffect(() => {
    const socket = io(SOCKET_URL)
    socketRef.current = socket
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('device_list', (list) => {
      // Only auto-update if viewing active network
      if (selectedNetwork === 'active') {
        setDevices(list)
        setScanning(false)
        setLastScan(Date.now())
      }
    })
    socket.on('network_info', (data) => {
      if (data.active) {
        setCurrentNetwork(data.active)
        setSubnet(data.active.subnet)
      }
      if (data.networks) setAllNetworks(data.networks)
    })
    socket.on('network_switched', (data) => {
      if (data.activeNetwork) {
        setCurrentNetwork(data.activeNetwork)
        setSubnet(data.activeNetwork.subnet)
        addNotification('network_switch', {
          hostname: `Switched network to ${data.activeNetwork.name}`
        })
      }
      if (data.allNetworks) setAllNetworks(data.allNetworks)
    })
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

    fetch(`${SOCKET_URL}/api/devices?network=active`)
      .then(r => r.json())
      .then(list => {
        if (Array.isArray(list)) {
          setDevices(list)
          setLastScan(Date.now())
        }
      })
      .catch(() => {})

    fetch(`${SOCKET_URL}/api/networks`)
      .then(r => r.json())
      .then(data => {
        if (data.active) {
          setCurrentNetwork(data.active)
          setSubnet(data.active.subnet)
        }
        if (data.networks) setAllNetworks(data.networks)
      })
      .catch(() => {})

    fetch(`${SOCKET_URL}/api/subnet`)
      .then(r => r.json())
      .then(d => {
        setSubnet(d.subnet)
        setIfaceName(d.interfaceName || 'WiFi')
        if (d.allInterfaces) setAllInterfaces(d.allInterfaces)
      })
      .catch(() => {})

    return () => socket.disconnect()
  }, [selectedNetwork])

  function handleNetworkChange(networkId) {
    setSelectedNetwork(networkId)
    setScanning(true)
    fetch(`${SOCKET_URL}/api/devices?network=${networkId}`)
      .then(r => r.json())
      .then(list => {
        if (Array.isArray(list)) {
          setDevices(list)
          setLastScan(Date.now())
        }
        setScanning(false)
      })
      .catch(() => setScanning(false))
  }

  function handleDeviceProbed(probedDevice) {
    if (!probedDevice) return
    setDevices(prev => {
      const idx = prev.findIndex(d => d.ip === probedDevice.ip)
      if (idx >= 0) {
        const u = [...prev]
        u[idx] = probedDevice
        return u
      }
      return [probedDevice, ...prev]
    })
  }

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
      const q = search.toLowerCase().trim()
      return !q ||
        d.ip.toLowerCase().includes(q) ||
        (d.hostname && d.hostname.toLowerCase().includes(q)) ||
        (d.mac && d.mac.toLowerCase().includes(q)) ||
        (d.vendor && d.vendor.toLowerCase().includes(q)) ||
        (d.deviceType && d.deviceType.toLowerCase().includes(q))
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
            <button className={`nav-tab ${page === 'history' ? 'nav-tab-active' : ''}`} onClick={() => setPage('history')}>
              📜 Device History & DB
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

          {/* Multi-Network Profile Selector */}
          <div className="network-selector-wrap">
            <span className="network-icon">📶</span>
            <select
              value={selectedNetwork}
              onChange={e => handleNetworkChange(e.target.value)}
              className="network-select"
              title="Select network profile view"
            >
              <option value="active">
                🟢 {currentNetwork ? currentNetwork.name : (ifaceName || 'WiFi')} ({currentNetwork ? currentNetwork.subnet : subnet}.0/24) [Active]
              </option>
              {allNetworks
                .filter(n => n.id !== currentNetwork?.id)
                .map(n => (
                  <option key={n.id} value={n.id}>
                    📁 {n.name} ({n.subnet}.0/24) — {n.device_count || 0} devs
                  </option>
                ))}
              <option value="all">🌐 All Networks Combined</option>
            </select>
          </div>

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
        ) : page === 'history' ? (
          <HistoryPage />
        ) : (
          <>
            <StatsBar
              online={online}
              offline={offline}
              total={devices.length}
              scanning={scanning}
              filter={filter}
              setFilter={setFilter}
            />
            {scanning && <ScanAnimation subnet={subnet} />}
            <FilterBar
              filter={filter}
              setFilter={setFilter}
              search={search}
              setSearch={setSearch}
              totalResults={filtered.length}
              onDeviceProbed={handleDeviceProbed}
              counts={{ all: devices.length, online, offline }}
            />
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">{scanning ? '📡' : devices.length === 0 ? '🔍' : '🔎'}</div>
                <p className="empty-text">
                  {search
                    ? `No devices matching "${search}" in ${filter === 'all' ? 'any category' : filter + ' devices'}.`
                    : scanning
                    ? 'Scanning active Wi-Fi network...'
                    : devices.length === 0
                    ? 'Searching for live devices on this network...'
                    : `No ${filter} devices found.`}
                </p>
                {search && (
                  <button className="search-reset-btn" style={{ marginTop: '12px', padding: '6px 16px', fontSize: '13px' }} onClick={() => setSearch('')}>
                    Clear Search
                  </button>
                )}
                {filter !== 'all' && (
                  <button className="search-reset-btn" style={{ marginTop: '12px', marginLeft: '8px', padding: '6px 16px', fontSize: '13px', background: 'rgba(0,212,255,0.15)', borderColor: 'rgba(0,212,255,0.3)', color: '#38bdf8' }} onClick={() => setFilter('all')}>
                    View All Devices ({devices.length})
                  </button>
                )}
              </div>
            ) : (
              <div className="device-grid">
                {filtered.map(device => (
                  <DeviceCard
                    key={device.ip}
                    device={device}
                    showNetworkBadge={selectedNetwork === 'all'}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
