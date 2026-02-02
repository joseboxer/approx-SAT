import React from 'react'
import Navbar from './Navbar'

function Layout({
  vista,
  setVista,
  clienteDestacado,
  setClienteDestacado,
  productoDestacado,
  setProductoDestacado,
  children,
}) {
  return (
    <div className="app">
      <Navbar
        vista={vista}
        setVista={setVista}
        onClienteDestacado={setClienteDestacado}
        onProductoDestacado={setProductoDestacado}
      />
      <main className="main">{children}</main>
    </div>
  )
}

export default Layout
