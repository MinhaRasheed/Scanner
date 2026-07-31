const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'netscan_secret_2026';

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

// Register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'All fields are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  // First user ever becomes admin
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get();
  const role = count.c === 0 ? 'admin' : 'user';

  const hashed = await bcrypt.hash(password, 10);
  const result = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)').run(name, email, hashed, role);
  const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ token: generateToken(user), user });
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  const { password: _, ...safeUser } = user;
  res.json({ token: generateToken(safeUser), user: safeUser });
});

// Get current user
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, created_at, last_login FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// List all users — admin only
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, created_at, last_login FROM users ORDER BY created_at DESC').all();
  res.json({ users, total: users.length });
});

// Update user role — admin only
router.patch('/users/:id/role', requireAuth, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot change your own role' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  const user = db.prepare('SELECT id, name, email, role, created_at, last_login FROM users WHERE id = ?').get(req.params.id);
  res.json({ user });
});

// Delete user — admin only
router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Admin stats
router.get('/stats', requireAuth, requireAdmin, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const admins = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin'").get().c;
  const today = db.prepare("SELECT COUNT(*) as c FROM users WHERE date(created_at) = date('now')").get().c;
  const recentLogins = db.prepare("SELECT COUNT(*) as c FROM users WHERE last_login IS NOT NULL AND last_login > datetime('now', '-1 day')").get().c;
  res.json({ total, admins, users: total - admins, today, recentLogins });
});

// Promote existing user to admin (one-time setup helper)
router.post('/make-admin', requireAuth, requireAdmin, (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
  res.json({ success: true });
});

module.exports = router;
