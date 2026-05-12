import React from 'react'
import Navbar from './Navbar'
import AlertaEstadoSinNotificar from './AlertaEstadoSinNotificar'
import { VISTAS, VISTAS_LABELS, VISTA_PARENT } from '../constants'

function buildBreadcrumbChain(vista) {
  const chain = []
  let v = vista
  while (v) {
    chain.unshift({ vista: v, label: VISTAS_LABELS[v] ?? v })
    v = VISTA_PARENT[v] ?? null
  }
  if (chain.length === 0 || chain[0].vista !== VISTAS.INICIO) {
    chain.unshift({ vista: VISTAS.INICIO, label: 'Inicio' })
  }
  return chain
}

function Layout({
  vista,
  setVista,
  clienteDestacado,
  setClienteDestacado,
  productoDestacado,
  setProductoDestacado,
  setSerialDestacado,
  notifCountKey,
  refreshNotifCount,
  children,
}) {
  const breadcrumbChain = buildBreadcrumbChain(vista)

  return (
    <div className="app">
      <a
        href="#contenido-principal"
        className="skip-to-content"
        onClick={(e) => {
          e.preventDefault()
          const el = document.getElementById('contenido-principal')
          if (el) {
            el.focus({ preventScroll: false })
          }
        }}
      >
        Saltar al contenido
      </a>
      <Navbar
        vista={vista}
        setVista={setVista}
        onClienteDestacado={setClienteDestacado}
        onProductoDestacado={setProductoDestacado}
        onSerialDestacado={setSerialDestacado}
        notifCountKey={notifCountKey}
        refreshNotifCount={refreshNotifCount}
      />
      <nav className="breadcrumbs" aria-label="Navegación">
        {breadcrumbChain.map(({ vista: v, label }, i) => {
          const isLast = i === breadcrumbChain.length - 1
          return (
            <React.Fragment key={v}>
              {i > 0 && <span className="breadcrumb-sep" aria-hidden>›</span>}
              {isLast ? (
                <span className="breadcrumb-item breadcrumb-current">{label}</span>
              ) : (
                <button
                  type="button"
                  className="breadcrumb-item breadcrumb-link"
                  onClick={() => setVista(v)}
                  title={`Ir a ${label}`}
                >
                  {label}
                </button>
              )}
            </React.Fragment>
          )
        })}
      </nav>
      <AlertaEstadoSinNotificar setVista={setVista} notifCountKey={notifCountKey} />
      <main id="contenido-principal" className="main app-view-transition" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}

export default Layout
