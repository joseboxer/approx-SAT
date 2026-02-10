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
import RMAEspeciales from './components/views/RMAEspeciales'
import EnRevision from './components/views/EnRevision'
import Informes from './components/views/Informes'
import Configuracion from './components/views/Configuracion'
import AdminPanel from './components/views/AdminPanel'
import Notificaciones from './components/views/Notificaciones'
import ModalEditarRma from './components/ModalEditarRma'
import NotificationPermissionModal, { shouldShowNotificationPermissionPrompt } from './components/NotificationPermissionModal'
import TourRecorrido from './components/TourRecorrido'
import { VISTAS, VISTAS_ATAJOS, API_URL, AUTH_STORAGE_KEY } from './constants'
import { ensurePushSubscription } from './utils/pushSubscription'
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
  const [rmaEspecialDestacadoId, setRmaEspecialDestacadoId] = useState(null)
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

  // Atajos de teclado globales: Alt+1..8 para ir a secciones (no en inputs)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      const key = e.key
      if (key >= '1' && key <= '8') {
        const target = document.activeElement
        const tag = target?.tagName?.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return
        const vistaKey = VISTAS_ATAJOS[parseInt(key, 10)]
        if (vistaKey) {
          e.preventDefault()
          setVista(vistaKey)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
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
      case VISTAS.EN_REVISION:
        return (
          <EnRevision
            setVista={setVista}
            setSerialDestacado={setSerialDestacado}
            setRmaDestacado={setRmaDestacado}
          />
        )
      case VISTAS.RMA_ESPECIALES:
        return (
          <RMAEspeciales
            setVista={setVista}
            rmaEspecialDestacadoId={rmaEspecialDestacadoId}
            setRmaEspecialDestacadoId={setRmaEspecialDestacadoId}
          />
        )
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
            setRmaEspecialDestacadoId={setRmaEspecialDestacadoId}
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

// Intervalo para volver a asegurar la suscripción push (p. ej. suscripción expirada en el navegador)
const PUSH_ENSURE_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 h

function App() {
  const { user } = useAuth()
  const [showNotificationPermissionModal, setShowNotificationPermissionModal] = useState(false)

  // Trigger único: comprobar suscripción push al cargar, al recuperar visibilidad y cada 24 h
  useEffect(() => {
    if (!user) return

    const run = async () => {
      const result = await ensurePushSubscription().catch(() => ({ showModal: false }))
      if (result.showModal && shouldShowNotificationPermissionPrompt()) {
        setShowNotificationPermissionModal(true)
      }
    }

    run()

    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVisible)

    const intervalId = setInterval(() => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        ensurePushSubscription().catch(() => {})
      }
    }, PUSH_ENSURE_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(intervalId)
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
