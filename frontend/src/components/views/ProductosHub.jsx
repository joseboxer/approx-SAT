import React from 'react'
import { VISTAS } from '../../constants'

const ICON_CATALOGO = '📚'
const ICON_REPUESTOS = '🔩'

/**
 * Hub de Productos: navegación elegante al catálogo y repuestos.
 */
function ProductosHub({ setVista }) {
  const opciones = [
    { key: VISTAS.PRODUCTOS, label: 'Catálogo de productos', desc: 'Buscar productos, marcas y abrir PDF o Excel', icon: ICON_CATALOGO },
    { key: VISTAS.REPUESTOS, label: 'Repuestos', desc: 'Gestión de repuestos', icon: ICON_REPUESTOS },
  ]

  return (
    <div className="menu-general productos-hub">
      <header className="menu-general-header">
        <h1 className="menu-general-title">Productos</h1>
        <p className="menu-general-lead">Elige una herramienta para trabajar con productos.</p>
      </header>
      <div className="menu-hub-grid menu-hub-grid--few">
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

export default ProductosHub
