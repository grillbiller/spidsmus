// Admin Controller for Spidsmus QR Jagt

document.addEventListener('DOMContentLoaded', () => {
  const targetCountInput = document.getElementById('target-count');
  const printCountInput = document.getElementById('print-count');
  const saveBtn = document.getElementById('save-settings');
  const resetBtn = document.getElementById('reset-game');
  const preparePrintBtn = document.getElementById('prepare-print');
  const printSection = document.getElementById('print-section');

  // Load current settings
  async function loadSettings() {
    try {
      const res = await fetch('api/settings');
      const data = await res.json();
      if (data.success) {
        targetCountInput.value = data.target_count;
        printCountInput.value = data.target_count; // Default print count to target count
      }
    } catch (err) {
      console.error('Fejl ved indlæsning af indstillinger:', err);
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
        body: JSON.stringify({ target_count: targetCount })
      });
      const data = await res.json();
      if (data.success) {
        alert('Indstillinger gemt!');
      }
    } catch (err) {
      alert('Fejl ved gemning: ' + err.message);
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
      }
    } catch (err) {
      alert('Fejl ved nulstilling: ' + err.message);
    }
  });

  // Prepare Printable QR Codes
  preparePrintBtn.addEventListener('click', () => {
    const count = parseInt(printCountInput.value, 10);
    if (isNaN(count) || count < 1) {
      alert('Ugyldigt antal koder til print.');
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
          value: id,
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
