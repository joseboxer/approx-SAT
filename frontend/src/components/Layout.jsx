import React from 'react'
import Navbar from './Navbar'

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
      <main className="main">{children}</main>
    </div>
  )
}

export default Layout
