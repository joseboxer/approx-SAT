import React from 'react'
import Navbar from './Navbar'
import { VISTAS_LABELS } from '../constants'

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
  const labelActual = VISTAS_LABELS[vista] ?? vista

  return (
    <div className="app">
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
        <span className="breadcrumb-item breadcrumb-inicio">Inicio</span>
        {vista !== 'inicio' && (
          <>
            <span className="breadcrumb-sep" aria-hidden>›</span>
            <span className="breadcrumb-item breadcrumb-current">{labelActual}</span>
          </>
        )}
      </nav>
      <main className="main">{children}</main>
    </div>
  )
}

export default Layout
