import React, { useEffect } from 'react'
import { useGarantia } from '../context/GarantiaContext'

function ModalEditarRma() {
  const {
    editandoRmaId,
    setEditandoRmaId,
    estadoRma,
    guardarEstadoRma,
    fechaRecogidaRma,
    guardarFechaRecogidaRma,
    OPCIONES_ESTADO,
  } = useGarantia()

  useEffect(() => {
    if (editandoRmaId == null) return
    const onKey = (e) => { if (e.key === 'Escape') setEditandoRmaId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editandoRmaId, setEditandoRmaId])

  if (editandoRmaId == null) return null

  return (
    <div
      className="modal-overlay"
      onClick={() => setEditandoRmaId(null)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-titulo"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="modal-titulo" className="modal-titulo">
          Editar RMA {editandoRmaId || ''}
        </h2>
        <div className="modal-cuerpo">
          <label htmlFor="modal-estado" className="modal-label">
            Estado
          </label>
          <select
            id="modal-estado"
            value={estadoRma[editandoRmaId] ?? ''}
            onChange={(e) =>
              guardarEstadoRma(editandoRmaId, e.target.value || null)
            }
            className="modal-select"
          >
            {OPCIONES_ESTADO.map((o) => (
              <option key={o.value || 'vacio'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="modal-hint">
            Abonado, Reparado o No tiene anomalías. Se guarda al elegir.
          </p>
          <label htmlFor="modal-fecha-recogida" className="modal-label">
            Fecha de recogida
          </label>
          <input
            id="modal-fecha-recogida"
            type="date"
            value={fechaRecogidaRma[editandoRmaId] ?? ''}
            onChange={(e) =>
              guardarFechaRecogidaRma(editandoRmaId, e.target.value || null)
            }
            className="modal-input"
          />
          <p className="modal-hint">
            Fecha en que se recogió el equipo. Se guarda al cambiar.
          </p>
        </div>
        <div className="modal-pie">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setEditandoRmaId(null)}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

export default ModalEditarRma
