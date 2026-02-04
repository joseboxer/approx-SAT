import React, { useEffect } from 'react'
import { registerPushSubscription } from '../utils/pushSubscription'

const STORAGE_KEY = 'garantia-sat-notification-permission-asked'

export function shouldShowNotificationPermissionPrompt() {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission !== 'default') return false
  try {
    return !localStorage.getItem(STORAGE_KEY)
  } catch {
    return false
  }
}

export function markNotificationPermissionAsked() {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {}
}

/**
 * Modal que pide permiso para notificaciones del navegador al iniciar sesión.
 * Se muestra una sola vez por navegador si el usuario no ha aceptado ni denegado.
 */
function NotificationPermissionModal({ open, onActivar, onCerrar }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onCerrar?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCerrar])

  if (!open) return null

  const handleActivar = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    markNotificationPermissionAsked()
    if (Notification.permission === 'granted') {
      registerPushSubscription().catch(() => {})
    }
    onActivar?.()
    onCerrar?.()
  }

  const handleAhoraNo = () => {
    markNotificationPermissionAsked()
    onCerrar?.()
  }

  return (
    <div
      className="modal-overlay"
      onClick={handleAhoraNo}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-permission-title"
    >
      <div className="modal modal-notification-permission" onClick={(e) => e.stopPropagation()}>
        <h2 id="notification-permission-title" className="modal-titulo">
          Notificaciones del navegador
        </h2>
        <p className="modal-notification-permission-desc">
          ¿Quieres activar las notificaciones (Web Push) para recibir avisos cuando otro usuario te envíe un mensaje (compartir un RMA, cliente, producto, etc.)? Podrás recibirlas aunque cierres el navegador.
        </p>
        <div className="modal-pie modal-pie-actions">
          <button type="button" className="btn btn-secondary" onClick={handleAhoraNo}>
            Ahora no
          </button>
          <button type="button" className="btn btn-primary" onClick={handleActivar}>
            Activar notificaciones
          </button>
        </div>
      </div>
    </div>
  )
}

export default NotificationPermissionModal
