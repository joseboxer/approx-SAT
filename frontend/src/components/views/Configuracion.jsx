import React, { useState, useEffect, useCallback } from 'react'
import { API_URL, AUTH_STORAGE_KEY } from '../../constants'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

/**
 * Vista Configuración: editar rutas de QNAP (catálogo productos) y Excel (sincronización RMA)
 * sin tocar archivos .env.
 */
function Configuracion() {
  const [productosCatalogPath, setProductosCatalogPath] = useState('')
  const [excelSyncPath, setExcelSyncPath] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetMensaje, setResetMensaje] = useState(null)
  const [resetError, setResetError] = useState(null)

  const cargar = useCallback(() => {
    setCargando(true)
    setError(null)
    fetch(`${API_URL}/api/settings`, { headers: getAuthHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error('Error al cargar configuración')
        return res.json()
      })
      .then((data) => {
        setProductosCatalogPath(data.PRODUCTOS_CATALOG_PATH ?? '')
        setExcelSyncPath(data.EXCEL_SYNC_PATH ?? '')
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const recargarRmaConfirm = () => {
    setResetting(true)
    setResetError(null)
    setResetMensaje(null)
    fetch(`${API_URL}/api/productos/sync-reset`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((e) => { throw new Error(e.detail || 'Error al recargar') })
        return res.json()
      })
      .then((data) => {
        setShowResetConfirm(false)
        setResetMensaje(data.mensaje + (data.cargados != null ? ` Registros cargados: ${data.cargados}.` : ''))
      })
      .catch((err) => setResetError(err.message))
      .finally(() => setResetting(false))
  }

  const guardar = () => {
    setGuardando(true)
    setMensaje(null)
    setError(null)
    fetch(`${API_URL}/api/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        PRODUCTOS_CATALOG_PATH: productosCatalogPath.trim(),
        EXCEL_SYNC_PATH: excelSyncPath.trim(),
      }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((e) => { throw new Error(e.detail || 'Error al guardar') })
        return res.json()
      })
      .then(() => {
        setMensaje('Configuración guardada correctamente.')
      })
      .catch((err) => setError(err.message || 'Error al guardar'))
      .finally(() => setGuardando(false))
  }

  if (cargando) return <p className="loading">Cargando configuración...</p>
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <>
      <h1 className="page-title">Configuración</h1>
      <p className="configuracion-desc">
        Rutas de red y archivos. Se guardan en la aplicación (no se modifican archivos del servidor).
      </p>

      <section className="configuracion-form" aria-label="Rutas">
        <div className="configuracion-field">
          <label htmlFor="config-productos-catalog-path">
            Ruta catálogo de productos (QNAP)
          </label>
          <input
            id="config-productos-catalog-path"
            type="text"
            value={productosCatalogPath}
            onChange={(e) => setProductosCatalogPath(e.target.value)}
            placeholder="Ej. \\\\Qnap-approx2\\z\\DEPT. TEC\\PRODUCTOS"
            className="configuracion-input"
          />
          <span className="configuracion-hint">
            Carpeta donde están las marcas y productos (Excel técnico con D31/D28). Las rutas con espacios (ej. DEPT. TEC\PRODUCTOS) se leen correctamente.
          </span>
        </div>

        <div className="configuracion-field">
          <label htmlFor="config-excel-sync-path">
            Ruta Excel sincronización RMA
          </label>
          <input
            id="config-excel-sync-path"
            type="text"
            value={excelSyncPath}
            onChange={(e) => setExcelSyncPath(e.target.value)}
            placeholder="Ej. \\\\Qnap-approx2\\ruta\\productos.xlsx o ruta local"
            className="configuracion-input"
          />
          <span className="configuracion-hint">
            Ruta completa al archivo Excel (incluyendo nombre del archivo). Se usa al pulsar &quot;Sincronizar&quot; en Inicio (mismo origen que Lista RMA). El archivo puede llamarse como quieras; las rutas con espacios (ej. DEPT. TEC\archivo nombre.xlsx) se leen correctamente.
          </span>
        </div>

        <div className="configuracion-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={guardar}
            disabled={guardando}
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>

        {mensaje && <p className="configuracion-ok">{mensaje}</p>}
      </section>

      <section className="configuracion-form configuracion-reset" aria-label="Recargar lista RMA">
        <h2 className="configuracion-subtitle">Recargar lista RMA desde Excel</h2>
        <p className="configuracion-desc">
          Borra todos los registros RMA y vuelve a cargar la lista entera desde el archivo Excel configurado arriba.
          Cada registro tendrá su número de fila (orden por antigüedad). Se pierden estados, fechas editadas y ocultos.
        </p>
        <div className="configuracion-actions">
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => { setResetError(null); setResetMensaje(null); setShowResetConfirm(true); }}
            disabled={resetting}
          >
            Recargar lista RMA desde Excel
          </button>
        </div>
        {resetMensaje && <p className="configuracion-ok">{resetMensaje}</p>}
        {resetError && <p className="error-msg">{resetError}</p>}
      </section>

      {showResetConfirm && (
        <div
          className="modal-overlay"
          onClick={() => !resetting && setShowResetConfirm(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
        >
          <div className="modal modal-confirm" onClick={(e) => e.stopPropagation()}>
            <h2 id="reset-modal-title" className="modal-titulo">¿Recargar lista RMA?</h2>
            <p className="modal-confirm-text">
              Se borrarán <strong>todos</strong> los registros RMA y se volverán a cargar desde el Excel configurado.
              Los estados (abonado, reparado…), fechas editadas y registros ocultos se perderán. Esta acción no se puede deshacer.
            </p>
            {resetError && <p className="error-msg">{resetError}</p>}
            <div className="modal-pie modal-pie-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => !resetting && setShowResetConfirm(false)}
                disabled={resetting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={recargarRmaConfirm}
                disabled={resetting}
              >
                {resetting ? 'Recargando...' : 'Recargar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Configuracion
