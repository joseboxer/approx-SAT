import React, { useState, useEffect, useRef } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { GarantiaProvider } from './context/GarantiaContext'
import { CatalogRefreshProvider } from './context/CatalogRefreshContext'
import { TourProvider } from './context/TourContext'
import Layout from './components/Layout'
import LoginRegister from './components/LoginRegister'
import Inicio from './components/views/Inicio'
import ListadoRMA from './components/views/ListadoRMA'
import Clientes from './components/views/Clientes'
import Productos from './components/views/Productos'
import ProductosRMA from './components/views/ProductosRMA'
import Repuestos from './components/views/Repuestos'
import ListaOculta from './components/views/ListaOculta'
import Informes from './components/views/Informes'
import Configuracion from './components/views/Configuracion'
import AdminPanel from './components/views/AdminPanel'
import Notificaciones from './components/views/Notificaciones'
import ModalEditarRma from './components/ModalEditarRma'
import NotificationPermissionModal, { shouldShowNotificationPermissionPrompt } from './components/NotificationPermissionModal'
import TourRecorrido from './components/TourRecorrido'
import { VISTAS, API_URL, AUTH_STORAGE_KEY } from './constants'
import { registerPushSubscription } from './utils/pushSubscription'
import './App.css'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

/**
 * App principal: Gestión de garantías.
 * Orquesta la vista activa y el layout; el estado global está en GarantiaContext.
 * Solo visible si el usuario ha iniciado sesión.
 */
function AppContent() {
  const [vista, setVista] = useState(VISTAS.INICIO)
  const [clienteDestacado, setClienteDestacado] = useState(null)
  const [productoDestacado, setProductoDestacado] = useState(null)
  const [rmaDestacado, setRmaDestacado] = useState(null)
  const [serialDestacado, setSerialDestacado] = useState(null)
  const [notifCountKey, setNotifCountKey] = useState(0)
  const refreshNotifCount = () => setNotifCountKey((k) => k + 1)

  // Notificaciones del navegador: avisar cuando aumente el número de sin leer (polling)
  const prevUnreadCountRef = useRef(null)
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
    const fetchCount = () => {
      fetch(`${API_URL}/api/notifications/unread-count`, { headers: getAuthHeaders() })
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then((data) => {
          const c = data.count ?? 0
          if (prevUnreadCountRef.current !== null && c > prevUnreadCountRef.current) {
            try {
              new Notification('SAT · Garantías', {
                body: c === 1 ? 'Tienes 1 notificación nueva.' : `Tienes ${c} notificaciones nuevas.`,
                icon: '/logo-aqprox.png',
              })
            } catch (_) {}
          }
          prevUnreadCountRef.current = c
        })
        .catch(() => {})
    }
    fetchCount()
    const id = setInterval(fetchCount, 60000)
    return () => clearInterval(id)
  }, [])

  const renderVista = () => {
    switch (vista) {
      case VISTAS.INICIO:
        return (
          <Inicio
            setVista={setVista}
            setRmaDestacado={setRmaDestacado}
          />
        )
      case VISTAS.RMA:
        return (
          <ListadoRMA
            setVista={setVista}
            setClienteDestacado={setClienteDestacado}
            setProductoDestacado={setProductoDestacado}
            setSerialDestacado={setSerialDestacado}
            rmaDestacado={rmaDestacado}
            serialDestacado={serialDestacado}
            setRmaDestacado={setRmaDestacado}
          />
        )
      case VISTAS.CLIENTES:
        return <Clientes clienteDestacado={clienteDestacado} />
      case VISTAS.PRODUCTOS:
        return (
          <Productos
            productoDestacado={productoDestacado}
            setProductoDestacado={setProductoDestacado}
          />
        )
      case VISTAS.PRODUCTOS_RMA:
        return (
          <ProductosRMA
            serialDestacado={serialDestacado}
            setSerialDestacado={setSerialDestacado}
            setVista={setVista}
            setProductoDestacado={setProductoDestacado}
            setRmaDestacado={setRmaDestacado}
          />
        )
      case VISTAS.REPUESTOS:
        return <Repuestos />
      case VISTAS.OCULTA:
        return <ListaOculta />
      case VISTAS.INFORMES:
        return <Informes />
      case VISTAS.CONFIGURACION:
        return <Configuracion setVista={setVista} />
      case VISTAS.ADMIN:
        return <AdminPanel />
      case VISTAS.NOTIFICACIONES:
        return (
          <Notificaciones
            setVista={setVista}
            setRmaDestacado={setRmaDestacado}
            setSerialDestacado={setSerialDestacado}
            setProductoDestacado={setProductoDestacado}
            setClienteDestacado={setClienteDestacado}
            onMarkRead={refreshNotifCount}
          />
        )
      default:
        return <Inicio setVista={setVista} setRmaDestacado={setRmaDestacado} />
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
      setSerialDestacado={setSerialDestacado}
      notifCountKey={notifCountKey}
      refreshNotifCount={refreshNotifCount}
    >
      {renderVista()}
      <ModalEditarRma />
      <TourRecorrido setVista={setVista} />
    </Layout>
  )
}

function App() {
  const { user } = useAuth()
  const [showNotificationPermissionModal, setShowNotificationPermissionModal] = useState(false)

  useEffect(() => {
    if (user && shouldShowNotificationPermissionPrompt()) {
      setShowNotificationPermissionModal(true)
    }
  }, [user])

  useEffect(() => {
    if (user && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      registerPushSubscription().catch(() => {})
    }
  }, [user])

  if (!user) return <LoginRegister />
  return (
    <GarantiaProvider>
      <CatalogRefreshProvider>
        <TourProvider>
          <AppContent />
          <NotificationPermissionModal
            open={showNotificationPermissionModal}
            onCerrar={() => setShowNotificationPermissionModal(false)}
          />
        </TourProvider>
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
