import React, { useState, useMemo, useCallback } from 'react'
import { useGarantia } from '../../context/GarantiaContext'
import { POR_PAGINA, OPCIONES_ESTADO, API_URL, AUTH_STORAGE_KEY } from '../../constants'
import {
  getRmaId,
  getValorOrden,
  getValorFiltro,
  getClaveFechaReal,
  getColumnasFiltroRma,
  compararValores,
} from '../../utils/garantia'
import HerramientasTabla from '../HerramientasTabla'
import Paginacion from '../Paginacion'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

function ListadoRMA({ setVista, setClienteDestacado, setProductoDestacado }) {
  const {
    productosVisibles,
    cargando,
    error,
    getSerie,
    getEstadoLabel,
    estadoRma,
    setEditandoRmaId,
    ocultarRmaGroup,
    claveSerieReal,
    refetchProductos,
  } = useGarantia()

  const [pagina, setPagina] = useState(1)
  const [columnaFiltro, setColumnaFiltro] = useState('PRODUCTO')
  const [valorFiltro, setValorFiltro] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('__todos__') // __todos__ = todos, '' = sin estado, 'abonado', etc.
  const [filtroFechaRecogidaDesde, setFiltroFechaRecogidaDesde] = useState('')
  const [filtroFechaRecogidaHasta, setFiltroFechaRecogidaHasta] = useState('')
  const [columnaOrden, setColumnaOrden] = useState('FECHA RECIBIDO')
  const [ordenAsc, setOrdenAsc] = useState(false)
  const [productosDesplegableAbierto, setProductosDesplegableAbierto] =
    useState(null)
  const [selectedRmaIds, setSelectedRmaIds] = useState(new Set())
  const [estadoMasivo, setEstadoMasivo] = useState('')
  const [aplicandoMasivo, setAplicandoMasivo] = useState(false)

  const columnasFiltro = useMemo(
    () => getColumnasFiltroRma(claveSerieReal),
    [claveSerieReal]
  )

  const grupos = useMemo(() => {
    const byId = {}
    const list = []
    productosVisibles.forEach((p) => {
      const id = getRmaId(p)
      if (!byId[id]) {
        byId[id] = { rmaId: id, items: [] }
        list.push(byId[id])
      }
      byId[id].items.push(p)
    })
    return list
  }, [productosVisibles])

  const gruposFiltrados = useMemo(() => {
    if (!valorFiltro.trim()) return grupos
    const key = columnaFiltro === 'NÂº DE RMA' ? columnaFiltro : columnaFiltro
    const busqueda = valorFiltro.trim().toLowerCase()
    return grupos.filter((g) =>
      g.items.some((p) => getValorFiltro(p, key).includes(busqueda))
    )
  }, [grupos, valorFiltro, columnaFiltro])

  const gruposFiltradosPorEstado = useMemo(() => {
    if (estadoFiltro === '__todos__') return gruposFiltrados
    return gruposFiltrados.filter((g) => {
      const estado = (estadoRma[g.rmaId] ?? '').trim()
      return estado === estadoFiltro
    })
  }, [gruposFiltrados, estadoFiltro, estadoRma])

  const gruposFiltradosPorFechaRecogida = useMemo(() => {
    let result = gruposFiltradosPorEstado
    if (filtroFechaRecogidaDesde) {
      const desde = filtroFechaRecogidaDesde.trim().slice(0, 10)
      if (desde) {
        result = result.filter((g) => {
          const f = (g.items[0] && g.items[0]['FECHA RECOGIDA']) ? String(g.items[0]['FECHA RECOGIDA']).trim().slice(0, 10) : ''
          return f && f >= desde
        })
      }
    }
    if (filtroFechaRecogidaHasta) {
      const hasta = filtroFechaRecogidaHasta.trim().slice(0, 10)
      if (hasta) {
        result = result.filter((g) => {
          const f = (g.items[0] && g.items[0]['FECHA RECOGIDA']) ? String(g.items[0]['FECHA RECOGIDA']).trim().slice(0, 10) : ''
          return f && f <= hasta
        })
      }
    }
    return result
  }, [gruposFiltradosPorEstado, filtroFechaRecogidaDesde, filtroFechaRecogidaHasta])

  const claveFechaReal = useMemo(
    () =>
      gruposFiltradosPorEstado.length && gruposFiltradosPorEstado[0].items[0]
        ? getClaveFechaReal(gruposFiltradosPorEstado[0].items[0])
        : 'FECHA RECIBIDO',
    [gruposFiltradosPorEstado]
  )
  const isEmptyVal = (x) =>
    x === '' || (typeof x === 'number' && Number.isNaN(x))
  const tieneValorFecha = (p) =>
    !isEmptyVal(getValorOrden(p, claveFechaReal))

  const gruposOrdenados = useMemo(() => {
    if (columnaOrden === 'FECHA RECIBIDO') {
      const conFecha = gruposFiltradosPorFechaRecogida.filter((g) =>
        tieneValorFecha(g.items[0])
      )
      const sinFecha = gruposFiltradosPorFechaRecogida.filter(
        (g) => !tieneValorFecha(g.items[0])
      )
      conFecha.sort((a, b) => {
        const va = getValorOrden(a.items[0], claveFechaReal)
        const vb = getValorOrden(b.items[0], claveFechaReal)
        return ordenAsc ? va - vb : vb - va
      })
      return [...conFecha, ...sinFecha]
    }
    return [...gruposFiltradosPorFechaRecogida].sort((a, b) => {
      const va = getValorOrden(a.items[0], columnaOrden)
      const vb = getValorOrden(b.items[0], columnaOrden)
      if (isEmptyVal(va) && isEmptyVal(vb)) return 0
      if (isEmptyVal(va)) return 1
      if (isEmptyVal(vb)) return -1
      const bothNumbers =
        typeof va === 'number' &&
        typeof vb === 'number' &&
        !Number.isNaN(va) &&
        !Number.isNaN(vb)
      const cmp = bothNumbers
        ? va - vb
        : String(va).localeCompare(String(vb), 'es')
      return ordenAsc ? cmp : -cmp
    })
  }, [gruposFiltradosPorFechaRecogida, columnaOrden, ordenAsc, claveFechaReal])

  const totalPaginas = Math.ceil(gruposOrdenados.length / POR_PAGINA) || 1
  const inicio = (pagina - 1) * POR_PAGINA
  const fin = inicio + POR_PAGINA
  const gruposEnPagina = gruposOrdenados.slice(inicio, fin)

  const toggleSelect = useCallback((grupo) => {
    const id = grupo?.rmaId ?? getRmaId(grupo?.items?.[0])
    if (!id) return
    setSelectedRmaIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAllPage = useCallback(() => {
    const ids = new Set(gruposEnPagina.map((g) => g.rmaId).filter(Boolean))
    const allSelected = ids.size > 0 && [...ids].every((id) => selectedRmaIds.has(id))
    setSelectedRmaIds((prev) => {
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }, [gruposEnPagina, selectedRmaIds])

  const handleAplicarEstadoMasivo = useCallback(async () => {
    if (selectedRmaIds.size === 0 || aplicandoMasivo) return
    setAplicandoMasivo(true)
    try {
      const res = await fetch(`${API_URL}/api/rmas/estado-masivo`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          rma_numbers: Array.from(selectedRmaIds),
          estado: estadoMasivo ?? '',
        }),
      })
      if (res.ok) {
        setSelectedRmaIds(new Set())
        refetchProductos()
      }
    } finally {
      setAplicandoMasivo(false)
    }
  }, [selectedRmaIds, estadoMasivo, refetchProductos, aplicandoMasivo])

  const selectedCount = selectedRmaIds.size
  const puedeAplicarMasivo = selectedCount > 0 && !aplicandoMasivo

  if (cargando) return <p className="loading">Cargando...</p>
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <>
      <h1 className="page-title">Listado RMA</h1>
      {selectedCount > 0 && (
        <div className="rma-estado-masivo-bar">
          <label className="rma-estado-masivo-label">
            Estado para los {selectedCount} seleccionados
          </label>
          <select
            className="rma-estado-masivo-select"
            value={estadoMasivo}
            onChange={(e) => setEstadoMasivo(e.target.value)}
            aria-label="Estado a aplicar"
          >
            {OPCIONES_ESTADO.map((o) => (
              <option key={o.value === '' ? '__' : o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary rma-estado-masivo-btn"
            disabled={!puedeAplicarMasivo}
            onClick={handleAplicarEstadoMasivo}
          >
            {aplicandoMasivo ? 'Aplicando…' : 'Aplicar estado a seleccionados'}
          </button>
          <button
            type="button"
            className="btn rma-estado-masivo-clear"
            onClick={() => setSelectedRmaIds(new Set())}
          >
            Quitar selección
          </button>
        </div>
      )}
      <div className="herramientas-rma">
        <div className="herramientas-rma-fila">
          <label htmlFor="rma-estado" className="herramientas-rma-label">
            Filtro por estado
          </label>
          <select
            id="rma-estado"
            value={estadoFiltro}
            onChange={(e) => {
              setEstadoFiltro(e.target.value)
              setPagina(1)
            }}
            className="herramientas-rma-select"
          >
            <option value="__todos__">Todos</option>
            {OPCIONES_ESTADO.map((o) => (
              <option key={o.value === '' ? '__sin_estado__' : o.value} value={o.value === '' ? '' : o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="herramientas-rma-fila">
          <label htmlFor="rma-fecha-recogida-desde" className="herramientas-rma-label">
            Fecha recogida desde
          </label>
          <input
            id="rma-fecha-recogida-desde"
            type="date"
            value={filtroFechaRecogidaDesde}
            onChange={(e) => {
              setFiltroFechaRecogidaDesde(e.target.value)
              setPagina(1)
            }}
            className="herramientas-rma-input herramientas-rma-input-date"
          />
          <label htmlFor="rma-fecha-recogida-hasta" className="herramientas-rma-label">
            hasta
          </label>
          <input
            id="rma-fecha-recogida-hasta"
            type="date"
            value={filtroFechaRecogidaHasta}
            onChange={(e) => {
              setFiltroFechaRecogidaHasta(e.target.value)
              setPagina(1)
            }}
            className="herramientas-rma-input herramientas-rma-input-date"
          />
        </div>
      </div>
      <HerramientasTabla
        columnas={columnasFiltro}
        columnaFiltro={columnaFiltro}
        setColumnaFiltro={setColumnaFiltro}
        valorFiltro={valorFiltro}
        setValorFiltro={setValorFiltro}
        columnaOrden={columnaOrden}
        setColumnaOrden={setColumnaOrden}
        ordenAsc={ordenAsc}
        setOrdenAsc={setOrdenAsc}
        onPaginaReset={setPagina}
        idPrefix="rma"
      />
      <div className="table-wrapper tabla-rma">
        <table>
          <thead>
            <tr>
              <th className="col-checkbox">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos de la página"
                  onChange={selectAllPage}
                  checked={
                    gruposEnPagina.length > 0 &&
                    gruposEnPagina.every((g) => selectedRmaIds.has(g.rmaId))
                  }
                />
              </th>
              <th>Nº RMA</th>
              <th>Producto</th>
              <th>Nº serie</th>
              <th>Cliente</th>
              <th>Fecha recibido</th>
              <th>Fecha recogida</th>
              <th>Avería</th>
              <th>Observaciones</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {gruposEnPagina.map((grupo, i) => {
              const p = grupo.items[0]
              const n = grupo.items.length
              const abierto = productosDesplegableAbierto === grupo.rmaId
              const key = grupo.rmaId || `rma-${inicio}-${i}`
              const isSelected = selectedRmaIds.has(grupo.rmaId)
              const fechaRecogida = p['FECHA RECOGIDA']
              return (
                <React.Fragment key={key}>
                  <tr className={isSelected ? 'row-selected' : ''}>
                    <td className="col-checkbox">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar RMA ${p['NÂº DE RMA'] ?? p['Nº DE RMA'] ?? ''}`}
                        checked={isSelected}
                        onChange={() => toggleSelect(grupo)}
                      />
                    </td>
                    <td>{p['NÂº DE RMA'] ?? p['Nº DE RMA'] ?? '-'}</td>
                    <td>
                      {n === 1 ? (
                        <button
                          type="button"
                          className="link-celda"
                          onClick={() => {
                            setProductoDestacado(p.PRODUCTO ?? '')
                            setVista('productos')
                          }}
                        >
                          {p.PRODUCTO ?? '-'}
                        </button>
                      ) : (
                        <div className="celda-desplegable">
                          <button
                            type="button"
                            className="link-celda btn-desplegable"
                            onClick={() =>
                              setProductosDesplegableAbierto(
                                abierto ? null : grupo.rmaId
                              )
                            }
                            aria-expanded={abierto}
                          >
                            {n} productos {abierto ? '▼' : '▶'}
                          </button>
                        </div>
                      )}
                    </td>
                    <td>{n === 1 ? getSerie(p) : '-'}</td>
                    <td>
                      <button
                        type="button"
                        className="link-celda"
                        onClick={() => {
                          setClienteDestacado(
                            p['RAZON SOCIAL O NOMBRE'] ?? ''
                          )
                          setVista('clientes')
                        }}
                      >
                        {p['RAZON SOCIAL O NOMBRE'] ?? '-'}
                      </button>
                    </td>
                    <td>
                      {p['FECHA RECIBIDO']
                        ? new Date(
                            p['FECHA RECIBIDO']
                          ).toLocaleDateString('es-ES')
                        : '-'}
                    </td>
                    <td>
                      {fechaRecogida
                        ? new Date(fechaRecogida).toLocaleDateString('es-ES')
                        : '-'}
                    </td>
                    <td>
                      {(p.AVERIA ?? '').toString().slice(0, 50)}
                      {p.AVERIA?.length > 50 ? '…' : ''}
                    </td>
                    <td>
                      {(p.OBSERVACIONES ?? '').toString().slice(0, 50)}
                      {p.OBSERVACIONES?.length > 50 ? '…' : ''}
                    </td>
                    <td>{getEstadoLabel(estadoRma[grupo.rmaId])}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-editar"
                        onClick={() => setEditandoRmaId(grupo.rmaId)}
                        title="Editar campos de este RMA"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-ocultar"
                        onClick={() => ocultarRmaGroup && ocultarRmaGroup(grupo)}
                        title="Ocultar este RMA (aparecerá en Lista oculta)"
                      >
                        Ocultar
                      </button>
                    </td>
                  </tr>
                  {abierto && n > 1 && (
                    <tr className="fila-desplegable">
                      <td colSpan={11} className="td-desplegable">
                        <div className="desplegable-detalle">
                          <table className="tabla-desplegable">
                            <thead>
                              <tr>
                                <th>Nº RMA</th>
                                <th>Producto</th>
                                <th>Nº serie</th>
                                <th>Cliente</th>
                                <th>Fecha recibido</th>
                                <th>Fecha recogida</th>
                                <th>Avería</th>
                                <th>Observaciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {grupo.items.map((item, j) => (
                                <tr key={j}>
                                  <td>
                                    {item['NÂº DE RMA'] ??
                                      item['Nº DE RMA'] ??
                                      '-'}
                                  </td>
                                  <td>{item.PRODUCTO ?? '-'}</td>
                                  <td>{getSerie(item)}</td>
                                  <td>
                                    {item['RAZON SOCIAL O NOMBRE'] ?? '-'}
                                  </td>
                                  <td>
                                    {item['FECHA RECIBIDO']
                                      ? new Date(
                                          item['FECHA RECIBIDO']
                                        ).toLocaleDateString('es-ES')
                                      : '-'}
                                  </td>
                                  <td>
                                    {item['FECHA RECOGIDA']
                                      ? new Date(
                                          item['FECHA RECOGIDA']
                                        ).toLocaleDateString('es-ES')
                                      : '-'}
                                  </td>
                                  <td>
                                    {(item.AVERIA ?? '')
                                      .toString()
                                      .slice(0, 50)}
                                    {item.AVERIA?.length > 50 ? '…' : ''}
                                  </td>
                                  <td>
                                    {(item.OBSERVACIONES ?? '')
                                      .toString()
                                      .slice(0, 50)}
                                    {item.OBSERVACIONES?.length > 50
                                      ? '…'
                                      : ''}
                                  </td>
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
            })}
          </tbody>
        </table>
      </div>
      <Paginacion
        inicio={inicio}
        fin={fin}
        total={gruposOrdenados.length}
        pagina={pagina}
        totalPaginas={totalPaginas}
        setPagina={setPagina}
        label="RMAs"
      />
    </>
  )
}

export default ListadoRMA
