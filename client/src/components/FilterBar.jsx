import './FilterBar.css'

export default function FilterBar({ filter, setFilter, search, setSearch }) {
  return (
    <div className="filter-bar">
      <div className="filter-tabs">
        {['all', 'online', 'offline'].map(f => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? 'tab-active' : ''}`}
            onClick={() => setFilter(f)}
          >
            <span className={`tab-dot ${f === 'online' ? 'tdot-green' : f === 'offline' ? 'tdot-red' : 'tdot-blue'}`} />
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="search-wrap">
        <span className="search-icon">🔎</span>
        <input
          className="search-input"
          type="text"
          placeholder="Search IP, hostname, MAC..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch('')}>✕</button>
        )}
      </div>
    </div>
  )
}
