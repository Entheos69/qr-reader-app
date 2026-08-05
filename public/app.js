// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('[PWA] Service Worker registrado');
      if (reg) reg.update();
    }).catch(err => {
      console.warn('[PWA] Fallo en registro de SW:', err);
    });
  });
}

// App State
let html5QrCode = null;
let camerasList = [];
let selectedCameraId = localStorage.getItem('preferred_camera_id') || null;
let scanHistory = JSON.parse(localStorage.getItem('qr_history') || '[]');
let offlineQueue = JSON.parse(localStorage.getItem('qr_offline_queue') || '[]');
let activeOperator = localStorage.getItem('qr_active_operator') || '';
let audioEnabled = true;
let isScanning = false;
let currentScannedCode = null;
let torchActive = false;

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

// Network Status & Offline Synchronization
function initNetworkStatus() {
  const badge = document.getElementById('network-badge');
  if (!badge) return;

  function updateStatus() {
    if (navigator.onLine) {
      badge.className = 'badge-online';
      badge.innerText = 'Online';
      syncOfflineQueue();
    } else {
      badge.className = 'badge-offline';
      badge.innerText = 'Offline';
    }
  }

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}

// Queue offline scans/events
function addToOfflineQueue(type, payload) {
  offlineQueue.push({ type, payload, timestamp: Date.now() });
  localStorage.setItem('qr_offline_queue', JSON.stringify(offlineQueue));
}

async function syncOfflineQueue() {
  if (offlineQueue.length === 0 || !navigator.onLine) return;

  console.log(`[Offline Sync] Procesando ${offlineQueue.length} elementos pendientes...`);
  const queueToSync = [...offlineQueue];
  offlineQueue = [];
  localStorage.setItem('qr_offline_queue', JSON.stringify(offlineQueue));

  for (const item of queueToSync) {
    try {
      const endpoint = item.type === 'event' ? '/api/events' : '/api/scans';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload)
      });
    } catch (e) {
      console.warn("Fallo al reenviar elemento offline, reencolando:", e);
      offlineQueue.push(item);
      localStorage.setItem('qr_offline_queue', JSON.stringify(offlineQueue));
    }
  }
}

// DOM Elements Initialization
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();

  const steps = [
    { name: 'fetchCensoCatalog', fn: fetchCensoCatalog },
    { name: 'initNetworkStatus', fn: initNetworkStatus },
    { name: 'initOperatorLogin', fn: initOperatorLogin },
    { name: 'initTabs', fn: initTabs },
    { name: 'initAudioToggle', fn: initAudioToggle },
    { name: 'initHistory', fn: initHistory },
    { name: 'initGenerator', fn: initGenerator },
    { name: 'initScanner', fn: initScanner },
    { name: 'initCaptures', fn: initCaptures },
    { name: 'initModal', fn: initModal },
    { name: 'initSyncWithPC', fn: initSyncWithPC },
    { name: 'initEventLogging', fn: initEventLogging },
    { name: 'initPreAnalysisEngine', fn: initPreAnalysisEngine }
  ];

  steps.forEach(step => {
    try {
      step.fn();
    } catch (err) {
      console.warn(`[PWA Init Warning] Paso ${step.name} no se completó:`, err);
    }
  });
});

function initSyncWithPC() {
  const syncBtn = document.getElementById('sync-pc-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', () => {
      syncOfflineQueue();
      alert("Sincronización con el servidor ejecutada.");
    });
  }
}

// Autenticación y Sesión de Operador
function initOperatorLogin() {
  const sessionBtn = document.getElementById('operator-session-btn');
  const nameDisplay = document.getElementById('operator-name-display');
  const loginModal = document.getElementById('login-modal');
  const closeLoginBtn = document.getElementById('close-login-btn');
  const loginForm = document.getElementById('login-form');
  const nameInput = document.getElementById('login-operator-name');
  const logoutBtn = document.getElementById('logout-operator-btn');
  const changeOpLink = document.getElementById('change-operator-link');

  function updateOperatorUI() {
    if (activeOperator) {
      nameDisplay.innerText = activeOperator.length > 12 ? activeOperator.substring(0, 10) + '..' : activeOperator;
      sessionBtn.classList.remove('btn-secondary');
      sessionBtn.classList.add('badge-online');
      sessionBtn.style.color = '#fff';
      if (logoutBtn) logoutBtn.style.display = 'block';
    } else {
      nameDisplay.innerText = 'Ingresar';
      sessionBtn.classList.remove('badge-online');
      sessionBtn.classList.add('btn-secondary');
      if (logoutBtn) logoutBtn.style.display = 'none';
    }
    const eventOperatorInput = document.getElementById('event-operator');
    if (eventOperatorInput) {
      eventOperatorInput.value = activeOperator;
    }
  }

  updateOperatorUI();

  function openLogin() {
    if (nameInput) nameInput.value = activeOperator;
    loginModal.style.display = 'flex';
  }

  if (sessionBtn) sessionBtn.addEventListener('click', openLogin);
  if (changeOpLink) changeOpLink.addEventListener('click', openLogin);

  if (closeLoginBtn) {
    closeLoginBtn.addEventListener('click', () => {
      loginModal.style.display = 'none';
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameVal = nameInput.value.trim();
      if (!nameVal) return;

      activeOperator = nameVal;
      localStorage.setItem('qr_active_operator', activeOperator);
      updateOperatorUI();
      loginModal.style.display = 'none';
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      activeOperator = '';
      localStorage.removeItem('qr_active_operator');
      updateOperatorUI();
      loginModal.style.display = 'none';
    });
  }
}

