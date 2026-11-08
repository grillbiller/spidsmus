import express from 'express';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;
const BASE_PATH = '/spidsmus';
const PASSWORD_FILE = '/var/lib/spidsmus-auth/.htpasswd';

// Initialize SQLite database
const db = new Database(process.env.DATABASE_PATH || path.join(__dirname, 'database.db'));

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
  CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    target_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS session_scans (
    session_id TEXT NOT NULL,
    code TEXT NOT NULL,
    id TEXT NOT NULL,
    scanned_at TEXT NOT NULL,
    PRIMARY KEY (session_id, code),
    FOREIGN KEY (session_id) REFERENCES game_sessions(id)
  );
`);

// Set default target if not exists
const stmtGetSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const stmtSetSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

if (!stmtGetSetting.get('target_count')) {
  stmtSetSetting.run('target_count', '200');
}

const stmtGetActiveSession = db.prepare(`
  SELECT id, title, target_count FROM game_sessions
  WHERE id = (SELECT value FROM settings WHERE key = 'active_session_id')
`);
const stmtInsertSession = db.prepare('INSERT INTO game_sessions (id, title, target_count, created_at) VALUES (?, ?, ?, ?)');
const stmtUpdateSession = db.prepare('UPDATE game_sessions SET title = ?, target_count = ? WHERE id = ?');
const createAndActivateSession = db.transaction((id, title, targetCount) => {
  stmtInsertSession.run(id, title, targetCount, new Date().toISOString());
  stmtSetSetting.run('active_session_id', id);
});

if (!stmtGetActiveSession.get()) {
  const configuredTarget = Number(stmtGetSetting.get('target_count').value);
  const targetCount = Number.isInteger(configuredTarget) && configuredTarget >= 1 && configuredTarget <= 1000
    ? configuredTarget
    : 200;
  createAndActivateSession(randomUUID(), 'Spidsmus', targetCount);
}

function getActiveSession() {
  return stmtGetActiveSession.get();
}

const stmtInsertScan = db.prepare('INSERT INTO session_scans (session_id, code, id, scanned_at) VALUES (?, ?, ?, ?)');
const stmtCount = db.prepare('SELECT COUNT(*) as count FROM session_scans WHERE session_id = ?');
const stmtAll = db.prepare('SELECT id, scanned_at FROM session_scans WHERE session_id = ? ORDER BY scanned_at DESC');
const stmtCheck = db.prepare('SELECT 1 FROM session_scans WHERE session_id = ? AND code = ?');
const stmtDeleteSessionScans = db.prepare('DELETE FROM session_scans WHERE session_id = ?');
const stmtGetSession = db.prepare('SELECT id, title, target_count, created_at FROM game_sessions WHERE id = ?');
const stmtAllSessions = db.prepare(`
  SELECT game_sessions.id, game_sessions.title, game_sessions.target_count, game_sessions.created_at,
         COUNT(session_scans.code) AS count
  FROM game_sessions
  LEFT JOIN session_scans ON session_scans.session_id = game_sessions.id
  GROUP BY game_sessions.id, game_sessions.title, game_sessions.target_count, game_sessions.created_at
  ORDER BY game_sessions.created_at DESC, game_sessions.id DESC
