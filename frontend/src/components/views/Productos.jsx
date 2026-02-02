import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { API_URL, AUTH_STORAGE_KEY, POR_PAGINA } from '../../constants'
import { compararValores } from '../../utils/garantia'
import Paginacion from '../Paginacion'

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
function Productos({ productoDestacado }) {
  const [catalogo, setCatalogo] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [filtroMarca, setFiltroMarca] = useState('')
  const [filtroSerie, setFiltroSerie] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [columnaOrden, setColumnaOrden] = useState('base_serial')
  const [ordenAsc, setOrdenAsc] = useState(true)
  const [pagina, setPagina] = useState(1)

  const refetch = useCallback(() => {
    setCargando(true)
    setError(null)
    fetch(`${API_URL}/api/productos-catalogo`, { headers: getAuthHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error('Error al cargar catálogo')
        return res.json()
      })
      .then((data) => setCatalogo(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

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

  const urlArchivo = (pathRel) => {
    if (!pathRel) return null
    const base = API_URL || ''
    return `${base}/api/productos-catalogo/archivo?path=${encodeURIComponent(pathRel)}`
  }

  if (cargando) return <p className="loading">Cargando catálogo...</p>
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <>
      <h1 className="page-title">Productos (catálogo)</h1>
      <p className="productos-catalogo-desc">
        Productos desde la carpeta de red. Abre el visual (PDF o Excel) directamente desde aquí.
      </p>

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

      {catalogo.length === 0 ? (
        <p className="productos-catalogo-empty">
          No hay productos en el catálogo. Configura la ruta en <strong>Configuración</strong> (menú superior)
          — carpeta de red, ej. \\Qnap-approx2\z\DEPT. TEC\PRODUCTOS.
        </p>
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
