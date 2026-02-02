import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useGarantia } from '../../context/GarantiaContext'
import { API_URL } from '../../constants'
import { getRmaId } from '../../utils/garantia'
import ProgressBar from '../ProgressBar'

function Inicio() {
  const { productos, productosVisibles, getRmaId: getRmaIdCtx, getEstadoLabel, cargando, refetchProductos } = useGarantia()
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncProgressMessage, setSyncProgressMessage] = useState('')
  const [syncResult, setSyncResult] = useState(null)
  const [syncError, setSyncError] = useState(null)
  const [archivoManual, setArchivoManual] = useState(null)
  const [mostrarSubir, setMostrarSubir] = useState(false)
  const syncPollRef = useRef(null)

  const rmaId = getRmaIdCtx ?? getRmaId

  const informes = useMemo(() => {
    const total = productos.length
    const visibles = productosVisibles.length
    const ocultos = total - visibles

    const porEstadoMap = {}
    productos.forEach((p) => {
      const e = (p.estado ?? '').trim() || '—'
      porEstadoMap[e] = (porEstadoMap[e] ?? 0) + 1
    })
    const porEstadoList = Object.entries(porEstadoMap).map(([e, cant]) => ({
      estado: e === '' || e === '—' ? '—' : getEstadoLabel(e),
      cantidad: cant,
    })).sort((a, b) => b.cantidad - a.cantidad)

    const porClienteMap = {}
    productos.forEach((p) => {
      const nombre = (p['RAZON SOCIAL O NOMBRE'] ?? '').toString().trim() || '—'
      const id = rmaId(p)
      if (!porClienteMap[nombre]) porClienteMap[nombre] = new Set()
      porClienteMap[nombre].add(id)
    })
    const porClienteList = Object.entries(porClienteMap)
      .map(([nombre, ids]) => ({ cliente: nombre, cantidad: ids.size }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5)

    const porProductoMap = {}
    productos.forEach((p) => {
      const prod = (p.PRODUCTO ?? '').toString().trim() || '—'
      porProductoMap[prod] = (porProductoMap[prod] ?? 0) + 1
    })
    const porProductoList = Object.entries(porProductoMap)
      .map(([producto, cantidad]) => ({ producto, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5)

    /* Últimos recibidos: solo visibles (los ocultos no aparecen; los cambios están en BD y afectan a todos los usuarios) */
    const recientes = [...productosVisibles]
      .filter((p) => p['FECHA RECIBIDO'])
      .sort((a, b) => {
        const da = new Date((a['FECHA RECIBIDO'] ?? '').toString()).getTime()
        const db = new Date((b['FECHA RECIBIDO'] ?? '').toString()).getTime()
        return db - da
      })
      .slice(0, 5)
      .map((p) => ({
        rma: rmaId(p),
        producto: (p.PRODUCTO ?? '—').toString().trim(),
        cliente: (p['RAZON SOCIAL O NOMBRE'] ?? '—').toString().trim(),
        fecha: (p['FECHA RECIBIDO'] ?? '—').toString().slice(0, 10),
      }))

    return {
      total,
      visibles,
      ocultos,
      porEstadoList,
      porClienteList,
      porProductoList,
      recientes,
    }
  }, [productos, productosVisibles, getEstadoLabel, rmaId])

  const handleSync = async (e) => {
    e?.preventDefault()
    setSyncError(null)
    setSyncResult(null)
    setSyncLoading(true)
    try {
      const token = localStorage.getItem('garantia-sat-token')
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${API_URL}/api/productos/sync`, {
        method: 'POST',
        headers,
        body: archivoManual ? (() => {
          const fd = new FormData()
          fd.append('file', archivoManual)
          return fd
        })() : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Error al sincronizar')
      setSyncResult(data)
      setArchivoManual(null)
      setMostrarSubir(false)
      refetchProductos()
    } catch (err) {
      setSyncError(err.message)
    } finally {
      setSyncLoading(false)
    }
  }

  return (
    <>
      <div className="card-welcome">
        <h1 className="card-welcome-title">
          Bienvenido al SAT
          <span className="card-welcome-accent" aria-hidden>▲</span>
        </h1>
        <p className="card-welcome-lead">
          SAT · Menú superior: listado RMA, clientes, productos.
        </p>

        <section className="sync-excel" aria-labelledby="sync-title">
          <h2 id="sync-title" className="sync-title">Sincronizar Excel</h2>
          <p className="sync-desc">
            Añade registros nuevos (mismo Nº RMA + serie no se duplican).
          </p>
          <div className="sync-form">
            <button
              type="button"
              className="btn btn-primary sync-btn"
              onClick={handleSync}
              disabled={syncLoading}
            >
              {syncLoading ? 'Sincronizando…' : 'Sincronizar'}
            </button>
            <button
              type="button"
              className="auth-switch sync-switch"
              onClick={() => setMostrarSubir((v) => !v)}
              disabled={syncLoading}
            >
              {mostrarSubir ? 'Usar archivo del servidor' : 'Subir otro archivo'}
            </button>
          </div>
          {mostrarSubir && (
            <form onSubmit={handleSync} className="sync-form sync-form-upload">
              <label className="sync-label">
                <span className="sr-only">Archivo Excel</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    setArchivoManual(e.target.files?.[0] ?? null)
                    setSyncError(null)
                    setSyncResult(null)
                  }}
                  className="sync-input"
                  disabled={syncLoading}
                />
              </label>
              <button type="submit" className="btn btn-primary sync-btn" disabled={syncLoading || !archivoManual}>
                Sincronizar con este archivo
              </button>
            </form>
          )}
          {syncLoading && (
            <ProgressBar
              percent={syncProgress}
              message={syncProgressMessage}
              className="sync-progress"
            />
          )}
          {syncError && (
            <p className="sync-error" role="alert">
              {syncError}
            </p>
          )}
          {syncResult != null && !syncLoading && (
            <p className="sync-ok">
              {syncResult.mensaje ?? 'Sincronización completada.'}
              {typeof syncResult.añadidos === 'number' && (
                <> Se añadieron <strong>{syncResult.añadidos}</strong> registros nuevos.</>
              )}
            </p>
          )}
        </section>
      </div>

      <section className="informes-globales" aria-labelledby="informes-title">
        <h2 id="informes-title" className="informes-titulo-seccion">Informes globales</h2>

        {cargando ? (
          <p className="informes-cargando">Cargando datos…</p>
        ) : (
          <div className="informes-grid">
            <div className="informe-card informe-resumen">
              <h3 className="informe-card-titulo">Resumen</h3>
              <div className="informe-resumen-kpis">
                <div className="informe-kpi">
                  <span className="informe-kpi-valor">{informes.total}</span>
                  <span className="informe-kpi-etiqueta">Total registros</span>
                </div>
                <div className="informe-kpi">
                  <span className="informe-kpi-valor">{informes.visibles}</span>
                  <span className="informe-kpi-etiqueta">Visibles</span>
                </div>
                <div className="informe-kpi">
                  <span className="informe-kpi-valor">{informes.ocultos}</span>
                  <span className="informe-kpi-etiqueta">Ocultos</span>
                </div>
              </div>
            </div>

            <div className="informe-card">
              <h3 className="informe-card-titulo">Por estado</h3>
              <div className="informe-tabla-wrap">
                <table className="informe-tabla">
                  <thead>
                    <tr>
                      <th>Estado</th>
                      <th>Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {informes.porEstadoList.length === 0 ? (
                      <tr><td colSpan={2}>Sin datos</td></tr>
                    ) : (
                      informes.porEstadoList.map((row, i) => (
                        <tr key={i}>
                          <td>{row.estado}</td>
                          <td>{row.cantidad}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="informe-card">
              <h3 className="informe-card-titulo">Por cliente</h3>
              <div className="informe-tabla-wrap">
                <table className="informe-tabla">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Nº RMAs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {informes.porClienteList.length === 0 ? (
                      <tr><td colSpan={2}>Sin datos</td></tr>
                    ) : (
                      informes.porClienteList.map((row, i) => (
                        <tr key={i}>
                          <td title={row.cliente}>{row.cliente.length > 28 ? row.cliente.slice(0, 28) + '…' : row.cliente}</td>
                          <td>{row.cantidad}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="informe-card">
              <h3 className="informe-card-titulo">Por producto</h3>
              <div className="informe-tabla-wrap">
                <table className="informe-tabla">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {informes.porProductoList.length === 0 ? (
                      <tr><td colSpan={2}>Sin datos</td></tr>
                    ) : (
                      informes.porProductoList.map((row, i) => (
                        <tr key={i}>
                          <td title={row.producto}>{row.producto.length > 28 ? row.producto.slice(0, 28) + '…' : row.producto}</td>
                          <td>{row.cantidad}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="informe-card informe-recientes">
              <h3 className="informe-card-titulo">Últimos recibidos</h3>
              <div className="informe-tabla-wrap">
                <table className="informe-tabla">
                  <thead>
                    <tr>
                      <th>RMA</th>
                      <th>Producto</th>
                      <th>Cliente</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {informes.recientes.length === 0 ? (
                      <tr><td colSpan={4}>Sin datos</td></tr>
                    ) : (
                      informes.recientes.map((row, i) => (
                        <tr key={i}>
                          <td>{row.rma}</td>
                          <td title={row.producto}>{row.producto.length > 18 ? row.producto.slice(0, 18) + '…' : row.producto}</td>
                          <td title={row.cliente}>{row.cliente.length > 18 ? row.cliente.slice(0, 18) + '…' : row.cliente}</td>
                          <td>{row.fecha}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  )
}

export default Inicio
