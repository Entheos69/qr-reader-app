// App State
let html5QrCode = null;
let camerasList = [];
let selectedCameraId = null;
let scanHistory = JSON.parse(localStorage.getItem('qr_history') || '[]');
let audioEnabled = true;
let isScanning = false;

// Web Audio API Beep Generator
function playBeepSound() {
  if (!audioEnabled) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 880 Hz
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) {
    console.warn("Audio Context Error:", e);
  }
}

// Haptic Vibration Feedback
function triggerVibration() {
  if ("vibrate" in navigator) {
    navigator.vibrate(120);
  }
}

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  
  initTabs();
  initAudioToggle();
  initHistory();
  initGenerator();
  initScanner();
  initCaptures();
  initModal();
});

// Navigation Tabs
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`tab-${targetTab}`).classList.add('active');

      if (targetTab === 'scanner') {
        startScanner();
      } else {
        stopScanner();
      }
    });
  });
}

// Audio Toggle
function initAudioToggle() {
  const toggleBtn = document.getElementById('toggle-audio-btn');
  const icon = document.getElementById('audio-icon');

  toggleBtn.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    if (audioEnabled) {
      icon.setAttribute('data-lucide', 'volume-2');
      toggleBtn.style.color = 'var(--text-main)';
    } else {
      icon.setAttribute('data-lucide', 'volume-x');
      toggleBtn.style.color = 'var(--text-muted)';
    }
    lucide.createIcons();
  });
}

// QR Scanner & Multi-Camera Enumeration
async function initScanner() {
  html5QrCode = new Html5Qrcode("reader");

  const cameraSelect = document.getElementById('camera-select');

  try {
    camerasList = await Html5Qrcode.getCameras();
    
    if (camerasList && camerasList.length > 0) {
      cameraSelect.innerHTML = '';
      
      // Buscar la mejor cámara trasera por defecto
      let defaultIndex = camerasList.findIndex(c => 
        c.label.toLowerCase().includes('back') || 
        c.label.toLowerCase().includes('trasera') || 
        c.label.toLowerCase().includes('environment') ||
        c.label.toLowerCase().includes('0')
      );
      if (defaultIndex === -1) defaultIndex = 0;

      camerasList.forEach((cam, idx) => {
        const option = document.createElement('option');
        option.value = cam.id;
        option.innerText = cam.label || `Lente Cámara ${idx + 1}`;
        if (idx === defaultIndex) option.selected = true;
        cameraSelect.appendChild(option);
      });

      selectedCameraId = camerasList[defaultIndex].id;

      cameraSelect.addEventListener('change', async (e) => {
        selectedCameraId = e.target.value;
        await stopScanner();
        startScanner();
      });
    } else {
      cameraSelect.innerHTML = '<option value="">Cámara por defecto</option>';
    }
  } catch (err) {
    console.warn("No se pudieron listar las cámaras individualmente:", err);
    cameraSelect.innerHTML = '<option value="">Cámara del sistema</option>';
  }

  // Iniciar escáner
  startScanner();

  document.getElementById('restart-scan-btn').addEventListener('click', () => {
    document.getElementById('restart-scan-btn').style.display = 'none';
    startScanner();
  });
}

async function startScanner() {
  if (isScanning || !html5QrCode) return;

  const overlay = document.getElementById('scanner-overlay');
  const statusText = document.getElementById('status-text');

  overlay.style.display = 'flex';
  statusText.innerText = "Escaneando...";

  const config = {
    fps: 20,
    qrbox: function(w, h) {
      const minEdge = Math.min(w, h);
      const size = Math.floor(minEdge * 0.75);
      return { width: size, height: size };
    },
    aspectRatio: 1.0,
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: true
    }
  };

  const cameraConstraint = selectedCameraId ? { deviceId: { exact: selectedCameraId } } : { facingMode: "environment" };

  try {
    await html5QrCode.start(
      cameraConstraint,
      config,
      onScanSuccess,
      onScanError
    );
    isScanning = true;
  } catch (err) {
    console.warn("No se pudo iniciar con la cámara seleccionada, usando fallback:", err);
    try {
      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanError
      );
      isScanning = true;
    } catch (e) {
      alert("Por favor concede permisos de cámara en tu navegador.");
    }
  }
}

async function stopScanner() {
  if (isScanning && html5QrCode) {
    try {
      await html5QrCode.stop();
      isScanning = false;
      document.getElementById('scanner-overlay').style.display = 'none';
    } catch (err) {
      console.warn("Error al detener el escáner:", err);
    }
  }
}

function onScanSuccess(decodedText) {
  playBeepSound();
  triggerVibration();
  stopScanner();

  document.getElementById('restart-scan-btn').style.display = 'inline-flex';
  document.getElementById('status-text').innerText = "Código detectado";

  saveToHistory(decodedText);
  showResultModal(decodedText);
}

function onScanError(errorMessage) {
  // Errores normales por cuadro en escaneo
}

