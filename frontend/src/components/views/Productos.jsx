import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { API_URL, AUTH_STORAGE_KEY, POR_PAGINA } from '../../constants'
import { compararValores } from '../../utils/garantia'
import Paginacion from '../Paginacion'
import ProgressBar from '../ProgressBar'
import { useCatalogRefresh } from '../../context/CatalogRefreshContext'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
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

  if (cargando && !cached) return (
    <div className="loading-wrap">
      <ProgressBar percent={null} message="Cargando catálogo..." />
    </div>
  )
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <>
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
                  <span className="productos-catalogo-marca-nombre">{marca}</span>
                </button>
              ))}
            </div>
            {marcaExpandida && (() => {
              const { productos: productosMarca } = porMarca.find((r) => r.marca === marcaExpandida) ?? { productos: [] }
              return (
                <div className="productos-catalogo-marca-detalle">
                  <h3 className="productos-catalogo-marca-detalle-titulo">{marcaExpandida}</h3>
                  <div className="table-wrapper tabla-productos-catalogo tabla-productos-catalogo--compacta">
                    <table>
                      <thead>
                        <tr>
                          <th>Nº serie base</th>
                          <th>Tipo</th>
                          <th>Fecha creación</th>
                          <th>Visual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productosMarca.map((p, i) => (
                          <tr key={`${p.base_serial}-${p.folder_rel}-${i}`}>
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
                          </tr>
                        ))}
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
          <div className="table-wrapper tabla-productos-catalogo">
            <table>
              <thead>
                <tr>
                  <th>Marca</th>
                  <th>Nº serie base</th>
                  <th>Tipo</th>
                  <th>Fecha creación</th>
                  <th>Visual</th>
                </tr>
              </thead>
              <tbody>
                {enPagina.map((p, i) => (
                  <tr key={`${p.base_serial}-${p.folder_rel}-${i}`}>
                    <td>{p.brand ?? '-'}</td>
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
    </>
  )
}

export default Productos
