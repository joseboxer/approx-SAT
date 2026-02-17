import React, { useState, useEffect } from 'react'
import { API_URL, AUTH_STORAGE_KEY, VISTAS } from '../constants'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

/**
 * Banner de alerta: productos con estado asignado que no tienen ninguna notificación.
 * Solo aplica a asignaciones desde ahora (no retroactivo).
 */
function AlertaEstadoSinNotificar({ setVista, notifCountKey }) {
  const [count, setCount] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    fetch(`${API_URL}/api/rmas/estado-sin-notificar`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((data) => setCount(data.count ?? 0))
      .catch(() => setCount(0))
  }, [notifCountKey])

  if (count === 0 || dismissed) return null

  return (
    <div
      className="alerta-estado-sin-notificar"
      role="alert"
      aria-live="polite"
    >
      <span className="alerta-estado-sin-notificar-text">
        {count === 1
          ? '1 producto con estado asignado no ha sido notificado a ningún usuario.'
          : `${count} productos con estado asignado no han sido notificados a ningún usuario.`}
      </span>
      <div className="alerta-estado-sin-notificar-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            setVista(VISTAS.RMA)
            setDismissed(true)
          }}
        >
          Ir a Lista RMA
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setDismissed(true)}
          aria-label="Ocultar aviso"
        >
          Ocultar
        </button>
      </div>
    </div>
  )
}

export default AlertaEstadoSinNotificar
