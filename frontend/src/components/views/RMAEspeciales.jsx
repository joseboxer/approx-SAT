import React, { useState, useEffect, useCallback, useRef } from 'react'
import { API_URL, AUTH_STORAGE_KEY, OPCIONES_ESTADO } from '../../constants'
import ProgressBar from '../ProgressBar'
import ModalNotificar from '../ModalNotificar'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

/** Extrae año y mes del source_path (ej. ".../2024/05/archivo.xlsx" -> { year: "2024", month: "05" }). */
function parseYearMonthFromPath(sourcePath) {
  if (!sourcePath || typeof sourcePath !== 'string') return null
  const normalized = sourcePath.replace(/\\/g, '/').trim()
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length < 3) return null
  const month = parts[parts.length - 2]
  const year = parts[parts.length - 3]
  if (/^\d{4}$/.test(year) && /^\d{1,2}$/.test(month)) return { year, month }
  return null
}

/** Agrupa RMAs por año y mes según source_path. Devuelve { year: { month: [rma, ...] } }. */
function groupByYearMonth(list) {
  const byYear = {}
  for (const r of list) {
    const ym = parseYearMonthFromPath(r.source_path)
    const year = ym ? ym.year : '_'
    const month = ym ? ym.month : '_'
    if (!byYear[year]) byYear[year] = {}
    if (!byYear[year][month]) byYear[year][month] = []
    byYear[year][month].push(r)
  }
  return byYear
}

function colIndexToLetter(idx) {
  let s = ''
  let n = idx
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s || 'A'
}

const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
function formatCreatedAt(createdAt) {
  if (!createdAt) return '—'
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return createdAt
  const day = d.getDate()
  const month = MESES[d.getMonth() + 1] || (d.getMonth() + 1)
  const year = d.getFullYear()
  return `${day} ${month} ${year}`
}

