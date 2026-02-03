import React, { useState, useRef, useEffect } from 'react'
import { useGarantia } from '../context/GarantiaContext'
import { useAuth } from '../context/AuthContext'
import { VISTAS } from '../constants'

function Navbar({ vista, setVista, onClienteDestacado, onProductoDestacado }) {
  const { hiddenRmas } = useGarantia()
  const { user, logout } = useAuth()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showRmaMenu, setShowRmaMenu] = useState(false)
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false)
  const rmaMenuRef = useRef(null)
  const hamburgerRef = useRef(null)

  const go = (v, clearCliente = true, clearProducto = true) => {
    setVista(v)
    if (clearCliente) onClienteDestacado?.(null)
    if (clearProducto) onProductoDestacado?.(null)
  }

  const [showProductosMenu, setShowProductosMenu] = useState(false)
  const productosMenuRef = useRef(null)

  const rmaVistas = [
    { key: VISTAS.RMA, label: 'Lista RMA' },
    { key: VISTAS.PRODUCTOS_RMA, label: 'Productos RMA' },
    { key: VISTAS.OCULTA, label: `Lista oculta${hiddenRmas.length > 0 ? ` (${hiddenRmas.length})` : ''}` },
  ]

  const productosVistas = [
    { key: VISTAS.PRODUCTOS, label: 'Catálogo', clearCliente: false },
    { key: VISTAS.REPUESTOS, label: 'Repuestos' },
  ]

  const isRmaVista = rmaVistas.some((r) => r.key === vista)
  const isProductosVista = productosVistas.some((p) => p.key === vista)

  useEffect(() => {
    const closeMenus = (e) => {
      if (rmaMenuRef.current && !rmaMenuRef.current.contains(e.target)) setShowRmaMenu(false)
      if (productosMenuRef.current && !productosMenuRef.current.contains(e.target)) setShowProductosMenu(false)
      if (hamburgerRef.current && !hamburgerRef.current.contains(e.target)) setShowHamburgerMenu(false)
    }
    document.addEventListener('mousedown', closeMenus)
    return () => document.removeEventListener('mousedown', closeMenus)
  }, [])

  const handleLogoutClick = () => {
    setShowHamburgerMenu(false)
    setShowLogoutConfirm(true)
  }
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
          className={`nav-link ${vista === VISTAS.CLIENTES ? 'active' : ''}`}
          onClick={() => go(VISTAS.CLIENTES, true, false)}
        >
          Clientes
        </button>
      </div>

      <div className="nav-right">
        <div className="nav-dropdown nav-dropdown-inline-wrap" ref={rmaMenuRef}>
          <button
            type="button"
            className={`nav-link nav-dropdown-trigger ${isRmaVista ? 'active' : ''}`}
            onClick={() => setShowRmaMenu((s) => !s)}
            aria-expanded={showRmaMenu}
            aria-haspopup="true"
          >
            RMA <span className="nav-dropdown-arrow" aria-hidden>{showRmaMenu ? '▲' : '▼'}</span>
          </button>
          {showRmaMenu && (
            <div className="nav-dropdown-inline" role="menu">
              {rmaVistas.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  className={`nav-link nav-dropdown-inline-item ${vista === key ? 'active' : ''}`}
                  onClick={() => go(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="nav-dropdown nav-dropdown-inline-wrap" ref={productosMenuRef}>
          <button
            type="button"
            className={`nav-link nav-dropdown-trigger ${isProductosVista ? 'active' : ''}`}
            onClick={() => setShowProductosMenu((s) => !s)}
            aria-expanded={showProductosMenu}
            aria-haspopup="true"
          >
            Productos <span className="nav-dropdown-arrow" aria-hidden>{showProductosMenu ? '▲' : '▼'}</span>
          </button>
          {showProductosMenu && (
            <div className="nav-dropdown-inline" role="menu">
              {productosVistas.map(({ key, label, clearCliente }) => (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  className={`nav-link nav-dropdown-inline-item ${vista === key ? 'active' : ''}`}
                  onClick={() => go(key, clearCliente !== false, key !== VISTAS.PRODUCTOS)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div ref={hamburgerRef}>
        <button
          type="button"
          className="nav-hamburger-btn"
          onClick={() => setShowHamburgerMenu((s) => !s)}
          aria-expanded={showHamburgerMenu}
          aria-label="Menú"
        >
          <span className="nav-hamburger-bar" />
          <span className="nav-hamburger-bar" />
          <span className="nav-hamburger-bar" />
        </button>
        {showHamburgerMenu && (
          <div className="nav-hamburger-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              className={`nav-hamburger-item ${vista === VISTAS.CONFIGURACION ? 'active' : ''}`}
              onClick={() => go(VISTAS.CONFIGURACION)}
            >
              Configuración
            </button>
            <button
              type="button"
              role="menuitem"
              className={`nav-hamburger-item ${vista === VISTAS.INFORMES ? 'active' : ''}`}
              onClick={() => go(VISTAS.INFORMES)}
            >
              Informes
            </button>
            {user && (
              <button
                type="button"
                role="menuitem"
                className="nav-hamburger-item nav-hamburger-logout"
                onClick={handleLogoutClick}
              >
                Cerrar sesión
              </button>
            )}
          </div>
        )}
        </div>
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
