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
let censoCatalog = {};
let currentBase64Photo = '';

// Safe DOM Helpers
function getEl(id) {
  return document.getElementById(id);
}

function setDisplay(id, displayVal) {
  const el = getEl(id);
  if (el) el.style.display = displayVal;
}

function setInnerText(id, textVal) {
  const el = getEl(id);
  if (el) el.innerText = textVal;
}

function getVal(id) {
  const el = getEl(id);
  return el ? el.value : '';
}

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
  const badge = getEl('network-badge');
  if (!badge) return;

  function updateStatus() {
    if (navigator.onLine) {
      badge.className = 'badge-online';
      badge.innerText = 'Online';
      syncOfflineQueue();
    } else {
      badge.className = 'badge-offline';
      badge.innerText = offlineQueue.length > 0 ? `Offline (${offlineQueue.length} pend)` : 'Offline';
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
  const badge = getEl('network-badge');
  if (badge && !navigator.onLine) {
    badge.innerText = `Offline (${offlineQueue.length} pend)`;
  }
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

  const badge = getEl('network-badge');
  if (badge && navigator.onLine) {
    badge.innerText = 'Online';
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
  const syncBtn = getEl('sync-pc-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', () => {
      syncOfflineQueue();
      alert("Sincronización con el servidor ejecutada.");
    });
  }
}

// Autenticación y Sesión de Operador
function initOperatorLogin() {
  const sessionBtn = getEl('operator-session-btn');
  const nameDisplay = getEl('operator-name-display');
  const closeLoginBtn = getEl('close-login-btn');
  const loginForm = getEl('login-form');
  const nameInput = getEl('login-operator-name');
  const logoutBtn = getEl('logout-operator-btn');
  const changeOpLink = getEl('change-operator-link');

  function updateOperatorUI() {
    if (activeOperator) {
      if (nameDisplay) nameDisplay.innerText = activeOperator.length > 12 ? activeOperator.substring(0, 10) + '..' : activeOperator;
      if (sessionBtn) {
        sessionBtn.classList.remove('btn-secondary');
        sessionBtn.classList.add('badge-online');
        sessionBtn.style.color = '#fff';
      }
      if (logoutBtn) logoutBtn.style.display = 'block';
    } else {
      if (nameDisplay) nameDisplay.innerText = 'Ingresar';
      if (sessionBtn) {
        sessionBtn.classList.remove('badge-online');
        sessionBtn.classList.add('btn-secondary');
      }
      if (logoutBtn) logoutBtn.style.display = 'none';
    }
    const eventOperatorInput = getEl('event-operator');
    if (eventOperatorInput) {
      eventOperatorInput.value = activeOperator;
    }
  }

  updateOperatorUI();

  function openLogin() {
    if (nameInput) nameInput.value = activeOperator;
    setDisplay('login-modal', 'flex');
  }

  if (sessionBtn) sessionBtn.addEventListener('click', openLogin);
  if (changeOpLink) changeOpLink.addEventListener('click', openLogin);

  if (closeLoginBtn) {
    closeLoginBtn.addEventListener('click', () => {
      setDisplay('login-modal', 'none');
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameVal = nameInput ? nameInput.value.trim() : '';
      if (!nameVal) return;

      activeOperator = nameVal;
      localStorage.setItem('qr_active_operator', activeOperator);
      updateOperatorUI();
      setDisplay('login-modal', 'none');
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      activeOperator = '';
      localStorage.removeItem('qr_active_operator');
      updateOperatorUI();
      setDisplay('login-modal', 'none');
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
    console.log("[Offline Queue] Escaneo guardado en cola local");
    return;
  }

  try {
    const res = await fetch('/api/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log("Respuesta del servidor PC:", data);
  } catch (err) {
    console.warn("Error al enviar escaneo al servidor PC, reencolando offline:", err);
    addToOfflineQueue('scan', payload);
  }
}

// Censo & Pre-Análisis Data Fetching
async function fetchCensoCatalog() {
  try {
    const res = await fetch('/api/censo');
    censoCatalog = await res.json();
  } catch (e) {
    console.warn("Catálogo censo local no disponible de inmediato:", e);
  }
}

// Pre-Analysis UI Evaluator
function evaluatePreAnalysisUI() {
  const code = currentScannedCode;
  const tempVal = getVal('event-temp');
  const hardnessVal = getVal('event-hardness');
  const warnContainer = getEl('preanalysis-warning-box');

  if (!warnContainer) return;

  if (!code) {
    warnContainer.style.display = 'none';
    return;
  }

  const codeUpper = String(code).toUpperCase();
  const objInfo = censoCatalog[codeUpper];
  let tempMin = 10, tempMax = 50;
  let durezaMin = 0, durezaMax = 100;

  if (objInfo && objInfo.tolerancias) {
    if (typeof objInfo.tolerancias.tempMin === 'number') tempMin = objInfo.tolerancias.tempMin;
    if (typeof objInfo.tolerancias.tempMax === 'number') tempMax = objInfo.tolerancias.tempMax;
    if (typeof objInfo.tolerancias.durezaMin === 'number') durezaMin = objInfo.tolerancias.durezaMin;
    if (typeof objInfo.tolerancias.durezaMax === 'number') durezaMax = objInfo.tolerancias.durezaMax;
  }

  const advertencias = [];
  if (tempVal) {
    const tNum = parseFloat(String(tempVal).replace(/[^0-9.-]/g, ''));
    if (!isNaN(tNum) && (tNum < tempMin || tNum > tempMax)) {
      advertencias.push(`Temperatura ${tNum}°C fuera del rango (${tempMin}-${tempMax}°C)`);
    }
  }
  if (hardnessVal) {
    const hNum = parseFloat(String(hardnessVal).replace(/[^0-9.-]/g, ''));
    if (!isNaN(hNum) && (hNum < durezaMin || hNum > durezaMax)) {
      advertencias.push(`Dureza ${hNum} Shore fuera del rango (${durezaMin}-${durezaMax} Shore)`);
    }
  }

  if (advertencias.length > 0) {
    warnContainer.innerHTML = `⚠️ <strong>Aviso Pre-Análisis:</strong><br>${advertencias.join('<br>')}`;
    warnContainer.style.display = 'block';
  } else {
    warnContainer.style.display = 'none';
  }
}

function initPreAnalysisEngine() {
  const tempInput = getEl('event-temp');
  const hardnessInput = getEl('event-hardness');

  if (tempInput) tempInput.addEventListener('input', evaluatePreAnalysisUI);
  if (hardnessInput) hardnessInput.addEventListener('input', evaluatePreAnalysisUI);
}

// Bitácora de Eventos de Ensayo
function initEventLogging() {
  const addEventBtn = getEl('add-event-btn');
  const cancelEventBtn = getEl('cancel-event-btn');
  const eventForm = getEl('event-form');
  const eventOperatorInput = getEl('event-operator');
  const photoInput = getEl('event-photo-input');
  const photoPreview = getEl('event-photo-preview');
  const photoContainer = getEl('event-photo-container');

  if (photoInput) {
    photoInput.addEventListener('change', (e) => {
      if (e.target.files.length === 0) return;
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          const maxDim = 600;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else { w = Math.round((w * maxDim) / h); h = maxDim; }
          }
          canvas.width = w; canvas.height = h;
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
        setDisplay('login-modal', 'flex');
        return;
      }
      setDisplay('event-modal', 'flex');
      setInnerText('event-code-display', currentScannedCode || 'Muestra');
      if (eventOperatorInput) eventOperatorInput.value = activeOperator;
    });
  }

  if (cancelEventBtn) {
    cancelEventBtn.addEventListener('click', () => {
      setDisplay('event-modal', 'none');
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
        tipoEvento: getVal('event-type'),
        temperatura: getVal('event-temp'),
        dureza: getVal('event-hardness'),
        observaciones: getVal('event-obs'),
        operador: opVal,
        foto: currentBase64Photo
      };

      if (!navigator.onLine) {
        addToOfflineQueue('event', payload);
        alert(`¡Evento guardado offline por ${opVal}! Se sincronizará automáticamente al recuperar red.`);
        setDisplay('event-modal', 'none');
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
          setDisplay('event-modal', 'none');
          eventForm.reset();
          currentBase64Photo = '';
          if (photoContainer) photoContainer.style.display = 'none';
        }
      } catch (err) {
        addToOfflineQueue('event', payload);
        alert("Sin respuesta del servidor. Registro almacenado en cola offline.");
        setDisplay('event-modal', 'none');
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
      const targetPane = getEl(`tab-${targetTab}`);
      if (targetPane) targetPane.classList.add('active');

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
  const toggleBtn = getEl('toggle-audio-btn');
  const icon = getEl('audio-icon');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      audioEnabled = !audioEnabled;
      if (icon) {
        if (audioEnabled) {
          icon.setAttribute('data-lucide', 'volume-2');
          toggleBtn.style.color = 'var(--text-main)';
        } else {
          icon.setAttribute('data-lucide', 'volume-x');
          toggleBtn.style.color = 'var(--text-muted)';
        }
      }
      if (window.lucide) lucide.createIcons();
    });
  }
}

// QR Scanner & Multi-Camera / Laptop Webcam Enumeration
async function initScanner() {
  const cameraSelect = getEl('camera-select');
  if (cameraSelect) {
    cameraSelect.innerHTML = '<option value="">Cámara del sistema (Auto)</option>';
  }

  try {
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("reader");
    }
  } catch (e) {
    console.warn("Error al instanciar Html5Qrcode:", e);
  }

  try {
    const timeoutGetCameras = new Promise((_, reject) => setTimeout(() => reject(new Error("getCameras timeout")), 2500));
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
    console.warn("Enumeración de cámaras no disponible o diferida:", err);
    if (cameraSelect) {
      cameraSelect.innerHTML = '<option value="">Cámara por defecto</option>';
    }
  }

  initTorch();
  await startScanner();

  const restartBtn = getEl('restart-scan-btn');
  if (restartBtn) {
    restartBtn.onclick = () => {
      restartBtn.style.display = 'none';
      startScanner();
    };
  }
}

