// Integration Test for Spidsmus Backend
import { spawn } from 'child_process';
import assert from 'assert';

const TEST_PORT = 4001;
const BASE_URL = `http://localhost:${TEST_PORT}/spidsmus`;

console.log('--- STARTING SPIDSMUS INTEGRATION TESTS ---');

// 1. Launch the server on port 4001
const serverProcess = spawn('node', ['server.js'], {
  env: { ...process.env, PORT: TEST_PORT },
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
    console.log('✅ Initial status test passed!');

    console.log('1.5 Testing POST /api/settings (Update target)...');
    res = await fetch(`${BASE_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_count: 5 })
    });
    data = await res.json();
    assert.strictEqual(data.success, true);

    res = await fetch(`${BASE_URL}/api/status`);
    data = await res.json();
    assert.strictEqual(data.target_count, 5);
    assert.strictEqual(data.remaining, 5);
    console.log('✅ Settings update test passed!');

    console.log('2. Testing POST /api/scan (New unique code)...');
    res = await fetch(`${BASE_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'SKOV_STI_04' })
    });
    data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.status, 'success');
    assert.strictEqual(data.code, 'SKOV_STI_04');
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
    assert.strictEqual(data.scans[0].id, 'SKOV_STI_04');
    console.log('✅ Post-scan status check passed!');

    console.log('4. Testing POST /api/scan (Duplicate scan of same code)...');
    res = await fetch(`${BASE_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'SKOV_STI_04' })
    });
    data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.status, 'already_scanned');
    assert.strictEqual(data.message, 'Har været fundet, tag QR Koden med dig');
    console.log('✅ Duplicate scan check passed!');

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
    assert.strictEqual(data.remaining, 5);
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
