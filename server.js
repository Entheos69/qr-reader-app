const http = require('http');
const fs = require('fs');
const path = require('path');

// Módulo nativo SQLite en Node >= 22 (con fallback seguro en memoria si no está activo)
let DatabaseSync;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (e) {
  console.warn('node:sqlite no disponible, usando fallback en memoria/JSON:', e.message);
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_EXPORT_DIR = path.join(__dirname, 'exports');
const SCANS_FILE = path.join(DATA_DIR, 'scans.json');
const CENSO_FILE = path.join(DATA_DIR, 'censo_objetos_v2.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const DB_FILE = path.join(DATA_DIR, 'qr_vision.db');

// Asegurar directorios
[DATA_DIR, DEFAULT_EXPORT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Inicialización de SQLite
let db = null;
if (DatabaseSync) {
  try {
    db = new DatabaseSync(DB_FILE);
    db.exec(`
      CREATE TABLE IF NOT EXISTS censo (
        codigo TEXT PRIMARY KEY,
        tipo TEXT,
        nombre TEXT,
        corrida TEXT,
        composicion TEXT,
        notas TEXT,
        epp TEXT,
        detalles TEXT
      );
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        date TEXT,
        dispositivo TEXT,
        raw TEXT,
        codigo TEXT,
        tipo TEXT,
        nombre TEXT,
        corrida TEXT,
        composicion TEXT,
        notas TEXT,
        epp TEXT,
        detalles TEXT,
        caracterizado INTEGER
      );
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        codigo TEXT,
        tipoEvento TEXT,
        temperatura TEXT,
        humedad TEXT,
        dureza TEXT,
        resistencia TEXT,
        observaciones TEXT,
        estadoEnsayo TEXT,
        operador TEXT,
        timestamp INTEGER,
        date TEXT,
        estadoPreAnalisis TEXT,
        advertencias TEXT,
        foto TEXT
      );
    `);
    try {
      db.exec(`ALTER TABLE events ADD COLUMN foto TEXT`);
    } catch (e) {
      // Columna ya existente o tabla recién creada
    }
    console.log('✅ Base de datos SQLite inicializada exitosamente en:', DB_FILE);
  } catch (e) {
    console.error('Error al configurar SQLite, operando con JSON plano:', e);
    db = null;
  }
}

// Clientes suscritos a SSE (Server-Sent Events) en vivo
const sseClients = new Set();

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// Cargar catálogo de Censo de Objetos INDUPOX Set v2.0
let censoData = {};
try {
  if (fs.existsSync(CENSO_FILE)) {
    censoData = JSON.parse(fs.readFileSync(CENSO_FILE, 'utf8'));
  }
} catch (e) {
  console.warn('Advertencia al cargar censo_objetos_v2.json:', e);
}

function saveCensoToFile() {
  try {
    fs.writeFileSync(CENSO_FILE, JSON.stringify(censoData, null, 2), 'utf8');
  } catch (e) {
    console.error('Error al guardar censo_objetos_v2.json:', e);
  }
}

// Cargar almacenamiento de Bitácora de Eventos
let eventsList = [];
try {
  if (fs.existsSync(EVENTS_FILE)) {
    eventsList = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
  }
} catch (e) {
  console.warn('Advertencia al cargar events.json:', e);
}

function saveEventsToFile() {
  try {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(eventsList, null, 2), 'utf8');
  } catch (e) {
    console.error('Error al guardar events.json:', e);
  }
}

// Cargar almacenamiento de escaneos
let scansList = [];
try {
  if (fs.existsSync(SCANS_FILE)) {
    scansList = JSON.parse(fs.readFileSync(SCANS_FILE, 'utf8'));
  }
} catch (e) {
  console.warn('Advertencia al cargar scans.json:', e);
}

function saveScansToFile() {
  try {
    fs.writeFileSync(SCANS_FILE, JSON.stringify(scansList, null, 2), 'utf8');
  } catch (e) {
    console.error('Error al guardar scans.json:', e);
  }
}

// Pre-Análisis de Calidad en Adquisición de Datos
function ejecutarPreAnalisisCaptura(payload) {
  const advertencias = [];
  let tempMin = 10, tempMax = 50;
  let durezaMin = 0, durezaMax = 100;

  if (payload.codigo) {
    const codeUpper = String(payload.codigo).toUpperCase();
    const objInfo = censoData[codeUpper];
    if (objInfo && objInfo.tolerancias) {
      if (typeof objInfo.tolerancias.tempMin === 'number') tempMin = objInfo.tolerancias.tempMin;
      if (typeof objInfo.tolerancias.tempMax === 'number') tempMax = objInfo.tolerancias.tempMax;
      if (typeof objInfo.tolerancias.durezaMin === 'number') durezaMin = objInfo.tolerancias.durezaMin;
      if (typeof objInfo.tolerancias.durezaMax === 'number') durezaMax = objInfo.tolerancias.durezaMax;
    }
  }

  // 1. Validar rango de temperatura (°C) si está presente
  if (payload.temperatura) {
    const tempNum = parseFloat(String(payload.temperatura).replace(/[^0-9.-]/g, ''));
    if (!isNaN(tempNum)) {
      if (tempNum < tempMin || tempNum > tempMax) {
        advertencias.push(`Temperatura fuera de tolerancia norma (${tempNum} °C vs ${tempMin}-${tempMax}°C)`);
      }
    }
  }

  // 2. Validar rango de dureza (Shore D/A)
  if (payload.dureza) {
    const durezaNum = parseFloat(String(payload.dureza).replace(/[^0-9.-]/g, ''));
    if (!isNaN(durezaNum)) {
      if (durezaNum < durezaMin || durezaNum > durezaMax) {
        advertencias.push(`Valor de dureza fuera de norma (${durezaNum} Shore vs ${durezaMin}-${durezaMax})`);
      }
    }
  }

  // 3. Control de captura reciente (duplicado en la última hora)
  if (payload.codigo) {
    const codeUpper = String(payload.codigo).toUpperCase();
    const reciente = eventsList.find(e => 
      String(e.codigo).toUpperCase() === codeUpper && 
      (Date.now() - (e.timestamp || 0)) < (60 * 60 * 1000)
    );
    if (reciente) {
      advertencias.push(`Muestra ensayada recientemente hace <60m`);
    }
  }

  return {
    estadoPreAnalisis: advertencias.length > 0 ? 'ADVERTENCIA' : 'OK',
    advertencias: advertencias.join(' | ')
  };
}

// Enriquecer un escaneo con los datos de bitácora más recientes de ese código
function enrichScanWithLatestEvent(scan) {
  if (!scan || !scan.codigo) return scan;
  const codeUpper = String(scan.codigo).toUpperCase();
  const latestEvent = eventsList.find(e => String(e.codigo).toUpperCase() === codeUpper);
  
  if (latestEvent) {
    return {
      ...scan,
      tipoEvento: latestEvent.tipoEvento || scan.tipoEvento || 'Medición de Ensayo',
      temperatura: latestEvent.temperatura || scan.temperatura || '',
      dureza: latestEvent.dureza || scan.dureza || '',
      observaciones: latestEvent.observaciones || scan.observaciones || '',
      operador: latestEvent.operador || scan.operador || 'Operador de Campo',
      foto: latestEvent.foto || scan.foto || '',
      estadoPreAnalisis: latestEvent.estadoPreAnalisis || scan.estadoPreAnalisis || 'OK',
      advertencias: latestEvent.advertencias || scan.advertencias || ''
    };
  }
  return {
    ...scan,
    estadoPreAnalisis: scan.estadoPreAnalisis || 'OK',
    advertencias: scan.advertencias || ''
  };
}

// Convertidor de Objeto JS a Formato YAML nativo
function objectToYaml(obj, indent = 0) {
  let yaml = '';
  const padding = ' '.repeat(indent);
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      yaml += `${padding}- # Lectura ${idx + 1}\n${objectToYaml(item, indent + 2)}`;
    });
    return yaml;
  }
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) continue;
    if (typeof val === 'object') {
      yaml += `${padding}${key}:\n${objectToYaml(val, indent + 2)}`;
    } else {
      const strVal = String(val).replace(/\n/g, '\\n');
      yaml += `${padding}${key}: "${strVal.replace(/"/g, '\\"')}"\n`;
    }
  }
  return yaml;
}

