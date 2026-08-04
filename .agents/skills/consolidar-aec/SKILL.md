---
name: consolidar-aec
description: Emisión y validación de Ordenes de Consolidación YAML AEC (v2) para el Grafo Ek-Chuah. Usar cuando una indagación web o hallazgo exógeno merezca volverse durable en el sistema.
updated: 2026-08-04
---

# Skill de Consolidación Ek-Chuah (YAML AEC v2)

Este skill gobierna la generación y emisión de **Órdenes de Consolidación (YAML AEC v2)** para trasladar indagaciones y hallazgos de la web viva hacia el Grafo Ek-Chuah.

---

## 📌 REGLAS CRÍTICAS Y FRONTERA

* **C0 (Nombre de Archivo)**: El nombre del archivo **DEBE ser idéntico al `meta.session_id`**: `<session_id>.yaml` (ej. `2026-08-04-001-Indagacion.yaml`). PROHIBIDO usar prefijos o títulos descriptivos como `GRANO_...`.
* **C1 (Clave Raíz)**: La clave raíz debe ser `ek_chuah_aec:` y `meta.schema_version` debe ser `"aec-1"`.
* **C2 (La Roca Insumos)**: Cada inscripción requiere `premisa` (no vacía), `busqueda` (lista de términos literales) y `resultados_crudos` (extractos literales cortos <15 palabras y atribuidos, NUNCA síntesis).
* **C4 (Via Epistémica)**: Toda afirmación debe llevar `survived_from` (apuntando al `local_id` de una referencia) e `inferida_por` (apuntando al `local_id` de una inscripción).
* **C6 (Gatillo)**: `necesidad.gatillo` debe matchear explícitamente `^(explicito:|implicito-de:)` y `necesidad.pregunta` no debe ser vacía.
* **FRONTERA FÍSICA (Lo que NO llenas tú)**:
  - `referencias[].content_hash` -> Dejar siempre como `"MATERIALIZAR"`.
  - `referencias[].capture_ts` -> Dejar siempre como `"MATERIALIZAR"`.
  - `meta.consolidado_por` -> Dejar siempre como `"PENDIENTE"`.
  - **JAMÁS pegues bytes ni base64**, solo la URL cruda. Tampoco declares `referente_id` ni `huella` (los deriva el pipeline local).

---

## 📐 PLANTILLA CANÓNICA (YAML AEC v2)

```yaml
ek_chuah_aec:
  meta:
    schema_version: "aec-1"
    session_id: "2026-08-04-001-Indagacion"  # Idéntico al nombre del archivo sin extensión
    consolidado_por: "PENDIENTE"            # Lo completa el actor local al materializar
    project: "ek-chuah"

  inscripciones:
    - local_id: i1
      premisa: |
        Hueco de conocimiento o encuadre que disparó la indagación web.
      busqueda:
        - "consulta literal 1 ejecutada"
        - "consulta literal 2"
      resultados_crudos:
        - fuente: "dominio/url real de origen"
          texto: "extracto LITERAL corto (<15 palabras), atribuido, NUNCA síntesis"
      conclusion: |
        Lectura interpretativa re-derivable de los insumos.
      inferidor:
        model: "Antigravity"
        ts: "2026-08-04T09:40:00-06:00"

  necesidad:
    pregunta: "De qué hueco o necesidad nació la indagación."
    gatillo: "explicito:'orden del Guardián o pregunta explicita'" # o implicito-de:'<orden>'
    origen_nodo: null

  consultas:
    - formulacion: "consulta literal 1 ejecutada"
      referencias:
        - local_id: r1
          url: "https://fuente-real-estable/ruta"
          content_hash: "MATERIALIZAR"
          capture_ts: "MATERIALIZAR"
          fecha_fuente: "capture"
          estatus: "viva"

  afirmaciones:
    - txt: "Afirmación nuclear que sobrevivió como saber."
      tipo: "claim"                    # claim | decision
      estatus: "afirmado"
      survived_from: r1               # local_id de la referencia
      inferida_por: i1                # local_id de la inscripción
```

---

## ⚠️ ERRORES COMUNES A EVITAR

1. **Sintetizar en `resultados_crudos`**: Mata el valor de la Roca. Usar siempre citas cortas verbatim.
2. **Poner fecha en `capture_ts`**: La hora de captura la fija el proceso local al bajar el snapshot.
3. **Nombrar el archivo con título humano**: El nombre del archivo debe coincidir 1:1 con `meta.session_id`.
4. **Modificar un YAML ya ingerido**: Los YAML AEC son logs inmutables (append-only). Si se requiere corregir, se emite un nuevo grano.
