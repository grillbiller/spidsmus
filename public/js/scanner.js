// Spidsmus Mobile Scanner Controller

let html5QrCode = null;
let isScanning = false;
let isProcessing = false; // Lock to prevent rapid multi-scans while modal is open

const scanBtn = document.getElementById('scan-btn');
const placeholderEl = document.getElementById('placeholder');
const visualOverlays = document.getElementById('scanner-visuals');
const modalOverlay = document.getElementById('modal-overlay');
const modalEl = document.getElementById('modal');
const modalIconEl = document.getElementById('modal-icon');
const modalTitleEl = document.getElementById('modal-title');
const modalMessageEl = document.getElementById('modal-message');

// 1. Programmatic Audio Synth (Web Audio API)
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Success chime: high-pitched double beep (pleasant "coin collect" style)
function playSuccessBeep() {
  try {
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const t = audioCtx.currentTime;
    
    // First Beep: F#5 (739.99 Hz)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(739.99, t);
    gain1.gain.setValueAtTime(0, t);
    gain1.gain.linearRampToValueAtTime(0.08, t + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(t);
    osc1.stop(t + 0.12);

    // Second Beep: B5 (987.77 Hz) played 90ms later
    setTimeout(() => {
      const t2 = audioCtx.currentTime;
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, t2);
      gain2.gain.setValueAtTime(0, t2);
      gain2.gain.linearRampToValueAtTime(0.1, t2 + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.18);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(t2);
      osc2.stop(t2 + 0.18);
    }, 90);

  } catch (err) {
    console.warn('Audio blocked or unsupported:', err);
  }
}

// Warning buzzer: lower-pitched saw-tooth sliding down (indicates duplicate scan)
function playWarningBuzz() {
  try {
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(329.63, t); // E4
    osc.frequency.linearRampToValueAtTime(220.00, t + 0.28); // Sweep down to A3
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(t);
    osc.stop(t + 0.28);
  } catch (err) {
    console.warn(err);
  }
}

// 2. Initialize Camera and Html5Qrcode
window.addEventListener('DOMContentLoaded', () => {
  html5QrCode = new Html5Qrcode("reader");
  
  scanBtn.addEventListener('click', toggleScanner);
  
  // Quick Audio trigger on body tap
  document.body.addEventListener('touchstart', initAudio, { once: true });
  document.body.addEventListener('click', initAudio, { once: true });
});

async function toggleScanner() {
  initAudio();
  if (isScanning) {
    await stopScanning();
  } else {
    await startScanning();
  }
}

async function startScanning() {
  scanBtn.disabled = true;
  scanBtn.innerHTML = 'Starter kamera...';

  try {
    const config = {
      fps: 12, // Optimal for mobile CPU/battery usage
      qrbox: (width, height) => {
        // Dynamic scan box size based on screen size
        const size = Math.min(width, height) * 0.7;
        return { width: size, height: size };
      },
      aspectRatio: 1.0
    };

    // Use environment camera (back camera) by default
    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      onScanSuccess,
      onScanFailure
    );

    // Active state
    isScanning = true;
    scanBtn.disabled = false;
    scanBtn.innerHTML = 'Stop Scanner 🛑';
    scanBtn.className = 'btn btn-secondary';
    
    // UI elements update
    placeholderEl.style.display = 'none';
    visualOverlays.style.display = 'block';

  } catch (err) {
    console.error('Kunne ikke starte kamera:', err);
    alert('Kamerafejl: Giv tilladelse til kameraet i din browser-indstillinger.');
    scanBtn.disabled = false;
    scanBtn.innerHTML = 'Aktiver Scanner 📷';
    scanBtn.className = 'btn btn-primary';
  }
}

async function stopScanning() {
  if (!html5QrCode) return;
  scanBtn.disabled = true;
  scanBtn.innerHTML = 'Stopper...';

  try {
    await html5QrCode.stop();
    isScanning = false;
    scanBtn.disabled = false;
    scanBtn.innerHTML = 'Aktiver Scanner 📷';
    scanBtn.className = 'btn btn-primary';
    
    // UI elements update
    placeholderEl.style.display = 'flex';
    visualOverlays.style.display = 'none';
  } catch (err) {
    console.error('Fejl ved standsning af kamera:', err);
    isScanning = false;
    scanBtn.disabled = false;
  }
}

// 3. Scan Callback Handler
function onScanSuccess(decodedText, decodedResult) {
  // If we are currently showing a scan modal, block processing of new frames
  if (isProcessing) return;
  isProcessing = true;

  console.log('QR Code detected:', decodedText);
  sendScanData(decodedText);
}

function onScanFailure(error) {
  // Silent, standard scanning logs which can be ignored
}

// 4. Send scanned QR to Backend
async function sendScanData(codeValue) {
  try {
    const response = await fetch('api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codeValue })
    });

    const data = await response.json();
    displayScanResult(data);
  } catch (err) {
    console.error('Netværksfejl under scanning indsendelse:', err);
    displayScanResult({
      status: 'error',
      message: 'Kunne ikke oprette forbindelse til serveren. Tjek din internetforbindelse.'
    });
  }
}

// 5. Modal Feedback Dialog Trigger
function displayScanResult(result) {
  // Reset modal styling classes
  modalEl.className = 'modal';

  if (result.status === 'success') {
    // 1. Success: A brand new QR code is registered
    playSuccessBeep();
    modalEl.classList.add('modal-success');
    modalIconEl.textContent = '🌿';
    modalTitleEl.textContent = 'Spor Fundet!';
    modalMessageEl.innerHTML = `<strong>"${escapeHtml(result.code)}"</strong><br><br>${result.message}<br><br><span style="color: var(--amber-gold); font-weight: bold; font-size: 1.2rem;">Tilbage: ${result.remaining}</span>`;
  } 
  else if (result.status === 'already_scanned') {
    // 2. Duplicate: Already found
    playWarningBuzz();
    modalEl.classList.add('modal-warning');
    modalIconEl.textContent = '⚠️';
    modalTitleEl.textContent = 'Allerede Fundet!';
    modalMessageEl.innerHTML = `<strong>"${escapeHtml(result.code)}"</strong><br><br>${result.message}`;
  } 
  else if (result.status === 'game_completed') {
    // 3. Game is fully won (200 codes reached)
    playSuccessBeep();
    modalEl.classList.add('modal-success');
    // Add extra glowing animation or fancy look
    modalIconEl.textContent = '🎉👑';
    modalTitleEl.textContent = 'GÅRDEN ER REDDET!';
    modalMessageEl.innerHTML = `<strong>"${escapeHtml(result.code)}"</strong><br><br>${result.message}`;
  } 
  else {
    // 4. General error
    playWarningBuzz();
    modalEl.classList.add('modal-warning');
    modalIconEl.textContent = '❌';
    modalTitleEl.textContent = 'Fejl!';
    modalMessageEl.innerHTML = result.message || 'Der opstod en fejl under registrering.';
  }

  // Open overlay
  modalOverlay.classList.add('active');
}

// Close feedback modal and unlock scanner
window.closeModal = () => {
  modalOverlay.classList.remove('active');
  // Add a slight delay before allowing the camera to decode again to avoid immediate repeat scans
  setTimeout(() => {
    isProcessing = false;
  }, 400);
};

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
