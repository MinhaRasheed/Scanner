import './FilterBar.css'

export default function FilterBar({ filter, setFilter, search, setSearch, totalResults }) {
  const categories = [
    { id: 'all', label: 'All Devices', icon: '🌐' },
    { id: 'online', label: 'Online', icon: '🟢' },
    { id: 'offline', label: 'Offline', icon: '⚪' },
  ]

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
          placeholder="Search by IP, name, hardware MAC, or brand (Apple, Samsung, Intel)..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch('')} title="Clear search">✕</button>
        )}
      </div>

      {search && (
        <div className="search-indicator">
          Found <strong>{totalResults}</strong> {totalResults === 1 ? 'device' : 'devices'} matching "{search}"
        </div>
      )}
    </div>
  )
}
