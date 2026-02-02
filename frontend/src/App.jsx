import React, { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { GarantiaProvider } from './context/GarantiaContext'
import { CatalogRefreshProvider } from './context/CatalogRefreshContext'
import Layout from './components/Layout'
import LoginRegister from './components/LoginRegister'
import Inicio from './components/views/Inicio'
import ListadoRMA from './components/views/ListadoRMA'
import Clientes from './components/views/Clientes'
import Productos from './components/views/Productos'
import ProductosRMA from './components/views/ProductosRMA'
import ListaOculta from './components/views/ListaOculta'
import Informes from './components/views/Informes'
import Configuracion from './components/views/Configuracion'
import ModalEditarRma from './components/ModalEditarRma'
import { VISTAS } from './constants'
import './App.css'

/**
 * App principal: Gestión de garantías.
 * Orquesta la vista activa y el layout; el estado global está en GarantiaContext.
 * Solo visible si el usuario ha iniciado sesión.
 */
function AppContent() {
  const [vista, setVista] = useState(VISTAS.INICIO)
  const [clienteDestacado, setClienteDestacado] = useState(null)
  const [productoDestacado, setProductoDestacado] = useState(null)

  const renderVista = () => {
    switch (vista) {
      case VISTAS.INICIO:
        return <Inicio />
      case VISTAS.RMA:
        return (
          <ListadoRMA
            setVista={setVista}
            setClienteDestacado={setClienteDestacado}
            setProductoDestacado={setProductoDestacado}
          />
        )
      case VISTAS.CLIENTES:
        return <Clientes clienteDestacado={clienteDestacado} />
      case VISTAS.PRODUCTOS:
        return <Productos productoDestacado={productoDestacado} />
      case VISTAS.PRODUCTOS_RMA:
        return <ProductosRMA />
      case VISTAS.OCULTA:
        return <ListaOculta />
      case VISTAS.INFORMES:
        return <Informes />
      case VISTAS.CONFIGURACION:
        return <Configuracion />
      default:
        return <Inicio />
    }
  }

  return (
    <Layout
      vista={vista}
      setVista={setVista}
      clienteDestacado={clienteDestacado}
      setClienteDestacado={setClienteDestacado}
      productoDestacado={productoDestacado}
      setProductoDestacado={setProductoDestacado}
    >
      {renderVista()}
      <ModalEditarRma />
    </Layout>
  )
}

function App() {
  const { user } = useAuth()
  if (!user) return <LoginRegister />
  return (
    <GarantiaProvider>
      <CatalogRefreshProvider>
        <AppContent />
      </CatalogRefreshProvider>
    </GarantiaProvider>
  )
}

function AppWithProviders() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  )
}

export default AppWithProviders
