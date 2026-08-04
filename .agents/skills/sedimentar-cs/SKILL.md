---
name: sedimentar-cs
description: Guía y validador para la emisión de archivos YAML de sedimentación de conceptos (YAML CS) en concept-sediment/sessions/. Usar cuando se deba realizar el cierre de sesión, registrar conceptos descubiertos, patrones o decisiones en el Grafo Semántico.
updated: 2026-08-04
---

# Skill de Sedimentación de Conceptos (YAML CS)

Este skill define la norma exacta para generar y validar archivos YAML de sedimentación de conceptos para el Grafo Semántico `concept-sediment`.

---

## 📌 REGLAS CRÍTICAS (Prioridad Máxima)

* **R1**: La clave raíz **DEBE ser `concept_sediment:`** en la línea 2 (después del frontmatter si existe). Sin esta clave, el parser rechaza el archivo.
* **R2**: **CAMPOS PROHIBIDOS** a nivel de concepto: `type`, `status`, `weight`, `strength` (en relaciones), `note` (en relaciones). Son métricas calculadas por el sistema.
* **R3**: Cada concepto requiere **`depth`** con valor en `{mention, usage, decision}` (0.3 / 0.7 / 1.0). NUNCA escribir `pattern` o `principle` ahí.
* **R4**: Las relaciones usan la clave **`related_to:`** (con `{target, relation, notes}`).
* **R5**: Nombre de archivo: `YYYY-MM-DD-NNN-Producer.yaml` (ej. `2026-08-04-001-Antigravity.yaml`). Verificar archivos existentes antes de escribir para no sobrescribir (usar `-a`, `-b` si ya existe NNN).
* **R6**: La relación `related` **SIEMPRE lleva `notes` por relación**. Además, todo target EXTERNO de relación de baja presión exige `gloss-de-target` en `notes`.

---

## 📐 ESQUEMA RAÍZ Y ESTRUCTURA

```yaml
concept_sediment:
  session_id: "2026-08-04-001-Antigravity"
  project: "inducop"                       # o el tag del proyecto
  date: "2026-08-04"
  producer: "Antigravity"
  status: draft                           # SIEMPRE draft al crear
  domains_active:
    - architecture_decisions
    - workflow_protocols

  summary: |
    Resumen libre del bloque de trabajo o sesión.

  concepts:
    - name: "Nombre descriptivo del concepto (matching exacto o slug)"
      depth: decision                     # mention | usage | decision
      domains:
        - architecture_decisions
      related_to:
        - target: "concepto_existente_en_grafo"
          relation: refines               # alta presión (gloss implícito)
        - target: "Concepto externo de baja presión"
          relation: co_occurs             # baja presión (requiere notes / gloss-de-target)
          notes: "Gloss-de-target: qué ES este referente externo."
        - target: "Concepto donde ningún otro verbo aplica"
          relation: related               # Exige notes per-relation (R6)
          notes: "Justificación de por qué ningún otro verbo del enum aplica."
      notes: |
        Contexto completo del concepto: motivación, origen, relación con decisiones.
        El embedding se genera a partir de name + notes.

  references:
    - path: "REPORTE_PROYECTO_QR_VISION_PRO.md"
      description: "Reporte de arquitectura y continuidad"
```

---

## 🔗 ENUM DE RELACIONES VÁLIDAS (`related_to.relation`)

### Relaciones Permitidas:
- **Alta Presión**: `contradicts`, `resolves`, `refines`, `instance_of`, `supersedes`
- **Baja Presión**: `depends_on`, `derived_from`, `co_occurs`, `tensions_with`, `enables`, `requires`, `related` *(R6 obligatoria)*, `complements`, `interpreted_under`

### ❌ Relaciones NO Permitidas (Rechazadas por el Parser):
`constrains`, `blocks`, `guards_against`, `informs`, `relates_to`, `validates`, `part_of`

---

## ⚙️ SISTEMA DE PROMOCIÓN EMERGENTE (Event → Pattern → Principle)

El `type` del concepto **NO SE DECLARA**. Es una métrica emergente calculada por el sistema:
1. **event**: Estado inicial de todo concepto recién creado.
2. **pattern**: Alcanza 3+ ocurrencias, 1+ `usage`/`decision` y transcurridos >=7 días.
3. **principle**: Alcanza 8+ ocurrencias, 2+ `decision` y transcurridos >=30 días.

---

## 📄 WORKFLOW POST-ESCRITURA

1. **Agente/Emisor**: Escribe el YAML con `status: draft` en `concept-sediment/sessions/` (o directorio de ingesta).
2. **Guardián**: Revisa contenido y cambia `status: draft` -> `status: reviewed`.
3. **Pipeline**: Ingesta del paquete mediante `extract_concepts` recalcula pesos, decay y fracturas.