`);

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
  const session = getActiveSession();
  res.json({
    success: true,
    session_id: session.id,
    session_title: session.title,
    target_count: session.target_count
  });
});

// 0. POST /api/settings
app.post(`${BASE_PATH}/api/settings`, (req, res) => {
  const body = req.body ?? {};
  const session = getActiveSession();
  const title = body.title === undefined
    ? session.title
    : typeof body.title === 'string' ? body.title.trim() : '';
  const targetCount = body.target_count === undefined
    ? session.target_count
    : Number(body.target_count);

  if (!title || Array.from(title).length > 80 || !Number.isInteger(targetCount) || targetCount < 1 || targetCount > 1000) {
    return res.status(400).json({ success: false, error: 'Ugyldig titel eller antal QR-koder.' });
  }

  stmtUpdateSession.run(title, targetCount, session.id);
  broadcastEvent({ type: 'settings_update', session_id: session.id, session_title: title, target_count: targetCount });
  res.json({ success: true, session_id: session.id, session_title: title, target_count: targetCount });
});

app.post(`${BASE_PATH}/api/session`, (req, res) => {
  const body = req.body ?? {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const targetCount = Number(body.target_count);

  if (!title || Array.from(title).length > 80 || !Number.isInteger(targetCount) || targetCount < 1 || targetCount > 1000) {
    return res.status(400).json({ success: false, error: 'Angiv en titel og mellem 1 og 1000 QR-koder.' });
  }

  const sessionId = randomUUID();
  createAndActivateSession(sessionId, title, targetCount);
  broadcastEvent({ type: 'session_update', session_id: sessionId, session_title: title, target_count: targetCount });
  res.json({ success: true, session_id: sessionId, session_title: title, target_count: targetCount });
app.get(`${BASE_PATH}/api/session`, (req, res) => {
  const activeSession = getActiveSession();
  res.json({ success: true, active_session_id: activeSession.id, sessions: stmtAllSessions.all() });
});

app.post(`${BASE_PATH}/api/session/activate`, (req, res) => {
  const sessionId = req.body?.session_id;
  const session = typeof sessionId === 'string' ? stmtGetSession.get(sessionId) : null;
  if (!session) {
    return res.status(404).json({ success: false, error: 'Sessionen findes ikke.' });
  }

  stmtSetSetting.run('active_session_id', session.id);
  broadcastEvent({ type: 'session_update', session_id: session.id, session_title: session.title, target_count: session.target_count });
  res.json({ success: true, session_id: session.id, session_title: session.title, target_count: session.target_count });
});

});

app.post(`${BASE_PATH}/api/password`, (req, res) => {
  if (req.get('origin') !== 'https://dalbynight.ddns.net') {
    return res.status(403).json({ success: false, error: 'Ugyldig forespørgsel' });
  }

  const { password, confirmation } = req.body ?? {};
  if (typeof password !== 'string' || typeof confirmation !== 'string' ||
      Array.from(password).length < 12 || Buffer.byteLength(password, 'utf8') > 72 ||
      /[\r\n\0]/.test(password)) {
    return res.status(400).json({ success: false, error: 'Adgangskoden skal være mindst 12 tegn og højst 72 bytes.' });
  }
  if (password !== confirmation) {
    return res.status(400).json({ success: false, error: 'Adgangskoderne er ikke ens.' });
  }

  const hashProcess = spawn('/usr/bin/htpasswd', ['-B', '-C', '12', '-i', PASSWORD_FILE, 'admin'], {
    stdio: ['pipe', 'ignore', 'ignore']
  });
  let responseSent = false;
  hashProcess.on('error', () => {
    if (responseSent) return;
    responseSent = true;
    res.status(500).json({ success: false, error: 'Kunne ikke starte adgangskodeværktøjet.' });
  });
  hashProcess.on('close', (code) => {
    if (responseSent) return;
    responseSent = true;
    if (code === 0) return res.json({ success: true });
    res.status(500).json({ success: false, error: 'Kunne ikke gemme adgangskoden.' });
  });
  hashProcess.stdin.on('error', () => {});
  hashProcess.stdin.end(`${password}\n`);
});

// 1. GET /spidsmus/api/status
app.get(`${BASE_PATH}/api/status`, (req, res) => {
  try {
    const session = getActiveSession();
    const { count } = stmtCount.get(session.id);
    const scans = stmtAll.all(session.id);
    const target = session.target_count;
    res.json({
      success: true,
      count,
      remaining: Math.max(0, target - count),
      completed: count >= target,
      scans,
      target_count: target,
      session_id: session.id,
      session_title: session.title
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Kunne ikke hente status' });
  }
});

// 2. POST /spidsmus/api/scan
app.post(`${BASE_PATH}/api/scan`, (req, res) => {
  try {
    const { code: scannedCode } = req.body ?? {};
    const session = getActiveSession();
    if (typeof scannedCode !== 'string') {
      return res.json({ status: 'invalid_code', message: 'Denne QR-kode er ikke gyldig for den aktive spilsession.' });
    }

    const code = scannedCode.trim();
    const match = code.match(/^SPIDSMUS:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([1-9]\d*)$/);
    const qrNumber = match ? Number(match[2]) : 0;
    if (!match || match[1] !== session.id || qrNumber > session.target_count) {
      return res.json({ status: 'invalid_code', message: 'Denne QR-kode er ikke gyldig for den aktive spilsession.' });
    }

    const displayCode = `SPIDSMUS_${String(qrNumber).padStart(3, '0')}`;
    const existing = stmtCheck.get(session.id, code);
    if (existing) return res.json({ status: 'already_scanned', message: 'Har været fundet, tag QR Koden med dig', code: displayCode });

    const { count: currentCount } = stmtCount.get(session.id);
    const target = session.target_count;
    if (currentCount >= target) return res.json({ status: 'game_completed', message: 'Gården reddet!', code: displayCode });

    const scannedAt = new Date().toISOString();
    stmtInsertScan.run(session.id, code, displayCode, scannedAt);
    const newCount = currentCount + 1;
    const remainingCount = Math.max(0, target - newCount);
    broadcastEvent({ type: 'scan', code: displayCode, scannedAt, count: newCount, remaining: remainingCount, completed: newCount >= target });
    res.json({ status: 'success', message: 'Fundet!', code: displayCode, count: newCount, remaining: remainingCount, completed: newCount >= target });
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
  const session = getActiveSession();
  stmtDeleteSessionScans.run(session.id);
  broadcastEvent({ type: 'reset', session_id: session.id, count: 0 });
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
