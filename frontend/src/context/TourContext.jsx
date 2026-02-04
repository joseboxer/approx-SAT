import React, { createContext, useContext, useState, useCallback } from 'react'
import { VISTAS } from '../constants'

export const TOUR_STEPS = [
  {
    id: 'inicio',
    vista: VISTAS.INICIO,
    title: 'Página de inicio',
    description: 'Aquí tienes un resumen: últimas reparaciones recibidas y acceso rápido al listado. Puedes hacer clic en una reparación para ver su detalle.',
  },
  {
    id: 'clientes',
    vista: VISTAS.CLIENTES,
    title: 'Clientes',
    description: 'Lista de clientes con sus reparaciones. Puedes unificar duplicados (mismo cliente con nombres o correos distintos) y organizar grupos.',
  },
  {
    id: 'busqueda-serie',
    vista: VISTAS.INICIO,
    title: 'Buscar por número de serie',
    description: 'Escribe o escanea un código de barras en este campo y pulsa «Ir» para ir directo a los productos en reparación con ese número de serie.',
  },
  {
    id: 'rma',
    vista: VISTAS.RMA,
    title: 'Listado de reparaciones',
    description: 'Todas las reparaciones con producto, número de serie, cliente, fechas y estado. Puedes filtrar, ordenar, editar el estado en la propia fila, ocultar o aplicar estado a varias a la vez. Desde aquí puedes ir al catálogo (clic en producto) o a productos en reparación (clic en nº de serie).',
  },
  {
    id: 'productos-rma',
    vista: VISTAS.PRODUCTOS_RMA,
    title: 'Productos en reparación',
    description: 'Vista por número de serie: cada producto con sus líneas. Puedes marcar garantía vigente e ir al listado de reparaciones o al catálogo. Al expandir una fila, el Nº RMA te lleva a esa reparación.',
  },
  {
    id: 'productos',
    vista: VISTAS.PRODUCTOS,
    title: 'Catálogo de productos',
    description: 'Catálogo desde la carpeta de red. Filtra por marca, serie o tipo y abre el PDF o Excel de cada producto.',
  },
  {
    id: 'repuestos',
    vista: VISTAS.REPUESTOS,
    title: 'Repuestos',
    description: 'Listado de repuestos, cantidades y su relación con los productos del catálogo.',
  },
  {
    id: 'hamburger',
    vista: VISTAS.INICIO,
    title: 'Menú principal',
    description: 'Mensajes y avisos: lo que te envían otros usuarios al compartir una fila. Ajustes: rutas de carpetas y conexión con Atractor. Informes: reportes de ventas, etc. El número en azul indica avisos sin leer.',
  },
  {
    id: 'fin',
    vista: VISTAS.INICIO,
    title: 'Fin de la guía',
    description: 'Ya conoces las secciones principales. Puedes repetir esta guía cuando quieras desde el menú → «Ver guía de la aplicación».',
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
