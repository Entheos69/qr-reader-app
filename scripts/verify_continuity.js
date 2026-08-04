const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'qr_vision.db');
const CENSO_FILE = path.join(DATA_DIR, 'censo_objetos_v2.json');
const AGENTS_FILE = path.join(ROOT_DIR, 'AGENTS.md');
const REPORT_FILE = path.join(ROOT_DIR, 'REPORTE_PROYECTO_QR_VISION_PRO.md');

console.log('----------------------------------------------------');
console.log('🔍 AUDITORÍA DE CONTINUIDAD Y MEMORIA DE PROYECTO');
console.log('----------------------------------------------------');

let warnings = 0;
let errors = 0;

// 1. Verificar Directivas de Agente
if (fs.existsSync(AGENTS_FILE)) {
  console.log('✅ AGENTS.md (Directivas de Continuidad Inter-Agente): Presente');
} else {
  console.log('❌ AGENTS.md: Falta en la raíz del proyecto');
  errors++;
}

// 2. Verificar Reporte Vivo del Proyecto
if (fs.existsSync(REPORT_FILE)) {
  console.log('✅ REPORTE_PROYECTO_QR_VISION_PRO.md: Presente');
} else {
  console.log('⚠️ REPORTE_PROYECTO_QR_VISION_PRO.md: Falta archivo de reporte');
  warnings++;
}

// 3. Verificar Catálogo Censo v2.0
if (fs.existsSync(CENSO_FILE)) {
  try {
    const censo = JSON.parse(fs.readFileSync(CENSO_FILE, 'utf8'));
    const keys = Object.keys(censo);
    console.log(`✅ Censo INDUPOX Set v2.0: OK (${keys.length} objetos registrados)`);
  } catch (e) {
    console.log('❌ Censo INDUPOX Set v2.0: Error al parsear JSON');
    errors++;
  }
} else {
  console.log('❌ Censo INDUPOX Set v2.0: Falta data/censo_objetos_v2.json');
  errors++;
}

// 4. Verificar Persistencia SQLite
if (fs.existsSync(DB_FILE)) {
  const stats = fs.statSync(DB_FILE);
  console.log(`✅ Base de datos SQLite (data/qr_vision.db): Presente (${stats.size} bytes)`);
} else {
  console.log('⚠️ Base de datos SQLite (data/qr_vision.db): No creada aún (se creará al iniciar server.js)');
}

// 5. Verificar Estado Git
try {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT_DIR }).toString().trim();
  const lastCommit = execSync('git log -1 --pretty=format:"%h - %s (%cr)"', { cwd: ROOT_DIR }).toString().trim();
  console.log(`✅ Git Repo: Rama '${branch}'`);
  console.log(`📌 Último Commit: "${lastCommit}"`);
} catch (e) {
  console.log('⚠️ Git Repo: No se pudo obtener información del commit');
  warnings++;
}

console.log('----------------------------------------------------');
if (errors === 0) {
  console.log('🚀 CONTINUIDAD Y ESTADO DEL REPOSORIO EN ORDEN');
} else {
  console.log(`⚠️ SE DETECTARON ${errors} ERRORES Y ${warnings} ADVERTENCIAS`);
}
console.log('----------------------------------------------------');
