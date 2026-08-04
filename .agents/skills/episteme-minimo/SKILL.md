---
name: episteme-minimo
description: Kit mínimo de alineación al sistema poli-agente del Guardián (INDUCOP, Flujo Tripartito, los tres grafos, MTV, directivas de continuidad). Usar SIEMPRE al arrancar sin contexto previo del ecosistema, al recibir un handoff/SOL, o cuando el Guardián diga "carga el sistema", "alinéate", "contexto del sistema", "prepara cierre de sesión".
updated: 2026-08-04
---

# Episteme mínimo del sistema (Adaptado para Antigravity)

## 📌 TL;DR (Reglas Fundamentales)

1. **El Guardián (Entheos)** media todas las decisiones de impacto; autoriza git push, migraciones de BD, deletes en producción y mutaciones del grafo.
2. **Tres grafos, tres ruteos**:
   - **Semántico (`concept-sediment`)**: Conceptos, patrones, principios. Usar `call_mcp_tool` con `cs_search_concepts` / `cs_session_open`.
   - **Catastro (`Acervo`)**: Documentos, afirmaciones corroboradas/falsadas. Usar `grep_search` / `view_file` en `docs_inducop/`.
   - **Ek-Chuah (`AEC`)**: Hallazgos web validados. Usar `call_mcp_tool` con `aec_search`, `aec_get_via`.
3. **MTV (Marco Teórico Vivo)**: Consulta el grafo **ANTES** de analizar, programar o sedimentar. Prohibido "analizar sin marco teórico".
4. **Re-falsar, no recitar**: Toda afirmación se verifica contra la fuente viva antes de reportarla. Citar procedencia.
5. **Regla de 3 intentos**: Si algo falla 3 veces consecutivas, **PARA y pregunta al Guardián**. No iterar a ciegas.
6. **No emojis en código ni consola**: Windows PowerShell no maneja UTF-8 extendido de forma confiable. Evita emojis en `server.js`, `scripts/` o outputs de consola.
7. **Incompletitud inherente**: NUNCA declare "no se puede" / "no existe" con certeza absoluta; di qué buscaste y propone verificación experimental.
8. **Ancla temporal ISO-8601 con offset**: Usar siempre `YYYY-MM-DDTHH:MM±HH:MM` (ej. `2026-08-04T09:45-06:00`), jamás abreviaturas como `CST`.

---

## 📢 Protocolo de Confirmación de Carga

Al cargar o activar este skill (ya sea automáticamente al inicio o por comandos como "alinéate" / "contexto del sistema"), el agente **debe emitir obligatoriamente el siguiente mensaje de confirmación al usuario**:

> **`Contexto del sistema listo`**

Acompañado de la fecha/hora en formato ISO-8601 con offset (`YYYY-MM-DDTHH:MM±HH:MM`) y el estado de los 3 grafos.

---

## 🛑 Protocolo de Cierre: Gatillo Canónico "Prepara cierre de sesión"

El comando **`"Prepara cierre de sesión"`** es el gatillo canónico que dispara forzosamente:
1. **Evaluación y Emisión de YAML CS (`sedimentar-cs`)**: Generar el archivo `YYYY-MM-DD-NNN-Antigravity.yaml` para el Grafo Semántico.
2. **Evaluación y Emisión de YAML AEC (`consolidar-aec`)**: Generar la Orden de Consolidación `YYYY-MM-DD-NNN-Indagacion.yaml` para el Grafo Ek-Chuah si existieron indagaciones web durables.
3. **Auditoría de Integridad**: Ejecución de `node scripts/verify_continuity.js`.
4. **Actualización de Memoria Transferible**: Actualizar `REPORTE_PROYECTO_QR_VISION_PRO.md` e hito `git commit`.

### ⚡ Sedimentación Preventiva (Anti-Degradación Epistémica)
Se dispara también si:
- La sesión se vuelve excesivamente extensa (riesgo de truncamiento o saturación de ventana de contexto).
- Se va a iniciar una reestructuración o proceso técnico complejo que pudiera degradar el contexto de trabajo.
- En estos casos, el agente **debe proponer o ejecutar una sedimentación intermedia** antes de avanzar.

---

## 🛠️ Herramientas y Ruteo por Tipo

| Tipo de Conocimiento | Grafo / Fuente | Herramienta Antigravity |
| :--- | :--- | :--- |
| **Conceptos / Principios / Patrones** | Semántico (`concept-sediment`) | `call_mcp_tool` (`cs_search_concepts`, `cs_get_concept_graph`) |
| **Documentos / Acervo / Afirmaciones** | Catastro (`docs_inducop`) | `grep_search`, `view_file` |
| **Hallazgos Web / Investigaciones** | Ek-Chuah (`AEC`) | `call_mcp_tool` (`aec_search`, `aec_get_via`) |
| **Código & Datos de Adquisición** | Repositorio Local (`qr_reader`) | `view_file`, `replace_file_content`, `run_command` |
