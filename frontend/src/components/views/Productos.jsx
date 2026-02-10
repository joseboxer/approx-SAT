import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { API_URL, AUTH_STORAGE_KEY, POR_PAGINA } from '../../constants'
import { compararValores } from '../../utils/garantia'
import Paginacion from '../Paginacion'
import ProgressBar from '../ProgressBar'
import ModalNotificar from '../ModalNotificar'
import { useCatalogRefresh } from '../../context/CatalogRefreshContext'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

// Para mostrar la marca sin el prefijo redundante "PRODUCTOS "
function formatBrand(brand) {
  const s = (brand || '').trim()
  if (!s) return s
  return s.replace(/^PRODUCTOS\\s+/i, '') || s
}

/**
 * Vista Productos: catálogo desde carpeta de red (QNAP).
 * Muestra marca, número de serie base, tipo, fecha creación y enlaces para abrir el visual (PDF/Excel).
 */
function Productos({ productoDestacado, setProductoDestacado }) {
  const [catalogo, setCatalogo] = useState([])
  const [catalogError, setCatalogError] = useState(null)
  const [cached, setCached] = useState(false)
  const [scannedAt, setScannedAt] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [filtroMarca, setFiltroMarca] = useState('')
  const [filtroSerie, setFiltroSerie] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [columnaOrden, setColumnaOrden] = useState('base_serial')
  const [ordenAsc, setOrdenAsc] = useState(true)
  const [pagina, setPagina] = useState(1)
  const [vistaCatalogo, setVistaCatalogo] = useState('lista') // 'lista' | 'marcas'
  const [marcaExpandida, setMarcaExpandida] = useState(null) // brand name cuando vista === 'marcas'
  const [notificarOpen, setNotificarOpen] = useState(false)
  const [notificarRef, setNotificarRef] = useState(null)
  const [tiposProducto, setTiposProducto] = useState([])
  const [nuevoTipo, setNuevoTipo] = useState('')
  const [tipoBulk, setTipoBulk] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [tiposSeleccionados, setTiposSeleccionados] = useState(() => new Set())
  const [tipoEnEdicion, setTipoEnEdicion] = useState(null)
  const [nombreTipoEdit, setNombreTipoEdit] = useState('')
  const [selectedRefs, setSelectedRefs] = useState(() => new Set())
  const tablaRef = useRef(null)
  const tiposListaRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)
  const [dragRect, setDragRect] = useState(null)
  const [dragMode, setDragMode] = useState('add') // 'add' | 'remove'
  const [dragContext, setDragContext] = useState(null) // 'productos' | 'tipos'
  const dragBaseSelectionRef = useRef(new Set())
  const dragScrollDirRef = useRef(null) // 'up' | 'down' | null

  const {
    taskId: refreshTaskId,
    percent: refreshProgress,
    message: refreshProgressMessage,
    status: refreshStatus,
    result: refreshResult,
    error: refreshError,
    startCatalogRefresh,
    clearResult: clearRefreshResult,
  } = useCatalogRefresh()
  const refreshing = !!refreshTaskId

  const refetch = useCallback(() => {
    setCargando(true)
    setError(null)
    setCatalogError(null)
    fetch(`${API_URL}/api/productos-catalogo`, { headers: getAuthHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error('Error al cargar catálogo')
        return res.json()
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setCatalogo(data)
          setCached(false)
          setScannedAt(null)
        } else {
          setCatalogo(data.productos ?? [])
          setCatalogError(data.error ?? null)
          setCached(data.cached ?? false)
          setScannedAt(data.scanned_at ?? null)
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  // Cargar lista de tipos de producto (existentes + extra configurables)
  useEffect(() => {
    fetch(`${API_URL}/api/productos-catalogo/tipos`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : { tipos: [] }))
      .then((data) => {
        setTiposProducto(Array.isArray(data.tipos) ? data.tipos : [])
      })
      .catch(() => {})
  }, [])

  // Aplicar resultado de la actualización en segundo plano (aunque hayas cambiado de apartado)
  useEffect(() => {
    if (refreshStatus === 'done' && refreshResult?.productos != null) {
      setCatalogo(refreshResult.productos)
      setCached(true)
      setCatalogError(null)
      clearRefreshResult()
    }
  }, [refreshStatus, refreshResult, clearRefreshResult])

  const refreshCatalog = useCallback(() => {
    setCatalogError(null)
    startCatalogRefresh()
  }, [startCatalogRefresh])

  useEffect(() => {
    setPagina(1)
  }, [filtroMarca, filtroSerie, filtroTipo])

  const getValor = (p, key) => (p[key] ?? '')

  const filtrados = useMemo(() => {
    let result = catalogo
    if (productoDestacado) {
      const q = (productoDestacado || '').toLowerCase()
      result = result.filter(
        (p) =>
          (p.base_serial || '').toLowerCase().includes(q) ||
          (p.brand || '').toLowerCase().includes(q) ||
          (p.product_type || '').toLowerCase().includes(q)
      )
    }
    const marca = (filtroMarca || '').trim().toLowerCase()
    if (marca) result = result.filter((p) => (p.brand || '').toLowerCase().includes(marca))
    const serie = (filtroSerie || '').trim().toLowerCase()
    if (serie) result = result.filter((p) => (p.base_serial || '').toLowerCase().includes(serie))
    const tipo = (filtroTipo || '').trim().toLowerCase()
    if (tipo) result = result.filter((p) => (p.product_type || '').toLowerCase().includes(tipo))
    return result
  }, [catalogo, productoDestacado, filtroMarca, filtroSerie, filtroTipo])

  const ordenados = useMemo(
    () =>
      [...filtrados].sort((a, b) =>
        compararValores(getValor(a, columnaOrden), getValor(b, columnaOrden), ordenAsc)
      ),
    [filtrados, columnaOrden, ordenAsc]
  )

  const totalPaginas = Math.ceil(ordenados.length / POR_PAGINA) || 1
  const inicio = (pagina - 1) * POR_PAGINA
  const enPagina = ordenados.slice(inicio, inicio + POR_PAGINA)

  const porMarca = useMemo(() => {
    const map = new Map()
    ordenados.forEach((p) => {
      const marca = (p.brand || '').trim() || '—'
      if (!map.has(marca)) map.set(marca, [])
      map.get(marca).push(p)
    })
    return Array.from(map.entries()).map(([marca, productos]) => ({ marca, productos }))
  }, [ordenados])

  const urlArchivo = (pathRel) => {
    if (!pathRel) return null
    const base = API_URL || ''
    return `${base}/api/productos-catalogo/archivo?path=${encodeURIComponent(pathRel)}`
  }

  const productoNoEncontrado =
    !cargando &&
    !error &&
    catalogo.length > 0 &&
    productoDestacado &&
    String(productoDestacado).trim() !== '' &&
    filtrados.length === 0

  const toggleSeleccionProducto = (p) => {
    const ref = [p.brand, p.base_serial].filter(Boolean).join('|') || p.base_serial || ''
    if (!ref) return
    setSelectedRefs((prev) => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })
  }

  const seleccionarPaginaActual = (checked) => {
    const nuevos = new Set(selectedRefs)
    enPagina.forEach((p) => {
      const ref = [p.brand, p.base_serial].filter(Boolean).join('|') || p.base_serial || ''
      if (!ref) return
      if (checked) nuevos.add(ref)
      else nuevos.delete(ref)
    })
    setSelectedRefs(nuevos)
  }

  const allPageSelected =
    enPagina.length > 0 &&
    enPagina.every((p) => {
      const ref = [p.brand, p.base_serial].filter(Boolean).join('|') || p.base_serial || ''
      return ref && selectedRefs.has(ref)
    })

  const handleCrearTipo = () => {
    const nombre = (nuevoTipo || '').trim()
    if (!nombre) return
    fetch(`${API_URL}/api/productos-catalogo/tipos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ nombre }),
    })
      .then((r) => (r.ok ? r.json() : r.json().then((d) => { throw new Error(d.detail || 'Error al crear tipo') })))
      .then((data) => {
        setTiposProducto((prev) => (prev.includes(data.tipo) ? prev : [...prev, data.tipo]))
        setNuevoTipo('')
      })
      .catch((err) => setError(err.message))
  }

  const handleAsignarTipoBulk = () => {
    const tipo = (tipoBulk || '').trim()
    if (!tipo || selectedRefs.size === 0) return
    setBulkLoading(true)
    fetch(`${API_URL}/api/productos-catalogo/tipos/asignar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ tipo, product_refs: Array.from(selectedRefs) }),
    })
      .then((r) => (r.ok ? r.json() : r.json().then((d) => { throw new Error(d.detail || 'Error al asignar tipo') })))
      .then(() => {
        refetch()
      })
      .catch((err) => setError(err.message))
      .finally(() => setBulkLoading(false))
  }

  const handleToggleTipoSeleccion = (tipo) => {
    const t = (tipo || '').trim()
    if (!t) return
    setTiposSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const handleBorrarTipos = () => {
    if (!tiposSeleccionados.size) return
    const lista = Array.from(tiposSeleccionados)
    // Aviso importante al usuario
    // eslint-disable-next-line no-alert
    const ok = window.confirm(
      `Vas a borrar estos tipos:\n\n${lista.join(
        ', '
      )}\n\nTodos los productos que tengan alguno de esos tipos se quedarán sin tipo.\n\n¿Quieres continuar?`
    )
    if (!ok) return
    setBulkLoading(true)
    fetch(`${API_URL}/api/productos-catalogo/tipos/borrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ tipos: lista }),
    })
      .then((r) => (r.ok ? r.json() : r.json().then((d) => { throw new Error(d.detail || 'Error al borrar tipos') })))
      .then(() => {
        setTiposProducto((prev) => prev.filter((t) => !lista.includes(t)))
        setTiposSeleccionados(new Set())
        setTipoEnEdicion(null)
        setNombreTipoEdit('')
        refetch()
      })
      .catch((err) => setError(err.message))
      .finally(() => setBulkLoading(false))
  }

  const empezarEditarTipo = (tipo) => {
    const t = (tipo || '').trim()
    if (!t) return
    setTipoEnEdicion(t)
    setNombreTipoEdit(t)
  }

  const cancelarEditarTipo = () => {
    setTipoEnEdicion(null)
    setNombreTipoEdit('')
  }

  const guardarEditarTipo = () => {
    const antiguo = (tipoEnEdicion || '').trim()
    const nuevo = (nombreTipoEdit || '').trim()
    if (!antiguo || !nuevo || antiguo === nuevo) {
      cancelarEditarTipo()
      return
    }
    setBulkLoading(true)
    fetch(`${API_URL}/api/productos-catalogo/tipos/renombrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ antiguo, nuevo }),
    })
      .then((r) => (r.ok ? r.json() : r.json().then((d) => { throw new Error(d.detail || 'Error al renombrar tipo') })))
      .then(() => {
        setTiposProducto((prev) =>
          prev.map((t) => (t === antiguo ? nuevo : t))
        )
        // Actualizar selección de tipos
        setTiposSeleccionados((prev) => {
          const next = new Set()
          prev.forEach((t) => {
            if (t === antiguo) next.add(nuevo)
            else next.add(t)
          })
          return next
        })
        setTipoEnEdicion(null)
        setNombreTipoEdit('')
        refetch()
      })
      .catch((err) => setError(err.message))
      .finally(() => setBulkLoading(false))
  }

  const onMouseDownTabla = (e) => {
    // Solo activar selección por arrastre con Shift+Alt (no interfiere con zoom del navegador)
    if (e.button !== 0 || !e.shiftKey || !e.altKey) return
    if (!tablaRef.current) return
    // Evitar selección de texto nativa
    e.preventDefault()
    const sel = window.getSelection && window.getSelection()
    if (sel && sel.removeAllRanges) sel.removeAllRanges()

    const container = tablaRef.current
    const start = { x: e.clientX, y: e.clientY }
    setDragging(true)
    setDragContext('productos')
    dragScrollDirRef.current = null
    setDragStart(start)
    setDragRect({ x: start.x, y: start.y, width: 0, height: 0 })
    dragBaseSelectionRef.current = new Set(selectedRefs)

    // Determinar modo (añadir o quitar) según si el elemento bajo el cursor está ya seleccionado
    let mode = 'add'
    const row = e.target.closest('tr[data-product-ref]')
    if (row) {
      const ref = row.getAttribute('data-product-ref') || ''
      if (ref && selectedRefs.has(ref)) mode = 'remove'
    }
    setDragMode(mode)

    const onMove = (ev) => {
      ev.preventDefault()
      const selMove = window.getSelection && window.getSelection()
      if (selMove && selMove.removeAllRanges) selMove.removeAllRanges()

      const current = { x: ev.clientX, y: ev.clientY }
      const x1 = Math.min(start.x, current.x)
      const y1 = Math.min(start.y, current.y)
      const x2 = Math.max(start.x, current.x)
      const y2 = Math.max(start.y, current.y)
      setDragRect({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 })

      const bounds = container.getBoundingClientRect()
      const edgeThreshold = 32
      const maxStep = 18
      if (current.y > bounds.bottom - edgeThreshold) {
        dragScrollDirRef.current = 'down'
        const factor = Math.min(1, (current.y - (bounds.bottom - edgeThreshold)) / edgeThreshold)
        container.scrollTop += 4 + maxStep * factor
      } else if (current.y < bounds.top + edgeThreshold) {
        dragScrollDirRef.current = 'up'
        const factor = Math.min(1, ((bounds.top + edgeThreshold) - current.y) / edgeThreshold)
        container.scrollTop -= 4 + maxStep * factor
      } else {
        dragScrollDirRef.current = null
      }

      const rows = Array.from(container.querySelectorAll('tr[data-product-ref]'))
      const within = new Set()
      rows.forEach((rowEl) => {
        const r = rowEl.getBoundingClientRect()
        const intersect =
          x1 <= r.right &&
          x2 >= r.left &&
          y1 <= r.bottom &&
          y2 >= r.top
        if (intersect) {
          const ref = rowEl.getAttribute('data-product-ref') || ''
          if (ref) within.add(ref)
        }
      })

      const base = dragBaseSelectionRef.current
      const next = new Set(base)
      if (mode === 'add') {
        within.forEach((ref) => next.add(ref))
      } else {
        within.forEach((ref) => next.delete(ref))
      }
      dragBaseSelectionRef.current = next
      setSelectedRefs(next)
    }

    const onUp = () => {
      setDragging(false)
      setDragStart(null)
      setDragRect(null)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onMouseDownTipos = (e) => {
    // Activar selección por arrastre con botón izquierdo (sin modificadores) dentro de la lista de tipos
    if (e.button !== 0) return
    if (!tiposListaRef.current) return
    // Evitar selección de texto nativa
    e.preventDefault()
    const sel = window.getSelection && window.getSelection()
    if (sel && sel.removeAllRanges) sel.removeAllRanges()

    const container = tiposListaRef.current
    const start = { x: e.clientX, y: e.clientY }
    setDragging(true)
    setDragContext('tipos')
    dragScrollDirRef.current = null
    setDragStart(start)
    setDragRect({ x: start.x, y: start.y, width: 0, height: 0 })
    dragLastPosRef.current = start
    dragBaseSelectionRef.current = new Set(tiposSeleccionados)

    // Determinar modo (añadir o quitar) según si el elemento bajo el cursor está ya seleccionado
    let mode = 'add'
    const item = e.target.closest('[data-tipo]')
    if (item) {
      const t = item.getAttribute('data-tipo') || ''
      if (t && tiposSeleccionados.has(t)) mode = 'remove'
    }

    const onMove = (ev) => {
      ev.preventDefault()
      const selMove = window.getSelection && window.getSelection()
      if (selMove && selMove.removeAllRanges) selMove.removeAllRanges()

      const current = { x: ev.clientX, y: ev.clientY }
      const x1 = Math.min(start.x, current.x)
      const y1 = Math.min(start.y, current.y)
      const x2 = Math.max(start.x, current.x)
      const y2 = Math.max(start.y, current.y)
      setDragRect({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 })

      const bounds = container.getBoundingClientRect()
      const edgeThreshold = 32
      if (current.y > bounds.bottom - edgeThreshold) {
        dragScrollDirRef.current = 'down'
      } else if (current.y < bounds.top + edgeThreshold) {
        dragScrollDirRef.current = 'up'
      } else {
        dragScrollDirRef.current = null
      }

      const items = Array.from(container.querySelectorAll('[data-tipo]'))
      const within = new Set()
      items.forEach((el) => {
        const r = el.getBoundingClientRect()
        const intersect =
          x1 <= r.right &&
          x2 >= r.left &&
          y1 <= r.bottom &&
          y2 >= r.top
        if (intersect) {
          const t = el.getAttribute('data-tipo') || ''
          if (t) within.add(t)
        }
      })

      const base = dragBaseSelectionRef.current
      const next = new Set(base)
      if (mode === 'add') {
        within.forEach((t) => next.add(t))
      } else {
        within.forEach((t) => next.delete(t))
      }
      dragBaseSelectionRef.current = next
      setTiposSeleccionados(next)
    }

    const onUp = () => {
      setDragging(false)
      setDragContext(null)
      setDragStart(null)
      setDragRect(null)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Autoscroll continuo mientras se arrastra en listas de TIPOS, aunque el ratón permanezca quieto:
  // se basa solo en la última dirección detectada (arriba/abajo), no en que haya movimiento nuevo.
  useEffect(() => {
    if (!dragging || dragContext !== 'tipos') return

    const interval = window.setInterval(() => {
      const container =
        dragContext === 'tipos' ? tiposListaRef.current : null
      if (!container) return

      const dir = dragScrollDirRef.current
      if (!dir) return

      const edgeThreshold = 32
      const maxStep = 18

      if (dir === 'down') {
        if (container.scrollTop + container.clientHeight >= container.scrollHeight) {
          // Ya estamos al final, dejar de forzar scroll
          dragScrollDirRef.current = null
          return
        }
        // Intensidad fija hacia abajo mientras el cursor siga más allá del borde inferior lógico
        container.scrollTop += 4 + maxStep
      } else if (dir === 'up') {
        if (container.scrollTop <= 0) {
          dragScrollDirRef.current = null
          return
        }
        container.scrollTop -= 4 + maxStep
      }
    }, 40)

    return () => window.clearInterval(interval)
  }, [dragging, dragContext])

  if (cargando && !cached) return (
    <div className="loading-wrap">
      <ProgressBar percent={null} message="Cargando catálogo..." />
    </div>
  )
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <div data-tour="productos" className={dragging ? 'productos-catalogo-dragging' : ''}>
      <h1 className="page-title">Productos (catálogo)</h1>
      {productoNoEncontrado && (
        <div className="rma-no-encontrado productos-catalogo-no-encontrado" role="alert">
          No se encontró en el catálogo ningún producto que coincida con la referencia &quot;{productoDestacado}&quot;.
          {setProductoDestacado && (
            <button
              type="button"
              className="btn btn-secondary btn-sm productos-catalogo-limpiar-ref"
              onClick={() => setProductoDestacado(null)}
            >
              Quitar filtro
            </button>
          )}
        </div>
      )}
      <p className="productos-catalogo-desc">
        Productos desde la carpeta de red (caché en BD). Abre el visual (PDF o Excel) directamente desde aquí.
        {scannedAt && <span className="catalog-scanned-at"> Última actualización: {scannedAt.replace('T', ' ').slice(0, 19)}.</span>}
      </p>

      <div className="productos-catalogo-actions">
        <div className="productos-catalogo-vista-toggle" role="tablist" aria-label="Tipo de vista">
          <button
            type="button"
            role="tab"
            aria-selected={vistaCatalogo === 'lista'}
            className={`btn ${vistaCatalogo === 'lista' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setVistaCatalogo('lista'); setMarcaExpandida(null); }}
          >
            Vista lista
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={vistaCatalogo === 'marcas'}
            className={`btn ${vistaCatalogo === 'marcas' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setVistaCatalogo('marcas'); setMarcaExpandida(null); }}
          >
            Vista por marcas
          </button>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={refreshCatalog}
          disabled={refreshing}
        >
          {refreshing ? 'Actualizando…' : 'Actualizar catálogo'}
        </button>
      </div>

      {vistaCatalogo !== '' && (
        <section className="productos-catalogo-bulk" aria-label="Edición masiva de tipo de producto">
          <div className="productos-catalogo-bulk-grid">
            <div className="productos-catalogo-bulk-acciones">
              <label>
                Tipo a asignar
                <select
                  value={tipoBulk}
                  onChange={(e) => setTipoBulk(e.target.value)}
                  className="productos-catalogo-filtro-select"
                >
                  <option value="">-- Seleccionar tipo --</option>
                  {tiposProducto.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleAsignarTipoBulk}
                disabled={bulkLoading || !tipoBulk || selectedRefs.size === 0}
              >
                {bulkLoading ? 'Asignando…' : 'Asignar a seleccionados'}
              </button>
              <span className="productos-catalogo-bulk-info">
                Seleccionados: {selectedRefs.size}
              </span>
              <button
                type="button"
                className="btn btn-link btn-sm"
                onClick={() => setSelectedRefs(new Set())}
                disabled={selectedRefs.size === 0}
              >
                Limpiar selección
              </button>
              <button
                type="button"
                className="btn btn-link btn-sm"
                onClick={() => {
                  const all = new Set(
                    ordenados.map((p) => [p.brand, p.base_serial].filter(Boolean).join('|') || p.base_serial || '')
                  )
                  all.delete('')
                  setSelectedRefs(all)
                }}
                disabled={ordenados.length === 0}
              >
                Seleccionar todo el filtrado
              </button>
            </div>
            <div className="productos-catalogo-bulk-tipos">
              <div className="productos-catalogo-bulk-tipos-header">
                <label>
                  Añadir nuevo tipo
                  <input
                    type="text"
                    value={nuevoTipo}
                    onChange={(e) => setNuevoTipo(e.target.value)}
                    placeholder="Nuevo tipo de producto"
                    className="productos-catalogo-filtro-input"
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleCrearTipo}
                  disabled={!nuevoTipo.trim()}
                >
                  Guardar tipo
                </button>
              </div>
              <div className="productos-catalogo-tipos-gestion">
                <p className="productos-catalogo-tipos-gestion-title">
                  <span>Tipos disponibles</span>
                  <span className="productos-catalogo-tipos-gestion-hint">
                    (Shift+Alt y arrastrar para seleccionar varios; pulsa editar para renombrar)
                  </span>
                  {tiposSeleccionados.size > 0 && (
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      onClick={handleBorrarTipos}
                      disabled={bulkLoading}
                    >
                      Borrar {tiposSeleccionados.size} tipo{tiposSeleccionados.size > 1 ? 's' : ''}
                    </button>
                  )}
                </p>
                <div
                  className="productos-catalogo-tipos-scroll"
                  onMouseDown={onMouseDownTipos}
                  ref={tiposListaRef}
                >
                  <div className="productos-catalogo-tipos-list">
                    {tiposProducto.map((t) => {
                      const checked = tiposSeleccionados.has(t)
                      const enEdicion = tipoEnEdicion === t
                      return (
                        <div
                          key={t}
                          data-tipo={t}
                          className={`productos-catalogo-tipo-item ${checked ? 'tipo-seleccionado' : ''}`}
                        >
                          <label className="productos-catalogo-tipo-check">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleTipoSeleccion(t)}
                            />
                            <span>{t}</span>
                          </label>
                          {!enEdicion && (
                            <button
                              type="button"
                              className="btn btn-link btn-xs"
                              onClick={() => empezarEditarTipo(t)}
                            >
                              Editar
                            </button>
                          )}
                          {enEdicion && (
                            <div className="productos-catalogo-tipo-edit">
                              <input
                                type="text"
                                value={nombreTipoEdit}
                                onChange={(e) => setNombreTipoEdit(e.target.value)}
                                className="productos-catalogo-filtro-input"
                              />
                              <button
                                type="button"
                                className="btn btn-primary btn-xs"
                                onClick={guardarEditarTipo}
                                disabled={!nombreTipoEdit.trim()}
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-xs"
                                onClick={cancelarEditarTipo}
                              >
                                Cancelar
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {refreshing && (
        <ProgressBar
          percent={refreshProgress}
          message={refreshProgressMessage}
          className="catalog-refresh-progress"
        />
      )}

      {!cached && catalogo.length === 0 && !catalogError && !refreshError && (
        <p className="productos-catalogo-hint">
          No hay caché. Pulsa <strong>Actualizar catálogo</strong> para escanear la carpeta de red (QNAP).
        </p>
      )}
      {(catalogError || refreshError) && (
        <div className="productos-catalogo-error" role="alert">
          No se pudo cargar el catálogo: {catalogError || refreshError}. Comprueba la ruta en <strong>Configuración</strong> (ej. \\Qnap-approx2\z\DEPT. TEC\PRODUCTOS). El servidor debe tener acceso a la carpeta de red.
        </div>
      )}

      <section className="productos-catalogo-filtros" aria-label="Filtros">
        <div className="productos-catalogo-filtros-grid">
          <label>
            Marca
            <input
              type="text"
              value={filtroMarca}
              onChange={(e) => setFiltroMarca(e.target.value)}
              placeholder="Filtrar por marca"
              className="productos-catalogo-filtro-input"
            />
          </label>
          <label>
            Nº serie base
            <input
              type="text"
              value={filtroSerie}
              onChange={(e) => setFiltroSerie(e.target.value)}
              placeholder="Filtrar por serie"
              className="productos-catalogo-filtro-input"
            />
          </label>
          <label>
            Tipo
            <input
              type="text"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              placeholder="Filtrar por tipo"
              className="productos-catalogo-filtro-input"
            />
          </label>
          <label>
            Ordenar por
            <select
              value={columnaOrden}
              onChange={(e) => setColumnaOrden(e.target.value)}
              className="productos-catalogo-filtro-select"
            >
              <option value="base_serial">Nº serie base</option>
              <option value="brand">Marca</option>
              <option value="product_type">Tipo</option>
              <option value="creation_date">Fecha creación</option>
            </select>
          </label>
          <label>
            <select
              value={ordenAsc ? 'asc' : 'desc'}
              onChange={(e) => setOrdenAsc(e.target.value === 'asc')}
              className="productos-catalogo-filtro-select"
            >
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setFiltroMarca('')
              setFiltroSerie('')
              setFiltroTipo('')
              setPagina(1)
            }}
          >
            Limpiar filtros
          </button>
        </div>
      </section>

      {catalogo.length === 0 && !catalogError ? (
        <p className="productos-catalogo-empty">
          No hay productos en el catálogo. Configura la ruta en <strong>Configuración</strong> (menú superior)
          — carpeta de red, ej. \\Qnap-approx2\z\DEPT. TEC\PRODUCTOS.
        </p>
      ) : catalogo.length === 0 && catalogError ? null : vistaCatalogo === 'marcas' ? (
        <>
          <section className="productos-catalogo-marcas" aria-label="Catálogo por marcas">
            <div className="productos-catalogo-marcas-grid">
              {porMarca.map(({ marca, productos }) => (
                <button
                  type="button"
                  key={marca}
                  className={`productos-catalogo-marca-card ${marcaExpandida === marca ? 'productos-catalogo-marca-card--activa' : ''}`}
                  onClick={() => setMarcaExpandida((prev) => (prev === marca ? null : marca))}
                  aria-expanded={marcaExpandida === marca}
                >
                  <span className="productos-catalogo-marca-icono" aria-hidden>◉</span>
                  <span className="productos-catalogo-marca-nombre">{formatBrand(marca)}</span>
                </button>
              ))}
            </div>
            {marcaExpandida && (() => {
              const { productos: productosMarca } = porMarca.find((r) => r.marca === marcaExpandida) ?? { productos: [] }
              return (
                <div className="productos-catalogo-marca-detalle">
                  <h3 className="productos-catalogo-marca-detalle-titulo">{formatBrand(marcaExpandida)}</h3>
                  <div
                    className="table-wrapper tabla-productos-catalogo tabla-productos-catalogo--compacta"
                    ref={tablaRef}
                    onMouseDown={onMouseDownTabla}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              checked={
                                productosMarca.length > 0 &&
                                productosMarca.every((p) => {
                                  const ref = [p.brand || marcaExpandida, p.base_serial].filter(Boolean).join('|') || p.base_serial || ''
                                  return ref && selectedRefs.has(ref)
                                })
                              }
                              onChange={(e) => {
                                const checked = e.target.checked
                                const next = new Set(selectedRefs)
                                productosMarca.forEach((p) => {
                                  const ref = [p.brand || marcaExpandida, p.base_serial].filter(Boolean).join('|') || p.base_serial || ''
                                  if (!ref) return
                                  if (checked) next.add(ref)
                                  else next.delete(ref)
                                })
                                setSelectedRefs(next)
                              }}
                              title="Seleccionar todos los productos de esta marca"
                            />
                          </th>
                          <th>Nº serie base</th>
                          <th>Tipo</th>
                          <th>Fecha creación</th>
                          <th>Visual</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productosMarca.map((p, i) => {
                          const ref = [p.brand || marcaExpandida, p.base_serial].filter(Boolean).join('|') || p.base_serial || ''
                          const checked = !!ref && selectedRefs.has(ref)
                          return (
                          <tr
                            key={`${p.base_serial}-${p.folder_rel}-${i}`}
                            data-product-ref={ref}
                            className={checked ? 'producto-row-seleccionado' : ''}
                          >
                            <td className="productos-catalogo-col-select">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSeleccionProducto({ ...p, brand: p.brand || marcaExpandida })}
                                title="Seleccionar producto para edición masiva"
                              />
                            </td>
                            <td>{p.base_serial ?? '-'}</td>
                            <td>{p.product_type ?? '-'}</td>
                            <td>{p.creation_date ?? '-'}</td>
                            <td className="productos-catalogo-visual">
                              {p.visual_pdf_rel && (
                                <a href={urlArchivo(p.visual_pdf_rel)} target="_blank" rel="noopener noreferrer" className="btn btn-link">Abrir PDF</a>
                              )}
                              {p.visual_excel_rel && (
                                <>
                                  {p.visual_pdf_rel && ' '}
                                  <a href={urlArchivo(p.visual_excel_rel)} target="_blank" rel="noopener noreferrer" className="btn btn-link">Abrir Excel</a>
                                </>
                              )}
                              {!p.visual_pdf_rel && !p.visual_excel_rel && '-'}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-notificar btn-sm"
                                onClick={() => {
                                  const brand = (p.brand || '').trim() || marcaExpandida
                                  setNotificarRef({ product_ref: `${brand}|${p.base_serial || ''}`, brand, base_serial: p.base_serial })
                                  setNotificarOpen(true)
                                }}
                                title="Notificar a un usuario (compartir este producto)"
                              >
                                Notificar
                              </button>
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}
          </section>
        </>
      ) : (
        <>
          <div
            className="table-wrapper tabla-productos-catalogo"
            ref={tablaRef}
            onMouseDown={onMouseDownTabla}
          >
            <table>
              <thead>
                <tr>
                  <th className="productos-catalogo-col-select">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={(e) => seleccionarPaginaActual(e.target.checked)}
                      title="Seleccionar todos los productos de esta página"
                    />
                  </th>
                  <th>Marca</th>
                  <th>Nº serie base</th>
                  <th>Tipo</th>
                  <th>Fecha creación</th>
                  <th>Visual</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {enPagina.map((p, i) => (
                  <tr
                    key={`${p.base_serial}-${p.folder_rel}-${i}`}
                    data-product-ref={[p.brand, p.base_serial].filter(Boolean).join('|') || p.base_serial || ''}
                    className={(() => {
                      const ref = [p.brand, p.base_serial].filter(Boolean).join('|') || p.base_serial || ''
                      return ref && selectedRefs.has(ref) ? 'producto-row-seleccionado' : ''
                    })()}
                  >
                    <td className="productos-catalogo-col-select">
                      <input
                        type="checkbox"
                        checked={(() => {
                          const ref = [p.brand, p.base_serial].filter(Boolean).join('|') || p.base_serial || ''
                          return !!ref && selectedRefs.has(ref)
                        })()}
                        onChange={() => toggleSeleccionProducto(p)}
                        title="Seleccionar producto para edición masiva"
                      />
                    </td>
                    <td>{formatBrand(p.brand) || '-'}</td>
                    <td>{p.base_serial ?? '-'}</td>
                    <td>{p.product_type ?? '-'}</td>
                    <td>{p.creation_date ?? '-'}</td>
                    <td className="productos-catalogo-visual">
                      {p.visual_pdf_rel && (
                        <a
                          href={urlArchivo(p.visual_pdf_rel)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-link"
                        >
                          Abrir PDF
                        </a>
                      )}
                      {p.visual_excel_rel && (
                        <>
                          {p.visual_pdf_rel && ' '}
                          <a
                            href={urlArchivo(p.visual_excel_rel)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-link"
                          >
                            Abrir Excel
                          </a>
                        </>
                      )}
                      {!p.visual_pdf_rel && !p.visual_excel_rel && '-'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-notificar btn-sm"
                        onClick={() => {
                          setNotificarRef({ product_ref: `${p.brand || ''}|${p.base_serial || ''}`, brand: p.brand, base_serial: p.base_serial })
                          setNotificarOpen(true)
                        }}
                        title="Notificar a un usuario (compartir este producto)"
                      >
                        Notificar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacion
            inicio={inicio}
            fin={inicio + enPagina.length}
            total={ordenados.length}
            pagina={pagina}
            totalPaginas={totalPaginas}
            setPagina={setPagina}
          />
        </>
      )}

      {dragRect && (
        <div
          className="productos-catalogo-drag-rect"
          style={{
            left: dragRect.x,
            top: dragRect.y,
            width: dragRect.width,
            height: dragRect.height,
          }}
        />
      )}

      {dragRect && dragging && (
        <div
          className="productos-catalogo-drag-rect"
          style={{
            left: `${dragRect.x}px`,
            top: `${dragRect.y}px`,
            width: `${dragRect.width}px`,
            height: `${dragRect.height}px`,
          }}
        />
      )}

      <ModalNotificar
        open={notificarOpen}
        onClose={() => { setNotificarOpen(false); setNotificarRef(null); }}
        type="catalogo"
        referenceData={notificarRef || {}}
      />
    </div>
  )
}

export default Productos