function initTorch() {
  const torchBtn = getEl('toggle-torch-btn');
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
              const labelEl = getEl('torch-label');
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

  const overlay = getEl('scanner-overlay');
  const statusText = getEl('status-text');

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
      setDisplay('scanner-overlay', 'none');
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

  setDisplay('restart-scan-btn', 'inline-flex');
  setInnerText('status-text', 'Código detectado');

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
  const nativeInput = getEl('qr-native-capture');
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

  const fileInput = getEl('qr-file-input');
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
  const modal = getEl('result-modal');
  const closeBtn = getEl('close-modal-btn');
  const copyBtn = getEl('copy-result-btn');

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const textEl = getEl('scanned-result-text');
      const text = textEl ? textEl.innerText : '';
      navigator.clipboard.writeText(text);
      copyBtn.innerHTML = `<i data-lucide="check"></i> ¡Copiado!`;
      if (window.lucide) lucide.createIcons();
      setTimeout(() => {
        copyBtn.innerHTML = `<i data-lucide="copy"></i> Copiar`;
        if (window.lucide) lucide.createIcons();
      }, 2000);
    });
  }
}

function showResultModal(text) {
  const modal = getEl('result-modal');
  const resultText = getEl('scanned-result-text');
  const timeText = getEl('scanned-time');
  const badge = getEl('result-type-badge');
  const openLinkBtn = getEl('open-result-btn');

  if (resultText) resultText.innerText = text;
  if (timeText) timeText.innerText = new Date().toLocaleString();

  const isUrl = /^https?:\/\//i.test(text);

  if (badge) {
    if (isUrl) {
      badge.innerText = "Enlace Web";
      badge.style.background = "rgba(16, 185, 129, 0.2)";
      badge.style.color = "var(--accent-success)";
      if (openLinkBtn) {
        openLinkBtn.style.display = "inline-flex";
        openLinkBtn.href = text;
      }
    } else {
      badge.innerText = "Texto Plano";
      badge.style.background = "rgba(99, 102, 241, 0.2)";
      badge.style.color = "var(--accent-primary)";
      if (openLinkBtn) openLinkBtn.style.display = "none";
    }
  }

  if (modal) modal.style.display = 'flex';
}

