const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'netscan.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT
  );

  CREATE TABLE IF NOT EXISTS devices (
    ip TEXT PRIMARY KEY,
    hostname TEXT,
    mac TEXT,
    vendor TEXT,
    device_type TEXT,
    connected_at INTEGER,
    disconnected_at INTEGER,
    last_seen INTEGER,
    status TEXT DEFAULT 'online'
  );
`);

module.exports = db;