// Transmitir escaneos al Servidor Central PC (asociando operador activo)
async function sendScanToServer(scanData) {
  const payload = {
    ...scanData,
    operador: activeOperator || scanData.operador || 'Operador de Campo'
  };

  if (!navigator.onLine) {
    addToOfflineQueue('scan', payload);
    return;
  }
  try {
    await fetch('/api/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn("No se pudo transmitir el escaneo al servidor PC, guardando offline:", e);
    addToOfflineQueue('scan', payload);
  }
}

// Sincronizar todo el historial guardado en el Celular hacia la PC
function initSyncWithPC() {
  const syncBtn = document.getElementById('sync-pc-btn');
  if (!syncBtn) return;

  syncBtn.addEventListener('click', async () => {
    if (scanHistory.length === 0 && offlineQueue.length === 0) {
      alert("No hay lecturas en la cola para sincronizar.");
      return;
    }

    syncBtn.innerHTML = `<i data-lucide="loader"></i> Sincronizando...`;
    lucide.createIcons();

    try {
      await syncOfflineQueue();
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanHistory)
      });
      const data = await res.json();
      alert(`¡Sincronización Exitosa! ${data.added || 0} lecturas procesadas en el servidor.`);
    } catch (e) {
      alert("Operando en modo offline o sin respuesta del servidor.");
    } finally {
      syncBtn.innerHTML = `<i data-lucide="refresh-cw"></i> Sincronizar Cola Offline / Servidor`;
      lucide.createIcons();
    }
  });
}

// Pre-Análisis de Calidad Preventivo con Tolerancias por Objeto
function initPreAnalysisEngine() {
  const tempInput = document.getElementById('event-temp');
  const hardnessInput = document.getElementById('event-hardness');
  const banner = document.getElementById('pre-analysis-banner');
  const msgSpan = document.getElementById('pre-analysis-msg');

  if (!tempInput || !hardnessInput || !banner) return;

  function evaluateQuality() {
    const warnings = [];
    let tempMin = 10, tempMax = 50;
    let durezaMin = 0, durezaMax = 100;

    if (currentScannedCode) {
      const codeUpper = String(currentScannedCode).toUpperCase();
      const objInfo = censoCatalog[codeUpper];
      if (objInfo && objInfo.tolerancias) {
        if (typeof objInfo.tolerancias.tempMin === 'number') tempMin = objInfo.tolerancias.tempMin;
        if (typeof objInfo.tolerancias.tempMax === 'number') tempMax = objInfo.tolerancias.tempMax;
        if (typeof objInfo.tolerancias.durezaMin === 'number') durezaMin = objInfo.tolerancias.durezaMin;
        if (typeof objInfo.tolerancias.durezaMax === 'number') durezaMax = objInfo.tolerancias.durezaMax;
      }
    }

    const tVal = parseFloat(tempInput.value.replace(/[^0-9.-]/g, ''));
    if (!isNaN(tVal) && (tVal < tempMin || tVal > tempMax)) {
      warnings.push(`Temperatura fuera de norma (${tVal}°C vs ${tempMin}-${tempMax}°C)`);
    }

    const hVal = parseFloat(hardnessInput.value.replace(/[^0-9.-]/g, ''));
    if (!isNaN(hVal) && (hVal < durezaMin || hVal > durezaMax)) {
      warnings.push(`Dureza fuera de norma (${hVal} vs ${durezaMin}-${durezaMax} Shore)`);
    }

    if (warnings.length > 0) {
      banner.style.display = 'block';
      msgSpan.innerText = ' ⚠️ Pre-Análisis: ' + warnings.join(' | ');
    } else {
      banner.style.display = 'none';
    }
  }

  tempInput.addEventListener('input', evaluateQuality);
  hardnessInput.addEventListener('input', evaluateQuality);
}

