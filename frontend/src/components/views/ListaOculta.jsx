import React, { useState, useMemo, useEffect } from 'react'
import { useGarantia } from '../../context/GarantiaContext'
import { POR_PAGINA } from '../../constants'
import {
  getRmaId,
  getValorOrden,
  getColumnasFiltroRma,
  compararValores,
} from '../../utils/garantia'
import HerramientasTabla from '../HerramientasTabla'
import Paginacion from '../Paginacion'

function ListaOculta() {
  const {
    hiddenRmas,
    desocultarRma,
    getSerie,
    getEstadoLabel,
    estadoRma,
    setEditandoRmaId,
    claveSerieReal,
  } = useGarantia()

  const [columnaFiltro, setColumnaFiltro] = useState('PRODUCTO')
  const [valorFiltro, setValorFiltro] = useState('')
  const [columnaOrden, setColumnaOrden] = useState('FECHA RECIBIDO')
  const [ordenAsc, setOrdenAsc] = useState(false)
  const [pagina, setPagina] = useState(1)

  const columnasOculta = useMemo(
    () => [
      ...getColumnasFiltroRma(claveSerieReal),
      { label: 'Estado', apiKey: '__estado__' },
    ],
    [claveSerieReal]
  )

  const getValorOculta = (p, key) => {
    if (key === '__estado__') return getEstadoLabel(estadoRma[getRmaId(p)])
    return getValorOrden(p, key === 'NÂº DE RMA' ? key : key)
  }

  useEffect(() => {
    setPagina(1)
  }, [valorFiltro, columnaFiltro])

  const filtrados = useMemo(() => {
    if (!valorFiltro.trim()) return hiddenRmas
    const busqueda = valorFiltro.trim().toLowerCase()
    return hiddenRmas.filter((p) =>
      String(getValorOculta(p, columnaFiltro))
        .toLowerCase()
        .includes(busqueda)
    )
  }, [hiddenRmas, valorFiltro, columnaFiltro, estadoRma])

  const ordenados = useMemo(
    () =>
      [...filtrados].sort((a, b) =>
        compararValores(
          getValorOculta(a, columnaOrden),
          getValorOculta(b, columnaOrden),
          ordenAsc
        )
      ),
    [filtrados, columnaOrden, ordenAsc, estadoRma]
  )

  const totalPaginas = Math.ceil(ordenados.length / POR_PAGINA) || 1
  const inicio = (pagina - 1) * POR_PAGINA
  const enPagina = ordenados.slice(inicio, inicio + POR_PAGINA)

  if (hiddenRmas.length === 0) {
    return (
      <>
        <h1 className="page-title">Lista oculta</h1>
        <p className="text-muted">
          RMAs ocultos no aparecen en el listado principal. Desocultar los
          vuelve a mostrar.
        </p>
        <p className="loading">No hay RMAs ocultos.</p>
      </>
    )
  }

  return (
    <>
      <h1 className="page-title">Lista oculta</h1>
      <p className="text-muted">
        RMAs ocultos no aparecen en el listado principal. Desocultar los vuelve
        a mostrar.
      </p>
      <HerramientasTabla
        columnas={columnasOculta}
        columnaFiltro={columnaFiltro}
        setColumnaFiltro={setColumnaFiltro}
        valorFiltro={valorFiltro}
        setValorFiltro={setValorFiltro}
        columnaOrden={columnaOrden}
        setColumnaOrden={setColumnaOrden}
        ordenAsc={ordenAsc}
        setOrdenAsc={setOrdenAsc}
        onPaginaReset={setPagina}
        idPrefix="oculta"
      />
      <div className="table-wrapper tabla-rma tabla-lista-oculta">
        <table>
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
              <th>Ocultado por</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {enPagina.map((p, i) => {
              const rmaId = getRmaId(p)
              return (
                <tr key={`oculta-${inicio + i}-${rmaId}`}>
                  <td>{p['NÂº DE RMA'] ?? p['Nº DE RMA'] ?? '-'}</td>
                  <td>{p.PRODUCTO ?? '-'}</td>
                  <td>{getSerie(p)}</td>
                  <td>{p['RAZON SOCIAL O NOMBRE'] ?? '-'}</td>
                  <td>
                    {p['FECHA RECIBIDO']
                      ? new Date(p['FECHA RECIBIDO']).toLocaleDateString(
                          'es-ES'
                        )
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
                  <td>{getEstadoLabel(estadoRma[rmaId])}</td>
                  <td>{p.hidden_by ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-editar"
                      onClick={() => setEditandoRmaId(rmaId)}
                      title="Editar campos de este RMA"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => desocultarRma(p)}
                      title="Volver a mostrar en el listado RMA"
                    >
                      Desocultar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Paginacion
        inicio={inicio}
        fin={inicio + POR_PAGINA}
        total={ordenados.length}
        pagina={pagina}
        totalPaginas={totalPaginas}
        setPagina={setPagina}
      />
    </>
  )
}

export default ListaOculta
