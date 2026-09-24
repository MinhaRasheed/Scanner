import { useState, useEffect, useCallback } from 'react'
import './HistoryPage.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function HistoryPage() {
  const [historyDevices, setHistoryDevices] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'online' | 'offline'
  const [activeTab, setActiveTab] = useState('devices') // 'devices' | 'events'
  const [toast, setToast] = useState(null)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/history`)
      const data = await res.json()
      setHistoryDevices(data.devices || [])
      setEvents(data.events || [])
    } catch (err) {
      console.error('Failed to load history:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function formatTime(ts) {
    if (!ts) return '—'
    return new Date(ts).toLocaleString()
  }

  function timeAgo(ts) {
    if (!ts) return 'Never'
    const diff = Math.max(0, Date.now() - new Date(ts).getTime())
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'Just now'
    if (m < 60) return `${m}m ago`
    if (m < 1440) return `${Math.floor(m / 60)}h ago`
    return `${Math.floor(m / 1440)}d ago`
  }

  function exportCSV() {
    if (historyDevices.length === 0) return
    const headers = ['IP Address', 'Hostname', 'MAC Address', 'Vendor / Manufacturer', 'Device Type', 'First Connected', 'Last Seen', 'Status']
    const rows = historyDevices.map(d => [
      `"${d.ip}"`,
      `"${d.hostname || ''}"`,
      `"${d.mac || ''}"`,
      `"${d.vendor || ''}"`,
      `"${d.device_type || ''}"`,
      `"${d.connected_at ? new Date(d.connected_at).toISOString() : ''}"`,
      `"${d.last_seen ? new Date(d.last_seen).toISOString() : ''}"`,
      `"${d.status || ''}"`
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `network_device_history_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Exported CSV successfully!')
  }

  const filteredDevices = historyDevices.filter(d => {
    const matchesFilter = filter === 'all' || d.status === filter
    const q = search.toLowerCase().trim()
    const matchesSearch = !q ||
      d.ip.toLowerCase().includes(q) ||
      (d.hostname && d.hostname.toLowerCase().includes(q)) ||
      (d.mac && d.mac.toLowerCase().includes(q)) ||
      (d.vendor && d.vendor.toLowerCase().includes(q)) ||
      (d.device_type && d.device_type.toLowerCase().includes(q))
    return matchesFilter && matchesSearch
  })

  const filteredEvents = events.filter(e => {
    const q = search.toLowerCase().trim()
    return !q ||
      e.ip.toLowerCase().includes(q) ||
      (e.hostname && e.hostname.toLowerCase().includes(q)) ||
      (e.vendor && e.vendor.toLowerCase().includes(q)) ||
      (e.event_type && e.event_type.toLowerCase().includes(q))
  })

  const totalUnique = historyDevices.length
  const onlineCount = historyDevices.filter(d => d.status === 'online').length
  const offlineCount = historyDevices.filter(d => d.status === 'offline').length

  return (
    <div className="history-page">
      {toast && <div className="history-toast">✅ {toast}</div>}

      <div className="history-header">
        <div>
          <h2 className="history-title">📜 Connected Devices Database & History</h2>
          <p className="history-sub">Audit trail of all physical devices that have ever connected to your network</p>
        </div>
        <div className="history-actions">
          <button className="export-btn" onClick={exportCSV} title="Download CSV Report">
            📥 Export CSV
          </button>
          <button className="refresh-btn" onClick={fetchHistory} disabled={loading}>
            <span className={loading ? 'spin' : ''}>⟳</span> Refresh
          </button>
        </div>
      </div>

      {/* Summary metric cards */}
      <div className="history-stats">
        <div className="hstat-card stat-total">
          <div className="hstat-icon">🗄️</div>
          <div className="hstat-num">{totalUnique}</div>
          <div className="hstat-label">Total Unique Devices in DB</div>
        </div>
        <div className="hstat-card stat-online">
          <div className="hstat-icon">🟢</div>
          <div className="hstat-num">{onlineCount}</div>
          <div className="hstat-label">Currently Online</div>
        </div>
        <div className="hstat-card stat-offline">
          <div className="hstat-icon">⚪</div>
          <div className="hstat-num">{offlineCount}</div>
          <div className="hstat-label">Offline / Saved in History</div>
        </div>
        <div className="hstat-card stat-events">
          <div className="hstat-icon">⚡</div>
          <div className="hstat-num">{events.length}</div>
          <div className="hstat-label">Total Connection Events</div>
        </div>
      </div>

      {/* Main View Tabs */}
      <div className="history-view-tabs">
        <button
          className={`hview-tab ${activeTab === 'devices' ? 'hview-tab-active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          🖥️ Unique Devices Database ({filteredDevices.length})
        </button>
        <button
          className={`hview-tab ${activeTab === 'events' ? 'hview-tab-active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          ⏱️ Live Activity Log ({filteredEvents.length})
        </button>
      </div>

      {/* Search & Filter Controls */}
      <div className="history-controls">
        <div className="hsearch-wrap">
          <span className="hsearch-icon">🔎</span>
          <input
            type="text"
            className="hsearch-input"
            placeholder="Search by IP, device name, hardware MAC, or brand (Apple, Samsung, Intel)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="hsearch-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {activeTab === 'devices' && (
          <div className="hfilter-tabs">
            {['all', 'online', 'offline'].map(f => (
              <button
                key={f}
                className={`hfilter-tab ${filter === f ? 'hfilter-active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table content */}
      <div className="history-table-card">
        {loading ? (
          <div className="history-loading">
            <span className="spin">⟳</span> Querying SQLite Database...
          </div>
        ) : activeTab === 'devices' ? (
          <div className="history-table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Device / Hostname</th>
                  <th>IP Address</th>
                  <th>Hardware MAC</th>
                  <th>Vendor / Brand</th>
                  <th>Type</th>
                  <th>First Connected</th>
                  <th>Last Seen</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="history-empty">
                      No devices matching your search criteria in the database.
                    </td>
                  </tr>
                ) : (
                  filteredDevices.map((d, i) => (
                    <tr key={d.ip} className={d.status === 'online' ? 'row-online' : ''}>
                      <td className="td-index">{i + 1}</td>
                      <td>
                        <div className="hdevice-name">
                          <strong>{d.hostname}</strong>
                        </div>
                      </td>
                      <td className="td-ip">{d.ip}</td>
                      <td className="td-mac">{d.mac || '—'}</td>
                      <td>
                        <span className="hvendor-badge">{d.vendor || 'Unknown'}</span>
                      </td>
                      <td className="td-type">{d.device_type || 'Unknown'}</td>
                      <td className="td-time">{formatTime(d.connected_at)}</td>
                      <td className="td-time" title={formatTime(d.last_seen)}>{timeAgo(d.last_seen)}</td>
                      <td>
                        <span className={`hstatus-badge ${d.status === 'online' ? 'badge-on' : 'badge-off'}`}>
                          <span className={`hdot ${d.status === 'online' ? 'dot-on' : 'dot-off'}`} />
                          {d.status === 'online' ? 'Online' : 'Offline'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="history-table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Event Type</th>
                  <th>Device / Hostname</th>
                  <th>IP Address</th>
                  <th>Hardware MAC</th>
                  <th>Vendor</th>
                  <th>Event Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="history-empty">
                      No activity logs found.
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((ev, i) => (
                    <tr key={ev.id || i}>
                      <td className="td-index">{i + 1}</td>
                      <td>
                        <span className={`hevent-badge ${ev.event_type === 'connected' ? 'event-connect' : ev.event_type === 'reconnected' ? 'event-reconnect' : 'event-disconnect'}`}>
                          {ev.event_type === 'connected' ? '🟢 Connect' : ev.event_type === 'reconnected' ? '🔄 Reconnect' : '🔴 Disconnect'}
                        </span>
                      </td>
                      <td><strong>{ev.hostname}</strong></td>
                      <td className="td-ip">{ev.ip}</td>
                      <td className="td-mac">{ev.mac || '—'}</td>
                      <td>{ev.vendor || 'Unknown'}</td>
                      <td className="td-time">{formatTime(ev.timestamp)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
