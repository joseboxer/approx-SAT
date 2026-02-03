import React, { useEffect } from 'react'
import { useTour, TOUR_STEPS } from '../context/TourContext'

/**
 * Overlay del recorrido de aprendizaje. Muestra el paso actual y permite Siguiente / Anterior / Cerrar.
 * Recibe setVista para cambiar la vista según el paso.
 */
function TourRecorrido({ setVista }) {
  const { tourActive, currentStep, isFirstStep, isLastStep, nextStep, prevStep, closeTour } = useTour()

  useEffect(() => {
    if (tourActive && currentStep?.vista) {
      setVista(currentStep.vista)
    }
  }, [tourActive, currentStep?.vista, setVista])

  if (!tourActive || !currentStep) return null

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-backdrop" onClick={closeTour} aria-hidden />
      <div className="tour-card">
        <div className="tour-header">
          <h2 id="tour-title" className="tour-title">
            Recorrido de aprendizaje
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
