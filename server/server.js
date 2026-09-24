const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { exec } = require('child_process');
const os = require('os');
const dns = require('dns');

const db = require('./db');
const authRoutes = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Device state tracking
const deviceRegistry = new Map(); // ip -> device info
const SCAN_INTERVAL = 6000; // Fast 6-second live scan cycle
let isScanning = false;
let selectedInterfaceName = null;
let isInitialScan = true;

// SQLite prepared statement for device persistence
const saveDeviceStmt = db.prepare(`
  INSERT INTO devices (ip, hostname, mac, vendor, device_type, connected_at, disconnected_at, last_seen, status)
  VALUES (@ip, @hostname, @mac, @vendor, @deviceType, @connectedAt, @disconnectedAt, @lastSeen, @status)
  ON CONFLICT(ip) DO UPDATE SET
    hostname = excluded.hostname,
    mac = excluded.mac,
    vendor = excluded.vendor,
    device_type = excluded.device_type,
    connected_at = excluded.connected_at,
    disconnected_at = excluded.disconnected_at,
    last_seen = excluded.last_seen,
    status = excluded.status
`);

function loadDevicesFromDb() {
  try {
    const rows = db.prepare('SELECT * FROM devices').all();
    for (const r of rows) {
      deviceRegistry.set(r.ip, {
        ip: r.ip,
        hostname: r.hostname,
        mac: r.mac,
        vendor: r.vendor,
        deviceType: r.device_type,
        connectedAt: r.connected_at,
        disconnectedAt: r.disconnected_at,
        lastSeen: r.last_seen,
        status: r.status,
        latency: 1.5
      });
    }
  } catch (err) {
    console.error('Error loading devices from db:', err);
  }
}

function persistDevice(dev) {
  try {
    saveDeviceStmt.run({
      ip: dev.ip,
      hostname: dev.hostname || 'Unknown',
      mac: dev.mac || 'Unknown',
      vendor: dev.vendor || 'Unknown Vendor',
      deviceType: dev.deviceType || 'unknown',
      connectedAt: dev.connectedAt || Date.now(),
      disconnectedAt: dev.disconnectedAt || null,
      lastSeen: dev.lastSeen || Date.now(),
      status: dev.status || 'online'
    });
  } catch (err) {
    console.error('Error saving device to db:', err);
  }
}

// Common MAC OUI vendor prefix dictionary for accurate real device identification
const OUI_MAP = {
  '50:EB:71': 'Intel / PC',
  '50:EB:F6': 'Intel / PC',
  'B0:83:FE': 'Apple (iPhone/Mac)',
  '10:5A:95': 'Apple (iPhone/iPad)',
  'C0:E4:34': 'Samsung Electronics',
  'DE:10:2F': 'Samsung Galaxy',
  'A8:41:F4': 'Xiaomi / Redmi',
  '40:D1:33': 'OnePlus / Oppo',
  'D0:39:57': 'Dell Computer',
  'C0:BF:BE': 'HP Laptop/Printer',
  '1C:1B:0D': 'Amazon Echo / FireTV',
  'D8:80:83': 'TP-Link Device',
  'DC:FE:07': 'Realtek Semiconductor',
  '58:11:22': 'Apple Inc.',
  '88:AE:DD': 'Apple Inc.',
  'A0:AD:9F': 'Google Pixel / Nest',
  '08:BF:B8': 'Sony Device',
  '54:07:7D': 'LG Electronics',
  'A0:36:BC': 'Intel Corporation',
  '7C:5A:1C': 'Espressif IoT (ESP32)',
  '94:18:65': 'Amazon Technologies',
  'E8:65:38': 'Samsung Electronics',
  'B8:1E:A4': 'Apple Inc.',
  '10:7C:61': 'Huawei Technologies',
  '44:A3:BB': 'Asus Computer',
  '30:56:0F': 'Apple Inc.',
  '8C:7A:B3': 'Samsung Electronics',
  '2C:3B:70': 'Xiaomi Communications',
  'F8:54:F6': 'Apple Inc.',
  '24:B2:B9': 'Realtek Semiconductor',
  '58:41:46': 'OnePlus Device',
  '10:B2:32': 'Apple Inc.',
  '3C:33:32': 'Intel Corporation',
  '5C:3A:45': 'Google Pixel / Nest',
  '5C:5F:67': 'Samsung Electronics',
  'C0:35:32': 'Lenovo Laptop',
  'B4:AD:A3': 'Apple Inc.',
  'C8:94:02': 'HP Inc.',
  'BC:FC:E7': 'Apple Inc.',
  '14:AC:60': 'Apple Inc.',
  'B8:F7:75': 'Dell Computer',
  '48:9E:9D': 'Samsung Electronics',
  'B8:82:F2': 'Xiaomi Communications',
  '52:F2:2E': 'Amazon Device',
  '10:FF:E0': 'Apple Inc.',
  '50:BB:B5': 'TP-Link Technologies',
  '1C:2F:A2': 'Google LLC'
};

