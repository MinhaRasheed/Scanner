import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import './AdminPage.css'

const API = 'http://localhost:3001/api/auth'

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('netscan_token')}`, 'Content-Type': 'application/json' }
}

export default function AdminPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [usersRes, statsRes] = await Promise.all([
        fetch(`${API}/users`, { headers: authHeader() }),
        fetch(`${API}/stats`, { headers: authHeader() })
      ])
      const usersData = await usersRes.json()
      const statsData = await statsRes.json()

      if (!usersRes.ok) {
        throw new Error(usersData.error || 'Failed to load registered users')
      }

      setUsers(usersData.users || [])
      setStats(statsData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleRoleChange(userId, newRole) {
    try {
      const res = await fetch(`${API}/users/${userId}/role`, {
        method: 'PATCH',
        headers: authHeader(),
        body: JSON.stringify({ role: newRole })
      })
      const data = await res.json()
      if (!res.ok) return showToast(data.error, 'error')
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
      setStats(prev => prev ? ({
        ...prev,
        admins: newRole === 'admin' ? prev.admins + 1 : prev.admins - 1,
        users: newRole === 'user' ? prev.users + 1 : prev.users - 1
      }) : null)
      showToast(`Role updated to ${newRole}`)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  async function handleDelete(userId) {
    try {
      const res = await fetch(`${API}/users/${userId}`, { method: 'DELETE', headers: authHeader() })
      const data = await res.json()
      if (!res.ok) return showToast(data.error, 'error')
      setUsers(prev => prev.filter(u => u.id !== userId))
      setStats(prev => prev ? ({ ...prev, total: prev.total - 1 }) : null)
      setDeleteConfirm(null)
      showToast('User deleted')
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  function formatDate(ts) {
    if (!ts) return '—'
    return new Date(ts).toLocaleString()
  }

  function timeAgo(ts) {
    if (!ts) return 'Never'
    const diff = Date.now() - new Date(ts).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'Just now'
    if (m < 60) return `${m}m ago`
    if (m < 1440) return `${Math.floor(m / 60)}h ago`
    return `${Math.floor(m / 1440)}d ago`
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return !q || (u.name && u.name.toLowerCase().includes(q)) || (u.email && u.email.toLowerCase().includes(q))
  })

  return (
    <div className="admin-page">
      {/* Toast */}
      {toast && (
        <div className={`admin-toast ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`}>
          {toast.type === 'error' ? '⚠️' : '✅'} {toast.msg}
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-icon">🗑️</div>
            <h3>Delete User</h3>
            <p>Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This cannot be undone.</p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="modal-confirm" onClick={() => handleDelete(deleteConfirm.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-header">
        <div>
          <h2 className="admin-title">Admin Panel</h2>
          <p className="admin-sub">Manage registered users and system access</p>
        </div>
        <button className="admin-refresh" onClick={fetchData} disabled={loading}>
          <span className={loading ? 'spin' : ''}>⟳</span> Refresh
        </button>
      </div>

      {error && (
        <div className="admin-error-banner" style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#fca5a5',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <div className="admin-stats">
          <div className="admin-stat-card stat-blue">
            <div className="astat-icon">👥</div>
            <div className="astat-num">{stats.total}</div>
            <div className="astat-label">Total Users</div>
          </div>
          <div className="admin-stat-card stat-purple">
            <div className="astat-icon">🛡️</div>
            <div className="astat-num">{stats.admins}</div>
            <div className="astat-label">Admins</div>
          </div>
          <div className="admin-stat-card stat-green">
            <div className="astat-icon">👤</div>
            <div className="astat-num">{stats.users}</div>
            <div className="astat-label">Regular Users</div>
          </div>
          <div className="admin-stat-card stat-cyan">
            <div className="astat-icon">🕐</div>
            <div className="astat-num">{stats.recentLogins}</div>
            <div className="astat-label">Active (24h)</div>
          </div>
          <div className="admin-stat-card stat-yellow">
            <div className="astat-icon">🆕</div>
            <div className="astat-num">{stats.today}</div>
            <div className="astat-label">Joined Today</div>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="admin-table-wrap">
        <div className="admin-table-header">
          <h3>Registered Users ({filtered.length})</h3>
          <div className="admin-search-wrap">
            <span>🔎</span>
            <input
              placeholder="Search name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="admin-search"
            />
          </div>
        </div>

        <div className="admin-table-scroll">
          {loading && users.length === 0 ? (
            <div className="admin-loading" style={{ padding: '40px', textAlign: 'center' }}>
              <span className="spin">⟳</span> Loading user accounts...
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="7" className="table-empty">No users found</td></tr>
                ) : filtered.map((u, i) => (
                  <tr key={u.id} className={user && u.id === user.id ? 'row-self' : ''}>
                    <td className="td-id">{i + 1}</td>
                    <td>
                      <div className="user-cell">
                        <div className="user-cell-avatar" style={{ background: u.role === 'admin' ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'linear-gradient(135deg,#00d4ff,#0891b2)' }}>
                          {(u.name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="user-cell-name">
                            {u.name}
                            {user && u.id === user.id && <span className="you-badge">You</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="td-email">{u.email}</td>
                    <td>
                      <span className={`role-badge ${u.role === 'admin' ? 'role-admin' : 'role-user'}`}>
                        {u.role === 'admin' ? '🛡️' : '👤'} {u.role}
                      </span>
                    </td>
                    <td className="td-date">{formatDate(u.created_at)}</td>
                    <td className="td-login">
                      <span title={formatDate(u.last_login)}>{timeAgo(u.last_login)}</span>
                    </td>
                    <td>
                      <div className="action-btns">
                        {user && u.id !== user.id ? (
                          <>
                            <button
                              className={`action-btn ${u.role === 'admin' ? 'btn-demote' : 'btn-promote'}`}
                              onClick={() => handleRoleChange(u.id, u.role === 'admin' ? 'user' : 'admin')}
                              title={u.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                            >
                              {u.role === 'admin' ? '↓ User' : '↑ Admin'}
                            </button>
                            <button
                              className="action-btn btn-delete"
                              onClick={() => setDeleteConfirm(u)}
                              title="Delete user"
                            >
                              🗑️
                            </button>
                          </>
                        ) : (
                          <span className="self-note">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
