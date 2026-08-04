# 🧠 Directivas de Continuidad y Memoria Transferible Inter-Agente
**Proyecto**: QR Vision Pro (`qr-reader-app`)  
**Dominio**: Adquisición de Datos y Control de Captura en Campo (INDUPOX / INDUCOP)  
**Skill de Referencia**: [`episteme-minimo`](file:///.agents/skills/episteme-minimo/SKILL.md)

---

## 📌 Principios de Preservación de Continuidad

Cualquier agente de IA (Antigravity, Gemini, Claude, GPT) o desarrollador humano que asuma este espacio de trabajo debe cumplir rigurosamente las siguientes directivas para garantizar la continuidad del proyecto más allá de las herramientas o sesiones efímeras.

### 1. Mensaje Obligatorio de Confirmación de Alineación
- **Regla**: Al cargar o activar la alineación del sistema (automática o tras palabras clave como *"alinéate"* / *"contexto del sistema"*), el agente **debe emitir obligatoriamente el mensaje**:
  > **`Contexto del sistema listo`**
- **Razón**: Permite al Guardián tener la referencia inequívoca de que la memoria y los 3 grafos han sido cargados.

### 2. Gatillo Canónico: "Prepara cierre de sesión" y Sedimentación Preventiva
- **Comando Canónico de Cierre**: La frase **`"Prepara cierre de sesión"`** es el gatillo canónico que dispara forzosamente:
  1. Evaluación de conceptos trabajados y emisión de **YAML CS** (`YYYY-MM-DD-NNN-Antigravity.yaml` en `sedimentar-cs`).
  2. Evaluación de indagaciones web durables y emisión de **YAML AEC** (`YYYY-MM-DD-NNN-Indagacion.yaml` en `consolidar-aec`).
  3. Auditoría de integridad mediante `node scripts/verify_continuity.js`.
  4. Actualización del reporte vivo `REPORTE_PROYECTO_QR_VISION_PRO.md` e hito `git commit`.
- **Sedimentación Preventiva (Anti-Degradación Epistémica)**:
  - Si la sesión se vuelve muy extensa o si se va a iniciar un proceso complejo que pueda alterar o degradar el contexto de trabajo, el agente **debe ejecutar un punto de control / sedimentación intermedia** para prevenir el desgaste del contexto o la pérdida de interpretabilidad.

### 3. Resguardar la Interpretabilidad (El POR QUÉ)
- **Regla**: Al realizar cambios en el código, base de datos o arquitectura, el rastro de decisiones debe quedar explícito en el **primer renglón del mensaje de commit de Git** y en el reporte del proyecto.
- **Razón**: Los datos en crudo (SQLite/JSON) sobreviven en el disco, pero la razón de ser de los contratos de diseño se pierde si el agente no documenta el *por qué*.

### 4. Marco Teórico Vivo (MTV) y Ruteo por Tipo de Grafo
- **MTV Previo**: Consultar el marco teórico en los grafos de conocimiento **ANTES** de analizar o escribir una solución (no improvisar lo que ya está resuelto).
- **Ruteo de Consultas**:
  - **Conceptos / Principios**: Grafo Semántico `concept-sediment` (`cs_search_concepts` / `cs_session_open`).
  - **Documentos / Afirmaciones**: Grafo Catastro (`docs_inducop/` acervo documental).
  - **Hallazgos Web**: Grafo `Ek-Chuah` (`aec_search` / `aec_get_via`).

### 5. Memoria en la Capa Frontera del Repositorio
- Toda lección aprendida o regla de negocio descubierta durante una sesión debe plasmarse en archivos leíbles en el repositorio (`AGENTS.md`, `REPORTE_PROYECTO_QR_VISION_PRO.md` o artefactos de plan).
- No asumir que el historial de chat de la sesión anterior estará disponible tras un reinicio. El repositorio en disco es la fuente autoritativa de verdad.

### 6. Modelo Local-First e Independencia de Herramientas Endémicas
- **Persistencia**: La fuente primaria de datos de adquisición es **SQLite** (`data/qr_vision.db`) procesada de forma transaccional local.
- **Interoperabilidad**: Todas las lecturas y eventos deben poder exportarse a formatos universales planos (**CSV, TSV, JSON, YAML**) mediante la API o mediante el selector nativo de carpetas de la PC.
- Si una herramienta endémica (ej. un plugin MCP específico o servidor remoto) no está disponible, el sistema debe degradar elegantemente a herramientas estándar de lectura de archivos y comandos Git nativos.

### 7. Regla de 3 Intentos y Ancla Temporal ISO-8601
- **Regla de 3 Intentos**: Si una tarea o comando falla 3 veces consecutivas, **DETENERSE y consultar al Guardián**.
- **Firma Temporal**: Todo reporte u orden debe llevar timestamp ISO-8601 con offset numérico explícito (ej. `2026-08-04T09:45-06:00`), sin abreviaturas como `CST`.
- **Prohibición de `DELETE` físico en Producción**: Preferir estados lógicos o desactivación (*soft-delete*).

---

## 🛠️ Comandos Rápidos de Diagnóstico de Continuidad

- **Verificar integridad del proyecto**: `npm run verify` o `node scripts/verify_continuity.js`
- **Iniciar servidor de adquisición local**: `npm start` o `node server.js`
- **Verificar cambios pendientes en Git**: `git status`