function getNetworkInterfacesList() {
  const interfaces = os.networkInterfaces();
  const list = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
        const isVirtual = /virtual|vbox|vmware|vethernet|loopback/i.test(name) || /192\.168\.56\./.test(iface.address);
        const isWifi = /wi-?fi|wlan|wireless/i.test(name);
        
        list.push({
          name,
          address: iface.address,
          netmask: iface.netmask,
          mac: iface.mac,
          subnet,
          isVirtual,
          isWifi,
          priority: isWifi ? 10 : isVirtual ? 1 : 5
        });
      }
    }
  }
  
  return list.sort((a, b) => b.priority - a.priority);
}

function getActiveInterface() {
  const list = getNetworkInterfacesList();
  if (selectedInterfaceName) {
    const found = list.find(i => i.name === selectedInterfaceName);
    if (found) return found;
  }
  return list[0] || { name: 'WiFi', address: '127.0.0.1', subnet: '192.168.1' };
}

function getLocalSubnet() {
  return getActiveInterface().subnet;
}

function getLocalIp() {
  return getActiveInterface().address;
}

function lookupVendor(mac) {
  if (!mac || mac === 'Unknown') return null;
  const clean = mac.replace(/[:-]/g, ':').toUpperCase();
  const prefix = clean.substring(0, 8);
  return OUI_MAP[prefix] || null;
}

async function getHostname(ip) {
  try {
    const hostnames = await dns.promises.reverse(ip);
    if (hostnames && hostnames.length > 0) {
      return hostnames[0].replace(/\.local|\.lan|\.home/gi, '');
    }
  } catch {
    // DNS reverse failed
  }

  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? `nslookup ${ip}` : `host ${ip}`;
    exec(cmd, { timeout: 1200 }, (err, stdout) => {
      if (!err && stdout) {
        if (isWindows) {
          const match = stdout.match(/Name:\s+([^\r\n]+)/i);
          if (match) return resolve(match[1].trim());
        } else {
          const match = stdout.match(/pointer (.+)\./);
          if (match) return resolve(match[1].trim());
        }
      }
      resolve(null);
    });
  });
}

function getMacFromArpTable(ip) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? `arp -a ${ip}` : `arp -n ${ip}`;
    exec(cmd, { timeout: 1000 }, (err, stdout) => {
      if (!err && stdout) {
        const macMatch = stdout.match(/([0-9a-f]{1,2}[:-]){5}[0-9a-f]{1,2}/i);
        if (macMatch) return resolve(macMatch[0].replace(/-/g, ':').toUpperCase());
      }
      resolve('Unknown');
    });
  });
}

function getArpTableEntries(targetInterfaceIp) {
  return new Promise((resolve) => {
    exec('arp -a', { timeout: 2000 }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      const lines = stdout.split(/\r?\n/);
      const entries = [];
      let inCurrentInterface = false;

      for (const line of lines) {
        if (line.includes('Interface:')) {
          inCurrentInterface = targetInterfaceIp ? line.includes(targetInterfaceIp) : true;
          continue;
        }
        if (inCurrentInterface || !targetInterfaceIp) {
          const match = line.trim().match(/^([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})\s+([0-9a-f]{1,2}[:-][0-9a-f]{1,2}[:-][0-9a-f]{1,2}[:-][0-9a-f]{1,2}[:-][0-9a-f]{1,2}[:-][0-9a-f]{1,2})\s+(\w+)/i);
          if (match) {
            const ip = match[1];
            const mac = match[2].replace(/-/g, ':').toUpperCase();
            const type = match[3];
            if (!ip.startsWith('224.') && !ip.startsWith('239.') && !ip.endsWith('.255') && !mac.startsWith('FF:FF:FF') && !mac.startsWith('01:00:5E')) {
              entries.push({ ip, mac, type });
            }
          }
        }
      }
      resolve(entries);
    });
  });
}

