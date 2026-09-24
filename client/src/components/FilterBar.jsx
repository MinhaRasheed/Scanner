import { useState } from 'react'
import './FilterBar.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function FilterBar({ filter, setFilter, search, setSearch, totalResults }) {
  const [probing, setProbing] = useState(false)
  const isIpQuery = /^(\d{1,3}\.){3}\d{1,3}$/.test(search.trim())

  const categories = [
    { id: 'all', label: 'All Devices', icon: '🌐' },
    { id: 'online', label: 'Online', icon: '🟢' },
    { id: 'offline', label: 'Offline', icon: '⚪' },
  ]

  async function handleProbeIp() {
    if (!isIpQuery || probing) return
    setProbing(true)
    try {
      await fetch(`${API}/api/probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: search.trim() })
      })
    } catch (err) {
      console.error('Probe error:', err)
    } finally {
      setProbing(false)
    }
  }

  return (
    <div className="filter-bar">
      <div className="filter-tabs">
        {categories.map(c => (
          <button
            key={c.id}
            className={`filter-tab ${filter === c.id ? 'tab-active' : ''}`}
            onClick={() => setFilter(c.id)}
          >
            <span className="tab-icon">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      <div className="search-wrap">
        <span className="search-icon">🔎</span>
        <input
          className="search-input"
          type="text"
          placeholder="Search IP, device name, hardware MAC, brand (Apple, Samsung)..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch('')} title="Clear search">✕</button>
        )}
        {isIpQuery && (
          <button className="probe-btn" onClick={handleProbeIp} disabled={probing} title="Probe and discover this exact IP immediately">
            {probing ? '⚡ Probing...' : '⚡ Probe IP'}
          </button>
        )}
      </div>

      {search && (
        <div className="search-indicator">
          Found <strong>{totalResults}</strong> {totalResults === 1 ? 'device' : 'devices'} matching "{search}"
          {isIpQuery && totalResults === 0 && (
            <span className="probe-hint">
              {' — '}Device not listed? Click <strong>⚡ Probe IP</strong> above to ping and discover it directly!
            </span>
          )}
        </div>
      )}
    </div>
  )
}