// Captura Nativa & Galería
function initCaptures() {
  // Captura Nativa HD para Campo
  const nativeInput = document.getElementById('qr-native-capture');
  if (nativeInput) {
    nativeInput.addEventListener('change', async (e) => {
      if (e.target.files.length === 0) return;
      const file = e.target.files[0];
      try {
        const result = await html5QrCode.scanFile(file, true);
        onScanSuccess(result);
      } catch (err) {
        alert("No se pudo leer el código QR en la foto. Intenta tomar la foto con más luz.");
      }
    });
  }

  // Galería
  const fileInput = document.getElementById('qr-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      if (e.target.files.length === 0) return;
      const file = e.target.files[0];
      try {
        const result = await html5QrCode.scanFile(file, true);
        onScanSuccess(result);
      } catch (err) {
        alert("No se detectó ningún código QR en la imagen seleccionada.");
      }
    });
  }
}

// Modal handling
function initModal() {
  const modal = document.getElementById('result-modal');
  const closeBtn = document.getElementById('close-modal-btn');
  const copyBtn = document.getElementById('copy-result-btn');

  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  copyBtn.addEventListener('click', () => {
    const text = document.getElementById('scanned-result-text').innerText;
    navigator.clipboard.writeText(text);
    copyBtn.innerHTML = `<i data-lucide="check"></i> ¡Copiado!`;
    lucide.createIcons();
    setTimeout(() => {
      copyBtn.innerHTML = `<i data-lucide="copy"></i> Copiar`;
      lucide.createIcons();
    }, 2000);
  });
}

function showResultModal(text) {
  const modal = document.getElementById('result-modal');
  const resultText = document.getElementById('scanned-result-text');
  const timeText = document.getElementById('scanned-time');
  const badge = document.getElementById('result-type-badge');
  const openLinkBtn = document.getElementById('open-result-btn');

  resultText.innerText = text;
  timeText.innerText = new Date().toLocaleString();

  const isUrl = /^https?:\/\//i.test(text);

  if (isUrl) {
    badge.innerText = "Enlace Web";
    badge.style.background = "rgba(16, 185, 129, 0.2)";
    badge.style.color = "var(--accent-success)";
    openLinkBtn.style.display = "inline-flex";
    openLinkBtn.href = text;
  } else {
    badge.innerText = "Texto Plano";
    badge.style.background = "rgba(99, 102, 241, 0.2)";
    badge.style.color = "var(--accent-primary)";
    openLinkBtn.style.display = "none";
  }

  modal.style.display = 'flex';
}

// History Management
function initHistory() {
  updateHistoryUI();
  document.getElementById('clear-history-btn').addEventListener('click', () => {
    if (confirm("¿Estás seguro de borrar el historial?")) {
      scanHistory = [];
      localStorage.removeItem('qr_history');
      updateHistoryUI();
    }
  });
}

function saveToHistory(text) {
  const item = {
    id: Date.now(),
    text: text,
    date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  scanHistory.unshift(item);
  if (scanHistory.length > 50) scanHistory.pop();

  localStorage.setItem('qr_history', JSON.stringify(scanHistory));
  updateHistoryUI();
}

function updateHistoryUI() {
  const list = document.getElementById('history-list');
  const countBadge = document.getElementById('history-count');
  countBadge.innerText = scanHistory.length;

  if (scanHistory.length === 0) {
    list.innerHTML = `<div class="empty-state">No hay escaneos guardados aún.</div>`;
    return;
  }

  list.innerHTML = scanHistory.map(item => `
    <div class="history-item">
      <div class="history-info">
        <span class="history-text">${escapeHtml(item.text)}</span>
        <span class="history-date">${item.date}</span>
      </div>
      <button class="icon-btn" onclick="copyHistoryText('${escapeHtml(item.text)}')">
        <i data-lucide="copy"></i>
      </button>
    </div>
  `).join('');

  lucide.createIcons();
}

window.copyHistoryText = function(text) {
  navigator.clipboard.writeText(text);
  alert("Texto copiado al portapapeles");
};

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

// QR Generator
function initGenerator() {
  const input = document.getElementById('qr-input');
  const generateBtn = document.getElementById('generate-qr-btn');
  const resultBox = document.getElementById('qr-result-box');
  const display = document.getElementById('qrcode-display');
  const downloadBtn = document.getElementById('download-qr-btn');

  generateBtn.addEventListener('click', () => {
    const val = input.value.trim();
    if (!val) {
      alert("Por favor ingresa un texto o enlace.");
      return;
    }

    display.innerHTML = '';
    new QRCode(display, {
      text: val,
      width: 180,
      height: 180,
      colorDark: "#090d16",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });

    resultBox.style.display = 'flex';
  });

  downloadBtn.addEventListener('click', () => {
    const img = display.querySelector('img') || display.querySelector('canvas');
    if (img) {
      const a = document.createElement('a');
      a.href = img.src || img.toDataURL("image/png");
      a.download = "codigo-qr.png";
      a.click();
    }
  });
}
