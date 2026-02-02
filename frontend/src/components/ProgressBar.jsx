import React from 'react'

/**
 * Barra de progreso en tiempo real.
 * @param {number|null} percent - 0-100 o null para modo indeterminado (animación)
 * @param {string} [message] - Texto debajo o junto a la barra
 * @param {string} [className] - Clases adicionales
 */
function ProgressBar({ percent = 0, message = '', className = '' }) {
  const indeterminate = percent == null
  const pct = indeterminate ? 0 : Math.min(100, Math.max(0, Number(percent)))

  return (
    <div className={`progress-bar-wrap ${className}`.trim()} role="progressbar" aria-valuenow={indeterminate ? undefined : pct} aria-valuemin={0} aria-valuemax={100} aria-label={message || 'Progreso'}>
      <div className="progress-bar-track">
        <div
          className={`progress-bar-fill ${indeterminate ? 'progress-bar-indeterminate' : ''}`}
          style={indeterminate ? {} : { width: `${pct}%` }}
        />
      </div>
      {message && <p className="progress-bar-message">{message}</p>}
    </div>
  )
}

export default ProgressBar
