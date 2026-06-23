import { useState } from 'react'
import './DeviceCard.css'

const DEVICE_ICONS = {
  router: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="8" width="20" height="8" rx="2" />
      <circle cx="6" cy="12" r="1" fill="currentColor" />
      <circle cx="10" cy="12" r="1" fill="currentColor" />
      <line x1="16" y1="5" x2="16" y2="8" />
      <line x1="20" y1="3" x2="20" y2="8" />
      <line x1="12" y1="7" x2="12" y2="8" />
    </svg>
  ),
  mobile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
      <line x1="10" y1="5" x2="14" y2="5" />
    </svg>
  ),
  laptop: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <line x1="1" y1="20" x2="23" y2="20" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  ),
  printer: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="6" y="2" width="12" height="6" rx="1" />
      <rect x="2" y="8" width="20" height="10" rx="2" />
      <rect x="6" y="15" width="12" height="5" rx="1" />
      <circle cx="18" cy="13" r="1" fill="currentColor" />
    </svg>
  ),
  tv: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  unknown: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <rect x="9" y="7" width="6" height="6" rx="1" />
      <line x1="7" y1="17" x2="17" y2="17" />
      <line x1="12" y1="13" x2="12" y2="17" />
    </svg>
  ),
}

function formatTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString()
}

function formatDuration(start, end) {
  const diff = (end || Date.now()) - start
  const s = Math.floor(diff / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export default function DeviceCard({ device }) {
  const [expanded, setExpanded] = useState(false)
  const isOnline = device.status === 'online'
  const icon = DEVICE_ICONS[device.deviceType] || DEVICE_ICONS.unknown

  return (
    <div className={`device-card ${isOnline ? 'card-online' : 'card-offline'}`} onClick={() => setExpanded(e => !e)}>
      <div className="card-glow" />

      <div className="card-header">
        <div className={`device-icon-wrap ${isOnline ? 'icon-online' : 'icon-offline'}`}>
          {icon}
        </div>
        <div className="card-info">
          <div className="device-hostname">
            {device.hostname}
            {device.isDemo && <span className="demo-badge">Demo</span>}
          </div>
          <div className="device-ip">{device.ip}</div>
        </div>
        <div className="card-status-col">
          <span className={`status-badge ${isOnline ? 'status-online' : 'status-offline'}`}>
            <span className={`status-dot ${isOnline ? 'dot-green' : 'dot-red'}`} />
            {isOnline ? 'Online' : 'Offline'}
          </span>
          {isOnline && device.latency != null && (
            <span className={`latency-badge ${device.latency < 5 ? 'lat-fast' : device.latency < 20 ? 'lat-medium' : 'lat-slow'}`}>
              {device.latency.toFixed(1)} ms
            </span>
          )}
        </div>
      </div>

      <div className="card-times">
        <div className="time-row">
          <span className="time-label">
            <span className="time-icon">🟢</span> Connected
          </span>
          <span className="time-value connected-time">{formatTime(device.connectedAt)}</span>
        </div>
        {device.disconnectedAt && (
          <div className="time-row">
            <span className="time-label">
              <span className="time-icon">🔴</span> Disconnected
            </span>
            <span className="time-value disconnected-time">{formatTime(device.disconnectedAt)}</span>
          </div>
        )}
        {isOnline && device.connectedAt && (
          <div className="time-row">
            <span className="time-label">
              <span className="time-icon">⏱</span> Uptime
            </span>
            <span className="time-value uptime-value">{formatDuration(device.connectedAt)}</span>
          </div>
        )}
        {!isOnline && device.connectedAt && device.disconnectedAt && (
          <div className="time-row">
            <span className="time-label">
              <span className="time-icon">📊</span> Session
            </span>
            <span className="time-value">{formatDuration(device.connectedAt, device.disconnectedAt)}</span>
          </div>
        )}
      </div>

      {expanded && (
        <div className="card-expanded">
          <div className="expanded-divider" />
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">MAC Address</span>
              <span className="detail-value mono">{device.mac || '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Device Type</span>
              <span className="detail-value capitalize">{device.deviceType || 'Unknown'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Last Seen</span>
              <span className="detail-value">{formatTime(device.lastSeen)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Latency</span>
              <span className="detail-value">{device.latency != null ? `${device.latency.toFixed(1)} ms` : '—'}</span>
            </div>
          </div>
        </div>
      )}

      <div className="expand-hint">{expanded ? '▲ Less' : '▼ More'}</div>
    </div>
  )
}