// Registro de Eventos y Mediciones de Ensayos desde el Celular
function initEventLogging() {
  const addEventBtn = document.getElementById('add-event-btn');
  const eventForm = document.getElementById('event-form');
  const cancelEventBtn = document.getElementById('cancel-event-btn');
  const eventOperatorInput = document.getElementById('event-operator');
  const photoInput = document.getElementById('event-photo');
  const photoPreview = document.getElementById('event-photo-preview');
  const photoContainer = document.getElementById('event-photo-preview-container');

  if (photoInput) {
    photoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 600;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          currentBase64Photo = canvas.toDataURL('image/jpeg', 0.65);

          if (photoPreview && photoContainer) {
            photoPreview.src = currentBase64Photo;
            photoContainer.style.display = 'block';
          }
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  if (addEventBtn) {
    addEventBtn.addEventListener('click', () => {
      if (!activeOperator) {
        document.getElementById('login-modal').style.display = 'flex';
        return;
      }
      document.getElementById('event-modal').style.display = 'flex';
      document.getElementById('event-code-display').innerText = currentScannedCode || 'Muestra';
      if (eventOperatorInput) eventOperatorInput.value = activeOperator;
    });
  }

  if (cancelEventBtn) {
    cancelEventBtn.addEventListener('click', () => {
      document.getElementById('event-modal').style.display = 'none';
      currentBase64Photo = '';
      if (photoContainer) photoContainer.style.display = 'none';
    });
  }

  if (eventForm) {
    eventForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const opVal = (eventOperatorInput && eventOperatorInput.value.trim()) ? eventOperatorInput.value.trim() : activeOperator || 'Operador de Campo';
      activeOperator = opVal;
      localStorage.setItem('qr_active_operator', activeOperator);

      const payload = {
        codigo: currentScannedCode,
        tipoEvento: document.getElementById('event-type').value,
        temperatura: document.getElementById('event-temp').value,
        dureza: document.getElementById('event-hardness').value,
        observaciones: document.getElementById('event-obs').value,
        operador: opVal,
        foto: currentBase64Photo
      };

      if (!navigator.onLine) {
        addToOfflineQueue('event', payload);
        alert(`¡Evento guardado offline por ${opVal}! Se sincronizará automáticamente al recuperar red.`);
        document.getElementById('event-modal').style.display = 'none';
        eventForm.reset();
        currentBase64Photo = '';
        if (photoContainer) photoContainer.style.display = 'none';
        return;
      }

      try {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          const advText = data.preAnalisis?.advertencias ? `\n\n⚠️ Aviso Pre-Análisis: ${data.preAnalisis.advertencias}` : '';
          alert(`¡Evento de Ensayo registrado por ${opVal} para ${currentScannedCode}!${advText}`);
          document.getElementById('event-modal').style.display = 'none';
          eventForm.reset();
          currentBase64Photo = '';
          if (photoContainer) photoContainer.style.display = 'none';
        }
      } catch (err) {
        addToOfflineQueue('event', payload);
        alert("Sin respuesta del servidor. Registro almacenado en cola offline.");
        document.getElementById('event-modal').style.display = 'none';
        eventForm.reset();
        currentBase64Photo = '';
        if (photoContainer) photoContainer.style.display = 'none';
      }
    });
  }
}

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
  const cameraSelect = document.getElementById('camera-select');
  if (cameraSelect) {
    cameraSelect.innerHTML = '<option value="">Cámara Principal (Auto)</option>';
  }

  try {
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("reader");
    }
  } catch (e) {
    console.warn("Error al inicializar Html5Qrcode:", e);
  }

  try {
    const timeoutGetCameras = new Promise((_, reject) => setTimeout(() => reject(new Error("getCameras timeout")), 3000));
    camerasList = await Promise.race([Html5Qrcode.getCameras(), timeoutGetCameras]);
    
    if (camerasList && camerasList.length > 0 && cameraSelect) {
      cameraSelect.innerHTML = '';
      
      const savedId = localStorage.getItem('preferred_camera_id');
      let defaultIndex = camerasList.findIndex(c => c.id === savedId);

      if (defaultIndex === -1) {
        defaultIndex = camerasList.findIndex(c => 
          c.label && (
            c.label.toLowerCase().includes('ultra') ||
            c.label.toLowerCase().includes('wide') ||
            c.label.toLowerCase().includes('back') || 
            c.label.toLowerCase().includes('trasera') || 
            c.label.toLowerCase().includes('environment')
          )
        );
      }
      if (defaultIndex === -1) defaultIndex = 0;

      camerasList.forEach((cam, idx) => {
        const option = document.createElement('option');
        option.value = cam.id;
        option.innerText = cam.label || `Cámara ${idx + 1}`;
        if (idx === defaultIndex) option.selected = true;
        cameraSelect.appendChild(option);
      });

      selectedCameraId = camerasList[defaultIndex].id;

      cameraSelect.onchange = async (e) => {
        selectedCameraId = e.target.value;
        localStorage.setItem('preferred_camera_id', selectedCameraId);
        await stopScanner();
        startScanner();
      };
    }
  } catch (err) {
    console.warn("Enumeración diferida de cámaras:", err);
    if (cameraSelect) {
      cameraSelect.innerHTML = '<option value="">Cámara Trasera (Auto)</option>';
    }
  }

  initTorch();
  startScanner();

  const restartBtn = document.getElementById('restart-scan-btn');
  if (restartBtn) {
    restartBtn.onclick = () => {
      restartBtn.style.display = 'none';
      startScanner();
    };
  }
}