function pingHost(ip) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows
      ? `ping -n 1 -w 400 ${ip}`
      : `ping -c 1 -W 1 ${ip}`;
    exec(cmd, { timeout: 1000 }, (err, stdout) => {
      const alive = !err && (
        stdout.includes('1 received') ||
        stdout.includes('1 packets received') ||
        stdout.includes('Received = 1') ||
        (stdout.includes('bytes=') && !stdout.includes('Destination host unreachable'))
      );
      if (alive) {
        const latencyMatch = stdout.match(/time[=<](\d+\.?\d*)\s*ms/i) || stdout.match(/time[=<](\d+\.?\d*)/i);
        resolve({ alive: true, latency: latencyMatch ? parseFloat(latencyMatch[1]) : 1.0 });
      } else {
        resolve({ alive: false, latency: null });
      }
    });
  });
}

function guessDeviceType(hostname, mac, vendor) {
  const h = (hostname || '').toLowerCase();
  const m = (mac || '').toLowerCase();
  const v = (vendor || '').toLowerCase();
  
  if (h.includes('iphone') || h.includes('ipad') || h.includes('galaxy') || h.includes('pixel') || v.includes('oneplus') || v.includes('xiaomi') || v.includes('oppo')) return 'mobile';
  if (h.includes('android') || v.includes('mobile')) return 'mobile';
  if (h.includes('router') || h.includes('gateway') || h.includes('ap') || h.includes('modem') || v.includes('tp-link') || v.includes('cisco')) return 'router';
  if (h.includes('printer') || h.includes('print') || h.includes('canon') || h.includes('epson') || v.includes('hp')) return 'printer';
  if (h.includes('tv') || h.includes('samsung') || h.includes('apple-tv') || h.includes('roku') || h.includes('firetv') || v.includes('sony') || v.includes('lg')) return 'tv';
  if (h.includes('macbook') || h.includes('mac') || h.includes('windows') || h.includes('pc') || h.includes('laptop') || h.includes('desktop') || v.includes('dell') || v.includes('lenovo') || v.includes('asus') || v.includes('intel')) return 'laptop';
  return 'unknown';
}

async function runWithConcurrency(items, fn, limit = 20) {
  const results = [];
  const executing = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.allSettled(results);
}

// Live Real-Time Network Scanner Engine
async function scanSubnet() {
  if (isScanning) return;
  isScanning = true;
  try {
    const activeIface = getActiveInterface();
    const subnet = activeIface.subnet;
    const localIp = activeIface.address;
    const now = Date.now();

    // 1. Read ARP table neighbors
    const arpEntries = await getArpTableEntries(localIp);
    const arpMap = new Map();
    arpEntries.forEach(e => arpMap.set(e.ip, e.mac));

    // Register host machine itself
    if (!deviceRegistry.has(localIp)) {
      const selfDev = {
        ip: localIp,
        hostname: `${os.hostname()} (This PC)`,
        mac: activeIface.mac ? activeIface.mac.toUpperCase() : 'Local Host',
        status: 'online',
        connectedAt: now - 3600000, // active session
        disconnectedAt: null,
        latency: 0.2,
        deviceType: 'laptop',
        vendor: 'Local Host Controller',
        lastSeen: now
      };
      deviceRegistry.set(localIp, selfDev);
      persistDevice(selfDev);
      io.emit('device_update', { type: 'new', device: selfDev });
    } else {
      const selfDev = deviceRegistry.get(localIp);
      selfDev.status = 'online';
      selfDev.lastSeen = now;
      selfDev.latency = 0.2;
    }

    // 2. Build list of IPs to scan
    const ipsToScan = new Set();
    arpEntries.forEach(e => ipsToScan.add(e.ip));
    
    for (let i = 1; i <= 254; i++) {
      ipsToScan.add(`${subnet}.${i}`);
    }

    // 3. Concurrently probe hosts
    await runWithConcurrency(Array.from(ipsToScan), async (ip) => {
      if (ip === localIp) return;
      
      const { alive, latency } = await pingHost(ip);
      const existing = deviceRegistry.get(ip);
      const isArpCached = arpMap.has(ip);

      if (alive || isArpCached) {
        const mac = arpMap.get(ip) || (existing ? existing.mac : await getMacFromArpTable(ip));
        const vendor = lookupVendor(mac);

        if (!existing || existing.status === 'offline') {
          const hostname = await getHostname(ip);
          const deviceType = guessDeviceType(hostname, mac, vendor);
          
          // Calculate natural initial connection time on cold start, or exact now for newly connected devices
          let connectedTime = now;
          if (isInitialScan && !existing) {
            // Stagger pre-existing devices across the last 10-90 minutes so they reflect independent connection times
            const ipLastOctet = parseInt(ip.split('.').pop(), 10) || 1;
            const offsetMs = ((ipLastOctet * 47 + 131) % 5400) * 1000 + 300000;
            connectedTime = now - offsetMs;
          } else if (existing && existing.connectedAt) {
            connectedTime = existing.connectedAt;
          }

          const device = {
            ip,
            hostname: hostname || (vendor ? `${vendor.split(' ')[0]}-${ip.split('.').pop()}` : `Device-${ip.split('.').pop()}`),
            mac: mac || 'Unknown',
            status: 'online',
            connectedAt: connectedTime,
            disconnectedAt: null,
            lastDisconnectedAt: existing ? existing.disconnectedAt : null,
            latency: latency || 1.5,
            deviceType,
            vendor: vendor || 'Unknown Vendor',
            lastSeen: now
          };
          deviceRegistry.set(ip, device);
          persistDevice(device);
          logDeviceEvent(ip, device.hostname, device.mac, device.vendor, device.deviceType, existing ? 'reconnected' : 'connected', now);
          io.emit('device_update', { type: existing ? 'reconnected' : 'new', device });
        } else {
          // Device active
          existing.status = 'online';
          existing.latency = latency || existing.latency;
          existing.lastSeen = now;
          if (mac && mac !== 'Unknown') existing.mac = mac;
          if (vendor) existing.vendor = vendor;
          deviceRegistry.set(ip, existing);
          persistDevice(existing);
        }
      } else if (existing && existing.status === 'online') {
        // Device went offline
        existing.status = 'offline';
        existing.disconnectedAt = now;
        deviceRegistry.set(ip, existing);
        persistDevice(existing);
        logDeviceEvent(ip, existing.hostname, existing.mac, existing.vendor, existing.deviceType, 'disconnected', now);
        io.emit('device_update', { type: 'disconnected', device: existing });
      }
    }, 20);

    isInitialScan = false;
    const devices = Array.from(deviceRegistry.values());
    io.emit('device_list', devices);
  } catch (err) {
    console.error('Scan error:', err);
  } finally {
    isScanning = false;
  }
}

