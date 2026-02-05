import React, { useState, useEffect, useCallback } from 'react'
import { API_URL, AUTH_STORAGE_KEY, OPCIONES_ESTADO } from '../../constants'
import ModalNotificar from '../ModalNotificar'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

function RMAEspeciales({ setVista }) {
  const [list, setList] = useState([])
  const [detalle, setDetalle] = useState(null)
  const [scanResult, setScanResult] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [escaneando, setEscaneando] = useState(false)
  const [error, setError] = useState(null)
  const [updatingEstadoId, setUpdatingEstadoId] = useState(null)
  const [notificarOpen, setNotificarOpen] = useState(false)
  const [notificarRef, setNotificarRef] = useState(null)
  const [asignarOpen, setAsignarOpen] = useState(false)
  const [asignarFile, setAsignarFile] = useState(null)
  const [asignarHeaders, setAsignarHeaders] = useState([])
  const [asignarColSerial, setAsignarColSerial] = useState('')
  const [asignarColFallo, setAsignarColFallo] = useState('')
  const [asignarColResolucion, setAsignarColResolucion] = useState('')
  const [importando, setImportando] = useState(false)

  const refetch = useCallback(() => {
    setCargando(true)
    setError(null)
    fetch(`${API_URL}/api/rma-especiales`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Error al cargar'))))
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const handleEscanear = () => {
    setEscaneando(true)
    setError(null)
    setScanResult(null)
    fetch(`${API_URL}/api/rma-especiales/scan`, { method: 'POST', headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.detail || 'Error al escanear')))))
      .then((data) => setScanResult(data))
      .catch((err) => setError(err.message))
      .finally(() => setEscaneando(false))
  }

  const handleImportar = async (item) => {
    if (item.missing && item.missing.length > 0) {
      setAsignarFile(item)
      setAsignarHeaders(item.headers || [])
      setAsignarColSerial('')
      setAsignarColFallo('')
      setAsignarColResolucion('')
      setAsignarOpen(true)
      return
    }
    setImportando(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/rma-especiales/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ path: item.path, rma_number: item.rma_number }),
      })
      const data = await res.json()
      if (!res.ok) {
        const raw = data.detail
        const parsed = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) } catch { return null } })() : raw
        if (parsed && parsed.code === 'columns_missing') {
          setAsignarFile({ path: item.path, rma_number: item.rma_number, headers: parsed.headers || [], missing: parsed.missing })
          setAsignarHeaders(parsed.headers || [])
          setAsignarColSerial('')
          setAsignarColFallo('')
          setAsignarColResolucion('')
          setAsignarOpen(true)
          return
        }
        throw new Error(parsed?.message || (typeof raw === 'string' ? raw : 'Error al importar'))
      }
      refetch()
      if (scanResult && scanResult.items) {
        setScanResult({ ...scanResult, items: scanResult.items.filter((i) => i.path !== item.path) })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setImportando(false)
    }
  }

  const handleAsignarSubmit = () => {
    if (!asignarFile) return
    setImportando(true)
    setError(null)
    fetch(`${API_URL}/api/rma-especiales/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        path: asignarFile.path,
        rma_number: asignarFile.rma_number,
        column_serial: asignarColSerial || null,
        column_fallo: asignarColFallo || null,
        column_resolucion: asignarColResolucion || null,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.id) {
          setAsignarOpen(false)
          setAsignarFile(null)
          refetch()
          if (scanResult && scanResult.items) {
            setScanResult({ ...scanResult, items: scanResult.items.filter((i) => i.path !== asignarFile.path) })
          }
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setImportando(false))
  }

  const handleVerDetalle = (id) => {
    fetch(`${API_URL}/api/rma-especiales/${id}`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDetalle)
      .catch(() => setDetalle(null))
  }

  const handleEstadoChange = (id, estado) => {
    setUpdatingEstadoId(id)
    fetch(`${API_URL}/api/rma-especiales/${id}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ estado }),
    })
      .then((r) => {
        if (r.ok) refetch()
      })
      .finally(() => setUpdatingEstadoId(null))
  }

  const conFaltantes = scanResult?.items?.filter((i) => i.missing && i.missing.length > 0) || []

  if (cargando && list.length === 0) return <p className="loading">Cargando RMA especiales...</p>

  return (
    <>
      <h1 className="page-title">RMA especiales</h1>
      <p className="notificaciones-desc">
        RMAs que no están en el Excel principal. Están en la carpeta «RMA Mayoristas, especiales, cargadores, etc» por año y mes. Un Excel = un RMA; el número RMA se toma del nombre del archivo.
      </p>

      <div className="rma-especiales-toolbar">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleEscanear}
          disabled={escaneando}
        >
          {escaneando ? 'Escaneando…' : 'Escanear carpeta'}
        </button>
      </div>

      {error && (
        <div className="error-msg" role="alert">
          {error}
        </div>
      )}

      {scanResult && (
        <div className="rma-especiales-scan-result card">
          <h3>Resultado del escaneo</h3>
          <p>
            Se encontraron {scanResult.total ?? 0} archivos.
            {conFaltantes.length > 0 && (
              <span> {conFaltantes.length} con columnas no reconocidas (asigna columnas manualmente).</span>
            )}
          </p>
          {scanResult.items && scanResult.items.length > 0 && (
            <ul className="rma-especiales-scan-list">
              {scanResult.items.map((item) => (
                <li key={item.path}>
                  <span>{item.rma_number}</span>
                  <span className="rma-especiales-scan-path">{item.path}</span>
                  {item.missing && item.missing.length > 0 ? (
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => handleImportar(item)}>
                      Asignar columnas
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleImportar(item)}
                      disabled={importando}
                    >
                      Importar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {list.length === 0 && !cargando ? (
        <p className="notificaciones-empty">No hay RMA especiales importados. Escanea la carpeta para encontrarlos.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nº RMA</th>
                <th>Líneas</th>
                <th>Estado</th>
                <th>Fecha recibido</th>
                <th>Fecha enviado</th>
                <th>Fecha recogida</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{r.rma_number}</td>
                  <td>{r.line_count ?? 0}</td>
                  <td>
                    <select
                      className="rma-estado-inline-select"
                      value={r.estado || ''}
                      onChange={(e) => handleEstadoChange(r.id, e.target.value)}
                      disabled={updatingEstadoId === r.id}
                    >
                      {OPCIONES_ESTADO.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{r.date_received || '—'}</td>
                  <td>{r.date_sent || '—'}</td>
                  <td>{r.date_pickup || '—'}</td>
                  <td>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleVerDetalle(r.id)}>
                      Ver
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        setNotificarRef({ id: r.id, rma_number: r.rma_number })
                        setNotificarOpen(true)
                      }}
                    >
                      Notificar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <div className="modal-overlay" onClick={() => setDetalle(null)} role="dialog" aria-modal="true">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-titulo">RMA {detalle.rma_number}</h2>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Ref. proveedor</th>
                    <th>Nº serie</th>
                    <th>Fallo</th>
                    <th>Resolución</th>
                  </tr>
                </thead>
                <tbody>
                  {(detalle.lineas || []).map((lin) => (
                    <tr key={lin.id}>
                      <td>{lin.ref_proveedor || '—'}</td>
                      <td>{lin.serial || '—'}</td>
                      <td>{lin.fallo || '—'}</td>
                      <td>{lin.resolucion || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-pie">
              <button type="button" className="btn btn-secondary" onClick={() => setDetalle(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {asignarOpen && asignarFile && (
        <div className="modal-overlay" onClick={() => !importando && setAsignarOpen(false)} role="dialog" aria-modal="true">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-titulo">Asignar columnas</h2>
            <p className="modal-notificar-desc">
              Archivo: <strong>{asignarFile.path}</strong>. Indica qué columna del Excel corresponde a cada concepto.
            </p>
            <div className="modal-notificar-field">
              <label>Columna para Nº de serie</label>
              <select value={asignarColSerial} onChange={(e) => setAsignarColSerial(e.target.value)}>
                <option value="">— No usar —</option>
                {asignarHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-notificar-field">
              <label>Columna para Fallo</label>
              <select value={asignarColFallo} onChange={(e) => setAsignarColFallo(e.target.value)}>
                <option value="">— No usar —</option>
                {asignarHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-notificar-field">
              <label>Columna para Resolución</label>
              <select value={asignarColResolucion} onChange={(e) => setAsignarColResolucion(e.target.value)}>
                <option value="">— No usar —</option>
                {asignarHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-pie modal-pie-actions">
              <button type="button" className="btn btn-secondary" onClick={() => !importando && setAsignarOpen(false)} disabled={importando}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={handleAsignarSubmit} disabled={importando}>
                {importando ? 'Importando…' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalNotificar
        open={notificarOpen}
        onClose={() => { setNotificarOpen(false); setNotificarRef(null) }}
        type="rma_especial"
        referenceData={notificarRef ? { rma_number: notificarRef.rma_number, id: notificarRef.id } : {}}
        onSuccess={() => refetch()}
      />
    </>
  )
}

export default RMAEspeciales
