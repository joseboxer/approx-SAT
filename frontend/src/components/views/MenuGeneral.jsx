import React from 'react'
import { useAuth } from '../../context/AuthContext'
import { VISTAS } from '../../constants'

const ICON_INICIO = '⌂'
const ICON_CLIENTES = '👥'
const ICON_MENSAJES = '✉'
const ICON_REPARACIONES = '🔧'
const ICON_PRODUCTOS = '📦'
const ICON_AJUSTES = '⚙'
const ICON_ADMIN = '🛡'
const ICON_INFORMES = '📊'

/**
 * Vista de menú general: acceso elegante a todas las secciones.
 * Reparaciones y Productos llevan a sus respectivos hubs.
 */
function MenuGeneral({ setVista }) {
  const { user } = useAuth()

  const go = (v) => {
    setVista(v)
  }

  const secciones = [
    { key: VISTAS.INICIO, label: 'Inicio', desc: 'Panel principal y resumen', icon: ICON_INICIO },
    { key: VISTAS.CLIENTES, label: 'Clientes', desc: 'Listado y búsqueda de clientes', icon: ICON_CLIENTES },
    { key: VISTAS.NOTIFICACIONES, label: 'Mensajes y avisos', desc: 'Notificaciones y comunicaciones', icon: ICON_MENSAJES },
    { key: VISTAS.REPARACIONES_HUB, label: 'Reparaciones', desc: 'Lista RMA, especiales, en revisión…', icon: ICON_REPARACIONES },
    { key: VISTAS.PRODUCTOS_HUB, label: 'Productos', desc: 'Catálogo, repuestos y productos con RMA', icon: ICON_PRODUCTOS },
    { key: VISTAS.CONFIGURACION, label: 'Ajustes', desc: 'Configuración y preferencias', icon: ICON_AJUSTES },
    ...(user?.isAdmin ? [{ key: VISTAS.ADMIN, label: 'Administración', desc: 'Gestionar usuarios', icon: ICON_ADMIN }] : []),
    { key: VISTAS.INFORMES, label: 'Informes', desc: 'Reportes y descargas', icon: ICON_INFORMES },
  ]

  return (
    <div className="menu-general">
      <header className="menu-general-header">
        <h1 className="menu-general-title">Menú</h1>
        <p className="menu-general-lead">Elige una sección para continuar.</p>
      </header>
      <div className="menu-hub-grid">
        {secciones.map(({ key, label, desc, icon }) => (
          <button
            key={key}
            type="button"
            className="menu-hub-card"
            onClick={() => go(key)}
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

export default MenuGeneral
