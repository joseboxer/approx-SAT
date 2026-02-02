/**
 * Utilidades para datos RMA y garantías.
 */

/**
 * Identificador único de un RMA (Nº de RMA).
 */
export function getRmaId(p) {
  return String(p['NÂº DE RMA'] ?? p['Nº DE RMA'] ?? '')
}

/**
 * Clave real de la columna "Nº de serie" en los datos (Excel puede usar otro nombre).
 */
export function getClaveSerieReal(primeraFila) {
  if (!primeraFila || typeof primeraFila !== 'object') return 'Nº DE SERIE'
  const key = Object.keys(primeraFila).find((k) =>
    /numero\s*de\s*serie|nº\s*serie|n°\s*serie|serie/i.test(k)
  )
  return key || 'Nº DE SERIE'
}

/**
 * Valor de número de serie para mostrar (o '-' si vacío).
 */
export function getSerie(p, claveSerieReal) {
  if (!p || !claveSerieReal) return '-'
  const v = p[claveSerieReal]
  if (v == null || v === '') return '-'
  return String(v).trim()
}

/**
 * Valor comparable para filtrar (texto en minúsculas).
 */
export function getValorFiltro(p, key) {
  let valor = p[key] ?? (key === 'NÂº DE RMA' ? p['Nº DE RMA'] : '') ?? ''
  if (valor && typeof valor === 'object' && valor.toISOString)
    valor = valor.toISOString().slice(0, 10)
  return String(valor).toLowerCase()
}

/**
 * Valor comparable para ordenar: fechas → timestamp, números → número, resto → string.
 */
export function getValorOrden(p, key) {
  let v = key === 'NÂº DE RMA' ? (p['NÂº DE RMA'] ?? p['Nº DE RMA'] ?? '') : (p[key] ?? '')
  if (v === '' || v == null) return ''
  if (typeof v === 'string' && v.trim() === '') return ''
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) {
    const t = new Date(v.trim()).getTime()
    return Number.isNaN(t) ? '' : t
  }
  if (typeof v === 'object' && v.toISOString) return v.getTime()
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  const str = String(v).trim()
  if (/^\d+$/.test(str)) return Number(str)
  return String(v).toLowerCase()
}

/**
 * Comparar dos valores para ordenar (vacíos al final).
 */
export function compararValores(a, b, asc) {
  const vacio = (x) =>
    x === '' || x == null || (typeof x === 'number' && Number.isNaN(x))
  if (vacio(a) && vacio(b)) return 0
  if (vacio(a)) return 1
  if (vacio(b)) return -1
  const num = (x) => typeof x === 'number' && !Number.isNaN(x)
  const cmp = num(a) && num(b) ? a - b : String(a).localeCompare(String(b), 'es')
  return asc ? cmp : -cmp
}

/**
 * Columnas RMA para filtro/orden (apiKey puede depender de claveSerieReal).
 */
export function getColumnasFiltroRma(claveSerieReal) {
  return [
    { label: 'Nº RMA', apiKey: 'NÂº DE RMA' },
    { label: 'Producto', apiKey: 'PRODUCTO' },
    { label: 'Nº serie', apiKey: claveSerieReal },
    { label: 'Cliente', apiKey: 'RAZON SOCIAL O NOMBRE' },
    { label: 'Fecha recibido', apiKey: 'FECHA RECIBIDO' },
    { label: 'Fecha enviado', apiKey: 'FECHA ENVIADO' },
    { label: 'Fecha recogida', apiKey: 'FECHA RECOGIDA' },
    { label: 'Antigüedad (fila)', apiKey: 'fila' },
    { label: 'Avería', apiKey: 'AVERIA' },
    { label: 'Observaciones', apiKey: 'OBSERVACIONES' },
  ]
}

/**
 * Clave real de la columna fecha en un objeto (por nombre de columna en Excel).
 */
export function getClaveFechaReal(primeraFila) {
  if (!primeraFila || typeof primeraFila !== 'object') return 'FECHA RECIBIDO'
  const key = Object.keys(primeraFila).find((k) => /fecha\s*recibido/i.test(k))
  return key || 'FECHA RECIBIDO'
}
