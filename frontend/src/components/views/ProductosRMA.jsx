import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { API_URL, AUTH_STORAGE_KEY, POR_PAGINA, COLUMNAS_PRODUCTOS_RMA, VISTAS } from '../../constants'
import { compararValores } from '../../utils/garantia'
import Paginacion from '../Paginacion'
import ProgressBar from '../ProgressBar'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

function formatDate(s) {
  if (!s) return '-'
  try {
    return new Date(s).toLocaleDateString('es-ES')
  } catch {
    return s
  }
}

function parseDateInput(s) {
  if (!s || typeof s !== 'string') return null
  const t = s.trim()
  if (!t) return null
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d
}

function renderFilaProductoRma(row, serialExpandido, setSerialExpandido, handleGarantiaChange, formatDate, setVista, setSerialDestacado, setProductoDestacado) {
  const items = Array.isArray(row.items) ? row.items : []
  const n = items.length
  const abierto = serialExpandido === row.serial
  const serial = row.serial ?? ''
  const productName = row.product_name ?? ''
  return (
    <React.Fragment key={row.serial}>
      <tr>
        <td>
          {n === 0 ? (
            serial && setSerialDestacado && setVista ? (
              <button
                type="button"
                className="link-celda"
                onClick={() => {
                  setSerialDestacado(serial)
                  setVista(VISTAS.RMA)
                }}
                title={`Ir al listado RMA: ${serial}`}
              >
                {serial}
              </button>
            ) : (
              row.serial
            )
          ) : (
            <div className="celda-desplegable celda-serial-rma">
              {serial && setSerialDestacado && setVista ? (
                <button
                  type="button"
                  className="link-celda productos-rma-link-serial"
                  onClick={() => {
                    setSerialDestacado(serial)
                    setVista(VISTAS.RMA)
                  }}
                  title={`Ir al listado RMA: ${serial}`}
                >
                  {row.serial}
                </button>
              ) : (
                <span>{row.serial}</span>
              )}
              <button
                type="button"
                className="link-celda btn-desplegable"
                onClick={() => setSerialExpandido(abierto ? null : row.serial)}
                aria-expanded={abierto}
              >
                {abierto ? '▼' : '▶'} ({n} {n === 1 ? 'línea' : 'líneas'})
              </button>
            </div>
          )}
        </td>
        <td>
          {productName && setProductoDestacado && setVista ? (
            <button
              type="button"
              className="link-celda"
              onClick={() => {
                setProductoDestacado(productName)
                setVista(VISTAS.PRODUCTOS)
              }}
              title={`Ir al catálogo: ${productName}`}
            >
              {productName}
            </button>
          ) : (
            row.product_name ?? '-'
          )}
        </td>
        <td>{row.count}</td>
        <td>{formatDate(row.first_date)}</td>
        <td>{formatDate(row.last_date)}</td>
        <td>
          {Array.isArray(row.clients_sample) && row.clients_sample.length > 0
            ? row.clients_sample.join(', ')
            : '-'}
        </td>
        <td>
          <label className="productos-rma-garantia-label">
            <input
              type="checkbox"
              checked={!!row.garantia_vigente}
              onChange={(e) => {
                const v = e.target.checked
                const msg = v
                  ? '¿Marcar la garantía como vigente?'
                  : '¿Marcar la garantía como no vigente?'
                if (!window.confirm(msg)) return
                handleGarantiaChange(row.serial, v)
              }}
              aria-label={`Garantía vigente: ${row.serial}`}
            />
            <span>{row.garantia_vigente ? 'Sí' : 'No'}</span>
          </label>
        </td>
      </tr>
      {abierto && n > 0 && (
        <tr className="fila-desplegable">
          <td colSpan={7} className="td-desplegable">
            <div className="desplegable-detalle">
              <table className="tabla-desplegable">
                <thead>
                  <tr>
                    <th>Nº RMA</th>
                    <th>Producto</th>
                    <th>Nº serie</th>
                    <th>Cliente</th>
                    <th>Fecha recibido</th>
                    <th>Avería</th>
                    <th>Observaciones</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, j) => (
                    <tr key={item.id ?? j}>
                      <td>{item['NÂº DE RMA'] ?? item['Nº DE RMA'] ?? '-'}</td>
                      <td>{item.PRODUCTO ?? '-'}</td>
                      <td>{item['Nº DE SERIE'] ?? '-'}</td>
                      <td>{item['RAZON SOCIAL O NOMBRE'] ?? '-'}</td>
                      <td>{item['FECHA RECIBIDO'] ? formatDate(item['FECHA RECIBIDO']) : '-'}</td>
                      <td>
                        {(item.AVERIA ?? '').toString().slice(0, 50)}
                        {item.AVERIA?.length > 50 ? '…' : ''}
                      </td>
                      <td>
                        {(item.OBSERVACIONES ?? '').toString().slice(0, 50)}
                        {item.OBSERVACIONES?.length > 50 ? '…' : ''}
                      </td>
                      <td>{item.estado ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  )
}

function ProductosRMA() {
  const [list, setList] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [pagina, setPagina] = useState(1)

  const [filtroSerial, setFiltroSerial] = useState('')
  const [filtroProducto, setFiltroProducto] = useState('')
  const [filtroGarantia, setFiltroGarantia] = useState('todos')
  const [filtroPrimeraDesde, setFiltroPrimeraDesde] = useState('')
  const [filtroPrimeraHasta, setFiltroPrimeraHasta] = useState('')
  const [filtroUltimaDesde, setFiltroUltimaDesde] = useState('')
  const [filtroUltimaHasta, setFiltroUltimaHasta] = useState('')
  const [filtroCountMin, setFiltroCountMin] = useState('')
  const [filtroClientes, setFiltroClientes] = useState('')
  const [columnaOrden, setColumnaOrden] = useState('serial')
  const [ordenAsc, setOrdenAsc] = useState(true)
  const [serialExpandido, setSerialExpandido] = useState(null)
  const [paginaSinFecha, setPaginaSinFecha] = useState(1)

  const refetch = useCallback(() => {
    setCargando(true)
    setError(null)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)
    fetch(`${API_URL}/api/productos-rma`, { headers: getAuthHeaders(), signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 ? 'Sesión expirada' : 'Error al cargar productos RMA')
        return res.json()
      })
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.name === 'AbortError' ? 'Tiempo de espera agotado' : (err.message || 'Error al cargar')))
      .finally(() => {
        clearTimeout(timeoutId)
        setCargando(false)
      })
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  // Aplicar serial al llegar desde Listado RMA
  useEffect(() => {
    if (serialDestacado && String(serialDestacado).trim()) {
      setFiltroSerial(String(serialDestacado).trim())
      setPagina(1)
      setPaginaSinFecha(1)
      setSerialDestacado?.(null)
    }
  }, [serialDestacado, setSerialDestacado])

  useEffect(() => {
    setPagina(1)
    setPaginaSinFecha(1)
  }, [filtroSerial, filtroProducto, filtroGarantia, filtroPrimeraDesde, filtroPrimeraHasta, filtroUltimaDesde, filtroUltimaHasta, filtroCountMin, filtroClientes])

  const filtrados = useMemo(() => {
    let result = list
    const ser = (filtroSerial || '').trim().toLowerCase()
    if (ser) {
      result = result.filter((row) =>
        (row.serial || '').toLowerCase().includes(ser)
      )
    }
    const prod = (filtroProducto || '').trim().toLowerCase()
    if (prod) {
      result = result.filter((row) =>
        (row.product_name || '').toLowerCase().includes(prod)
      )
    }
    if (filtroGarantia === 'vigente') {
      result = result.filter((row) => !!row.garantia_vigente)
    } else if (filtroGarantia === 'no_vigente') {
      result = result.filter((row) => !row.garantia_vigente)
    }
    const primeraDesde = parseDateInput(filtroPrimeraDesde)
    if (primeraDesde) {
      result = result.filter((row) => {
        const d = parseDateInput(row.first_date)
        return d && d >= primeraDesde
      })
    }
    const primeraHasta = parseDateInput(filtroPrimeraHasta)
    if (primeraHasta) {
      result = result.filter((row) => {
        const d = parseDateInput(row.first_date)
        return d && d <= primeraHasta
      })
    }
    const ultimaDesde = parseDateInput(filtroUltimaDesde)
    if (ultimaDesde) {
      result = result.filter((row) => {
        const d = parseDateInput(row.last_date)
        return d && d >= ultimaDesde
      })
    }
    const ultimaHasta = parseDateInput(filtroUltimaHasta)
    if (ultimaHasta) {
      result = result.filter((row) => {
        const d = parseDateInput(row.last_date)
        return d && d <= ultimaHasta
      })
    }
    const countMin = parseInt(filtroCountMin, 10)
    if (!Number.isNaN(countMin) && countMin > 0) {
      result = result.filter((row) => (row.count || 0) >= countMin)
    }
    const clientes = (filtroClientes || '').trim().toLowerCase()
    if (clientes) {
      result = result.filter((row) => {
        const sample = Array.isArray(row.clients_sample)
          ? row.clients_sample.join(' ')
          : ''
        return sample.toLowerCase().includes(clientes)
      })
    }
    return result
  }, [
    list,
    filtroSerial,
    filtroProducto,
    filtroGarantia,
    filtroPrimeraDesde,
    filtroPrimeraHasta,
    filtroUltimaDesde,
    filtroUltimaHasta,
    filtroCountMin,
    filtroClientes,
  ])

  const getValorOrden = (row, key) => {
    const v = row[key]
    if (key === 'garantia_vigente') return v ? 1 : 0
    if (key === 'count') return typeof v === 'number' ? v : parseInt(v, 10) || 0
    if (key === 'first_date' || key === 'last_date') return v || ''
    if (key === 'serial') return (v ?? '').toString()
    return (v ?? '').toString()
  }

  const hasValidFirstDate = useCallback((row) => parseDateInput(row.first_date) !== null, [])

  const { conFechaValida, sinFechaValida } = useMemo(() => {
    const con = filtrados.filter(hasValidFirstDate)
    const sin = filtrados.filter((row) => !hasValidFirstDate(row))
    return { conFechaValida: con, sinFechaValida: sin }
  }, [filtrados, hasValidFirstDate])

  const ordenadosConFecha = useMemo(() => {
    return [...conFechaValida].sort((a, b) => {
      const va = getValorOrden(a, columnaOrden)
      const vb = getValorOrden(b, columnaOrden)
      return compararValores(va, vb, ordenAsc)
    })
  }, [conFechaValida, columnaOrden, ordenAsc])

  const ordenadosSinFecha = useMemo(() => {
    return [...sinFechaValida].sort((a, b) => {
      const va = getValorOrden(a, columnaOrden)
      const vb = getValorOrden(b, columnaOrden)
      return compararValores(va, vb, ordenAsc)
    })
  }, [sinFechaValida, columnaOrden, ordenAsc])

  const totalPaginas = Math.ceil(ordenadosConFecha.length / POR_PAGINA) || 1
  const inicio = (pagina - 1) * POR_PAGINA
  const enPagina = ordenadosConFecha.slice(inicio, inicio + POR_PAGINA)

  const totalPaginasSinFecha = Math.ceil(ordenadosSinFecha.length / POR_PAGINA) || 1
  const inicioSinFecha = (paginaSinFecha - 1) * POR_PAGINA
  const enPaginaSinFecha = ordenadosSinFecha.slice(inicioSinFecha, inicioSinFecha + POR_PAGINA)

  const handleGarantiaChange = useCallback(
    async (serial, vigente) => {
      const encoded = encodeURIComponent(serial)
      const res = await fetch(
        `${API_URL}/api/productos-rma/${encoded}/garantia`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ vigente }),
        }
      )
      if (res.ok) refetch()
    },
    [refetch]
  )

  const limpiarFiltros = useCallback(() => {
    setFiltroSerial('')
    setFiltroProducto('')
    setFiltroGarantia('todos')
    setFiltroPrimeraDesde('')
    setFiltroPrimeraHasta('')
    setFiltroUltimaDesde('')
    setFiltroUltimaHasta('')
    setFiltroCountMin('')
    setFiltroClientes('')
    setPagina(1)
    setPaginaSinFecha(1)
  }, [])

  const hayFiltros =
    filtroSerial ||
    filtroProducto ||
    filtroGarantia !== 'todos' ||
    filtroPrimeraDesde ||
    filtroPrimeraHasta ||
    filtroUltimaDesde ||
    filtroUltimaHasta ||
    filtroCountMin ||
    filtroClientes

  const mostrarSerialNoEncontrado =
    !cargando &&
    list.length > 0 &&
    filtroSerial.trim() !== '' &&
    ordenadosConFecha.length === 0 &&
    ordenadosSinFecha.length === 0

  if (cargando) return (
    <div className="loading-wrap">
      <ProgressBar percent={null} message="Cargando productos RMA..." />
    </div>
  )
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <>
      <h1 className="page-title">Productos RMA</h1>
      {mostrarSerialNoEncontrado && (
        <div className="rma-no-encontrado productos-rma-no-encontrado" role="alert">
          No se encontró ningún producto RMA con ese número de serie.
        </div>
      )}
      <p className="productos-rma-desc">
        Lista por número de serie completo (clave primaria). No aparecen productos
        que formen parte de la lista oculta. Los que tienen fecha válida se muestran
        primero; los de fecha inválida van en una lista aparte debajo. La expiración
        de garantía se calcula desde la primera fecha (más de 3 años = expirada).
      </p>

      <section className="productos-rma-filtros" aria-labelledby="productos-rma-filtros-titulo">
        <h2 id="productos-rma-filtros-titulo" className="productos-rma-filtros-titulo">
          Filtros
        </h2>
        <div className="productos-rma-filtros-grid">
          <label className="productos-rma-filtro-label">
            Nº de serie
            <input
              type="text"
              className="productos-rma-filtro-input"
              placeholder="Buscar por número de serie..."
              value={filtroSerial}
              onChange={(e) => {
                setFiltroSerial(e.target.value)
                setPagina(1)
              }}
            />
          </label>
          <label className="productos-rma-filtro-label">
            Producto
            <input
              type="text"
              className="productos-rma-filtro-input"
              placeholder="Buscar por nombre..."
              value={filtroProducto}
              onChange={(e) => {
                setFiltroProducto(e.target.value)
                setPagina(1)
              }}
            />
          </label>
          <label className="productos-rma-filtro-label">
            Garantía
            <select
              className="productos-rma-filtro-select"
              value={filtroGarantia}
              onChange={(e) => {
                setFiltroGarantia(e.target.value)
                setPagina(1)
              }}
            >
              <option value="todos">Todas</option>
              <option value="vigente">Vigente</option>
              <option value="no_vigente">No vigente</option>
            </select>
          </label>
          <label className="productos-rma-filtro-label">
            Primera fecha desde
            <input
              type="date"
              className="productos-rma-filtro-input"
              value={filtroPrimeraDesde}
              onChange={(e) => {
                setFiltroPrimeraDesde(e.target.value)
                setPagina(1)
              }}
            />
          </label>
          <label className="productos-rma-filtro-label">
            Primera fecha hasta
            <input
              type="date"
              className="productos-rma-filtro-input"
              value={filtroPrimeraHasta}
              onChange={(e) => {
                setFiltroPrimeraHasta(e.target.value)
                setPagina(1)
              }}
            />
          </label>
          <label className="productos-rma-filtro-label">
            Última fecha desde
            <input
              type="date"
              className="productos-rma-filtro-input"
              value={filtroUltimaDesde}
              onChange={(e) => {
                setFiltroUltimaDesde(e.target.value)
                setPagina(1)
              }}
            />
          </label>
          <label className="productos-rma-filtro-label">
            Última fecha hasta
            <input
              type="date"
              className="productos-rma-filtro-input"
              value={filtroUltimaHasta}
              onChange={(e) => {
                setFiltroUltimaHasta(e.target.value)
                setPagina(1)
              }}
            />
          </label>
          <label className="productos-rma-filtro-label">
            Nº RMAs mínimo
            <input
              type="number"
              min="1"
              className="productos-rma-filtro-input"
              placeholder="1"
              value={filtroCountMin}
              onChange={(e) => {
                setFiltroCountMin(e.target.value)
                setPagina(1)
              }}
            />
          </label>
          <label className="productos-rma-filtro-label">
            Clientes (texto)
            <input
              type="text"
              className="productos-rma-filtro-input"
              placeholder="Buscar en clientes..."
              value={filtroClientes}
              onChange={(e) => {
                setFiltroClientes(e.target.value)
                setPagina(1)
              }}
            />
          </label>
        </div>
        <div className="productos-rma-filtros-extra">
          <label className="productos-rma-filtro-label">
            Ordenar por
            <select
              className="productos-rma-filtro-select"
              value={columnaOrden}
              onChange={(e) => {
                setColumnaOrden(e.target.value)
                setPagina(1)
              }}
            >
              {COLUMNAS_PRODUCTOS_RMA.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="productos-rma-filtro-label productos-rma-orden-direccion">
            <select
              className="productos-rma-filtro-select"
              value={ordenAsc ? 'asc' : 'desc'}
              onChange={(e) => {
                setOrdenAsc(e.target.value === 'asc')
                setPagina(1)
              }}
            >
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </select>
          </label>
          {hayFiltros && (
            <button
              type="button"
              className="btn btn-limpiar productos-rma-limpiar"
              onClick={limpiarFiltros}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </section>

      <section className="productos-rma-seccion" aria-labelledby="productos-rma-con-fecha">
        <h2 id="productos-rma-con-fecha" className="productos-rma-seccion-titulo">
          Con fecha válida
        </h2>
        <div className="table-wrapper table-wrapper-productos-rma tabla-productos-rma">
          <table>
            <thead>
              <tr>
                <th>Nº de serie</th>
                <th>Producto</th>
                <th>Nº líneas</th>
                <th>Primera fecha</th>
                <th>Última fecha</th>
                <th>Clientes (muestra)</th>
                <th>Garantía vigente</th>
              </tr>
            </thead>
            <tbody>
              {enPagina.map((row) => renderFilaProductoRma(row, serialExpandido, setSerialExpandido, handleGarantiaChange, formatDate))}
            </tbody>
          </table>
        </div>
        <Paginacion
          inicio={inicio}
          fin={inicio + POR_PAGINA}
          total={ordenadosConFecha.length}
          pagina={pagina}
          totalPaginas={totalPaginas}
          setPagina={setPagina}
        />
        {ordenadosConFecha.length === 0 && (
          <p className="productos-rma-empty">
            {conFechaValida.length === 0 && sinFechaValida.length === 0
              ? (list.length === 0 ? 'No hay números de serie con RMA visibles.' : 'Ningún registro coincide con los filtros.')
              : 'Ningún registro con fecha válida.'}
          </p>
        )}
      </section>

      {ordenadosSinFecha.length > 0 && (
        <section className="productos-rma-seccion productos-rma-seccion-sin-fecha" aria-labelledby="productos-rma-sin-fecha">
          <h2 id="productos-rma-sin-fecha" className="productos-rma-seccion-titulo">
            Sin fecha válida
          </h2>
          <div className="table-wrapper table-wrapper-productos-rma tabla-productos-rma">
            <table>
              <thead>
                <tr>
                  <th>Nº de serie</th>
                  <th>Producto</th>
                  <th>Nº líneas</th>
                  <th>Primera fecha</th>
                  <th>Última fecha</th>
                  <th>Clientes (muestra)</th>
                  <th>Garantía vigente</th>
                </tr>
              </thead>
              <tbody>
                {enPaginaSinFecha.map((row) => renderFilaProductoRma(row, serialExpandido, setSerialExpandido, handleGarantiaChange, formatDate, setVista, setSerialDestacado, setProductoDestacado))}
              </tbody>
            </table>
          </div>
          <Paginacion
            inicio={inicioSinFecha}
            fin={inicioSinFecha + POR_PAGINA}
            total={ordenadosSinFecha.length}
            pagina={paginaSinFecha}
            totalPaginas={totalPaginasSinFecha}
            setPagina={setPaginaSinFecha}
          />
        </section>
      )}
    </>
  )
}

export default ProductosRMA
