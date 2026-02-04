import React, { useState, useEffect, useCallback } from 'react'
import { API_URL, AUTH_STORAGE_KEY, NOTIFICATION_TYPES, NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_SIN_FILTRO, LAST_NOTIFICATION_TO_USER_KEY, NOTIFICATIONS_CATEGORY_KEY } from '../constants'

const CATEGORIAS_ENVIO = ['abono', 'envio', 'sin_categoria']

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

/**
 * Modal para enviar una notificación a otro usuario (compartir una fila de RMA, Catálogo, Productos RMA o Clientes).
 * Props: open, onClose, type ('rma'|'catalogo'|'producto_rma'|'cliente'), referenceData (objeto), onSuccess (opcional)
 */
function ModalNotificar({ open, onClose, type, referenceData, onSuccess }) {
  const [users, setUsers] = useState([])
  const [toUserId, setToUserId] = useState('')
  const [category, setCategory] = useState('sin_categoria')
  const [message, setMessage] = useState('')
  const [cargando, setCargando] = useState(false)
  const [cargandoUsers, setCargandoUsers] = useState(false)
  const [error, setError] = useState(null)

  const refetchUsers = useCallback(() => {
    setCargandoUsers(true)
    setError(null)
    fetch(`${API_URL}/api/users`, { headers: getAuthHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error('Error al cargar usuarios')
        return r.json()
      })
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setCargandoUsers(false))
  }, [])

  useEffect(() => {
    if (open) {
      setMessage('')
      setError(null)
      refetchUsers()
      try {
        const lastId = localStorage.getItem(LAST_NOTIFICATION_TO_USER_KEY)
        if (lastId) setToUserId(lastId)
        else setToUserId('')
        const lastCat = localStorage.getItem(NOTIFICATIONS_CATEGORY_KEY)
        if (CATEGORIAS_ENVIO.includes(lastCat)) setCategory(lastCat)
        else setCategory('sin_categoria')
      } catch {
        setToUserId('')
        setCategory('sin_categoria')
      }
    }
  }, [open, refetchUsers])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleSubmit = (e) => {
    e.preventDefault()
    const uid = toUserId === '' ? null : parseInt(toUserId, 10)
    if (uid == null || !type || !referenceData || typeof referenceData !== 'object') {
      setError('Selecciona un usuario destinatario.')
      return
    }
    setCargando(true)
    setError(null)
    fetch(`${API_URL}/api/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        to_user_id: uid,
        type: type.trim(),
        category: CATEGORIAS_ENVIO.includes(category) ? category : 'sin_categoria',
        reference_data: referenceData,
        message: (message || '').trim() || undefined,
      }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.detail || 'Error al enviar notificación') })
        return r.json()
      })
      .then(() => {
        try {
          localStorage.setItem(LAST_NOTIFICATION_TO_USER_KEY, String(uid))
          localStorage.setItem(NOTIFICATIONS_CATEGORY_KEY, CATEGORIAS_ENVIO.includes(category) ? category : 'sin_categoria')
        } catch (_) {}
        onSuccess?.()
        onClose()
      })
      .catch((err) => setError(err.message || 'Error al enviar'))
      .finally(() => setCargando(false))
  }

  if (!open) return null

  const typeLabel = NOTIFICATION_TYPES[type] || type || ''

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-notificar-title"
    >
      <div className="modal modal-notificar" onClick={(e) => e.stopPropagation()}>
        <h2 id="modal-notificar-title" className="modal-titulo">
          Notificar a un usuario
        </h2>
        <p className="modal-notificar-desc">
          Compartir esta fila ({typeLabel}) con otro usuario. Recibirá una notificación y podrá abrirla desde el apartado Notificaciones.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="modal-notificar-field">
            <label htmlFor="modal-notificar-category">Categoría</label>
            <select
              id="modal-notificar-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={cargando}
            >
              {CATEGORIAS_ENVIO.map((c) => (
                <option key={c} value={c}>
                  {NOTIFICATION_CATEGORIES[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="modal-notificar-field">
            <label htmlFor="modal-notificar-user">
              Usuario destinatario <span className="required">*</span>
            </label>
            <select
              id="modal-notificar-user"
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              disabled={cargandoUsers}
              required
            >
              <option value="">— Seleccionar —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </div>
          <div className="modal-notificar-field">
            <label htmlFor="modal-notificar-message">Mensaje (opcional)</label>
            <textarea
              id="modal-notificar-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Añade un comentario para el destinatario..."
              rows={3}
              disabled={cargando}
            />
          </div>
          {error && (
            <p className="modal-notificar-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-pie modal-pie-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={cargando}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={cargando || cargandoUsers}>
              {cargando ? 'Enviando…' : 'Enviar notificación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ModalNotificar
