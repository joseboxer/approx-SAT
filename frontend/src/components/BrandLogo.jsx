import React from 'react'

/**
 * Logo "aqprox": usa el SVG public/63.svg.
 * Animación: primero la "x" centrada y grande, luego transición rápida a logo completo.
 */
function BrandLogo() {
  return (
    <div className="brand-logo-wrap" aria-hidden role="img">
      <img
        src="/63.svg"
        alt=""
        className="brand-logo-img"
      />
    </div>
  )
}

export default BrandLogo
