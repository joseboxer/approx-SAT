import React, { useState, useEffect, useCallback } from 'react'
import { API_URL, AUTH_STORAGE_KEY, VISTAS, NOTIFICATION_TYPES, NOTIFICATIONS_TAB_KEY } from '../../constants'

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
  const [list, setList] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATIONS_TAB_KEY, bandeja)
    } catch (_) {}
  }, [bandeja])

  const refetch = useCallback(() => {
    setCargando(true)
    setError(null)
    const url = bandeja === BANDEJA_ENVIADOS
      ? `${API_URL}/api/notifications/sent`
      : `${API_URL}/api/notifications`
    fetch(url, { headers: getAuthHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error('Error al cargar notificaciones')
        return r.json()
      })
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [bandeja])

  useEffect(() => {
    refetch()
  }, [refetch])

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

      <p className="notificaciones-desc">
        {bandeja === BANDEJA_RECIBIDOS
          ? 'Mensajes que otros usuarios te han enviado. Pulsa «Ver» para ir al apartado correspondiente.'
          : 'Mensajes que tú has enviado a otros usuarios.'}
      </p>

      {list.length === 0 ? (
        <p className="notificaciones-empty">
          {bandeja === BANDEJA_RECIBIDOS ? 'No tienes mensajes recibidos.' : 'No has enviado ningún mensaje.'}
        </p>
      ) : (
        <ul className="notificaciones-list">
          {list.map((n) => (
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
        </ul>
      )}
    </>
  )
}

export default Notificaciones
