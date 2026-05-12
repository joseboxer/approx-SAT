import React, { useRef } from 'react'
import { VISTAS_ATAJOS, VISTAS_LABELS } from '../constants'
import { useDialogFocus } from '../hooks/useDialogFocus'

/** Lista de atajos Alt+número desde el menú hamburguesa */
function ShortcutsHelpModal({ open, onClose }) {
  const panelRef = useRef(null)
  useDialogFocus(open, panelRef, { onClose })

  if (!open) return null

  const rows = Object.entries(VISTAS_ATAJOS).sort((a, b) => Number(a[0]) - Number(b[0]))

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-help-title"
    >
      <div className="modal modal-shortcuts-help" ref={panelRef} onClick={(e) => e.stopPropagation()}>
        <h2 id="shortcuts-help-title" className="modal-titulo">
          Atajos de teclado
        </h2>
        <p className="modal-notificar-desc">
          Con el foco fuera de campos de texto (input, textarea o select), puedes ir directamente a estas secciones:
        </p>
        <ul className="shortcuts-help-list">
          {rows.map(([num, vistaKey]) => (
            <li key={num}>
              <kbd className="kbd">Alt</kbd>
              {' + '}
              <kbd className="kbd">{num}</kbd>
              <span className="shortcuts-help-sep"> — </span>
              {VISTAS_LABELS[vistaKey] ?? vistaKey}
            </li>
          ))}
        </ul>
        <p className="configuracion-hint">
          Los mismos atajos aparecen en la ayuda contextual (tooltips) de la barra superior cuando existen.
        </p>
        <div className="modal-pie modal-pie-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

export default ShortcutsHelpModal