function initTorch() {
  const torchBtn = document.getElementById('toggle-torch-btn');
  if (!torchBtn) return;

  torchBtn.style.display = 'inline-flex';
  torchBtn.onclick = async () => {
    try {
      if (html5QrCode && isScanning) {
        const videoElement = document.querySelector('#reader video');
        if (videoElement && videoElement.srcObject) {
          const track = videoElement.srcObject.getVideoTracks()[0];
          if (track) {
            const capabilities = track.getCapabilities ? track.getCapabilities() : {};
            if (capabilities.torch || 'torch' in track.getConstraints()) {
              torchActive = !torchActive;
              await track.applyConstraints({ advanced: [{ torch: torchActive }] });
              const labelEl = document.getElementById('torch-label');
              if (torchActive) {
                torchBtn.classList.add('btn-torch-active');
                if (labelEl) labelEl.innerText = 'Linterna ON';
              } else {
                torchBtn.classList.remove('btn-torch-active');
                if (labelEl) labelEl.innerText = 'Linterna OFF';
              }
              return;
            }
          }
        }
      }
      alert("La linterna no está disponible en esta cámara o navegador.");
    } catch (e) {
      console.warn("Error al activar linterna:", e);
      alert("No se pudo alternar la linterna.");
    }
  };
}

async function startScanner() {
  if (isScanning || !html5QrCode) return;

  const overlay = document.getElementById('scanner-overlay');
  const statusText = document.getElementById('status-text');

  if (overlay) overlay.style.display = 'flex';
  if (statusText) statusText.innerText = "Iniciando cámara...";

  const config = {
    fps: 15,
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

  // Cadena de restricciones adaptativa (Celulares -> Webcam Laptop -> Genérica)
  const constraintsToTry = [];
  if (selectedCameraId) {
    constraintsToTry.push({ deviceId: { exact: selectedCameraId } });
  }
  constraintsToTry.push({ facingMode: "environment" });
  constraintsToTry.push({ facingMode: "user" });
  constraintsToTry.push({});

  let started = false;
  for (const constraint of constraintsToTry) {
    try {
      await html5QrCode.start(
        constraint,
        config,
        onScanSuccess,
        onScanError
      );
      isScanning = true;
      started = true;
      if (statusText) statusText.innerText = "Listo para escanear";
      break;
    } catch (err) {
      console.warn("Intento de cámara no exitoso con restricción:", constraint, err.message || err);
      try {
        if (html5QrCode.isScanning) {
          await html5QrCode.stop();
        }
      } catch (e) {}
    }
  }

  if (!started) {
    if (statusText) statusText.innerText = "Cámara inactiva (Subir imagen o archivo)";
    if (overlay) overlay.style.display = 'none';
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

  currentScannedCode = decodedText.trim();
  const match = currentScannedCode.match(/\/r\/([A-Za-z0-9]+)/i) || currentScannedCode.match(/([A-Z0-9]{2,6})$/i);
  if (match && match[1]) {
    currentScannedCode = match[1].toUpperCase();
  }

  document.getElementById('restart-scan-btn').style.display = 'inline-flex';
  document.getElementById('status-text').innerText = "Código detectado";

  const scanEntry = {
    id: Date.now(),
    text: decodedText,
    operador: activeOperator || 'Operador de Campo',
    date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  saveToHistory(decodedText);
  sendScanToServer(scanEntry);
  showResultModal(decodedText);
}

function onScanError(errorMessage) {
  // Errores normales por cuadro
}

// Captura Nativa & Galería
function initCaptures() {
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
