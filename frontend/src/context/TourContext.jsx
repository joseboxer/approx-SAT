import React, { createContext, useContext, useState, useCallback } from 'react'
import { VISTAS } from '../constants'

export const TOUR_STEPS = [
  {
    id: 'inicio',
    vista: VISTAS.INICIO,
    title: 'Inicio',
    description: 'Desde aquí ves un resumen de la aplicación: últimos RMAs recibidos y acceso rápido a Lista RMA. Puedes hacer clic en un RMA para ir directamente a su detalle.',
  },
  {
    id: 'clientes',
    vista: VISTAS.CLIENTES,
    title: 'Clientes',
    description: 'Listado de clientes con sus RMAs. Puedes unificar clientes duplicados (mismo cliente con distintos nombres o correos) y gestionar grupos.',
  },
  {
    id: 'busqueda-serie',
    vista: VISTAS.INICIO,
    title: 'Búsqueda por número de serie',
    description: 'En la barra superior puedes escribir o escanear un código de barras en el campo "Nº serie" y pulsar Ir para ir directamente a Productos RMA filtrado por ese número de serie.',
  },
  {
    id: 'rma',
    vista: VISTAS.RMA,
    title: 'Lista RMA',
    description: 'Aquí se listan todos los RMAs con sus líneas (producto, número de serie, cliente, fechas, estado). Puedes filtrar, ordenar, editar, ocultar RMAs y aplicar estado en masa. Desde aquí puedes ir a Productos RMA (clic en nº de serie) o al Catálogo (clic en producto).',
  },
  {
    id: 'productos-rma',
    vista: VISTAS.PRODUCTOS_RMA,
    title: 'Productos RMA',
    description: 'Vista agrupada por número de serie: ves cada producto RMA con sus líneas. Puedes marcar garantía vigente, ir a Lista RMA (clic en nº de serie) o al Catálogo (clic en producto). Al expandir una fila puedes hacer clic en el Nº RMA para ir a ese RMA en Lista RMA.',
  },
  {
    id: 'productos',
    vista: VISTAS.PRODUCTOS,
    title: 'Catálogo',
    description: 'Catálogo de productos desde la carpeta de red (QNAP). Puedes filtrar por marca, serie, tipo y abrir el visual (PDF/Excel) de cada producto.',
  },
  {
    id: 'repuestos',
    vista: VISTAS.REPUESTOS,
    title: 'Repuestos',
    description: 'Gestión de repuestos: listado, cantidad y vinculación con productos del catálogo.',
  },
  {
    id: 'hamburger',
    vista: VISTAS.INICIO,
    title: 'Menú (hamburguesa)',
    description: 'Notificaciones: avisos que otros usuarios te envían al compartir una fila (RMA, cliente, producto). Configuración: rutas de carpetas, Atractor, etc. Informes: informes de ventas y otros. El círculo azul indica notificaciones sin leer.',
  },
  {
    id: 'fin',
    vista: VISTAS.INICIO,
    title: 'Fin del recorrido',
    description: 'Ya conoces las secciones principales. Puedes volver a iniciar el recorrido desde el menú hamburguesa → "Recorrido de aprendizaje".',
  },
]

const TourContext = createContext(null)

export function useTour() {
  const ctx = useContext(TourContext)
  return ctx
}

export function TourProvider({ children }) {
  const [tourActive, setTourActive] = useState(false)
  const [tourStepIndex, setTourStepIndex] = useState(0)

  const startTour = useCallback(() => {
    setTourStepIndex(0)
    setTourActive(true)
  }, [])

  const nextStep = useCallback(() => {
    setTourStepIndex((i) => {
      if (i >= TOUR_STEPS.length - 1) {
        setTourActive(false)
        return 0
      }
      return i + 1
    })
  }, [])

  const prevStep = useCallback(() => {
    setTourStepIndex((i) => Math.max(0, i - 1))
  }, [])

  const closeTour = useCallback(() => {
    setTourActive(false)
    setTourStepIndex(0)
  }, [])

  const value = {
    tourActive,
    tourStepIndex,
    currentStep: TOUR_STEPS[tourStepIndex] ?? null,
    isFirstStep: tourStepIndex === 0,
    isLastStep: tourStepIndex >= TOUR_STEPS.length - 1,
    startTour,
    nextStep,
    prevStep,
    closeTour,
  }

  return (
    <TourContext.Provider value={value}>
      {children}
    </TourContext.Provider>
  )
}
