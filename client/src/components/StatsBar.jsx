import './StatsBar.css'

export default function StatsBar({ online, offline, total, scanning }) {
  const onlinePct = total > 0 ? Math.round((online / total) * 100) : 0

  return (
    <div className="stats-bar">
      <div className="stat-card stat-total">
        <div className="stat-icon">🌐</div>
        <div className="stat-content">
          <div className="stat-number">{total}</div>
          <div className="stat-label">Total Devices</div>
        </div>
      </div>
      <div className="stat-card stat-online">
        <div className="stat-icon">✅</div>
        <div className="stat-content">
          <div className="stat-number text-green">{online}</div>
          <div className="stat-label">Online</div>
        </div>
        <div className="stat-bar-wrap">
          <div className="stat-bar-fill" style={{ width: `${onlinePct}%` }} />
        </div>
      </div>
      <div className="stat-card stat-offline-card">
        <div className="stat-icon">❌</div>
        <div className="stat-content">
          <div className="stat-number text-red">{offline}</div>
          <div className="stat-label">Offline</div>
        </div>
      </div>
      <div className="stat-card stat-status">
        <div className="stat-icon">{scanning ? '📡' : '🛡️'}</div>
        <div className="stat-content">
          <div className={`stat-number ${scanning ? 'text-cyan scanning-text' : 'text-cyan'}`}>
            {scanning ? 'Active' : 'Ready'}
          </div>
          <div className="stat-label">Scanner</div>
        </div>
        {scanning && <div className="scanning-ring" />}
      </div>
    </div>
  )
}
