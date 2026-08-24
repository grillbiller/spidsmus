// Spidsmus Scoreboard Controller

// 1. Setup Audio Synthesizer (Web Audio API)
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Play a pleasant, retro game level-up chime
function playSuccessChime() {
  try {
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const t = audioCtx.currentTime;
    
    // Low harmony note (C5)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, t); // C5
    gain1.gain.setValueAtTime(0, t);
    gain1.gain.linearRampToValueAtTime(0.08, t + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(t);
    osc1.stop(t + 0.4);

    // High melody note (G5) played slightly later
    setTimeout(() => {
      const t2 = audioCtx.currentTime;
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, t2); // G5
      gain2.gain.setValueAtTime(0, t2);
      gain2.gain.linearRampToValueAtTime(0.1, t2 + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.5);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(t2);
      osc2.stop(t2 + 0.5);
    }, 80);

    // Extra high victory chime (C6) played after
    setTimeout(() => {
      const t3 = audioCtx.currentTime;
      const osc3 = audioCtx.createOscillator();
      const gain3 = audioCtx.createGain();
      osc3.type = 'triangle';
      osc3.frequency.setValueAtTime(1046.50, t3); // C6
      gain3.gain.setValueAtTime(0, t3);
      gain3.gain.linearRampToValueAtTime(0.06, t3 + 0.05);
      gain3.gain.exponentialRampToValueAtTime(0.001, t3 + 0.6);
      osc3.connect(gain3);
      gain3.connect(audioCtx.destination);
      osc3.start(t3);
      osc3.stop(t3 + 0.6);
    }, 180);

  } catch (err) {
    console.warn('Audio Context blocked or not supported:', err);
  }
}

// Play a low sweep when reset occurs
function playResetSweep() {
  try {
    initAudio();
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.6);
    
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(t);
    osc.stop(t + 0.6);
  } catch (err) {
    console.warn(err);
  }
}

// 2. Confetti Particle System
let confettiActive = false;
let confettiInterval = null;
const canvas = document.getElementById('confetti-canvas');
const ctx = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class ConfettiParticle {
  constructor() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * -canvas.height - 20;
    this.size = Math.random() * 8 + 6;
    this.color = ['#e5a91a', '#3f7b4a', '#2ecc71', '#3498db', '#e74c3c', '#9b59b6'][Math.floor(Math.random() * 6)];
    this.speedX = Math.random() * 4 - 2;
    this.speedY = Math.random() * 5 + 4;
    this.rotation = Math.random() * 360;
    this.rotationSpeed = Math.random() * 4 - 2;
  }
  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    this.rotation += this.rotationSpeed;
    if (this.y > canvas.height) {
      this.y = -20;
      this.x = Math.random() * canvas.width;
    }
  }
  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.fillStyle = this.color;
    ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    ctx.restore();
  }
}

function animateConfetti() {
  if (!confettiActive) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach((p) => {
    p.update();
    p.draw();
  });
  requestAnimationFrame(animateConfetti);
}

function startConfetti() {
  if (confettiActive) return;
  confettiActive = true;
  particles = Array.from({ length: 120 }, () => new ConfettiParticle());
  animateConfetti();
}

