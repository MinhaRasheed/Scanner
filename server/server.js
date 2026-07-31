const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { exec } = require('child_process');
const os = require('os');

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
const SCAN_INTERVAL = 8000;

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

function getHostname(ip) {
  return new Promise((resolve) => {
    exec(`host ${ip}`, { timeout: 2000 }, (err, stdout) => {
      if (!err && stdout) {
        const match = stdout.match(/pointer (.+)\./);
        if (match) return resolve(match[1]);
      }
      resolve(null);
    });
  });
}

function getMacVendor(ip) {
  return new Promise((resolve) => {
    exec(`arp ${ip}`, { timeout: 2000 }, (err, stdout) => {
      if (!err && stdout) {
        const macMatch = stdout.match(/([0-9a-f]{1,2}[:\-]){5}[0-9a-f]{1,2}/i);
        if (macMatch) return resolve(macMatch[0]);
      }
      resolve('Unknown');
    });
  });
}

function pingHost(ip) {
  return new Promise((resolve) => {
    exec(`ping -c 1 -W 1 ${ip}`, { timeout: 3000 }, (err, stdout) => {
      if (!err && stdout.includes('1 packets received')) {
        // parse latency
        const latencyMatch = stdout.match(/time=(\d+\.?\d*)/);
        resolve({ alive: true, latency: latencyMatch ? parseFloat(latencyMatch[1]) : null });
      } else {
        resolve({ alive: false, latency: null });
      }
    });
  });
}

function guessDeviceType(hostname, mac) {
  const h = (hostname || '').toLowerCase();
  const m = (mac || '').toLowerCase();
  if (h.includes('iphone') || h.includes('ipad')) return 'mobile';
  if (h.includes('android')) return 'mobile';
  if (h.includes('router') || h.includes('gateway') || h.includes('ap')) return 'router';
  if (h.includes('printer') || h.includes('print')) return 'printer';
  if (h.includes('tv') || h.includes('samsung') || h.includes('apple-tv')) return 'tv';
  if (h.includes('macbook') || h.includes('mac') || h.includes('windows') || h.includes('pc')) return 'laptop';
  return 'unknown';
}

async function scanSubnet() {
  const subnet = getLocalSubnet();
  const now = Date.now();
  const scanPromises = [];

  for (let i = 1; i <= 254; i++) {
    const ip = `${subnet}.${i}`;
    scanPromises.push(
      pingHost(ip).then(async ({ alive, latency }) => {
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
      })
    );
  }

  await Promise.allSettled(scanPromises);

  // Broadcast full device list
  const devices = Array.from(deviceRegistry.values());
  io.emit('device_list', devices);
}

// REST endpoints
app.get('/api/devices', (req, res) => {
  res.json(Array.from(deviceRegistry.values()));
});

app.get('/api/subnet', (req, res) => {
  res.json({ subnet: getLocalSubnet(), localIp: getLocalIp() });
});

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  // Send current device list on connect
  socket.emit('device_list', Array.from(deviceRegistry.values()));
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
  socket.on('manual_scan', () => scanSubnet());
});

function seedDemoDevices() {
  const subnet = getLocalSubnet();
  const now = Date.now();
  const demos = [
    { ip: `${subnet}.5`,  hostname: 'MacBook-Pro',   mac: 'de:ad:be:ef:00:01', deviceType: 'laptop',  latency: 3.5,  status: 'online'  },
    { ip: `${subnet}.10`, hostname: 'iPhone-15',      mac: 'de:ad:be:ef:00:02', deviceType: 'mobile',  latency: 5.1,  status: 'online'  },
    { ip: `${subnet}.15`, hostname: 'Samsung-SmartTV',mac: 'de:ad:be:ef:00:03', deviceType: 'tv',      latency: 8.7,  status: 'online'  },
    { ip: `${subnet}.20`, hostname: 'HP-LaserJet',    mac: 'de:ad:be:ef:00:04', deviceType: 'printer', latency: null, status: 'offline' },
    { ip: `${subnet}.25`, hostname: 'iPad-Air',       mac: 'de:ad:be:ef:00:05', deviceType: 'mobile',  latency: 4.2,  status: 'offline' },
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

// Start scanning
async function startScanning() {
  console.log(`Scanning subnet: ${getLocalSubnet()}.0/24`);
  seedDemoDevices();
  await scanSubnet();
  setInterval(scanSubnet, SCAN_INTERVAL);
}

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScanning();
});
