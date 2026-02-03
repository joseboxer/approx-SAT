import React, { useState, useEffect, useCallback, useRef } from 'react'
import { API_URL, AUTH_STORAGE_KEY } from '../../constants'
import ProgressBar from '../ProgressBar'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

/** Genera el contenido del .bat para añadir www.Approx-SAT.com al archivo hosts (Windows). */
function getHostsBatContent(serverHost) {
  const host = (serverHost || '').trim() || 'localhost'
  return `@echo off
chcp 65001 >nul
:: Script para añadir www.Approx-SAT.com al archivo hosts (Windows).
:: Ejecutar como administrador: clic derecho en el archivo -> Ejecutar como administrador.

set "HOSTS_PATH=%SystemRoot%\\System32\\drivers\\etc\\hosts"
set "SERVER_HOST=${host}"
set "DOMAIN=www.Approx-SAT.com"

net session >nul 2>&1
if %errorLevel% neq 0 (
  echo Solicitando permisos de administrador...
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$path = [Environment]::ExpandEnvironmentVariables('%HOSTS_PATH%'); $server = '%SERVER_HOST%'; $domain = 'www.Approx-SAT.com'; $newLine = $server + [char]9 + $domain; $content = Get-Content $path -Raw -ErrorAction Stop; $lines = $content -split \"\\r?\\n\"; $filtered = $lines | Where-Object { $_ -notmatch 'Approx-SAT\\.com' }; $newContent = ($filtered -join \"\\r\\n\").TrimEnd() + \"\\r\\n\" + $newLine + \"\\r\\n\"; Set-Content -Path $path -Value $newContent -NoNewline -Encoding ASCII -ErrorAction Stop"
if %errorLevel% equ 0 (
  echo Listo: %DOMAIN% configurado para apuntar a %SERVER_HOST%.
) else (
  echo Error al escribir en el archivo hosts. Comprueba que ejecutaste como administrador.
)
pause
`
}

