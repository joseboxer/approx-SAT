import React from 'react'
import { useGarantia } from '../../context/GarantiaContext'
import { VISTAS } from '../../constants'

const ICON_LISTA = '📋'
const ICON_ESPECIALES = '⭐'
const ICON_REVISION = '🔍'
const ICON_PRODUCTOS_RMA = '📦'
const ICON_OCULTA = '🙈'

/**
 * Hub de Reparaciones: navegación elegante a todas las herramientas de RMA.
 */
function ReparacionesHub({ setVista }) {
  const { hiddenRmas } = useGarantia()

  const opciones = [
    { key: VISTAS.RMA, label: 'Lista RMA', desc: 'Ver y gestionar todas las reparaciones', icon: ICON_LISTA },
    { key: VISTAS.RMA_ESPECIALES, label: 'RMA especiales', desc: 'Reparaciones con mensaje o estado especial', icon: ICON_ESPECIALES },
    { key: VISTAS.EN_REVISION, label: 'En revisión', desc: 'Reparaciones pendientes de revisión', icon: ICON_REVISION },
    { key: VISTAS.PRODUCTOS_RMA, label: 'Productos con RMA', desc: 'Productos en reparación por número de serie', icon: ICON_PRODUCTOS_RMA },
    { key: VISTAS.OCULTA, label: 'Reparaciones ocultas', desc: hiddenRmas.length > 0 ? `${hiddenRmas.length} reparación(es) oculta(s)` : 'Ver reparaciones ocultas', icon: ICON_OCULTA },
  ]

  return (
    <div className="menu-general reparaciones-hub">
      <header className="menu-general-header">
        <h1 className="menu-general-title">Reparaciones</h1>
        <p className="menu-general-lead">Elige una herramienta para trabajar con las reparaciones.</p>
      </header>
      <div className="menu-hub-grid">
        {opciones.map(({ key, label, desc, icon }) => (
          <button
            key={key}
            type="button"
            className="menu-hub-card"
            onClick={() => setVista(key)}
          >
            <span className="menu-hub-card-icon" aria-hidden>{icon}</span>
            <span className="menu-hub-card-label">{label}</span>
            <span className="menu-hub-card-desc">{desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default ReparacionesHub
