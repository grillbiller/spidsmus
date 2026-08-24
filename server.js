import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;
const BASE_PATH = '/spidsmus';

// Initialize SQLite database
const db = new Database(path.join(__dirname, 'database.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    scanned_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Set default target if not exists
const stmtGetSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const stmtSetSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

if (!stmtGetSetting.get('target_count')) {
  stmtSetSetting.run('target_count', '200');
}

function getTargetCount() {
  const row = stmtGetSetting.get('target_count');
  return parseInt(row ? row.value : '200', 10);
}

// Prepared statements
const stmtInsert = db.prepare('INSERT INTO scans (id, scanned_at) VALUES (?, ?)');
const stmtCount = db.prepare('SELECT COUNT(*) as count FROM scans');
const stmtAll = db.prepare('SELECT id, scanned_at FROM scans ORDER BY scanned_at DESC');
const stmtCheck = db.prepare('SELECT id FROM scans WHERE id = ?');
const stmtDeleteAll = db.prepare('DELETE FROM scans');

app.use(express.json());
// Serve static assets from 'public' folder under /spidsmus
app.use(`${BASE_PATH}`, express.static(path.join(__dirname, 'public')));

// Store active Server-Sent Events (SSE) clients
const sseClients = [];

function broadcastEvent(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

// 0. GET /api/settings
app.get(`${BASE_PATH}/api/settings`, (req, res) => {
  const target = getTargetCount();
  res.json({ success: true, target_count: target });
});

// 0. POST /api/settings
app.post(`${BASE_PATH}/api/settings`, (req, res) => {
  const { target_count } = req.body;
  if (target_count !== undefined) {
    stmtSetSetting.run('target_count', target_count.toString());
    broadcastEvent({ type: 'settings_update', target_count: parseInt(target_count, 10) });
    return res.json({ success: true });
  }
  res.status(400).json({ success: false, error: 'Manglende target_count' });
});

// 1. GET /spidsmus/api/status
app.get(`${BASE_PATH}/api/status`, (req, res) => {
  try {
    const { count } = stmtCount.get();
    const scans = stmtAll.all();
    const target = getTargetCount();
    res.json({ success: true, count, remaining: Math.max(0, target - count), completed: count >= target, scans, target_count: target });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Kunne ikke hente status' });
  }
});

// 2. POST /spidsmus/api/scan
app.post(`${BASE_PATH}/api/scan`, (req, res) => {
  try {
    let { code } = req.body;
    code = code.trim().substring(0, 100);
    const existing = stmtCheck.get(code);
    if (existing) return res.json({ status: 'already_scanned', message: 'Har været fundet, tag QR Koden med dig', code });
    
    const { count: currentCount } = stmtCount.get();
    const target = getTargetCount();
    if (currentCount >= target) return res.json({ status: 'game_completed', message: 'Gården reddet!', code });

    stmtInsert.run(code, new Date().toISOString());
    const newCount = currentCount + 1;
    const remainingCount = Math.max(0, target - newCount);
    broadcastEvent({ type: 'scan', code, count: newCount, remaining: remainingCount, completed: newCount >= target });
    res.json({ status: 'success', message: 'Fundet!', code, count: newCount, remaining: remainingCount, completed: newCount >= target });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Fejl' });
  }
});

// 3. GET /spidsmus/api/events
app.get(`${BASE_PATH}/api/events`, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  sseClients.push(res);
  req.on('close', () => sseClients.splice(sseClients.indexOf(res), 1));
});

// 4. POST /spidsmus/api/reset
app.post(`${BASE_PATH}/api/reset`, (req, res) => {
  stmtDeleteAll.run();
  broadcastEvent({ type: 'reset', count: 0 });
  res.json({ success: true, message: 'Spillet er nulstillet!' });
});

// Explicit routes for HTML pages
app.get(`${BASE_PATH}/admin.html`, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get(`${BASE_PATH}/admin`, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get(`${BASE_PATH}/scanner.html`, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scanner.html'));
});

app.get(`${BASE_PATH}/scanner`, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scanner.html'));
});

// Fallback for the base path and everything else to index.html
app.get(`${BASE_PATH}/`, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(`${BASE_PATH}`, (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  // If it's not an API and wasn't caught by static/explicit routes, send index.html
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Running on port ${PORT}`));
