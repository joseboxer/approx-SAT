import React from 'react'

/**
 * Apartado Informes: genera informes a partir de varias fuentes de datos.
 * - Fuentes de datos: por determinar.
 * - Tipos de informe: por determinar.
 * - Descarga en Excel: opción a integrar.
 * Estructura preparada para añadir detalles más adelante.
 */
function Informes() {
  return (
    <div className="informes-page">
      <h1 className="page-title">Informes</h1>
      <p className="informes-intro">
        Desde aquí se crearán informes combinando varias fuentes de datos.
        Las fuentes y los tipos de informe se definirán más adelante.
      </p>

      <section className="informes-seccion" aria-labelledby="informes-fuentes">
        <h2 id="informes-fuentes" className="informes-seccion-titulo">
          Fuentes de datos
        </h2>
        <p className="informes-seccion-desc">
          Fuentes de datos para los informes (por determinar).
        </p>
        <div className="informes-placeholder">
          <span className="informes-placeholder-text">— Pendiente de definir —</span>
        </div>
      </section>

      <section className="informes-seccion" aria-labelledby="informes-tipos">
        <h2 id="informes-tipos" className="informes-seccion-titulo">
          Tipos de informe
        </h2>
        <p className="informes-seccion-desc">
          Tipos de informe disponibles (por determinar).
        </p>
        <div className="informes-placeholder">
          <span className="informes-placeholder-text">— Pendiente de definir —</span>
        </div>
      </section>

      <section className="informes-seccion" aria-labelledby="informes-descarga">
        <h2 id="informes-descarga" className="informes-seccion-titulo">
          Descargar en Excel
        </h2>
        <p className="informes-seccion-desc">
          Opción para descargar el informe generado en formato Excel.
        </p>
        <div className="informes-acciones">
          <button
            type="button"
            className="btn btn-primary informes-btn-descarga"
            disabled
            title="Se habilitará cuando se definan los informes"
          >
            Descargar Excel (próximamente)
          </button>
        </div>
      </section>
    </div>
  )
}

export default Informes