function stopConfetti() {
  confettiActive = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Initialize dynamic audio triggering on first interaction
document.body.addEventListener('click', () => {
  initAudio();
}, { once: true });


// 3. UI Updates and SSE Connection
const countdownEl = document.getElementById('countdown');
const foundCountEl = document.getElementById('found-count');
const targetCountDisplayEl = document.getElementById('target-count-display');
const percentDisplayEl = document.getElementById('percent-display');
const progressFillEl = document.getElementById('progress-fill');
const logListEl = document.getElementById('log-list');
const logEmptyEl = document.getElementById('log-empty');
const victoryOverlay = document.getElementById('victory-overlay');

let globalTargetCount = 200;

// Format date to local Danish time format (e.g. 14:32:05)
function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Animate numbers and progress
function updateScoreboard(count, remaining, completed, targetCount = globalTargetCount) {
  globalTargetCount = targetCount;
  if (targetCountDisplayEl) targetCountDisplayEl.textContent = targetCount;

  // Animate the countdown digit transition
  const prevCount = parseInt(countdownEl.textContent, 10);
  countdownEl.textContent = remaining;
  
  if (prevCount !== remaining) {
    countdownEl.classList.add('pulse');
    setTimeout(() => countdownEl.classList.remove('pulse'), 300);
  }

  foundCountEl.textContent = count;
  
  const percentage = Math.min(100, Math.round((count / targetCount) * 100));
  percentDisplayEl.textContent = `${percentage}%`;
  progressFillEl.style.width = `${percentage}%`;

  if (completed) {
    victoryOverlay.classList.add('active');
    startConfetti();
  } else {
    victoryOverlay.classList.remove('active');
    stopConfetti();
  }
}

// Render dynamic log items on the dashboard
function addLogItem(code, time, isPrepend = true) {
  if (logEmptyEl) {
    logEmptyEl.style.display = 'none';
  }
  
  const li = document.createElement('li');
  li.className = 'log-item';
  li.innerHTML = `
    <span class="log-code-text" title="${escapeHtml(code)}">${escapeHtml(code)}</span>
    <span class="log-time">${formatTime(time)}</span>
  `;
  
  if (isPrepend) {
    logListEl.prepend(li);
  } else {
    logListEl.appendChild(li);
  }

  // Keep log at max 25 items to conserve memory/DOM size
  while (logListEl.children.length > 25) {
    logListEl.removeChild(logListEl.lastChild);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Fetch current status from database
async function fetchInitialStatus() {
  try {
    const res = await fetch('api/status');
    const data = await res.json();
    if (data.success) {
      globalTargetCount = data.target_count || 200;
      updateScoreboard(data.count, data.remaining, data.completed, globalTargetCount);
      
      // Clean log list
      logListEl.innerHTML = '';
      if (data.scans.length === 0) {
        logListEl.appendChild(logEmptyEl);
        logEmptyEl.style.display = 'block';
      } else {
        // Show scans (api returns newest first, so append them in order)
        data.scans.slice(0, 25).forEach(scan => {
          addLogItem(scan.id, scan.scanned_at, false);
        });
      }
    }
  } catch (err) {
    console.error('Kunne ikke hente startstatus:', err);
  }
}

// Handle scan events arriving from SSE
function handleScanEvent(data) {
  updateScoreboard(data.count, data.remaining, data.completed);
  addLogItem(data.code, data.scannedAt, true);
  playSuccessChime();
}

// Handle reset events arriving from SSE
function handleResetEvent() {
  updateScoreboard(0, globalTargetCount, false, globalTargetCount);
  logListEl.innerHTML = '';
  logListEl.appendChild(logEmptyEl);
  logEmptyEl.style.display = 'block';
  playResetSweep();
}

// Handle settings update events arriving from SSE
function handleSettingsUpdate(data) {
  globalTargetCount = data.target_count;
  // Re-fetch status to get updated remaining/completed based on new target
  fetchInitialStatus();
}

// 4. Connect to Server-Sent Events (SSE)
function connectSSE() {
  const evtSource = new EventSource('api/events');
  
  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'scan') {
        handleScanEvent(data);
      } else if (data.type === 'reset') {
        handleResetEvent();
      } else if (data.type === 'settings_update') {
        handleSettingsUpdate(data);
      }
    } catch (err) {
      console.error('Fejl ved parsing af SSE event:', err);
    }
  };

  evtSource.onerror = () => {
    console.warn('SSE-forbindelse mistet. Prøver at genforbinde om 3 sekunder...');
    evtSource.close();
    setTimeout(connectSSE, 3000);
  };
}

// 5. Generate Dynamic QR Code for Mobile Controller
function generateStartQRCode() {
  const scannerUrl = window.location.origin + window.location.pathname.replace(/\/?(index\.html)?$/, '') + '/scanner.html';
  console.log('Generating Start QR pointing to:', scannerUrl);
  
  new QRious({
    element: document.getElementById('start-qr'),
    value: scannerUrl,
    size: 200,
    foreground: '#142817', // Match var(--forest-dark)
    background: '#ffffff',
    level: 'H' // High correction level so it is highly scannable on screens
  });
}

// Close Victory overlay manually
window.closeVictory = () => {
  victoryOverlay.classList.remove('active');
  stopConfetti();
};

// Bootstrap the page
window.addEventListener('DOMContentLoaded', () => {
  generateStartQRCode();
  fetchInitialStatus();
  connectSSE();
});
