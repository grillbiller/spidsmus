import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_PORT = 4001;
const TEST_DATABASE_PATH = join(tmpdir(), `spidsmus-test-${process.pid}.db`);
const BASE_URL = `http://localhost:${TEST_PORT}/spidsmus`;

rmSync(TEST_DATABASE_PATH, { force: true });

console.log('--- STARTING SPIDSMUS INTEGRATION TESTS ---');

// 1. Launch the server on port 4001
const serverProcess = spawn('node', ['server.js'], {
  env: { ...process.env, PORT: TEST_PORT, DATABASE_PATH: TEST_DATABASE_PATH },
  stdio: 'pipe'
});

// Helper to wait for the server to be up and running
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Ensure the server is shut down even on failures
async function runTests() {
  try {
    // Wait 1.5 seconds for server to start up and bind to port
    await wait(1500);

    console.log('1. Testing GET /api/status (Initial state)...');
    let res = await fetch(`${BASE_URL}/api/status`);
    let data = await res.json();
    
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.count, 0);
    assert.strictEqual(data.target_count, 200);
    assert.strictEqual(data.completed, false);
    const firstSessionId = data.session_id;
    console.log('✅ Initial status test passed!');

    res = await fetch(`${BASE_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'NOT_A_GAME_QR' })
    });
    data = await res.json();
    assert.strictEqual(data.status, 'invalid_code');
    assert.strictEqual((await (await fetch(`${BASE_URL}/api/status`)).json()).count, 0);

    console.log('1.5 Testing POST /api/settings (Update target)...');
    res = await fetch(`${BASE_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test session', target_count: 5 })
    });
    data = await res.json();
    assert.strictEqual(data.success, true);

    res = await fetch(`${BASE_URL}/api/status`);
    data = await res.json();
    assert.strictEqual(data.target_count, 5);
    assert.strictEqual(data.remaining, 5);
    assert.strictEqual(data.session_title, 'Test session');
    console.log('✅ Settings update test passed!');

    console.log('2. Testing POST /api/scan (New unique code)...');
    const firstCode = `SPIDSMUS:${firstSessionId}:1`;
    res = await fetch(`${BASE_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: firstCode })
    });
    data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.status, 'success');
    assert.strictEqual(data.code, 'SPIDSMUS_001');
    assert.strictEqual(data.count, 1);
    assert.strictEqual(data.remaining, 4);
    assert.strictEqual(data.completed, false);
    console.log('✅ Unique scan test passed!');

    console.log('3. Testing GET /api/status (After one scan)...');
    res = await fetch(`${BASE_URL}/api/status`);
    data = await res.json();

    assert.strictEqual(data.count, 1);
    assert.strictEqual(data.remaining, 4);
    assert.strictEqual(data.scans.length, 1);
    assert.strictEqual(data.scans[0].id, 'SPIDSMUS_001');
    console.log('✅ Post-scan status check passed!');

    console.log('4. Testing POST /api/scan (Duplicate scan of same code)...');
    res = await fetch(`${BASE_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: firstCode })
    });
    data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.status, 'already_scanned');
    assert.strictEqual(data.message, 'Har været fundet, tag QR Koden med dig');
    console.log('✅ Duplicate scan check passed!');

    res = await fetch(`${BASE_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: `SPIDSMUS:${firstSessionId}:6` })
    });
    data = await res.json();
    assert.strictEqual(data.status, 'invalid_code');

    res = await fetch(`${BASE_URL}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Sommerfest', target_count: 2 })
    });
    data = await res.json();
    assert.strictEqual(data.success, true);
    const secondSessionId = data.session_id;

    res = await fetch(`${BASE_URL}/api/session`);
    data = await res.json();
    assert.strictEqual(data.sessions.length, 2);
    assert.strictEqual(data.sessions.find(session => session.id === firstSessionId).count, 1);
    assert.strictEqual(data.sessions.find(session => session.id === secondSessionId).count, 0);

    res = await fetch(`${BASE_URL}/api/session/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: firstSessionId })
    });
    data = await res.json();
    assert.strictEqual(data.success, true);
    res = await fetch(`${BASE_URL}/api/status`);
    data = await res.json();
    assert.strictEqual(data.session_title, 'Test session');
    assert.strictEqual(data.count, 1);

    res = await fetch(`${BASE_URL}/api/session/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: secondSessionId })
    });
    data = await res.json();
    assert.strictEqual(data.success, true);
    res = await fetch(`${BASE_URL}/api/status`);
    data = await res.json();
    assert.strictEqual(data.session_title, 'Sommerfest');
    assert.strictEqual(data.count, 0);

    res = await fetch(`${BASE_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: firstCode })
    });
    data = await res.json();
    assert.strictEqual(data.status, 'invalid_code');

    res = await fetch(`${BASE_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: `SPIDSMUS:${secondSessionId}:1` })
    });
    data = await res.json();
    assert.strictEqual(data.status, 'success');

    console.log('5. Testing POST /api/reset (Game reset)...');
    res = await fetch(`${BASE_URL}/api/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true })
    });
    data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.message, 'Spillet er nulstillet!');
    console.log('✅ Reset test passed!');

    console.log('6. Testing GET /api/status (After reset)...');
    res = await fetch(`${BASE_URL}/api/status`);
    data = await res.json();

    assert.strictEqual(data.count, 0);
    assert.strictEqual(data.remaining, 2);
    assert.strictEqual(data.scans.length, 0);
    console.log('✅ Post-reset status check passed!');

    console.log('🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉');
  } catch (error) {
    console.error('❌ TEST FAILURE:', error);
    process.exitCode = 1;
  } finally {
    console.log('Shutting down test server...');
    serverProcess.kill();
    // Wait a brief moment for cleanup
    await wait(500);
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(`${TEST_DATABASE_PATH}${suffix}`, { force: true });
    }
    process.exit();
  }
}

// Log server output to console for easy debugging
serverProcess.stdout.on('data', (data) => {
  console.log(`[Server Out] ${data.toString().trim()}`);
});

serverProcess.stderr.on('data', (data) => {
  console.error(`[Server Err] ${data.toString().trim()}`);
});

runTests();