function RMAEspeciales({ setVista }) {
  const [list, setList] = useState([])
  const [detalle, setDetalle] = useState(null)
  const [scanResult, setScanResult] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [scanTaskId, setScanTaskId] = useState(null)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanMessage, setScanMessage] = useState('')
  const [error, setError] = useState(null)
  const scanPollRef = useRef(null)
  const [detalleId, setDetalleId] = useState(null)
  const [updatingLineaEstadoId, setUpdatingLineaEstadoId] = useState(null)
  const [notificarOpen, setNotificarOpen] = useState(false)
  const [notificarRef, setNotificarRef] = useState(null)
  const [asignarOpen, setAsignarOpen] = useState(false)
  const [asignarFile, setAsignarFile] = useState(null)
  const [asignarColSerial, setAsignarColSerial] = useState('')
  const [asignarColFallo, setAsignarColFallo] = useState('')
  const [asignarColResolucion, setAsignarColResolucion] = useState('')
  const [asignarGrid, setAsignarGrid] = useState(null)
  const [asignarHeaderRow, setAsignarHeaderRow] = useState(0)
  const [asignarColSerialIdx, setAsignarColSerialIdx] = useState(0)
  const [asignarColFalloIdx, setAsignarColFalloIdx] = useState(0)
  const [asignarColResolucionIdx, setAsignarColResolucionIdx] = useState(0)
  const [importando, setImportando] = useState(false)
  const [viewMode, setViewMode] = useState('lista') // 'lista' | 'carpetas'
  const [folderNav, setFolderNav] = useState(null)   // null | { year } | { year, month }

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

  useEffect(() => {
    if (!asignarOpen || !asignarFile?.path) return
    const path = encodeURIComponent(asignarFile.path)
    fetch(`${API_URL}/api/rma-especiales/excel-preview?path=${path}`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Error al cargar vista previa'))))
      .then((data) => setAsignarGrid(data.rows || []))
      .catch(() => setAsignarGrid([]))
  }, [asignarOpen, asignarFile?.path])

  const handleEscanear = () => {
    setError(null)
    setScanResult(null)
    setScanProgress(0)
    setScanMessage('Iniciando...')
    fetch(`${API_URL}/api/rma-especiales/scan`, { method: 'POST', headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.detail || 'Error al escanear')))))
      .then((data) => {
        if (data.task_id) setScanTaskId(data.task_id)
        else setError('No se recibió task_id')
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    if (!scanTaskId) return
    const poll = () => {
      fetch(`${API_URL}/api/tasks/${scanTaskId}`, { headers: getAuthHeaders() })
        .then((r) => (r.ok ? r.json() : {}))
        .then((data) => {
          setScanProgress(data.percent ?? 0)
          setScanMessage(data.message ?? '')
          if (data.status === 'done') {
            if (data.result?.items != null) {
              setScanResult({ items: data.result.items, total: data.result.total ?? data.result.items.length })
            }
            setScanTaskId(null)
          } else if (data.status === 'error') {
            setError(data.message || 'Error en el escaneo')
            setScanTaskId(null)
          }
        })
        .catch(() => {})
    }
    poll()
    scanPollRef.current = setInterval(poll, 500)
    return () => {
      if (scanPollRef.current) clearInterval(scanPollRef.current)
    }
  }, [scanTaskId])

  const escaneando = !!scanTaskId

  const handleImportar = async (item) => {
    if (item.missing && item.missing.length > 0) {
      setAsignarFile(item)
      setAsignarGrid(null)
      setAsignarHeaderRow(0)
      setAsignarColSerialIdx(0)
      setAsignarColFalloIdx(0)
      setAsignarColResolucionIdx(0)
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
          setAsignarGrid(null)
          setAsignarHeaderRow(0)
          setAsignarColSerialIdx(0)
          setAsignarColFalloIdx(0)
          setAsignarColResolucionIdx(0)
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
    const pathJustImported = asignarFile.path
    setImportando(true)
    setError(null)
    const useGrid = Array.isArray(asignarGrid) && asignarGrid.length > 0
    const body = useGrid
      ? {
          path: asignarFile.path,
          rma_number: asignarFile.rma_number,
          header_row: asignarHeaderRow,
          column_serial_index: asignarColSerialIdx,
          column_fallo_index: asignarColFalloIdx,
          column_resolucion_index: asignarColResolucionIdx,
        }
      : {
          path: asignarFile.path,
          rma_number: asignarFile.rma_number,
          column_serial: asignarColSerial || null,
          column_fallo: asignarColFallo || null,
          column_resolucion: asignarColResolucion || null,
        }
    fetch(`${API_URL}/api/rma-especiales/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.id) {
          setAsignarOpen(false)
          setAsignarFile(null)
          refetch()
          // Recomprobar el resto de Excels con los nuevos aliases: los que tengan las mismas columnas pasan a "Importar"
          if (scanResult && scanResult.items) {
            const itemsWithoutImported = scanResult.items.filter((i) => i.path !== pathJustImported)
            const recheckPaths = itemsWithoutImported
              .filter((i) => i.missing && i.missing.length > 0)
              .map((i) => i.path)
            if (recheckPaths.length > 0) {
              fetch(`${API_URL}/api/rma-especiales/recheck`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ paths: recheckPaths }),
              })
                .then((res) => (res.ok ? res.json() : { items: [] }))
                .then((recheckData) => {
                  const recheckMap = new Map((recheckData.items || []).map((r) => [r.path, r]))
                  const updatedItems = itemsWithoutImported.map((item) => recheckMap.get(item.path) ?? item)
                  setScanResult({ ...scanResult, items: updatedItems, total: updatedItems.length })
                })
                .catch(() => setScanResult({ ...scanResult, items: itemsWithoutImported, total: itemsWithoutImported.length }))
            } else {
              setScanResult({ ...scanResult, items: itemsWithoutImported, total: itemsWithoutImported.length })
            }
          }
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setImportando(false))
  }

  const handleVerDetalle = (id) => {
    setDetalle(null)
    setDetalleId(id)
    fetch(`${API_URL}/api/rma-especiales/${id}`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDetalle)
      .catch(() => setDetalle(null))
  }

  const handleVolverListado = () => {
    setDetalleId(null)
    setDetalle(null)
    refetch()
  }

  const handleLineaEstadoChange = (lineaId, estado) => {
    setUpdatingLineaEstadoId(lineaId)
    fetch(`${API_URL}/api/rma-especiales/lineas/${lineaId}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ estado }),
    })
      .then((r) => {
        if (r.ok && detalle && detalle.lineas) {
          setDetalle({
            ...detalle,
            lineas: detalle.lineas.map((lin) =>
              lin.id === lineaId ? { ...lin, estado } : lin
            ),
          })
        }
      })
      .finally(() => setUpdatingLineaEstadoId(null))
  }

  const conFaltantes = scanResult?.items?.filter((i) => i.missing && i.missing.length > 0) || []

  const byYearMonth = groupByYearMonth(list)
  const years = Object.keys(byYearMonth).filter((y) => y !== '_').sort((a, b) => Number(b) - Number(a))
  if (byYearMonth._) years.push('_')

  function renderVistaCarpetas() {
    const hasYear = folderNav && folderNav.year
    const hasMonth = hasYear && folderNav.month

    if (!hasYear) {
      return (
        <div className="rma-especiales-carpetas">
          <p className="rma-especiales-carpetas-desc">Organizado como en el directorio: año → mes → RMAs.</p>
          <div className="rma-especiales-grid rma-especiales-grid-years">
            {years.map((year) => {
              const months = byYearMonth[year] ? Object.keys(byYearMonth[year]) : []
              const totalRmas = months.reduce((acc, m) => acc + (byYearMonth[year][m]?.length || 0), 0)
              return (
                <button
                  key={year}
                  type="button"
                  className="rma-especiales-card rma-especiales-card-year"
                  onClick={() => setFolderNav({ year })}
                >
                  <span className="rma-especiales-card-icon" aria-hidden>📁</span>
                  <span className="rma-especiales-card-title">{year === '_' ? 'Otros' : year}</span>
                  <span className="rma-especiales-card-meta">{totalRmas} RMA{totalRmas !== 1 ? 's' : ''}</span>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    const monthsInYear = byYearMonth[folderNav.year] ? Object.keys(byYearMonth[folderNav.year]).sort((a, b) => (folderNav.year === '_' ? 0 : Number(b) - Number(a))) : []

    if (!hasMonth) {
      return (
        <div className="rma-especiales-carpetas">
          <div className="rma-especiales-breadcrumb">
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setFolderNav(null)}>
              ← Años
            </button>
            <span className="rma-especiales-breadcrumb-current">{folderNav.year === '_' ? 'Otros' : folderNav.year}</span>
          </div>
          <div className="rma-especiales-grid rma-especiales-grid-months">
            {monthsInYear.map((month) => {
              const rmas = byYearMonth[folderNav.year][month] || []
              const monthName = month === '_' ? 'Sin mes' : (MESES[parseInt(month, 10)] || month)
              return (
                <button
                  key={month}
                  type="button"
                  className="rma-especiales-card rma-especiales-card-month"
                  onClick={() => setFolderNav({ year: folderNav.year, month })}
                >
                  <span className="rma-especiales-card-icon" aria-hidden>📂</span>
                  <span className="rma-especiales-card-title">{monthName}</span>
                  <span className="rma-especiales-card-meta">{rmas.length} RMA{rmas.length !== 1 ? 's' : ''}</span>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    const rmasInMonth = (byYearMonth[folderNav.year] && byYearMonth[folderNav.year][folderNav.month]) ? byYearMonth[folderNav.year][folderNav.month] : []
    const monthName = folderNav.month === '_' ? 'Sin mes' : (MESES[parseInt(folderNav.month, 10)] || folderNav.month)

    return (
      <div className="rma-especiales-carpetas">
        <div className="rma-especiales-breadcrumb">
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setFolderNav(null)}>
            ← Años
          </button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setFolderNav({ year: folderNav.year })}>
            {folderNav.year === '_' ? 'Otros' : folderNav.year}
          </button>
          <span className="rma-especiales-breadcrumb-current">{monthName}</span>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nº RMA</th>
                <th>Líneas</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rmasInMonth.map((r) => (
                <tr key={r.id}>
                  <td>{r.rma_number}</td>
                  <td>{r.line_count ?? 0}</td>
                  <td>{formatCreatedAt(r.created_at)}</td>
                  <td>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleVerDetalle(r.id)}>
                      Ver
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => { setNotificarRef({ id: r.id, rma_number: r.rma_number }); setNotificarOpen(true) }}
                    >
                      Notificar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (cargando && list.length === 0) return <p className="loading">Cargando RMA especiales...</p>

  // Vista detalle: tabla de líneas del RMA especial (estilo lista RMA), con estado por producto
  if (detalleId != null) {
    if (!detalle || !detalle.rma_number) {
      return (
        <>
          <button type="button" className="btn btn-secondary btn-back" onClick={handleVolverListado}>
            ← Volver al listado
          </button>
          <p className="loading">Cargando RMA...</p>
        </>
      )
    }
    return (
      <>
        <div className="rma-especiales-detalle-header">
          <button type="button" className="btn btn-secondary btn-back" onClick={handleVolverListado}>
            ← Volver al listado
          </button>
          <h1 className="page-title">RMA {detalle.rma_number}</h1>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Ref. proveedor</th>
                <th>Nº serie</th>
                <th>Fallo</th>
                <th>Resolución</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {(detalle.lineas || []).map((lin) => (
                <tr key={lin.id}>
                  <td>{lin.ref_proveedor || '—'}</td>
                  <td>{lin.serial || '—'}</td>
                  <td>{lin.fallo || '—'}</td>
                  <td>{lin.resolucion || '—'}</td>
                  <td>
                    <select
                      className="rma-estado-inline-select"
                      value={lin.estado || ''}
                      onChange={(e) => handleLineaEstadoChange(lin.id, e.target.value)}
                      disabled={updatingLineaEstadoId === lin.id}
                    >
                      {OPCIONES_ESTADO.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  }

  return (
    <>
      <h1 className="page-title">RMA especiales</h1>
      <p className="notificaciones-desc">
        RMAs que no están en el Excel principal. Están en la carpeta «RMA Mayoristas, especiales, cargadores, etc» por año y mes. Un Excel = un RMA; el número RMA se toma del nombre del archivo.
      </p>

      <div className="rma-especiales-toolbar">
        <div className="rma-especiales-view-toggle">
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'lista' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setViewMode('lista'); setFolderNav(null) }}
          >
            Lista
          </button>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'carpetas' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('carpetas')}
          >
            Carpetas
          </button>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleEscanear}
          disabled={escaneando}
        >
          {escaneando ? 'Escaneando…' : 'Escanear carpeta'}
        </button>
      </div>

      {escaneando && (
        <ProgressBar
          percent={scanProgress}
          message={scanMessage}
          className="rma-especiales-scan-progress"
        />
      )}

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
      ) : viewMode === 'carpetas' ? (
        renderVistaCarpetas()
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nº RMA</th>
                <th>Líneas</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{r.rma_number}</td>
                  <td>{r.line_count ?? 0}</td>
                  <td>{formatCreatedAt(r.created_at)}</td>
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

      {asignarOpen && asignarFile && (
        <div className="modal-overlay" onClick={() => !importando && setAsignarOpen(false)} role="dialog" aria-modal="true">
          <div className="modal rma-especiales-asignar-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-titulo">Asignar celdas del Excel</h2>
            <p className="modal-notificar-desc">
              Archivo: <strong>{asignarFile.path}</strong>. Indica la <strong>fila de cabecera</strong> y qué <strong>columna</strong> corresponde a cada concepto. Si otro archivo tiene las mismas celdas, se reconocerá automáticamente.
            </p>
            {asignarGrid === null ? (
              <p className="loading">Cargando vista previa del Excel...</p>
            ) : Array.isArray(asignarGrid) && asignarGrid.length > 0 ? (
              (() => {
                const maxCols = Math.max(...asignarGrid.map((row) => (row || []).length), 1)
                return (
              <>
                <div className="rma-especiales-excel-grid-wrap">
                  <table className="rma-especiales-excel-grid">
                    <thead>
                      <tr>
                        <th></th>
                        {Array.from({ length: maxCols }, (_, ci) => (
                          <th key={ci}>{colIndexToLetter(ci)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {asignarGrid.map((row, ri) => (
                        <tr key={ri} className={ri === asignarHeaderRow ? 'rma-especiales-header-row' : ''}>
                          <td className="rma-especiales-row-num">{ri}</td>
                          {Array.from({ length: maxCols }, (_, ci) => {
                            const cell = (row || [])[ci]
                            return <td key={ci} title={cell}>{cell || '\u00A0'}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="rma-especiales-asignar-fields">
                  <div className="modal-notificar-field">
                    <label>Fila de cabecera (número de fila)</label>
                    <select
                      value={asignarHeaderRow}
                      onChange={(e) => setAsignarHeaderRow(Number(e.target.value))}
                    >
                      {asignarGrid.map((_, ri) => (
                        <option key={ri} value={ri}>Fila {ri}</option>
                      ))}
                    </select>
                  </div>
                  {(() => {
                    const headerRow = asignarGrid[asignarHeaderRow] || []
                    return (
                      <>
                        <div className="modal-notificar-field">
                          <label>Columna Nº serie</label>
                          <select value={asignarColSerialIdx} onChange={(e) => setAsignarColSerialIdx(Number(e.target.value))}>
                            {Array.from({ length: maxCols }, (_, i) => (
                              <option key={i} value={i}>{colIndexToLetter(i)} ({headerRow[i] || '—'})</option>
                            ))}
                          </select>
                        </div>
                        <div className="modal-notificar-field">
                          <label>Columna Fallo</label>
                          <select value={asignarColFalloIdx} onChange={(e) => setAsignarColFalloIdx(Number(e.target.value))}>
                            {Array.from({ length: maxCols }, (_, i) => (
                              <option key={i} value={i}>{colIndexToLetter(i)} ({headerRow[i] || '—'})</option>
                            ))}
                          </select>
                        </div>
                        <div className="modal-notificar-field">
                          <label>Columna Resolución</label>
                          <select value={asignarColResolucionIdx} onChange={(e) => setAsignarColResolucionIdx(Number(e.target.value))}>
                            {Array.from({ length: maxCols }, (_, i) => (
                              <option key={i} value={i}>{colIndexToLetter(i)} ({headerRow[i] || '—'})</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )
                  })()}
                </div>
                <div className="modal-pie modal-pie-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => !importando && setAsignarOpen(false)} disabled={importando}>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleAsignarSubmit} disabled={importando}>
                    {importando ? 'Importando…' : 'Importar y guardar formato'}
                  </button>
                </div>
              </>
                )
              })()
            ) : (
              <>
                <p className="modal-notificar-desc">No se pudo cargar la vista previa. Asigna por nombre de columna:</p>
                <div className="modal-notificar-field">
                  <label>Columna Nº de serie</label>
                  <select value={asignarColSerial} onChange={(e) => setAsignarColSerial(e.target.value)}>
                    <option value="">— No usar —</option>
                    {(asignarFile.headers || []).map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                <div className="modal-notificar-field">
                  <label>Columna Fallo</label>
                  <select value={asignarColFallo} onChange={(e) => setAsignarColFallo(e.target.value)}>
                    <option value="">— No usar —</option>
                    {(asignarFile.headers || []).map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                <div className="modal-notificar-field">
                  <label>Columna Resolución</label>
                  <select value={asignarColResolucion} onChange={(e) => setAsignarColResolucion(e.target.value)}>
                    <option value="">— No usar —</option>
                    {(asignarFile.headers || []).map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                <div className="modal-pie modal-pie-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => !importando && setAsignarOpen(false)} disabled={importando}>Cancelar</button>
                  <button type="button" className="btn btn-primary" onClick={handleAsignarSubmit} disabled={importando}>{importando ? 'Importando…' : 'Importar'}</button>
                </div>
              </>
            )}
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
