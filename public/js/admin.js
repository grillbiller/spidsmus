// Admin Controller for Spidsmus QR Jagt

document.addEventListener('DOMContentLoaded', () => {
  const sessionTitleInput = document.getElementById('session-title');
  const targetCountInput = document.getElementById('target-count');
  const printCountInput = document.getElementById('print-count');
  const saveBtn = document.getElementById('save-settings');
  const startSessionBtn = document.getElementById('start-session');
  const sessionStatus = document.getElementById('session-status');
  const sessionPicker = document.getElementById('session-picker');
  const activateSessionBtn = document.getElementById('activate-session');
  const resetBtn = document.getElementById('reset-game');
  const preparePrintBtn = document.getElementById('prepare-print');
  const printSection = document.getElementById('print-section');
  const newPasswordInput = document.getElementById('new-password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const changePasswordBtn = document.getElementById('change-password');
  const passwordStatus = document.getElementById('password-status');
  let activeSessionId = '';

  // Load current settings
  async function loadSettings() {
    try {
      const res = await fetch('api/settings');
      const data = await res.json();
      if (data.success) {
        activeSessionId = data.session_id;
        sessionTitleInput.value = data.session_title;
        targetCountInput.value = data.target_count;
        printCountInput.value = data.target_count; // Default print count to target count
      }
    } catch (err) {
      console.error('Fejl ved indlæsning af indstillinger:', err);
    }
  }
  async function loadSessions() {
    try {
      const res = await fetch('api/session');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kunne ikke hente sessioner.');

      sessionPicker.replaceChildren();
      for (const session of data.sessions) {
        const option = document.createElement('option');
        const createdAt = new Date(session.created_at).toLocaleString('da-DK', {
          dateStyle: 'short',
          timeStyle: 'short'
        });
        option.value = session.id;
        option.textContent = `${session.title} - ${createdAt}${session.id === data.active_session_id ? ' (aktiv)' : ''}`;
        sessionPicker.appendChild(option);
      }
      sessionPicker.value = data.active_session_id;
    } catch (err) {
      sessionStatus.textContent = err.message;
    }
  }


  // Save settings
  saveBtn.addEventListener('click', async () => {
    const targetCount = parseInt(targetCountInput.value, 10);
    if (isNaN(targetCount) || targetCount < 1) {
      alert('Ugyldigt antal koder.');
      return;
    }

    try {
      const res = await fetch('api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: sessionTitleInput.value, target_count: targetCount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kunne ikke gemme indstillinger.');
      sessionStatus.textContent = 'Sessionens indstillinger er gemt.';
      await loadSessions();
    } catch (err) {
      alert('Fejl ved gemning: ' + err.message);
    }
  });

  startSessionBtn.addEventListener('click', async () => {
    const title = sessionTitleInput.value.trim();
    const targetCount = parseInt(targetCountInput.value, 10);
    if (!title || title.length > 80 || isNaN(targetCount) || targetCount < 1 || targetCount > 1000) {
      sessionStatus.textContent = 'Angiv en titel og mellem 1 og 1000 QR-koder.';
      return;
    }
    if (!confirm('En ny session nulstiller fremdriften og gør gamle QR-koder ugyldige. Tidligere sessioner gemmes. Fortsæt?')) {
      return;
    }

    startSessionBtn.disabled = true;
    sessionStatus.textContent = '';
    try {
      const res = await fetch('api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, target_count: targetCount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kunne ikke starte sessionen.');

      activeSessionId = data.session_id;
      sessionStatus.textContent = `Sessionen "${data.session_title}" er startet. Print nye QR-koder.`;
      await loadSessions();
    } catch (err) {
      sessionStatus.textContent = err.message;
    } finally {
      startSessionBtn.disabled = false;
    }
  });

  activateSessionBtn.addEventListener('click', async () => {
    const sessionId = sessionPicker.value;
    if (!sessionId || sessionId === activeSessionId) return;

    const selectedTitle = sessionPicker.selectedOptions[0]?.textContent || 'valgt session';
    if (!confirm(`Skift til ${selectedTitle}? Dens fremdrift og QR-koder genoptages.`)) return;

    activateSessionBtn.disabled = true;
    sessionStatus.textContent = '';
    try {
      const res = await fetch('api/session/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kunne ikke åbne sessionen.');

      activeSessionId = data.session_id;
      sessionTitleInput.value = data.session_title;
      targetCountInput.value = data.target_count;
      printCountInput.value = data.target_count;
      sessionStatus.textContent = `Sessionen "${data.session_title}" er genoptaget.`;
      await loadSessions();
    } catch (err) {
      sessionStatus.textContent = err.message;
    } finally {
      activateSessionBtn.disabled = false;
    }
  });

  // Reset game
  resetBtn.addEventListener('click', async () => {
    const confirmText = 'NULSTIL';
    const pin = prompt(`ADVARSEL: Dette sletter ALLE fundne spor!\n\nSkriv "${confirmText}" for at bekræfte.`);
    if (pin !== confirmText) {
      if (pin !== null) alert('Nulstilling afbrudt.');
      return;
    }

    try {
      const res = await fetch('api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true })
      });
      const data = await res.json();
      if (data.success) {
        alert('Spillet er nu nulstillet! Alle data er slettet.');
        await loadSessions();
      }
    } catch (err) {
      alert('Fejl ved nulstilling: ' + err.message);
    }
  });

  changePasswordBtn.addEventListener('click', async () => {
    const password = newPasswordInput.value;
    if (password.length < 12) {
      passwordStatus.textContent = 'Adgangskoden skal være mindst 12 tegn.';
      return;
    }
    if (password !== confirmPasswordInput.value) {
      passwordStatus.textContent = 'Adgangskoderne er ikke ens.';
      return;
    }

    changePasswordBtn.disabled = true;
    passwordStatus.textContent = '';
    try {
      const res = await fetch('api/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirmation: confirmPasswordInput.value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kunne ikke ændre adgangskoden.');

      newPasswordInput.value = '';
      confirmPasswordInput.value = '';
      passwordStatus.textContent = 'Adgangskoden er ændret. Brug den nye adgangskode, når du bliver bedt om at logge ind igen.';
    } catch (err) {
      passwordStatus.textContent = err.message;
    } finally {
      changePasswordBtn.disabled = false;
    }
  });

  // Prepare Printable QR Codes
  preparePrintBtn.addEventListener('click', () => {
    const count = parseInt(printCountInput.value, 10);
    const targetCount = parseInt(targetCountInput.value, 10);
    if (isNaN(count) || count < 1 || count > targetCount) {
      alert('Antallet printede koder skal være mellem 1 og sessionens QR-antal.');
      return;
    }
    if (!activeSessionId) {
      sessionStatus.textContent = 'Kunne ikke hente den aktive session. Genindlæs siden.';
      return;
    }


    // Clear previous
    printSection.innerHTML = '';
    
    const codesPerPage = 50;
    const totalPages = Math.ceil(count / codesPerPage);

    for (let p = 0; p < totalPages; p++) {
      const pageDiv = document.createElement('div');
      pageDiv.className = 'qr-page';
      
      const startIdx = p * codesPerPage + 1;
      const endIdx = Math.min((p + 1) * codesPerPage, count);

      for (let i = startIdx; i <= endIdx; i++) {
        const id = `SPIDSMUS_${i.toString().padStart(3, '0')}`;
        
        const itemDiv = document.createElement('div');
        itemDiv.className = 'qr-item';
        
        const canvas = document.createElement('canvas');
        itemDiv.appendChild(canvas);
        
        const label = document.createElement('div');
        label.className = 'qr-label';
        label.textContent = id;
        itemDiv.appendChild(label);
        
        pageDiv.appendChild(itemDiv);

        // Generate QR
        new QRious({
          element: canvas,
          value: `SPIDSMUS:${activeSessionId}:${i}`,
          size: 150,
          level: 'M'
        });
      }
      
      printSection.appendChild(pageDiv);
    }

    // Trigger print dialog
    window.print();
  });

  loadSettings();
});
  loadSessions();