// Convertidor a CSV/TSV estructurado de adquisición
function objectsToCsv(items, delimiter = ',') {
  if (!items || items.length === 0) return '';
  const headers = ['id', 'timestamp', 'date', 'codigo', 'tipo', 'nombre', 'corrida', 'composicion', 'tipoEvento', 'temperatura', 'dureza', 'estadoPreAnalisis', 'advertencias', 'operador', 'raw'];
  let result = headers.join(delimiter) + '\n';

  items.forEach(item => {
    const enriched = enrichScanWithLatestEvent(item);
    const row = headers.map(h => {
      const val = enriched[h] !== undefined && enriched[h] !== null ? String(enriched[h]) : '';
      const escaped = val.replace(/"/g, '""');
      return `"${escaped}"`;
    });
    result += row.join(delimiter) + '\n';
  });

  return result;
}

// Caracterización de Código QR
function caracterizarQr(rawText) {
  if (!rawText) return { caracterizado: false, raw: '' };

  let cleanCode = rawText.trim();
  const matchUrl = cleanCode.match(/\/r\/([A-Za-z0-9]+)/i) || cleanCode.match(/([A-Z0-9]{2,6})$/i);
  if (matchUrl && matchUrl[1]) {
    cleanCode = matchUrl[1].toUpperCase();
  }

  if (censoData[cleanCode]) {
    const item = censoData[cleanCode];
    return {
      caracterizado: true,
      codigo: item.codigo,
      tipo: item.tipo,
      nombre: item.nombre,
      corrida: item.corrida || '',
      composicion: item.composicion || '',
      notas: item.notas || '',
      epp: item.epp || '',
      detalles: item.detalles || '',
      raw: rawText
    };
  }

  const isUrl = /^https?:\/\//i.test(rawText);
  return {
    caracterizado: false,
    codigo: cleanCode,
    tipo: isUrl ? 'ENLACE_WEB' : 'TEXTO_PLANO',
    nombre: rawText,
    raw: rawText
  };
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const urlParts = req.url.split('?');
  const pathname = urlParts[0];
  const queryParams = new URLSearchParams(urlParts[1] || '');

  // CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // ================= SSE TRANSMISIÓN EN TIEMPO REAL =================
  if (pathname === '/api/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 5000\n\n');
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // ================= API ENDPOINTS =================

  // Autenticación de Operador (Audit Log)
  if (pathname === '/api/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const operatorName = (payload.operador || '').trim();
        if (!operatorName) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Nombre de operador requerido' }));
          return;
        }
        console.log(`🔑 Sesión iniciada para operador: ${operatorName}`);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, operador: operatorName, sessionStart: Date.now() }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Payload JSON inválido' }));
      }
    });
    return;
  }

  // Catálogo Censo
  if (pathname === '/api/censo' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(censoData));
    return;
  }

  if (pathname === '/api/censo' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const item = JSON.parse(body);
        if (!item.codigo) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'El código del objeto es obligatorio' }));
          return;
        }
        const cleanCode = item.codigo.trim().toUpperCase();
        censoData[cleanCode] = {
          codigo: cleanCode,
          tipo: item.tipo || 'OPERATIVA',
          nombre: item.nombre || 'Nuevo Objeto',
          corrida: item.corrida || '',
          composicion: item.composicion || '',
          notas: item.notas || '',
          epp: item.epp || 'EPP: nitrilo + gafas · máx. 200 g concentrados',
          detalles: item.detalles || ''
        };
        saveCensoToFile();
        broadcastSSE('censo_update', censoData[cleanCode]);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, item: censoData[cleanCode] }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Payload JSON inválido' }));
      }
    });
    return;
  }

  // Bitácora de Eventos de Ensayos (Con Pre-Análisis de Calidad)
  if (pathname === '/api/events' && req.method === 'GET') {
    const filterCodigo = queryParams.get('codigo');
    let filteredEvents = eventsList;
    if (filterCodigo) {
      filteredEvents = eventsList.filter(e => String(e.codigo).toUpperCase() === String(filterCodigo).toUpperCase());
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(filteredEvents));
    return;
  }

  if (pathname === '/api/events' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (!payload.codigo) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'El código de la muestra es obligatorio' }));
          return;
        }

        // Pre-análisis de calidad de la captura
        const preAnalisis = ejecutarPreAnalisisCaptura(payload);

        const eventEntry = {
          id: Date.now() + Math.random(),
          codigo: payload.codigo.trim().toUpperCase(),
          tipoEvento: payload.tipoEvento || 'Medición de Ensayo',
          temperatura: payload.temperatura || '',
          humedad: payload.humedad || '',
          dureza: payload.dureza || '',
          resistencia: payload.resistencia || '',
          observaciones: payload.observaciones || '',
          estadoEnsayo: payload.estadoEnsayo || 'En Proceso',
          operador: payload.operador || 'Técnico de Campo',
          foto: payload.foto || '',
          timestamp: Date.now(),
          date: new Date().toLocaleString(),
          estadoPreAnalisis: preAnalisis.estadoPreAnalisis,
          advertencias: preAnalisis.advertencias
        };
        eventsList.unshift(eventEntry);
        saveEventsToFile();

        // Persistir también en SQLite si está activo
        if (db) {
          try {
            const stmt = db.prepare(`
              INSERT INTO events (id, codigo, tipoEvento, temperatura, humedad, dureza, resistencia, observaciones, estadoEnsayo, operador, timestamp, date, estadoPreAnalisis, advertencias, foto)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
              String(eventEntry.id),
              eventEntry.codigo,
              eventEntry.tipoEvento,
              eventEntry.temperatura,
              eventEntry.humedad,
              eventEntry.dureza,
              eventEntry.resistencia,
              eventEntry.observaciones,
              eventEntry.estadoEnsayo,
              eventEntry.operador,
              eventEntry.timestamp,
              eventEntry.date,
              eventEntry.estadoPreAnalisis,
              eventEntry.advertencias,
              eventEntry.foto
            );
          } catch (errDb) {
            console.warn('Error al insertar evento en SQLite:', errDb.message);
          }
        }

        // Actualizar también los datos del evento en la lista de escaneos correspondientes
        const codeUpper = eventEntry.codigo;
        scansList.forEach((scan, idx) => {
          if (String(scan.codigo).toUpperCase() === codeUpper) {
            scansList[idx] = {
              ...scan,
              tipoEvento: eventEntry.tipoEvento,
              temperatura: eventEntry.temperatura,
              dureza: eventEntry.dureza,
              observaciones: eventEntry.observaciones,
              operador: eventEntry.operador,
              foto: eventEntry.foto,
              estadoPreAnalisis: eventEntry.estadoPreAnalisis,
              advertencias: eventEntry.advertencias
            };
          }
        });
        saveScansToFile();

        // Transmisión en tiempo real a clientes conectados
        broadcastSSE('event_added', eventEntry);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, event: eventEntry, preAnalisis }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Payload JSON inválido' }));
      }
    });
    return;
  }

  // Escaneos API con fusión automática de bitácora
  if (pathname === '/api/scans' && req.method === 'GET') {
    const enrichedList = scansList.map(enrichScanWithLatestEvent);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(enrichedList));
    return;
  }

  if (pathname === '/api/scans' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const newItems = Array.isArray(payload) ? payload : [payload];

        let addedCount = 0;
        newItems.forEach(item => {
          const text = typeof item === 'string' ? item : (item.text || item.raw);
          if (!text) return;

          const exists = scansList.some(s => s.raw === text && (Date.now() - s.timestamp < 3000));
          if (!exists) {
            const charData = caracterizarQr(text);
            const entry = {
              id: item.id || Date.now() + Math.random(),
              timestamp: item.timestamp || Date.now(),
              date: item.date || new Date().toLocaleString(),
              dispositivo: item.dispositivo || 'Celular Móvil',
              tipoEvento: item.tipoEvento || '',
              temperatura: item.temperatura || '',
              dureza: item.dureza || '',
              observaciones: item.observaciones || '',
              operador: item.operador || '',
              estadoPreAnalisis: item.estadoPreAnalisis || 'OK',
              advertencias: item.advertencias || '',
              ...charData
            };
            scansList.unshift(entry);
            addedCount++;
            broadcastSSE('scan_added', entry);
          }
        });

        if (scansList.length > 500) scansList = scansList.slice(0, 500);
        saveScansToFile();

        const enrichedList = scansList.map(enrichScanWithLatestEvent);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, added: addedCount, total: enrichedList.length }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Payload JSON inválido' }));
      }
    });
    return;
  }

  if (pathname.startsWith('/api/scans/') && req.method === 'DELETE') {
    const idToDelete = pathname.replace('/api/scans/', '');
    scansList = scansList.filter(s => String(s.id) !== String(idToDelete));
    saveScansToFile();
    broadcastSSE('scan_deleted', { id: idToDelete });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, remaining: scansList.length }));
    return;
  }

  if (pathname === '/api/scans' && req.method === 'DELETE') {
    scansList = [];
    saveScansToFile();
    broadcastSSE('scan_deleted_all', {});
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, total: 0 }));
    return;
  }

  // Exportar a JSON / YAML / CSV / TSV con pre-análisis enriquecido
  if (pathname === '/api/export' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { scanId, items, format = 'json', targetDir } = payload;
        const destDir = (targetDir && targetDir.trim()) ? targetDir.trim() : DEFAULT_EXPORT_DIR;

        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        let exportItems = [];
        if (scanId) {
          exportItems = scansList.filter(s => String(s.id) === String(scanId));
        } else if (items && Array.isArray(items)) {
          exportItems = items;
        } else {
          exportItems = scansList;
        }

        if (exportItems.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'No se encontraron elementos para exportar' }));
          return;
        }

        const fmtLower = format.toLowerCase();
        if (fmtLower === 'csv' || fmtLower === 'tsv') {
          const delimiter = fmtLower === 'tsv' ? '\t' : ',';
          const filename = `adquisicion_muestras_${Date.now()}.${fmtLower}`;
          const filePath = path.join(destDir, filename);
          const content = objectsToCsv(exportItems, delimiter);
          fs.writeFileSync(filePath, content, 'utf8');
          
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            count: exportItems.length,
            targetDir: destDir,
            files: [{ filename, filePath }]
          }));
          return;
        }

        const exportedFiles = [];
        const isYaml = fmtLower === 'yaml' || fmtLower === 'yml';

        exportItems.forEach(item => {
          const enriched = enrichScanWithLatestEvent(item);
          const codeLabel = enriched.codigo || 'LECTURA';
          const filename = `${codeLabel}_${enriched.id || Date.now()}.${isYaml ? 'yaml' : 'json'}`;
          const filePath = path.join(destDir, filename);

          const content = isYaml ? objectToYaml(enriched) : JSON.stringify(enriched, null, 2);
          fs.writeFileSync(filePath, content, 'utf8');
          exportedFiles.push({ filename, filePath });
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          count: exportedFiles.length,
          targetDir: destDir,
          files: exportedFiles
        }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Error al exportar archivo: ' + e.message }));
      }
    });
    return;
  }

  // ================= STATIC FILES =================
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexContent) => {
          if (err2) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 Internal Error');
          } else {
            res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
            res.end(indexContent);
          }
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor QR Vision Pro listo en puerto ${PORT}`);
  console.log(`📊 Dashboard de Escritorio disponible en: http://localhost:${PORT}/dashboard.html`);
});
