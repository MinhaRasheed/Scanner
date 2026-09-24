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

  CREATE TABLE IF NOT EXISTS device_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    hostname TEXT,
    mac TEXT,
    vendor TEXT,
    device_type TEXT,
    event_type TEXT,
    network_id TEXT DEFAULT 'default',
    network_name TEXT DEFAULT 'Default Network',
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS networks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ssid TEXT,
    subnet TEXT NOT NULL,
    gateway TEXT,
    local_ip TEXT,
    first_seen INTEGER,
    last_seen INTEGER,
    device_count INTEGER DEFAULT 0
  );
`);

// Safe incremental migrations for existing databases
try { db.exec("ALTER TABLE devices ADD COLUMN network_id TEXT DEFAULT 'default'"); } catch {}
try { db.exec("ALTER TABLE devices ADD COLUMN network_name TEXT DEFAULT 'Default Network'"); } catch {}
try { db.exec("ALTER TABLE device_history ADD COLUMN network_id TEXT DEFAULT 'default'"); } catch {}
try { db.exec("ALTER TABLE device_history ADD COLUMN network_name TEXT DEFAULT 'Default Network'"); } catch {}

// Backfill existing devices belonging to University MRC network
try {
  db.prepare(`
    UPDATE devices 
    SET network_id = 'net_MRC_172_20_163', network_name = 'MRC (Campus Wi-Fi)' 
    WHERE ip LIKE '172.20.%' AND (network_id = 'default' OR network_id IS NULL)
  `).run();

  db.prepare(`
    UPDATE device_history 
    SET network_id = 'net_MRC_172_20_163', network_name = 'MRC (Campus Wi-Fi)' 
    WHERE ip LIKE '172.20.%' AND (network_id = 'default' OR network_id IS NULL)
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO networks (id, name, ssid, subnet, gateway, local_ip, first_seen, last_seen, device_count)
    VALUES ('net_MRC_172_20_163', 'MRC (Campus Wi-Fi)', 'MRC', '172.20.163', '172.20.160.1', '172.20.163.223', ?, ?, ?)
  `).run(Date.now() - 36000000, Date.now() - 3600000, 134);
} catch (err) {
  console.error('Migration notice:', err.message);
}

module.exports = db;
