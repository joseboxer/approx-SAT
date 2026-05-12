import React, { useState, useEffect } from 'react'
import { API_URL, VISTAS } from '../constants'
import { apiFetch } from '../utils/auth'

/**
 * Banner de alerta: productos Lista RMA y líneas de RMA especiales con estado asignado
 * que no tienen ninguna notificación que los cubra. Solo aplica a asignaciones desde ahora.
 */
function AlertaEstadoSinNotificar({ setVista, notifCountKey }) {
  const [countRma, setCountRma] = useState(0)
  const [countEspecial, setCountEspecial] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    apiFetch(`${API_URL}/api/rmas/estado-sin-notificar`)
      .then((r) => (r.ok ? r.json() : { count_rma_items: 0, count_rma_especial_lineas: 0 }))
      .then((data) => {
        setCountRma(data.count_rma_items ?? (Array.isArray(data.items) ? data.items.length : 0))
        setCountEspecial(data.count_rma_especial_lineas ?? (Array.isArray(data.rma_especial_lineas) ? data.rma_especial_lineas.length : 0))
      })
      .catch(() => {
        setCountRma(0)
        setCountEspecial(0)
      })
  }, [notifCountKey])

  const total = countRma + countEspecial
  if (total === 0 || dismissed) return null

  let text = ''
  if (countRma > 0 && countEspecial === 0) {
    text =
      countRma === 1
        ? '1 producto con estado asignado no ha sido notificado a ningún usuario.'
        : `${countRma} productos con estado asignado no han sido notificados a ningún usuario.`
  } else if (countRma === 0 && countEspecial > 0) {
    text =
      countEspecial === 1
        ? '1 línea de RMA especial con estado asignado no ha sido notificada a ningún usuario.'
        : `${countEspecial} líneas de RMA especiales con estado asignado no han sido notificadas a ningún usuario.`
  } else {
    text = `${countRma} producto${countRma !== 1 ? 's' : ''} en lista RMA y ${countEspecial} línea${countEspecial !== 1 ? 's' : ''} en RMA especiales tienen estado asignado sin notificación.`
  }

  return (
    <div
      className="alerta-estado-sin-notificar"
      role="alert"
      aria-live="polite"
    >
      <span className="alerta-estado-sin-notificar-text">{text}</span>
      <div className="alerta-estado-sin-notificar-actions">
        {countRma > 0 && (
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
        )}
        {countEspecial > 0 && (
          <button
            type="button"
            className={`btn btn-sm ${countRma > 0 ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => {
              setVista(VISTAS.RMA_ESPECIALES)
              setDismissed(true)
            }}
          >
            Ir a RMA especiales
          </button>
        )}
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
