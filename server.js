const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_EXPORT_DIR = path.join(__dirname, 'exports');
const SCANS_FILE = path.join(DATA_DIR, 'scans.json');
const CENSO_FILE = path.join(DATA_DIR, 'censo_objetos_v2.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');

// Asegurar directorios
[DATA_DIR, DEFAULT_EXPORT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

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

// Cargar almacenamiento de Bitácora de Eventos de Pruebas
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

// Convertidor de Objeto JS a Formato YAML nativo
function objectToYaml(obj, indent = 0) {
  let yaml = '';
  const padding = ' '.repeat(indent);
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) continue;
    if (typeof val === 'object' && !Array.isArray(val)) {
      yaml += `${padding}${key}:\n${objectToYaml(val, indent + 2)}`;
    } else if (Array.isArray(val)) {
      yaml += `${padding}${key}:\n`;
      val.forEach(item => {
        if (typeof item === 'object') {
          yaml += `${padding}  -\n${objectToYaml(item, indent + 4)}`;
        } else {
          yaml += `${padding}  - "${String(item).replace(/"/g, '\\"')}"\n`;
        }
      });
    } else {
      const strVal = String(val).replace(/\n/g, '\\n');
      yaml += `${padding}${key}: "${strVal.replace(/"/g, '\\"')}"\n`;
    }
  }
  return yaml;
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

  // ================= API ENDPOINTS =================

  // Catálogo Censo (GET, POST, PUT, DELETE)
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
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, item: censoData[cleanCode] }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Payload JSON inválido' }));
      }
    });
    return;
  }

  if (pathname.startsWith('/api/censo/') && req.method === 'DELETE') {
    const codeToDelete = pathname.replace('/api/censo/', '').toUpperCase();
    if (censoData[codeToDelete]) {
      delete censoData[codeToDelete];
      saveCensoToFile();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true, deleted: codeToDelete }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Objeto no encontrado' }));
    }
    return;
  }

  // Bitácora de Eventos de Ensayos (GET, POST)
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
          timestamp: Date.now(),
          date: new Date().toLocaleString()
        };
        eventsList.unshift(eventEntry);
        saveEventsToFile();

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, event: eventEntry }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Payload JSON inválido' }));
      }
    });
    return;
  }

  // Escaneos API (GET, POST, DELETE)
  if (pathname === '/api/scans' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(scansList));
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

          const exists = scansList.some(s => s.raw === text && (Date.now() - s.timestamp < 5000));
          if (!exists) {
            const charData = caracterizarQr(text);
            const entry = {
              id: item.id || Date.now() + Math.random(),
              timestamp: item.timestamp || Date.now(),
              date: item.date || new Date().toLocaleString(),
              dispositivo: item.dispositivo || 'Celular Móvil',
              ...charData
            };
            scansList.unshift(entry);
            addedCount++;
          }
        });

        if (scansList.length > 500) scansList = scansList.slice(0, 500);
        saveScansToFile();

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, added: addedCount, total: scansList.length }));
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
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, remaining: scansList.length }));
    return;
  }

  if (pathname === '/api/scans' && req.method === 'DELETE') {
    scansList = [];
    saveScansToFile();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, total: 0 }));
    return;
  }

  // Exportar a JSON / YAML
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

        const exportedFiles = [];
        const isYaml = format.toLowerCase() === 'yaml' || format.toLowerCase() === 'yml';

        exportItems.forEach(item => {
          const codeLabel = item.codigo || 'LECTURA';
          const filename = `${codeLabel}_${item.id || Date.now()}.${isYaml ? 'yaml' : 'json'}`;
          const filePath = path.join(destDir, filename);

          // Adjuntar eventos de bitácora si existen
          const itemEvents = eventsList.filter(e => String(e.codigo).toUpperCase() === String(item.codigo).toUpperCase());
          const fullRecord = { ...item, bitacoraEventos: itemEvents };

          const content = isYaml ? objectToYaml(fullRecord) : JSON.stringify(fullRecord, null, 2);
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
  console.log(`🚀 Servidor QR Vision Pro (Fase 3) listo en puerto ${PORT}`);
  console.log(`📊 Dashboard de Escritorio disponible en: http://localhost:${PORT}/dashboard.html`);
});
