import React, { useState, useRef, useEffect } from 'react'
import { useGarantia } from '../context/GarantiaContext'
import { useAuth } from '../context/AuthContext'
import { useTour } from '../context/TourContext'
import { VISTAS, ATAJO_POR_VISTA, API_URL, AUTH_STORAGE_KEY } from '../constants'
function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

function Navbar({ vista, setVista, onClienteDestacado, onProductoDestacado, onSerialDestacado, notifCountKey, refreshNotifCount }) {
  const { hiddenRmas } = useGarantia()
  const { user, logout } = useAuth()
  const tour = useTour()
  const startTour = tour?.startTour
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showRmaMenu, setShowRmaMenu] = useState(false)
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [serialInput, setSerialInput] = useState('')
  const serialInputRef = useRef(null)
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
    { key: VISTAS.REPARACIONES_HUB, label: 'Ver todas las opciones', isHub: true },
    { key: VISTAS.RMA, label: 'Lista RMA' },
    { key: VISTAS.RMA_ESPECIALES, label: 'RMA especiales' },
    { key: VISTAS.EN_REVISION, label: 'En revisión' },
    { key: VISTAS.PRODUCTOS_RMA, label: 'Productos con RMA' },
    { key: VISTAS.OCULTA, label: `Reparaciones ocultas${hiddenRmas.length > 0 ? ` (${hiddenRmas.length})` : ''}` },
  ]

  const productosVistas = [
    { key: VISTAS.PRODUCTOS_HUB, label: 'Ver todas las opciones', isHub: true },
    { key: VISTAS.PRODUCTOS, label: 'Catálogo de productos', clearCliente: false },
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

  useEffect(() => {
    fetch(`${API_URL}/api/notifications/unread-count`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((data) => setUnreadCount(data.count ?? 0))
      .catch(() => setUnreadCount(0))
  }, [notifCountKey])

  const handleLogoutClick = () => {
    setShowHamburgerMenu(false)
    setShowLogoutConfirm(true)
  }
  const handleLogoutConfirm = () => {
    setShowLogoutConfirm(false)
    logout()
  }
  const handleLogoutCancel = () => setShowLogoutConfirm(false)

  const handleSerialSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault()
    const serial = (serialInput || '').trim()
    if (!serial) return
    onSerialDestacado?.(serial)
    setVista(VISTAS.PRODUCTOS_RMA)
    setSerialInput('')
  }

  return (
    <>
    <nav className="navbar">
      <div className="nav-brand-wrap">
        <button
          type="button"
          className="nav-logo-btn"
          onClick={() => go(VISTAS.INICIO)}
          title={`Inicio (Atajo: ${ATAJO_POR_VISTA[VISTAS.INICIO] ?? '—'})`}
          aria-label="Ir a Inicio"
        >
          <img
            src="/logo-aqprox.png"
            alt="aqprox"
            className="nav-logo"
          />
        </button>
        <span className="nav-brand-subtitle">SAT · Servicio de Asistencia Técnica</span>
      </div>

      <div className="nav-links">
        <button
          type="button"
          className={`nav-link ${vista === VISTAS.MENU ? 'active' : ''}`}
          onClick={() => go(VISTAS.MENU)}
          title="Ver menú general con todas las secciones"
        >
          Menú
        </button>
        <button
          type="button"
          className={`nav-link ${vista === VISTAS.INICIO ? 'active' : ''}`}
          onClick={() => go(VISTAS.INICIO)}
          title={ATAJO_POR_VISTA[VISTAS.INICIO] ? `Inicio (Atajo: ${ATAJO_POR_VISTA[VISTAS.INICIO]})` : 'Inicio'}
        >
          Inicio
        </button>

        <button
          type="button"
          className={`nav-link ${vista === VISTAS.CLIENTES ? 'active' : ''}`}
          onClick={() => go(VISTAS.CLIENTES, true, false)}
          title={ATAJO_POR_VISTA[VISTAS.CLIENTES] ? `Clientes (Atajo: ${ATAJO_POR_VISTA[VISTAS.CLIENTES]})` : 'Clientes'}
        >
          Clientes
        </button>

        <button
          type="button"
          className={`nav-link nav-link-notif ${vista === VISTAS.NOTIFICACIONES ? 'active' : ''}`}
          onClick={() => go(VISTAS.NOTIFICACIONES)}
          aria-label={unreadCount > 0 ? `Mensajes (${unreadCount} sin leer)` : 'Mensajes'}
          title={ATAJO_POR_VISTA[VISTAS.NOTIFICACIONES] ? `Mensajes y avisos (Atajo: ${ATAJO_POR_VISTA[VISTAS.NOTIFICACIONES]})` : 'Mensajes y avisos'}
        >
          Mensajes
          {unreadCount > 0 && (
            <span className="nav-notif-badge nav-notif-badge-inline" aria-hidden>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      <form
        className="nav-serial-search"
        onSubmit={handleSerialSubmit}
        role="search"
        aria-label="Buscar por número de serie"
        data-tour="busqueda-serie"
      >
        <label htmlFor="nav-serial-input" className="nav-serial-label">
          Nº serie
        </label>
        <input
          ref={serialInputRef}
          id="nav-serial-input"
          type="text"
          className="nav-serial-input"
          placeholder="Escanear o buscar..."
          value={serialInput}
          onChange={(e) => setSerialInput(e.target.value)}
          autoComplete="off"
          aria-label="Número de serie (escanear código de barras o escribir)"
        />
        <button type="submit" className="nav-serial-btn" title="Ir a productos en reparación con este número de serie">
          Ir
        </button>
      </form>

      <div className="nav-right">
        <div className="nav-dropdown nav-dropdown-inline-wrap" ref={rmaMenuRef}>
          <button
            type="button"
            className={`nav-link nav-dropdown-trigger ${isRmaVista ? 'active' : ''}`}
            onClick={() => setShowRmaMenu((s) => !s)}
            aria-expanded={showRmaMenu}
            aria-haspopup="true"
            aria-label="Reparaciones (listado, productos, ocultas)"
            title={ATAJO_POR_VISTA[VISTAS.RMA] ? `Reparaciones (Atajo: ${ATAJO_POR_VISTA[VISTAS.RMA]})` : 'Reparaciones'}
          >
            Reparaciones <span className="nav-dropdown-arrow" aria-hidden>{showRmaMenu ? '▲' : '▼'}</span>
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
                  title={ATAJO_POR_VISTA[key] ? `${label} (Atajo: ${ATAJO_POR_VISTA[key]})` : label}
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
            aria-label="Productos (catálogo y repuestos)"
            title={ATAJO_POR_VISTA[VISTAS.PRODUCTOS] || ATAJO_POR_VISTA[VISTAS.PRODUCTOS_RMA] ? `Productos (Atajo: ${ATAJO_POR_VISTA[VISTAS.PRODUCTOS] ?? ATAJO_POR_VISTA[VISTAS.PRODUCTOS_RMA]})` : 'Productos'}
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
                  title={ATAJO_POR_VISTA[key] ? `${label} (Atajo: ${ATAJO_POR_VISTA[key]})` : label}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div ref={hamburgerRef} className="nav-hamburger-wrap">
        <button
          type="button"
          className="nav-hamburger-btn"
          onClick={() => setShowHamburgerMenu((s) => !s)}
          aria-expanded={showHamburgerMenu}
          aria-label={unreadCount > 0 ? `Menú principal (${unreadCount} avisos sin leer)` : 'Menú principal'}
          data-tour="hamburger"
        >
          <span className="nav-hamburger-bar" />
          <span className="nav-hamburger-bar" />
          <span className="nav-hamburger-bar" />
          {unreadCount > 0 && (
            <span className="nav-hamburger-btn-badge" aria-hidden>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
        {showHamburgerMenu && (
          <div className="nav-hamburger-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              className={`nav-hamburger-item ${vista === VISTAS.NOTIFICACIONES ? 'active' : ''}`}
              onClick={() => go(VISTAS.NOTIFICACIONES)}
            >
              Mensajes y avisos
              {unreadCount > 0 && (
                <span className="nav-notif-badge" aria-label={`${unreadCount} sin leer`}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              role="menuitem"
              className={`nav-hamburger-item ${vista === VISTAS.CONFIGURACION ? 'active' : ''}`}
              onClick={() => go(VISTAS.CONFIGURACION)}
              title={ATAJO_POR_VISTA[VISTAS.CONFIGURACION] ? `Ajustes (Atajo: ${ATAJO_POR_VISTA[VISTAS.CONFIGURACION]})` : 'Ajustes y configuración'}
            >
              Ajustes y configuración
            </button>
            {user?.isAdmin && (
              <button
                type="button"
                role="menuitem"
                className={`nav-hamburger-item ${vista === VISTAS.ADMIN ? 'active' : ''}`}
                onClick={() => go(VISTAS.ADMIN)}
                title={ATAJO_POR_VISTA[VISTAS.ADMIN] ? `Administración (Atajo: ${ATAJO_POR_VISTA[VISTAS.ADMIN]})` : 'Gestionar usuarios'}
              >
                Gestionar usuarios
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className={`nav-hamburger-item ${vista === VISTAS.INFORMES ? 'active' : ''}`}
              onClick={() => go(VISTAS.INFORMES)}
              title={ATAJO_POR_VISTA[VISTAS.INFORMES] ? `Informes (Atajo: ${ATAJO_POR_VISTA[VISTAS.INFORMES]})` : 'Informes y reportes'}
            >
              Informes y reportes
            </button>
            <button
              type="button"
              role="menuitem"
              className="nav-hamburger-item nav-hamburger-tour"
              onClick={() => {
                setShowHamburgerMenu(false)
                startTour?.()
              }}
            >
              Ver guía de la aplicación
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
