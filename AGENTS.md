# 🧠 Directivas de Continuidad y Memoria Transferible Inter-Agente
**Proyecto**: QR Vision Pro (`qr-reader-app`)  
**Dominio**: Adquisición de Datos y Control de Captura en Campo (INDUPOX / INDUCOP)

---

## 📌 Principios de Preservación de Continuidad

Cualquier agente de IA (Antigravity, Gemini, Claude, GPT) o desarrollador humano que asuma este espacio de trabajo debe cumplir rigurosamente las siguientes directivas para garantizar la continuidad del proyecto más allá de las herramientas o sesiones efímeras.

### 1. Resguardar la Interpretabilidad (El POR QUÉ)
- **Regla**: Al realizar cambios en el código, base de datos o arquitectura, el rastro de decisiones debe quedar explícito en el **primer renglón del mensaje de commit de Git** y en el reporte del proyecto.
- **Razón**: Los datos en crudo (SQLite/JSON) sobreviven en el disco, pero la razón de ser de los contratos de diseño se pierde si el agente no documenta el *por qué*.

### 2. Memoria en la Capa Frontera del Repositorio
- Toda lección aprendida o regla de negocio descubierta durante una sesión debe plasmarse en archivos leíbles en el repositorio (`AGENTS.md`, `REPORTE_PROYECTO_QR_VISION_PRO.md` o artefactos de plan).
- No asumir que el historial de chat de la sesión anterior estará disponible tras un reinicio. El repositorio en disco es la fuente autoritativa de verdad.

### 3. Modelo Local-First e Independencia de Herramientas Endémicas
- **Persistencia**: La fuente primaria de datos de adquisición es **SQLite** (`data/qr_vision.db`) procesada de forma transaccional local.
- **Interoperabilidad**: Todas las lecturas y eventos deben poder exportarse a formatos universales planos (**CSV, TSV, JSON, YAML**) mediante la API o mediante el selector nativo de carpetas de la PC.
- Si una herramienta endémica (ej. un plugin MCP específico o servidor remoto) no está disponible, el sistema debe degradar elegantemente a herramientas estándar de lectura de archivos y comandos Git nativos.

### 4. Modelo Bi-Temporal e Invalidación No Destructiva
- **Prohibición de `DELETE` físico en Producción**: No eliminar físicamente lecturas ni registros de censo salvo solicitud explícita. Preferir estados lógicos o desactivación (*soft-delete*).

---

## 🛠️ Comandos Rápidos de Diagnóstico de Continuidad

- **Verificar integridad del proyecto**: `npm run verify` o `node scripts/verify_continuity.js`
- **Iniciar servidor de adquisición local**: `npm start` o `node server.js`
- **Verificar cambios pendientes en Git**: `git status`

