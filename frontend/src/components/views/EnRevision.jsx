import React, { useState, useEffect, useCallback } from 'react'
import ModalNotificar from '../ModalNotificar'
import { API_URL, AUTH_STORAGE_KEY, VISTAS, OPCIONES_ESTADO } from '../../constants'

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
  const [updatingEstadoItemId, setUpdatingEstadoItemId] = useState(null)
  const [notificarOpen, setNotificarOpen] = useState(false)
  const [notificarRef, setNotificarRef] = useState(null)

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

  const handleEstadoChange = (item, newEstado) => {
    if (item.id == null || updatingEstadoItemId != null) return
    setUpdatingEstadoItemId(item.id)
    fetch(`${API_URL}/api/rmas/items/${item.id}/estado`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ estado: newEstado }),
    })
      .then((r) => {
        if (!r.ok) throw new Error('Error al guardar estado')
        return r.json()
      })
      .then(() => {
        refetch()
        const rmaNum = item['Nº DE RMA'] ?? item['NÂº DE RMA']
        const serial = item['Nº DE SERIE'] ?? item['NÂº DE SERIE']
        setNotificarRef(
          rmaNum != null
            ? { rma_number: String(rmaNum), ...(serial ? { serial: String(serial) } : {}) }
            : null
        )
        setNotificarOpen(true)
      })
      .catch((err) => setError(err.message))
      .finally(() => setUpdatingEstadoItemId(null))
  }

  if (cargando) return <p className="loading">Cargando ítems a revisar...</p>
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <>
      <h1 className="page-title">Revisar</h1>
      <p className="text-muted">
        Ítems RMA que has marcado para revisar y aún no tienen estado (resolución). Acceso rápido cuando no llega resolución el mismo día. Cuando asignes estado, saldrán de esta lista.
      </p>
      {list.length === 0 ? (
        <p className="notificaciones-empty">No hay ítems pendientes de revisar.</p>
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
                <th>Marcado para revisar</th>
                <th>Estado</th>
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
                  <td>
                    <select
                      className="rma-estado-inline-select"
                      value={item.estado ?? ''}
                      onChange={(e) => handleEstadoChange(item, e.target.value)}
                      disabled={updatingEstadoItemId === item.id}
                      aria-label="Estado (al asignar sale de la lista y se abre notificar)"
                    >
                      {OPCIONES_ESTADO.map((o) => (
                        <option key={o.value === '' ? '__' : o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
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
      <ModalNotificar
        open={notificarOpen}
        onClose={() => {
          setNotificarOpen(false)
          setNotificarRef(null)
        }}
        type="rma"
        referenceData={notificarRef || {}}
        onSuccess={() => refetch()}
      />
    </>
  )
}

export default EnRevision