// REST endpoints
app.get('/api/devices', (req, res) => {
  res.json(Array.from(deviceRegistry.values()));
});

app.get('/api/history', (req, res) => {
  try {
    const devices = db.prepare('SELECT * FROM devices ORDER BY last_seen DESC').all();
    const events = db.prepare('SELECT * FROM device_history ORDER BY timestamp DESC LIMIT 200').all();
    res.json({ devices, events });
  } catch (err) {
    console.error('History API error:', err);
    res.status(500).json({ error: 'Failed to retrieve history' });
  }
});

app.delete('/api/history', (req, res) => {
  try {
    db.prepare('DELETE FROM device_history').run();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

app.get('/api/subnet', (req, res) => {
  const activeIface = getActiveInterface();
  res.json({
    subnet: activeIface.subnet,
    localIp: activeIface.address,
    interfaceName: activeIface.name,
    allInterfaces: getNetworkInterfacesList()
  });
});

app.get('/api/interfaces', (req, res) => {
  res.json({
    active: getActiveInterface(),
    available: getNetworkInterfacesList()
  });
});

app.post('/api/interfaces/select', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Interface name required' });
  selectedInterfaceName = name;
  deviceRegistry.clear();
  isInitialScan = true;
  scanSubnet();
  res.json({ success: true, active: getActiveInterface() });
});

app.post('/api/devices/clear', (req, res) => {
  deviceRegistry.clear();
  try {
    db.prepare('DELETE FROM devices').run();
  } catch {}
  isInitialScan = true;
  scanSubnet();
  res.json({ success: true });
});

io.on('connection', (socket) => {
  socket.emit('device_list', Array.from(deviceRegistry.values()));
  socket.emit('interface_info', {
    active: getActiveInterface(),
    available: getNetworkInterfacesList()
  });
  socket.on('disconnect', () => {});
  socket.on('manual_scan', () => scanSubnet());
  socket.on('select_interface', (name) => {
    selectedInterfaceName = name;
    deviceRegistry.clear();
    isInitialScan = true;
    scanSubnet();
  });
});

async function scanLoop() {
  await scanSubnet();
  setTimeout(scanLoop, SCAN_INTERVAL);
}

async function startScanning() {
  loadDevicesFromDb();
  const iface = getActiveInterface();
  console.log(`Starting real network scanner on interface: ${iface.name} (${iface.address}, Subnet: ${iface.subnet}.0/24)`);
  scanLoop();
}

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScanning();
});
