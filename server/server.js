const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { exec } = require('child_process');
const os = require('os');
const dns = require('dns');

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
const SCAN_INTERVAL = 10000;
let isScanning = false;

function getLocalSubnet() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}`;
      }
    }
  }
  return '192.168.1';
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

async function getHostname(ip) {
  // Try fast DNS reverse lookup first (no child process)
  try {
    const hostnames = await dns.promises.reverse(ip);
    if (hostnames && hostnames.length > 0) {
      return hostnames[0];
    }
  } catch {
    // DNS reverse failed, fallback to system command
  }

  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? `nslookup ${ip}` : `host ${ip}`;
    exec(cmd, { timeout: 1500 }, (err, stdout) => {
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

function getMacVendor(ip) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? `arp -a ${ip}` : `arp ${ip}`;
    exec(cmd, { timeout: 1500 }, (err, stdout) => {
      if (!err && stdout) {
        const macMatch = stdout.match(/([0-9a-f]{1,2}[:-]){5}[0-9a-f]{1,2}/i);
        if (macMatch) return resolve(macMatch[0].toUpperCase());
      }
      resolve('Unknown');
    });
  });
}

function pingHost(ip) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows
      ? `ping -n 1 -w 500 ${ip}`
      : `ping -c 1 -W 1 ${ip}`;
    exec(cmd, { timeout: 1500 }, (err, stdout) => {
      const alive = !err && (
        stdout.includes('1 received') ||          // Linux
        stdout.includes('1 packets received') ||   // macOS
        stdout.includes('Received = 1') ||         // Windows English
        stdout.includes('bytes=') ||               // Windows general reply
        stdout.includes('TTL=')
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

function guessDeviceType(hostname, mac) {
  const h = (hostname || '').toLowerCase();
  const m = (mac || '').toLowerCase();
  if (h.includes('iphone') || h.includes('ipad') || h.includes('galaxy') || h.includes('pixel')) return 'mobile';
  if (h.includes('android')) return 'mobile';
  if (h.includes('router') || h.includes('gateway') || h.includes('ap') || h.includes('modem')) return 'router';
  if (h.includes('printer') || h.includes('print') || h.includes('canon') || h.includes('epson')) return 'printer';
  if (h.includes('tv') || h.includes('samsung') || h.includes('apple-tv') || h.includes('roku') || h.includes('firetv')) return 'tv';
  if (h.includes('macbook') || h.includes('mac') || h.includes('windows') || h.includes('pc') || h.includes('laptop') || h.includes('desktop')) return 'laptop';
  return 'unknown';
}

// Helper to run promises with controlled concurrency
async function runWithConcurrency(items, fn, limit = 16) {
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

async function scanSubnet() {
  if (isScanning) return;
  isScanning = true;
  try {
    const subnet = getLocalSubnet();
    const now = Date.now();
    const ips = [];
    for (let i = 1; i <= 254; i++) {
      ips.push(`${subnet}.${i}`);
    }

    await runWithConcurrency(ips, async (ip) => {
      const { alive, latency } = await pingHost(ip);
      const existing = deviceRegistry.get(ip);
      if (alive) {
        if (!existing || existing.status === 'offline') {
          // New device or reconnected
          const [hostname, mac] = await Promise.all([getHostname(ip), getMacVendor(ip)]);
          const deviceType = guessDeviceType(hostname, mac);
          const device = {
            ip,
            hostname: hostname || `Device-${ip.split('.').pop()}`,
            mac: mac || 'Unknown',
            status: 'online',
            connectedAt: now,
            disconnectedAt: existing ? existing.disconnectedAt : null,
            latency,
            deviceType,
            lastSeen: now
          };
          deviceRegistry.set(ip, device);
          io.emit('device_update', { type: existing ? 'reconnected' : 'new', device });
        } else {
          // Update latency and lastSeen
          existing.latency = latency;
          existing.lastSeen = now;
          deviceRegistry.set(ip, existing);
        }
      } else if (existing && existing.status === 'online') {
        existing.status = 'offline';
        existing.disconnectedAt = now;
        deviceRegistry.set(ip, existing);
        io.emit('device_update', { type: 'disconnected', device: existing });
      }
    }, 16);

    // If no real devices found at all, keep demo devices visible
    const realDevices = Array.from(deviceRegistry.values()).filter(d => !d.isDemo);
    if (realDevices.length === 0) seedDemoDevices();

    // Broadcast full device list
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

app.get('/api/subnet', (req, res) => {
  res.json({ subnet: getLocalSubnet(), localIp: getLocalIp() });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  // Send current device list on connect
  socket.emit('device_list', Array.from(deviceRegistry.values()));
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
  socket.on('manual_scan', () => {
    scanSubnet();
  });
});

function seedDemoDevices() {
  const subnet = getLocalSubnet();
  const now = Date.now();
  const demos = [
    { ip: `${subnet}.5`,  hostname: 'MacBook-Pro',   mac: 'DE:AD:BE:EF:00:01', deviceType: 'laptop',  latency: 3.5,  status: 'online'  },
    { ip: `${subnet}.10`, hostname: 'iPhone-15',      mac: 'DE:AD:BE:EF:00:02', deviceType: 'mobile',  latency: 5.1,  status: 'online'  },
    { ip: `${subnet}.15`, hostname: 'Samsung-SmartTV',mac: 'DE:AD:BE:EF:00:03', deviceType: 'tv',      latency: 8.7,  status: 'online'  },
    { ip: `${subnet}.20`, hostname: 'HP-LaserJet',    mac: 'DE:AD:BE:EF:00:04', deviceType: 'printer', latency: null, status: 'offline' },
    { ip: `${subnet}.25`, hostname: 'iPad-Air',       mac: 'DE:AD:BE:EF:00:05', deviceType: 'mobile',  latency: 4.2,  status: 'offline' },
  ];
  demos.forEach((d) => {
    if (deviceRegistry.has(d.ip)) return; // don't overwrite real device
    const connectedAt = now - Math.floor(Math.random() * 3600000);
    deviceRegistry.set(d.ip, {
      ...d,
      isDemo: true,
      connectedAt,
      disconnectedAt: d.status === 'offline' ? now - Math.floor(Math.random() * 1800000) : null,
      lastSeen: d.status === 'offline' ? now - Math.floor(Math.random() * 1800000) : now,
    });
  });
}

// Recursive scan loop to prevent overlapping runs
async function scanLoop() {
  await scanSubnet();
  setTimeout(scanLoop, SCAN_INTERVAL);
}

// Start scanning
async function startScanning() {
  console.log(`Scanning subnet: ${getLocalSubnet()}.0/24`);
  seedDemoDevices();
  scanLoop();
}

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScanning();
});
