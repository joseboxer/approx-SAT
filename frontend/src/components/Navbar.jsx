import React, { useState } from 'react'
import { useGarantia } from '../context/GarantiaContext'
import { useAuth } from '../context/AuthContext'
import { VISTAS } from '../constants'

function Navbar({ vista, setVista, onClienteDestacado, onProductoDestacado }) {
  const { hiddenRmas } = useGarantia()
  const { user, logout } = useAuth()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const go = (v, clearCliente = true, clearProducto = true) => {
    setVista(v)
    if (clearCliente) onClienteDestacado?.(null)
    if (clearProducto) onProductoDestacado?.(null)
  }

  const handleLogoutClick = () => setShowLogoutConfirm(true)
  const handleLogoutConfirm = () => {
    setShowLogoutConfirm(false)
    logout()
  }
  const handleLogoutCancel = () => setShowLogoutConfirm(false)

  return (
    <>
    <nav className="navbar">
      <div className="nav-brand-wrap">
        <img
          src="/logo-aqprox.png"
          alt="aqprox"
          className="nav-logo"
        />
        <span className="nav-brand-subtitle">SAT · Servicio de Asistencia Técnica</span>
      </div>
      <div className="nav-links">
        <button
          type="button"
          className={`nav-link ${vista === VISTAS.INICIO ? 'active' : ''}`}
          onClick={() => go(VISTAS.INICIO)}
        >
          Inicio
        </button>
        <button
          type="button"
          className={`nav-link ${vista === VISTAS.RMA ? 'active' : ''}`}
          onClick={() => go(VISTAS.RMA)}
        >
          Listado RMA
        </button>
        <button
          type="button"
          className={`nav-link ${vista === VISTAS.CLIENTES ? 'active' : ''}`}
          onClick={() => go(VISTAS.CLIENTES, true, false)}
        >
          Clientes
        </button>
        <button
          type="button"
          className={`nav-link ${vista === VISTAS.PRODUCTOS ? 'active' : ''}`}
          onClick={() => go(VISTAS.PRODUCTOS, false, true)}
        >
          Productos
        </button>
        <button
          type="button"
          className={`nav-link ${vista === VISTAS.PRODUCTOS_RMA ? 'active' : ''}`}
          onClick={() => go(VISTAS.PRODUCTOS_RMA)}
        >
          Productos RMA
        </button>
        <button
          type="button"
          className={`nav-link ${vista === VISTAS.OCULTA ? 'active' : ''}`}
          onClick={() => setVista(VISTAS.OCULTA)}
        >
          Lista oculta {hiddenRmas.length > 0 && `(${hiddenRmas.length})`}
        </button>
        <button
          type="button"
          className={`nav-link ${vista === VISTAS.INFORMES ? 'active' : ''}`}
          onClick={() => go(VISTAS.INFORMES)}
        >
          Informes
        </button>
        {user && (
          <button type="button" className="nav-link nav-logout" onClick={handleLogoutClick}>
            Cerrar sesión
          </button>
        )}
      </div>
    </nav>

    {showLogoutConfirm && (
      <div
        className="modal-overlay"
        onClick={handleLogoutCancel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-title"
      >
        <div className="modal modal-confirm" onClick={(e) => e.stopPropagation()}>
          <h2 id="logout-title" className="modal-titulo">Cerrar sesión</h2>
          <p className="modal-confirm-text">¿Quieres cerrar sesión?</p>
          <div className="modal-pie modal-pie-actions">
            <button type="button" className="btn btn-secondary" onClick={handleLogoutCancel}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={handleLogoutConfirm}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

export default Navbar
