import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { API_URL, AUTH_STORAGE_KEY, VISTAS, NOTIFICATION_TYPES, NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_VALUES, NOTIFICATION_CATEGORY_SIN_FILTRO, NOTIFICATIONS_TAB_KEY, NOTIFICATIONS_CATEGORY_KEY } from '../../constants'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

function parseRef(ref) {
  if (!ref) return ''
  try {
    if (typeof ref === 'string') return ref
    const o = typeof ref === 'object' ? ref : JSON.parse(ref)
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

const BANDEJA_RECIBIDOS = 'recibidos'
const BANDEJA_ENVIADOS = 'enviados'

/** Devuelve etiqueta de fecha al estilo WhatsApp: "Hoy", "Ayer" o "31 ene 2025" */
function getDateLabel(createdAt) {
  if (!createdAt) return ''
  const d = new Date(createdAt)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.floor((today - dateOnly) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Agrupa notificaciones por etiqueta de fecha (orden ya es DESC por created_at) */
function groupByDate(items) {
  const groups = []
  let currentLabel = null
  let currentItems = []
  for (const n of items) {
    const label = getDateLabel(n.created_at)
    if (label !== currentLabel) {
      if (currentItems.length > 0) groups.push({ dateLabel: currentLabel, items: currentItems })
      currentLabel = label
      currentItems = [n]
    } else {
      currentItems.push(n)
    }
  }
  if (currentItems.length > 0) groups.push({ dateLabel: currentLabel, items: currentItems })
  return groups
}

function Notificaciones({
  setVista,
  setRmaDestacado,
  setSerialDestacado,
  setProductoDestacado,
  setClienteDestacado,
  onMarkRead,
}) {
  const [bandeja, setBandeja] = useState(() => {
    try {
      const t = localStorage.getItem(NOTIFICATIONS_TAB_KEY)
      return t === BANDEJA_ENVIADOS ? BANDEJA_ENVIADOS : BANDEJA_RECIBIDOS
    } catch {
      return BANDEJA_RECIBIDOS
    }
  })
  const [categoria, setCategoria] = useState(() => {
    try {
      const c = localStorage.getItem(NOTIFICATIONS_CATEGORY_KEY)
      return NOTIFICATION_CATEGORY_VALUES.includes(c) ? c : NOTIFICATION_CATEGORY_SIN_FILTRO
    } catch {
      return NOTIFICATION_CATEGORY_SIN_FILTRO
    }
  })
  const [list, setList] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATIONS_TAB_KEY, bandeja)
    } catch (_) {}
  }, [bandeja])
  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATIONS_CATEGORY_KEY, categoria)
    } catch (_) {}
  }, [categoria])

  const refetch = useCallback(() => {
    setCargando(true)
    setError(null)
    const base = bandeja === BANDEJA_ENVIADOS
      ? `${API_URL}/api/notifications/sent`
      : `${API_URL}/api/notifications`
    const url = categoria
      ? `${base}?category=${encodeURIComponent(categoria)}`
      : base
    fetch(url, { headers: getAuthHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error('Error al cargar notificaciones')
        return r.json()
      })
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [bandeja, categoria])

  useEffect(() => {
    refetch()
  }, [refetch])

  const groupedList = useMemo(() => groupByDate(list), [list])

  const handleVer = (n) => {
    let ref
    try {
      ref = typeof n.reference_data === 'string' ? JSON.parse(n.reference_data) : n.reference_data
    } catch {
      ref = {}
    }
    const type = (n.type || '').toLowerCase()

    if (type === 'rma' && ref.rma_number) {
      setRmaDestacado?.(ref.rma_number)
      setVista?.(VISTAS.RMA)
    } else if (type === 'producto_rma' && ref.serial) {
      setSerialDestacado?.(ref.serial)
      setVista?.(VISTAS.PRODUCTOS_RMA)
    } else if (type === 'catalogo') {
      const productRef = ref.product_ref || (ref.brand && ref.base_serial ? `${ref.brand}|${ref.base_serial}` : null)
      if (productRef) {
        setProductoDestacado?.(productRef.replace(/\|/g, ' — '))
        setVista?.(VISTAS.PRODUCTOS)
      }
    } else if (type === 'cliente' && (ref.nombre || ref.email)) {
      setClienteDestacado?.(ref.nombre || ref.email || '')
      setVista?.(VISTAS.CLIENTES)
    }

    if (bandeja === BANDEJA_RECIBIDOS && n.id && !n.read_at) {
      fetch(`${API_URL}/api/notifications/${n.id}/read`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
      }).then(() => {
        refetch()
        onMarkRead?.()
      })
    }
  }

  if (cargando) return <p className="loading">Cargando notificaciones...</p>
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <>
      <h1 className="page-title">Mensajes y avisos</h1>

      <div className="notificaciones-bandejas" role="tablist" aria-label="Bandeja de mensajes">
        <button
          type="button"
          role="tab"
          aria-selected={bandeja === BANDEJA_RECIBIDOS}
          className={`notificaciones-tab ${bandeja === BANDEJA_RECIBIDOS ? 'active' : ''}`}
          onClick={() => setBandeja(BANDEJA_RECIBIDOS)}
        >
          Recibidos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={bandeja === BANDEJA_ENVIADOS}
          className={`notificaciones-tab ${bandeja === BANDEJA_ENVIADOS ? 'active' : ''}`}
          onClick={() => setBandeja(BANDEJA_ENVIADOS)}
        >
          Enviados
        </button>
      </div>

      <div className="notificaciones-categorias" role="tablist" aria-label="Filtro por categoría">
        {NOTIFICATION_CATEGORY_VALUES.map((cat) => (
          <button
            key={cat || 'sin-filtro'}
            type="button"
            role="tab"
            aria-selected={categoria === cat}
            className={`notificaciones-tab notificaciones-tab-cat ${categoria === cat ? 'active' : ''}`}
            onClick={() => setCategoria(cat)}
          >
            {NOTIFICATION_CATEGORIES[cat]}
          </button>
        ))}
      </div>

      <p className="notificaciones-desc">
        {bandeja === BANDEJA_RECIBIDOS
          ? `Recibidos${categoria ? ` · Filtro: ${NOTIFICATION_CATEGORIES[categoria]}` : ''}. Pulsa «Ver» para ir al apartado correspondiente.`
          : `Enviados${categoria ? ` · Filtro: ${NOTIFICATION_CATEGORIES[categoria]}` : ''}.`}
      </p>

      {list.length === 0 ? (
        <p className="notificaciones-empty">
          {bandeja === BANDEJA_RECIBIDOS
            ? (categoria ? `No tienes mensajes recibidos en ${NOTIFICATION_CATEGORIES[categoria]}.` : 'No tienes mensajes recibidos.')
            : (categoria ? `No has enviado ningún mensaje en ${NOTIFICATION_CATEGORIES[categoria]}.` : 'No has enviado ningún mensaje.')}
        </p>
      ) : (
        <ul className="notificaciones-list">
          {groupedList.map(({ dateLabel, items }) => (
            <React.Fragment key={dateLabel}>
              <li className="notificaciones-date-separator" aria-hidden>
                {dateLabel}
              </li>
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`notificaciones-item ${bandeja === BANDEJA_RECIBIDOS && !n.read_at ? 'notificaciones-item-unread' : ''}`}
                >
                  <div className="notificaciones-item-header">
                    <span className="notificaciones-item-from">
                      {bandeja === BANDEJA_RECIBIDOS ? n.from_username : n.to_username}
                      {bandeja === BANDEJA_RECIBIDOS && !n.read_at && <span className="notificaciones-badge">Nueva</span>}
                    </span>
                    <span className="notificaciones-item-date">
                      {n.created_at ? new Date(n.created_at).toLocaleString('es-ES') : ''}
                    </span>
                  </div>
                  <div className="notificaciones-item-type">
                    {NOTIFICATION_TYPES[n.type] || n.type}
                    {n.category && n.category !== 'sin_categoria' && (
                      <span className="notificaciones-item-cat"> · {NOTIFICATION_CATEGORIES[n.category] || n.category}</span>
                    )}
                  </div>
                  <div className="notificaciones-item-ref">
                    {parseRef(n.reference_data)}
                  </div>
                  {n.message && (
                    <p className="notificaciones-item-message">{n.message}</p>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm notificaciones-btn-ver"
                    onClick={() => handleVer(n)}
                  >
                    Ver
                  </button>
                </li>
              ))}
            </React.Fragment>
          ))}
        </ul>
      )}
    </>
  )
}

export default Notificaciones
