/** Campos de referencia en notificaciones tipo RMA (lista RMA / productos RMA). */

const RMA_NUM_KEYS = ['Nº DE RMA', 'NÂº DE RMA']
const SERIE_KEYS = ['Nº DE SERIE', 'NÂº DE SERIE']

export function parseNotificationReference(raw) {
  if (raw == null) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw)
      return typeof o === 'object' && o !== null && !Array.isArray(o) ? o : {}
    } catch {
      return {}
    }
  }
  return {}
}

function strTrim(v) {
  if (v == null) return ''
  return String(v).trim()
}

/**
 * Construye reference_data para notificar un ítem RMA estándar.
 * @param {object} item fila API (_row_to_api)
 * @param {(item: object) => string} [getSerie] opcional (p. ej. desde GarantiaContext)
 */
export function buildRmaNotificationReference(item, getSerie) {
  if (!item || typeof item !== 'object') return {}
  const rmaNum = item[RMA_NUM_KEYS[0]] ?? item[RMA_NUM_KEYS[1]]
  const serialRaw =
    typeof getSerie === 'function' ? getSerie(item) : item[SERIE_KEYS[0]] ?? item[SERIE_KEYS[1]] ?? ''
  const serial = strTrim(serialRaw)
  const averia = strTrim(item.AVERIA)
  const client = strTrim(item['RAZON SOCIAL O NOMBRE'])
  const product = strTrim(item.PRODUCTO)
  const out = {}
  if (rmaNum != null && String(rmaNum).trim() !== '') out.rma_number = String(rmaNum).trim()
  if (serial && serial !== '-') out.serial = serial
  if (averia) out.averia = averia
  if (client) out.client_name = client
  if (product) out.product = product
  return out
}

/** Notificar todo el RMA agrupado: misma info que la primera línea + nota si hay varias. */
export function buildWholeRmaNotificationReference(firstItem, getSerie, lineCount) {
  const base = buildRmaNotificationReference(firstItem, getSerie)
  const n = Number(lineCount)
  if (Number.isFinite(n) && n > 1) {
    base.whole_rma_lines = n
    base.whole_rma_note = `Este RMA tiene ${n} líneas; el resumen corresponde a la primera.`
  }
  return base
}

/**
 * reference_data para RMA especial (cabecera + opcionalmente líneas cargadas).
 * @param {{ id?: number, rma_number?: string, line_count?: number, lineas?: object[] }} p
 */
export function buildRmaEspecialNotificationReference(p) {
  const out = {}
  if (p?.id != null) out.id = p.id
  const rn = strTrim(p?.rma_number)
  if (rn) out.rma_number = rn
  const lc = p?.line_count
  if (lc != null && Number.isFinite(Number(lc))) out.line_count = Number(lc)
  const lineas = Array.isArray(p?.lineas) ? p.lineas : []
  if (lineas.length > 0) {
    out.line_previews = lineas.slice(0, 4).map((l) => ({
      ref_proveedor: strTrim(l.ref_proveedor),
      serial: strTrim(l.serial),
      fallo: strTrim(l.fallo).slice(0, 240),
      resolucion: strTrim(l.resolucion).slice(0, 120),
    })).filter((x) => x.ref_proveedor || x.serial || x.fallo || x.resolucion)
  }
  return out
}

/** Filas etiquetadas para la UI de mensajes (RMA / producto_rma). */
export function getRmaStyleRefRows(ref) {
  const o = parseNotificationReference(ref)
  const rows = []
  if (o.rma_number) rows.push({ key: 'rma', label: 'RMA', value: String(o.rma_number) })
  if (o.serial) rows.push({ key: 'serial', label: 'Serie', value: String(o.serial) })
  if (o.product) rows.push({ key: 'product', label: 'Producto', value: String(o.product) })
  if (o.averia) rows.push({ key: 'averia', label: 'Fallo / avería', value: String(o.averia) })
  if (o.client_name) rows.push({ key: 'client', label: 'Cliente', value: String(o.client_name) })
  if (o.whole_rma_note) rows.push({ key: 'note', label: 'Nota', value: String(o.whole_rma_note) })
  return { parsed: o, rows }
}

/** Texto plano (notificaciones antiguas u otros tipos). */
export function formatReferencePlainText(ref) {
  if (!ref) return ''
  try {
    if (typeof ref === 'string') return ref
    const o = typeof ref === 'object' ? ref : JSON.parse(ref)
    if (o.rma_number && o.serial) return `RMA ${o.rma_number} — ${o.serial}`
    if (o.rma_number) return `RMA ${o.rma_number}`
    if (o.serial) return o.serial
    if (o.brand && o.base_serial) return `${o.brand} — ${o.base_serial}`
    if (o.product_ref) return o.product_ref.replace(/\|/g, ' — ')
    if (o.nombre) return `${o.nombre}${o.email ? ` (${o.email})` : ''}`
    return JSON.stringify(o)
  } catch {
    return String(ref)
  }
}
