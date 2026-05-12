import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  API_URL,
  VISTAS,
  NOTIFICATION_TYPES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_VALUES,
  NOTIFICATION_CATEGORY_SIN_FILTRO,
  NOTIFICATIONS_TAB_KEY,
  NOTIFICATIONS_CATEGORY_KEY,
} from '../../constants'
import { getAuthHeaders } from '../../utils/auth'

function parseRef(ref) {
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

const BANDEJA_RECIBIDOS = 'recibidos'
const BANDEJA_ENVIADOS = 'enviados'
const BANDEJA_BORRADOS = 'borrados'

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
  setRmaEspecialDestacadoId,
  onMarkRead,
}) {
  const [bandeja, setBandeja] = useState(() => {
    try {
      const t = localStorage.getItem(NOTIFICATIONS_TAB_KEY)
      if (t === BANDEJA_ENVIADOS || t === BANDEJA_BORRADOS) return t
      return BANDEJA_RECIBIDOS
    } catch {
      return BANDEJA_RECIBIDOS
    }
  })
  const [actioningId, setActioningId] = useState(null)
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
  const [searchText, setSearchText] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATIONS_TAB_KEY, bandeja)
    } catch (err) {
      void err
    }
  }, [bandeja])
  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATIONS_CATEGORY_KEY, categoria)
    } catch (err) {
      void err
    }
  }, [categoria])

  const refetch = useCallback(() => {
    setCargando(true)
    setError(null)
    const params = new URLSearchParams()
    params.set('box', bandeja)
    if (categoria && bandeja !== BANDEJA_BORRADOS) params.set('category', categoria)
    if (searchText.trim()) params.set('q', searchText.trim())
    if (typeFilter) params.set('type', typeFilter)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (onlyUnread && bandeja === BANDEJA_RECIBIDOS) params.set('unread_only', '1')
    const url = `${API_URL}/api/notifications/search?${params.toString()}`
    fetch(url, { headers: getAuthHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error('Error al cargar notificaciones')
        return r.json()
      })
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [bandeja, categoria, searchText, typeFilter, dateFrom, dateTo, onlyUnread])

  useEffect(() => {
    refetch()
  }, [refetch])

  const groupedList = useMemo(() => groupByDate(list), [list])
  const visibleIds = useMemo(() => list.map((n) => n.id).filter((x) => x != null), [list])
  const selectedCount = selectedIds.size
  const selectedVisibleCount = useMemo(
    () => visibleIds.reduce((acc, id) => acc + (selectedIds.has(id) ? 1 : 0), 0),
    [visibleIds, selectedIds]
  )
  const typeValues = useMemo(() => ['', ...Object.keys(NOTIFICATION_TYPES)], [])

  const toggleSelect = useCallback((id) => {
    if (id == null) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      visibleIds.forEach((id) => next.add(id))
      return next
    })
  }, [visibleIds])

  const deselectVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      visibleIds.forEach((id) => next.delete(id))
      return next
    })
  }, [visibleIds])

  const clearSelected = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleBorrar = (n) => {
    if (!n.id || actioningId !== null) return
    setActioningId(n.id)
    fetch(`${API_URL}/api/notifications/${n.id}/delete`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.detail || 'Error al borrar') })
        return r.json()
      })
      .then(() => {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(n.id)
          return next
        })
        refetch()
      })
      .catch((err) => setError(err.message))
      .finally(() => setActioningId(null))
  }

  const handleRestaurar = (n) => {
    if (!n.id || actioningId !== null) return
    setActioningId(n.id)
    fetch(`${API_URL}/api/notifications/${n.id}/restore`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.detail || 'Error al restaurar') })
        return r.json()
      })
      .then(() => {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(n.id)
          return next
        })
        refetch()
      })
      .catch((err) => setError(err.message))
      .finally(() => setActioningId(null))
  }

  const handleVer = (n) => {
    let ref
    try {
      ref = typeof n.reference_data === 'string' ? JSON.parse(n.reference_data) : n.reference_data
    } catch {
      ref = {}
    }
    const type = (n.type || '').toLowerCase()

    if (type === 'rma' && ref.serial) {
      setSerialDestacado?.(ref.serial)
      setVista?.(VISTAS.PRODUCTOS_RMA)
    } else if (type === 'rma' && ref.rma_number) {
      setRmaDestacado?.(ref.rma_number)
      setVista?.(VISTAS.RMA)
    } else if (type === 'rma_especial' && (ref.id != null || ref.rma_number)) {
      if (ref.id != null) setRmaEspecialDestacadoId?.(ref.id)
      setVista?.(VISTAS.RMA_ESPECIALES)
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

  const handleGeneratePdf = useCallback(() => {
    if (selectedCount === 0 || pdfLoading) return
    setPdfLoading(true)
    fetch(`${API_URL}/api/notifications/report-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}))
          throw new Error(d.detail || 'No se pudo generar el PDF.')
        }
        return r.blob()
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `reporte-mensajes-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch((err) => setError(err.message))
      .finally(() => setPdfLoading(false))
  }, [selectedCount, pdfLoading, selectedIds])

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
        <button
          type="button"
          role="tab"
          aria-selected={bandeja === BANDEJA_BORRADOS}
          className={`notificaciones-tab ${bandeja === BANDEJA_BORRADOS ? 'active' : ''}`}
          onClick={() => setBandeja(BANDEJA_BORRADOS)}
        >
          Borrados
        </button>
      </div>

      <div className="notificaciones-categorias" role="tablist" aria-label="Filtro por categoría">
        {bandeja === BANDEJA_BORRADOS ? null : NOTIFICATION_CATEGORY_VALUES.map((cat) => (
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
          : bandeja === BANDEJA_BORRADOS
            ? 'Mensajes que has borrado desde Enviados. No se eliminan de la base de datos; puedes restaurarlos.'
            : `Enviados${categoria ? ` · Filtro: ${NOTIFICATION_CATEGORIES[categoria]}` : ''}. Solo tú puedes borrarlos; pasarán a la bandeja Borrados.`}
      </p>

      <section className="configuracion-form" aria-label="Buscador de mensajes">
        <div className="configuracion-field">
          <label htmlFor="notif-search-text">Buscar texto (RMA, referencia, usuario, mensaje)</label>
          <input
            id="notif-search-text"
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="configuracion-input"
            placeholder="Ej. RMA 24001, serie, usuario..."
          />
        </div>
        <div className="configuracion-estado-grid">
          <div className="configuracion-field">
            <label htmlFor="notif-search-type">Tipo</label>
            <select
              id="notif-search-type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="configuracion-input"
            >
              <option value="">Todos</option>
              {typeValues.filter(Boolean).map((t) => (
                <option key={t} value={t}>{NOTIFICATION_TYPES[t] || t}</option>
              ))}
            </select>
          </div>
          <div className="configuracion-field">
            <label htmlFor="notif-search-date-from">Fecha desde</label>
            <input
              id="notif-search-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="configuracion-input"
            />
          </div>
          <div className="configuracion-field">
            <label htmlFor="notif-search-date-to">Fecha hasta</label>
            <input
              id="notif-search-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="configuracion-input"
            />
          </div>
        </div>
        {bandeja === BANDEJA_RECIBIDOS && (
          <label className="configuracion-hint" style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={onlyUnread}
              onChange={(e) => setOnlyUnread(e.target.checked)}
            />
            Solo no leídos
          </label>
        )}
        <div className="configuracion-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSearchText('')
              setTypeFilter('')
              setDateFrom('')
              setDateTo('')
              setOnlyUnread(false)
            }}
          >
            Limpiar filtros
          </button>
        </div>
      </section>

      <section className="configuracion-form" aria-label="Selección y reporte">
        <p className="configuracion-desc">
          Seleccionados: <strong>{selectedCount}</strong>
          {selectedVisibleCount > 0 && <> · visibles seleccionados: <strong>{selectedVisibleCount}</strong></>}
        </p>
        <div className="configuracion-actions">
          <button type="button" className="btn btn-secondary" onClick={selectVisible}>
            Seleccionar visibles
          </button>
          <button type="button" className="btn btn-secondary" onClick={deselectVisible}>
            Deseleccionar visibles
          </button>
          <button type="button" className="btn btn-secondary" onClick={clearSelected}>
            Limpiar selección
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGeneratePdf}
            disabled={selectedCount === 0 || pdfLoading}
          >
            {pdfLoading ? 'Generando PDF…' : `Generar PDF (${selectedCount})`}
          </button>
        </div>
      </section>

      {list.length === 0 ? (
        <p className="notificaciones-empty">
          {bandeja === BANDEJA_RECIBIDOS
            ? (categoria ? `No tienes mensajes recibidos en ${NOTIFICATION_CATEGORIES[categoria]}.` : 'No tienes mensajes recibidos.')
            : bandeja === BANDEJA_BORRADOS
              ? 'No tienes mensajes en la bandeja de borrados.'
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
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(n.id)}
                        onChange={() => toggleSelect(n.id)}
                        aria-label={`Seleccionar mensaje ${n.id}`}
                      />
                      <span className="configuracion-hint">#{n.id}</span>
                    </label>
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
                  <div className="notificaciones-item-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm notificaciones-btn-ver"
                      onClick={() => handleVer(n)}
                    >
                      Ver
                    </button>
                    {bandeja === BANDEJA_ENVIADOS && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleBorrar(n)}
                        disabled={actioningId === n.id}
                        title="Mover a Borrados (solo tú puedes borrarlo)"
                      >
                        {actioningId === n.id ? '…' : 'Borrar'}
                      </button>
                    )}
                    {bandeja === BANDEJA_BORRADOS && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRestaurar(n)}
                        disabled={actioningId === n.id}
                        title="Volver a Enviados"
                      >
                        {actioningId === n.id ? '…' : 'Restaurar'}
                      </button>
                    )}
                  </div>
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