function downloadHostsBat(serverHost) {
  const content = getHostsBatContent(serverHost)
  const blob = new Blob([content], { type: 'application/x-bat' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'configurar-dominio-approx-sat.bat'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Vista Configuración: editar rutas de QNAP (catálogo productos) y Excel (sincronización RMA)
 * sin tocar archivos .env.
 */
function Configuracion() {
  const [productosCatalogPath, setProductosCatalogPath] = useState('')
  const [excelSyncPath, setExcelSyncPath] = useState('')
  const [atractorUrl, setAtractorUrl] = useState('')
  const [atractorUser, setAtractorUser] = useState('')
  const [atractorPassword, setAtractorPassword] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [copyMensaje, setCopyMensaje] = useState(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetProgress, setResetProgress] = useState(0)
  const [resetProgressMessage, setResetProgressMessage] = useState('')
  const [resetMensaje, setResetMensaje] = useState(null)
  const [resetError, setResetError] = useState(null)
  const resetPollRef = useRef(null)

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

  const parseErrorResponse = (res) =>
    res.text().then((text) => {
      let detail = 'Error al recargar'
      try {
        const j = JSON.parse(text)
        if (j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
      } catch (_) {
        if (text) detail = text
      }
      throw new Error(detail)
    })

  const recargarRmaConfirm = () => {
    setResetting(true)
    setResetError(null)
    setResetMensaje(null)
    setResetProgress(0)
    setResetProgressMessage('Iniciando...')
    fetch(`${API_URL}/api/productos/sync-reset`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (!res.ok) return parseErrorResponse(res)
        return res.json()
      })
      .then((data) => {
        const taskId = data.task_id
        if (!taskId) {
          setResetError('No se recibió task_id')
          setResetting(false)
          return
        }
        const poll = () => {
          fetch(`${API_URL}/api/tasks/${taskId}`, { headers: getAuthHeaders() })
            .then((r) => r.json())
            .then((t) => {
              setResetProgress(t.percent ?? 0)
              setResetProgressMessage(t.message ?? '')
              if (t.status === 'done') {
                if (resetPollRef.current) clearInterval(resetPollRef.current)
                resetPollRef.current = null
                setShowResetConfirm(false)
                const msg = t.result?.mensaje ?? 'Completado.'
                const cargados = t.result?.cargados
                setResetMensaje(cargados != null ? `${msg} Registros cargados: ${cargados}.` : msg)
                setResetting(false)
              } else if (t.status === 'error') {
                if (resetPollRef.current) clearInterval(resetPollRef.current)
                resetPollRef.current = null
                setResetError(t.message || 'Error al recargar')
                setResetting(false)
              }
            })
            .catch(() => {})
        }
        poll()
        resetPollRef.current = setInterval(poll, 400)
      })
      .catch((err) => {
        setResetError(err.message)
        setResetting(false)
      })
  }

  useEffect(() => {
    return () => {
      if (resetPollRef.current) clearInterval(resetPollRef.current)
    }
  }, [])

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
        ATRACTOR_URL: atractorUrl.trim(),
        ATRACTOR_USER: atractorUser.trim(),
        ATRACTOR_PASSWORD: atractorPassword.trim(),
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
            Carpeta donde están las marcas y productos (Excel: fecha en C3, serie base = última celda con texto en col D). Las rutas con espacios (ej. DEPT. TEC\PRODUCTOS) se leen correctamente.
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

        <h2 className="configuracion-subtitle">Atractor</h2>
        <p className="configuracion-desc">
          Conexión con Atractor para informes (p. ej. ventas totalizadas). La URL puede ser la base (https://atractor.ejemplo.com) o el endpoint completo; se añadirán los parámetros de fechas al pedir el informe.
        </p>
        <div className="configuracion-field">
          <label htmlFor="config-atractor-url">URL de Atractor</label>
          <input
            id="config-atractor-url"
            type="text"
            value={atractorUrl}
            onChange={(e) => setAtractorUrl(e.target.value)}
            placeholder="Ej. https://atractor.ejemplo.com/api/informe-ventas"
            className="configuracion-input"
          />
        </div>
        <div className="configuracion-field">
          <label htmlFor="config-atractor-user">Usuario</label>
          <input
            id="config-atractor-user"
            type="text"
            value={atractorUser}
            onChange={(e) => setAtractorUser(e.target.value)}
            placeholder="Usuario de Atractor"
            className="configuracion-input"
          />
        </div>
        <div className="configuracion-field">
          <label htmlFor="config-atractor-password">Contraseña</label>
          <input
            id="config-atractor-password"
            type="password"
            value={atractorPassword}
            onChange={(e) => setAtractorPassword(e.target.value)}
            placeholder="Dejar en blanco para no cambiar"
            className="configuracion-input"
            autoComplete="new-password"
          />
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

      <section className="configuracion-form configuracion-dominio" aria-label="Dominio en este equipo">
        <h2 className="configuracion-subtitle">Dominio www.Approx-SAT.com (equipo cliente)</h2>
        <p className="configuracion-desc">
          Para acceder a la aplicación usando el nombre <strong>www.Approx-SAT.com</strong> en lugar de la IP y el puerto,
          debes configurar el archivo <strong>hosts</strong> en <strong>este equipo</strong> (el ordenador desde el que estás entrando ahora).
          Puedes hacerlo <strong>a mano</strong> (instrucciones abajo) o <strong>con un script .bat</strong> (solo Windows) que lo hace por ti.
        </p>
        {typeof window !== 'undefined' && (
          <div className="configuracion-dominio-script">
            <p className="configuracion-dominio-script-desc">
              Descarga el script y ejecútalo en este equipo (clic derecho → Ejecutar como administrador). Añadirá o actualizará la línea en el archivo hosts.
            </p>
            <button
              type="button"
              className="btn btn-primary configuracion-dominio-download-bat"
              onClick={() => downloadHostsBat(window.location.hostname)}
            >
              Descargar script (.bat)
            </button>
          </div>
        )}
        <div className="configuracion-dominio-line">
          <h3 className="configuracion-dominio-manual-title">O hazlo a mano</h3>
          <label htmlFor="config-hosts-line" className="configuracion-dominio-label">
            Línea a añadir o actualizar en el archivo hosts:
          </label>
          <input
            id="config-hosts-line"
            type="text"
            readOnly
            value={typeof window !== 'undefined' ? `${window.location.hostname}\twww.Approx-SAT.com` : ''}
            className="configuracion-input configuracion-dominio-input"
            aria-label="Línea para el archivo hosts"
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm configuracion-dominio-copy"
            onClick={() => {
              const line = typeof window !== 'undefined' ? `${window.location.hostname}\twww.Approx-SAT.com` : ''
              if (line && navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(line)
                setCopyMensaje('Línea copiada al portapapeles.')
                setTimeout(() => setCopyMensaje(null), 3000)
              }
            }}
          >
            Copiar
          </button>
        </div>
        <div className="configuracion-dominio-instructions">
          <h3 className="configuracion-dominio-instructions-title">Windows</h3>
          <ol className="configuracion-dominio-list">
            <li>Abre el Bloc de notas como administrador (clic derecho → Ejecutar como administrador).</li>
            <li>Archivo → Abrir y ve a <code>C:\Windows\System32\drivers\etc</code>.</li>
            <li>En &quot;Archivos de texto&quot; elige &quot;Todos los archivos (*.*)&quot; y abre <code>hosts</code>.</li>
            <li>Añade la línea de arriba al final del archivo (o sustituye la línea que ya tenga www.Approx-SAT.com).</li>
            <li>Guarda el archivo.</li>
          </ol>
          <h3 className="configuracion-dominio-instructions-title">Linux / macOS</h3>
          <ol className="configuracion-dominio-list">
            <li>Abre una terminal y edita el archivo hosts: <code>sudo nano /etc/hosts</code> (o <code>sudo vi /etc/hosts</code>).</li>
            <li>Añade la línea de arriba al final del archivo (o sustituye la línea que ya tenga www.Approx-SAT.com).</li>
            <li>Guarda y cierra el editor (en nano: Ctrl+O, Enter, Ctrl+X).</li>
          </ol>
        </div>
        <p className="configuracion-dominio-after">
          Después podrás acceder a la aplicación en{' '}
          <strong>
            http://www.Approx-SAT.com{typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : ''}
          </strong>
          {typeof window !== 'undefined' && window.location.port ? ` (mismo puerto que ahora: ${window.location.port}).` : '.'}
        </p>
        <div className="configuracion-dominio-troubleshoot">
          <h3 className="configuracion-dominio-troubleshoot-title">Si no puedes acceder por el dominio</h3>
          <ul className="configuracion-dominio-troubleshoot-list">
            <li>
              <strong>Servidor:</strong> El servidor donde corre la aplicación debe arrancarse con <code>--host 0.0.0.0</code> para aceptar conexiones por red (no solo localhost). Ejemplo: <code>uvicorn main:app --host 0.0.0.0 --port 8000</code>.
            </li>
            <li>
              <strong>CORS:</strong> En el <code>.env</code> del servidor, en <code>CORS_ORIGINS</code> incluye la URL del dominio (p. ej. <code>http://www.Approx-SAT.com:8000</code>) o usa <code>CORS_ORIGINS=*</code> para permitir cualquier origen.
            </li>
            <li>
              <strong>Frontend:</strong> La aplicación debe estar compilada sin definir <code>VITE_API_URL</code> (o con la misma URL que usas en el navegador) para que las peticiones vayan al mismo sitio. Si compilaste con una IP fija, vuelve a compilar sin <code>VITE_API_URL</code>.
            </li>
            <li>
              <strong>Inicio de sesión:</strong> Al cambiar de IP a dominio (o al revés) el navegador trata la sesión como distinta; tendrás que iniciar sesión de nuevo.
            </li>
            <li>
              <strong>Notificaciones del navegador:</strong> Para que las notificaciones funcionen en todos los equipos (no solo en el servidor), la aplicación debe servirse por <strong>HTTPS</strong>. Consulta en el proyecto la sección &quot;HTTPS para notificaciones&quot; en <code>DEPLOY.md</code>.
            </li>
          </ul>
        </div>
        {copyMensaje && <p className="configuracion-ok configuracion-dominio-copy-ok">{copyMensaje}</p>}
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
            {resetting && (
              <ProgressBar
                percent={resetProgress}
                message={resetProgressMessage}
                className="modal-progress"
              />
            )}
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
