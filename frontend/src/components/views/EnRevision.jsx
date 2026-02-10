import React, { useState, useEffect, useCallback } from 'react'
import { API_URL, AUTH_STORAGE_KEY, VISTAS } from '../../constants'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

function EnRevision({ setVista, setSerialDestacado, setRmaDestacado }) {
  const [list, setList] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(() => {
    setCargando(true)
    setError(null)
    fetch(`${API_URL}/api/rmas/en-revision`, { headers: getAuthHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error('Error al cargar')
        return r.json()
      })
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const goToListadoRMA = (rmaNumber) => {
    setRmaDestacado?.(rmaNumber)
    setVista?.(VISTAS.RMA)
  }

  const goToProductosRMA = (serial) => {
    if (serial) {
      setSerialDestacado?.(serial)
      setVista?.(VISTAS.PRODUCTOS_RMA)
    }
  }

  if (cargando) return <p className="loading">Cargando ítems en revisión...</p>
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <>
      <h1 className="page-title">En revisión</h1>
      <p className="text-muted">
        Ítems RMA que has marcado como &quot;En revisión&quot; y aún no tienen estado (resolución). Acceso rápido cuando no llega resolución el mismo día. Cuando asignes estado, saldrán de esta lista.
      </p>
      {list.length === 0 ? (
        <p className="notificaciones-empty">No hay ítems en revisión.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nº RMA</th>
                <th>Producto</th>
                <th>Nº serie</th>
                <th>Cliente</th>
                <th>Fecha recibido</th>
                <th>En revisión desde</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button
                      type="button"
                      className="link-celda"
                      onClick={() => goToListadoRMA(item['Nº DE RMA'])}
                    >
                      {item['Nº DE RMA'] ?? '-'}
                    </button>
                  </td>
                  <td>{item.PRODUCTO ?? '-'}</td>
                  <td>
                    {item['Nº DE SERIE'] ? (
                      <button
                        type="button"
                        className="link-celda"
                        onClick={() => goToProductosRMA(item['Nº DE SERIE'])}
                      >
                        {item['Nº DE SERIE']}
                      </button>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{item['RAZON SOCIAL O NOMBRE'] ?? '-'}</td>
                  <td>
                    {item['FECHA RECIBIDO']
                      ? new Date(item['FECHA RECIBIDO']).toLocaleDateString('es-ES')
                      : '-'}
                  </td>
                  <td>
                    {item.en_revision_at
                      ? new Date(item.en_revision_at).toLocaleString('es-ES')
                      : '-'}
                  </td>
                  <td className="celda-acciones">
                    <div className="celda-acciones-wrap">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => goToListadoRMA(item['Nº DE RMA'])}
                      >
                        Ir al listado RMA
                      </button>
                      {item['Nº DE SERIE'] && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => goToProductosRMA(item['Nº DE SERIE'])}
                        >
                          Productos RMA
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default EnRevision