// History Management
function initHistory() {
  updateHistoryUI();
  const clearBtn = getEl('clear-history-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm("¿Estás seguro de borrar el historial?")) {
        scanHistory = [];
        localStorage.removeItem('qr_history');
        updateHistoryUI();
      }
    });
  }
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
  const list = getEl('history-list');
  const countBadge = getEl('history-count');
  if (countBadge) countBadge.innerText = scanHistory.length;

  if (!list) return;

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

  if (window.lucide) lucide.createIcons();
}

window.copyHistoryText = function(text) {
  navigator.clipboard.writeText(text);
  alert("Texto copiado al portapapeles");
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

// QR Generator
function initGenerator() {
  const input = getEl('qr-input');
  const generateBtn = getEl('generate-qr-btn');
  const resultBox = getEl('qr-result-box');
  const display = getEl('qrcode-display');
  const downloadBtn = getEl('download-qr-btn');

  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      const val = input ? input.value.trim() : '';
      if (!val) {
        alert("Por favor ingresa un texto o enlace.");
        return;
      }

      if (display) {
        display.innerHTML = '';
        new QRCode(display, {
          text: val,
          width: 180,
          height: 180,
          colorDark: "#090d16",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      }

      if (resultBox) resultBox.style.display = 'flex';
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      if (display) {
        const img = display.querySelector('img') || display.querySelector('canvas');
        if (img) {
          const a = document.createElement('a');
          a.href = img.src || img.toDataURL("image/png");
          a.download = "codigo-qr.png";
          a.click();
        }
      }
    });
  }
}
