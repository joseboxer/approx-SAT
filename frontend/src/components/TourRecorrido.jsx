import React, { useEffect, useRef } from 'react'
import { useTour, TOUR_STEPS } from '../context/TourContext'

const TOUR_HIGHLIGHT_CLASS = 'tour-step-target'

/**
 * Overlay del recorrido guiado. Muestra el paso actual, resalta el elemento explicado y permite Siguiente / Anterior / Cerrar.
 */
function TourRecorrido({ setVista }) {
  const { tourActive, currentStep, isFirstStep, isLastStep, nextStep, prevStep, closeTour } = useTour()
  const highlightedElRef = useRef(null)

  useEffect(() => {
    if (tourActive && currentStep?.vista) {
      setVista(currentStep.vista)
    }
  }, [tourActive, currentStep?.vista, setVista])

  // Señalar el elemento que se está explicando: añadir clase de resaltado y quitar al cambiar paso o cerrar
  useEffect(() => {
    if (!tourActive || !currentStep?.id) {
      if (highlightedElRef.current) {
        highlightedElRef.current.classList.remove(TOUR_HIGHLIGHT_CLASS)
        highlightedElRef.current = null
      }
      return
    }
    const stepId = currentStep.id
    const delay = stepId === 'inicio' || stepId === 'fin' || stepId === 'busqueda-serie' || stepId === 'hamburger' ? 50 : 300
    const t = setTimeout(() => {
      if (highlightedElRef.current) {
        highlightedElRef.current.classList.remove(TOUR_HIGHLIGHT_CLASS)
        highlightedElRef.current = null
      }
      const el = document.querySelector(`[data-tour="${stepId}"]`)
      if (el) {
        el.classList.add(TOUR_HIGHLIGHT_CLASS)
        highlightedElRef.current = el
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      }
    }, delay)
    return () => {
      clearTimeout(t)
      if (highlightedElRef.current) {
        highlightedElRef.current.classList.remove(TOUR_HIGHLIGHT_CLASS)
        highlightedElRef.current = null
      }
    }
  }, [tourActive, currentStep?.id])

  if (!tourActive || !currentStep) return null

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-backdrop" onClick={closeTour} aria-hidden />
      <div className="tour-card">
        <div className="tour-header">
          <h2 id="tour-title" className="tour-title">
            Guía de la aplicación
          </h2>
          <span className="tour-step-indicator">
            Paso {(TOUR_STEPS.findIndex((s) => s.id === currentStep.id) + 1) || TOUR_STEPS.length} de {TOUR_STEPS.length}
          </span>
        </div>
        <h3 className="tour-step-title">{currentStep.title}</h3>
        <p className="tour-step-desc">{currentStep.description}</p>
        <div className="tour-actions">
          <button type="button" className="btn btn-secondary tour-btn-close" onClick={closeTour}>
            Cerrar
          </button>
          <div className="tour-nav">
            {!isFirstStep && (
              <button type="button" className="btn btn-secondary" onClick={prevStep}>
                Anterior
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={nextStep}>
              {isLastStep ? 'Finalizar' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TourRecorrido
