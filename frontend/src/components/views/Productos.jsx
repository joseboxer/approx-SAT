import React, { useState, useMemo } from 'react'
import { useGarantia } from '../../context/GarantiaContext'
import { POR_PAGINA, COLUMNAS_PRODUCTOS } from '../../constants'
import { compararValores } from '../../utils/garantia'
import HerramientasTabla from '../HerramientasTabla'
import Paginacion from '../Paginacion'

function Productos({ productoDestacado }) {
  const { productosVisibles, cargando, error } = useGarantia()
  const [columnaFiltro, setColumnaFiltro] = useState('producto')
  const [valorFiltro, setValorFiltro] = useState('')
  const [columnaOrden, setColumnaOrden] = useState('producto')
  const [ordenAsc, setOrdenAsc] = useState(true)
  const [pagina, setPagina] = useState(1)

  const productosUnicos = useMemo(() => {
    const map = {}
    productosVisibles.forEach((p) => {
      const prod = (p.PRODUCTO ?? '').toString().trim()
      if (!prod) return
      if (!map[prod]) map[prod] = { producto: prod, count: 0 }
      map[prod].count++
    })
    return Object.values(map)
  }, [productosVisibles])

  const productosBase = useMemo(() => {
    if (!productoDestacado) return productosUnicos
    return productosUnicos.filter((p) =>
      p.producto
        .toLowerCase()
        .includes((productoDestacado || '').toLowerCase())
    )
  }, [productosUnicos, productoDestacado])

  const getValor = (p, key) => (key === 'count' ? p.count : (p[key] ?? ''))

  const filtrados = useMemo(() => {
    if (!valorFiltro.trim()) return productosBase
    const busqueda = valorFiltro.trim().toLowerCase()
    return productosBase.filter((p) =>
      String(getValor(p, columnaFiltro)).toLowerCase().includes(busqueda)
    )
  }, [productosBase, valorFiltro, columnaFiltro])

  const ordenados = useMemo(
    () =>
      [...filtrados].sort((a, b) =>
        compararValores(
          getValor(a, columnaOrden),
          getValor(b, columnaOrden),
          ordenAsc
        )
      ),
    [filtrados, columnaOrden, ordenAsc]
  )

  const totalPaginas = Math.ceil(ordenados.length / POR_PAGINA) || 1
  const inicio = (pagina - 1) * POR_PAGINA
  const enPagina = ordenados.slice(inicio, inicio + POR_PAGINA)

  if (cargando) return <p className="loading">Cargando...</p>
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <>
      <h1 className="page-title">Productos</h1>
      <HerramientasTabla
        columnas={COLUMNAS_PRODUCTOS}
        columnaFiltro={columnaFiltro}
        setColumnaFiltro={setColumnaFiltro}
        valorFiltro={valorFiltro}
        setValorFiltro={setValorFiltro}
        columnaOrden={columnaOrden}
        setColumnaOrden={setColumnaOrden}
        ordenAsc={ordenAsc}
        setOrdenAsc={setOrdenAsc}
        onPaginaReset={setPagina}
        idPrefix="productos"
      />
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Nº RMAs</th>
            </tr>
          </thead>
          <tbody>
            {enPagina.map((p, i) => (
              <tr key={p.producto + i}>
                <td>{p.producto}</td>
                <td>{p.count}</td>
              </tr>
            ))}
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

export default Productos
