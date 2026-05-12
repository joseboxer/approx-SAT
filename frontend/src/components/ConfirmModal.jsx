import React, { useRef } from 'react'
import { useDialogFocus } from '../hooks/useDialogFocus'

/**
 * Diálogo de confirmación accesible (sustituto de window.confirm).
 */
function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  danger,
  children,
}) {
  const panelRef = useRef(null)
  useDialogFocus(open, panelRef, { onClose: onCancel })

  if (!open) return null

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="modal modal-confirm" ref={panelRef} onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-modal-title" className="modal-titulo">
          {title || 'Confirmar'}
        </h2>
        {message != null && message !== '' ? (
          typeof message === 'string' ? (
            <p className="modal-confirm-text" style={{ whiteSpace: 'pre-line' }}>{message}</p>
          ) : (
            <div className="modal-confirm-text">{message}</div>
          )
        ) : null}
        {children}
        <div className="modal-pie modal-pie-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
