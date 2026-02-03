import React, { useState } from 'react'
import { API_URL, AUTH_STORAGE_KEY } from '../../constants'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

/**
 * Apartado Informes: genera informes (Atractor, etc.) y opción de descarga.
 */
function Informes() {
  const [atractorDesde, setAtractorDesde] = useState('')
  const [atractorHasta, setAtractorHasta] = useState('')
  const [atractorCargando, setAtractorCargando] = useState(false)
  const [atractorError, setAtractorError] = useState(null)
  const [atractorDatos, setAtractorDatos] = useState(null)

  const pedirInformeVentasAtractor = () => {
    const desde = atractorDesde.trim().slice(0, 10)
    const hasta = atractorHasta.trim().slice(0, 10)
    if (!desde || !hasta) {
      setAtractorError('Indica el rango de fechas (desde y hasta).')
      return
    }
    setAtractorError(null)
    setAtractorDatos(null)
    setAtractorCargando(true)
    fetch(`${API_URL}/api/atractor/informe-ventas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ desde, hasta }),
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (data.detail) throw new Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))
        setAtractorDatos(data.datos ?? data)
      })
      .catch((err) => setAtractorError(err.message || 'Error al obtener el informe'))
      .finally(() => setAtractorCargando(false))
  }

  const renderAtractorResult = (datos) => {
    if (datos == null) return null
    if (Array.isArray(datos) && datos.length > 0 && typeof datos[0] === 'object') {
      const keys = [...new Set(datos.flatMap((o) => Object.keys(o)))]
      return (
        <div className="table-wrapper informes-atractor-tabla-wrap">
          <table className="informe-tabla">
            <thead>
              <tr>
                {keys.map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.map((row, i) => (
                <tr key={i}>
                  {keys.map((k) => (
                    <td key={k}>{row[k] != null ? String(row[k]) : '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    return (
      <pre className="informes-atractor-raw">
        {typeof datos === 'object' ? JSON.stringify(datos, null, 2) : String(datos)}
      </pre>
    )
  }

  return (
    <div className="informes-page">
      <h1 className="page-title">Informes</h1>
      <p className="informes-intro">
        Informes desde distintas fuentes. Configura Atractor en Configuración (URL, usuario y contraseña) para poder solicitar el informe de ventas.
      </p>

      <section className="informes-seccion" aria-labelledby="informes-atractor">
        <h2 id="informes-atractor" className="informes-seccion-titulo">
          Informe de ventas totalizadas (Atractor)
        </h2>
        <p className="informes-seccion-desc">
          Obtiene el informe de ventas desde Atractor para el rango de fechas indicado. La URL, usuario y contraseña se configuran en Configuración.
        </p>
        <div className="informes-atractor-controls">
          <label className="informes-atractor-label">
            Desde
            <input
              type="date"
              value={atractorDesde}
              onChange={(e) => setAtractorDesde(e.target.value)}
              className="informes-atractor-input"
            />
          </label>
          <label className="informes-atractor-label">
            Hasta
            <input
              type="date"
              value={atractorHasta}
              onChange={(e) => setAtractorHasta(e.target.value)}
              className="informes-atractor-input"
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={pedirInformeVentasAtractor}
            disabled={atractorCargando}
          >
            {atractorCargando ? 'Cargando...' : 'Obtener informe'}
          </button>
        </div>
        {atractorError && (
          <p className="error-msg informes-atractor-error" role="alert">
            {atractorError}
          </p>
        )}
        {atractorDatos != null && (
          <div className="informes-atractor-result">
            <h3 className="informes-atractor-result-titulo">Resultado</h3>
            {renderAtractorResult(atractorDatos)}
          </div>
        )}
      </section>

      <section className="informes-seccion" aria-labelledby="informes-descarga">
        <h2 id="informes-descarga" className="informes-seccion-titulo">
          Descargar en Excel
        </h2>
        <p className="informes-seccion-desc">
          Opción para descargar el informe generado en formato Excel (próximamente).
        </p>
        <div className="informes-acciones">
          <button
            type="button"
            className="btn btn-primary informes-btn-descarga"
            disabled
            title="Se habilitará cuando se implemente"
          >
            Descargar Excel (próximamente)
          </button>
        </div>
      </section>
    </div>
  )
}

export default Informes
