import { useState } from 'react'
import './FilterBar.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function FilterBar({ filter, setFilter, search, setSearch, totalResults }) {
  const [probing, setProbing] = useState(false)
  const [probeStatus, setProbeStatus] = useState(null)
  const isIpQuery = /^(\d{1,3}\.){3}\d{1,3}$/.test(search.trim())

  const categories = [
    { id: 'all', label: 'All Devices', icon: '🌐' },
    { id: 'online', label: 'Online', icon: '🟢' },
    { id: 'offline', label: 'Offline', icon: '⚪' },
  ]

  async function handleProbeIp(targetIp) {
    const ipToProbe = targetIp || search.trim()
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ipToProbe) || probing) return
    setProbing(true)
    setProbeStatus({ type: 'loading', message: `Probing target IP ${ipToProbe}...` })
    try {
      const res = await fetch(`${API}/api/probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: ipToProbe })
      })
      const data = await res.json()
      if (data.device) {
        setProbeStatus({
          type: 'success',
          message: `Target ${ipToProbe} registered! Status: ${data.device.status.toUpperCase()} (${data.device.vendor || 'Unknown Vendor'})`
        })
      } else {
        setProbeStatus({ type: 'error', message: `Could not reach ${ipToProbe}` })
      }
    } catch (err) {
      setProbeStatus({ type: 'error', message: `Probe failed: ${err.message}` })
    } finally {
      setProbing(false)
      setTimeout(() => setProbeStatus(null), 6000)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && isIpQuery) {
      handleProbeIp()
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
          placeholder="Search device name, brand, or type an IP (e.g. 172.20.181.188)..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {search && !isIpQuery && (
          <button className="search-clear" onClick={() => setSearch('')} title="Clear search">✕</button>
        )}
        <button
          className={`probe-btn ${isIpQuery ? 'probe-btn-active' : ''}`}
          onClick={() => handleProbeIp()}
          disabled={probing || !isIpQuery}
          title={isIpQuery ? "Probe this exact IP address now (or press Enter)" : "Type a complete IPv4 address to probe"}
        >
          {probing ? '⚡ Probing...' : '⚡ Probe IP'}
        </button>
      </div>

      {probeStatus && (
        <div className={`probe-status-banner probe-status-${probeStatus.type}`}>
          <span>{probeStatus.type === 'loading' ? '⏳' : probeStatus.type === 'success' ? '✅' : '⚠️'}</span>
          {probeStatus.message}
        </div>
      )}

      {search && (
        <div className="search-indicator">
          Found <strong>{totalResults}</strong> {totalResults === 1 ? 'device' : 'devices'} matching "{search}"
          {isIpQuery && totalResults === 0 && (
            <span className="probe-hint">
              {' — '}Press <strong>Enter</strong> or click <strong>⚡ Probe IP</strong> to target and register this device!
            </span>
          )}
        </div>
      )}
    </div>
  )
}
