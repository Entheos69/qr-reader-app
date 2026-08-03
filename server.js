const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const SCANS_FILE = path.join(DATA_DIR, 'scans.json');
const CENSO_FILE = path.join(DATA_DIR, 'censo_objetos_v2.json');

// Cargar catálogo de Censo de Objetos INDUPOX Set v2.0
let censoData = {};
try {
  if (fs.existsSync(CENSO_FILE)) {
    censoData = JSON.parse(fs.readFileSync(CENSO_FILE, 'utf8'));
  }
} catch (e) {
  console.warn('Advertencia al cargar censo_objetos_v2.json:', e);
}

// Cargar o inicializar almacenamiento de escaneos
let scansList = [];
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
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

// Función de Caracterización de Código QR
function caracterizarQr(rawText) {
  if (!rawText) return { caracterizado: false, raw: '' };

  let cleanCode = rawText.trim();

  // Si contiene URL tipo inducop.mx/r/M04 o https://.../M04
  const matchUrl = cleanCode.match(/\/r\/([A-Za-z0-9]+)/i) || cleanCode.match(/([A-Z0-9]{2,6})$/i);
  if (matchUrl && matchUrl[1]) {
    cleanCode = matchUrl[1].toUpperCase();
  }

  // Buscar coincidencia en el Censo de Objetos INDUPOX Set v2.0
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

  // Si es URL genérica o texto plano
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

  // ================= API ENDPOINTS =================
  if (pathname === '/api/censo' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(censoData));
    return;
  }

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

          // Verificar si ya existe para evitar duplicados exactos en corto tiempo
          const exists = scansList.some(s => s.raw === text && (Date.now() - s.timestamp < 10000));
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

  if (pathname === '/api/scans' && req.method === 'DELETE') {
    scansList = [];
    saveScansToFile();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, total: 0 }));
    return;
  }

  // Handle CORS OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // ================= STATIC FILES =================
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Prevenir Directory Traversal
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
