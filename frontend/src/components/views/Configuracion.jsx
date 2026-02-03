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

/** Genera el contenido del .bat para añadir www.Approx-SAT.com al archivo hosts (Windows). CRLF al descargar. serverHost debe ser una IP (nunca "localhost" en el archivo hosts). */
function getHostsBatContent(serverHost) {
  let host = (serverHost || '').trim() || '127.0.0.1'
  if (host.toLowerCase() === 'localhost') host = '127.0.0.1'
  return `@echo off
chcp 65001 >nul
:: Script para añadir www.Approx-SAT.com al archivo hosts (Windows).
:: Ejecutar como administrador: clic derecho -> Ejecutar como administrador.

cd /d "%~dp0"

set "HOSTS_PATH=%SystemRoot%\\System32\\drivers\\etc\\hosts"
set "SERVER_HOST=${host}"
set "DOMAIN=www.Approx-SAT.com"

net session >nul 2>&1
if %errorLevel% neq 0 (
  echo Solicitando permisos de administrador...
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$path = [Environment]::ExpandEnvironmentVariables('%HOSTS_PATH%'); $server = '%SERVER_HOST%'; $domain = 'www.Approx-SAT.com'; $newLine = $server + [char]9 + $domain; $content = Get-Content $path -Raw -ErrorAction Stop; $lines = $content -split '[\r\n]+'; $filtered = $lines | Where-Object { $_ -notmatch 'Approx-SAT\\.com' }; $crlf = [char]13 + [char]10; $newContent = ($filtered -join $crlf).TrimEnd() + $crlf + $newLine + $crlf; Set-Content -Path $path -Value $newContent -NoNewline -Encoding ASCII -ErrorAction Stop"
if %errorLevel% equ 0 (
  echo Listo: %DOMAIN% configurado para apuntar a %SERVER_HOST%.
) else (
  echo Error al escribir en el archivo hosts. Comprueba que ejecutaste como administrador.
)
pause
`
}

function downloadHostsBat(serverHost) {
  const content = getHostsBatContent(serverHost).replace(/\n/g, '\r\n')
  const blob = new Blob([content], { type: 'application/x-bat' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'configurar-dominio-approx-sat.bat'
  a.click()
  URL.revokeObjectURL(url)
}

/** Genera el contenido del .bat para instalar el certificado HTTPS en el equipo cliente (Windows). */
function getInstallCertBatContent() {
  return `@echo off
chcp 65001 >nul
:: Instalar certificado HTTPS (cert.pem) en el equipo cliente para confiar en el servidor Garantia SAT.
:: Ejecutar como administrador: clic derecho -> Ejecutar como administrador.
:: Coloca cert.pem (desde la carpeta backend del servidor) en la misma carpeta que este .bat.

cd /d "%~dp0"

net session >nul 2>&1
if %errorLevel% neq 0 (
  echo Solicitando permisos de administrador...
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)

set "CERT="
if exist "cert.pem" set "CERT=cert.pem"
if not defined CERT if exist "cert.cer" set "CERT=cert.cer"

if not defined CERT (
  echo No se encontró cert.pem ni cert.cer en esta carpeta.
  echo.
  echo Carpeta donde debe estar cert.pem:
  echo   %~dp0
  echo.
  echo Copia cert.pem desde la carpeta backend del servidor
  echo a la ruta de arriba y vuelve a ejecutar este script.
  echo.
  pause
  exit /b 1
)

echo Instalando certificado en Autoridades de certificación raíz de confianza...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pem = Get-Content -Path '%CERT%' -Raw -ErrorAction Stop; $b64 = $pem -replace '-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\\r?\\n',''; $bytes = [System.Convert]::FromBase64String($b64); $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(,$bytes); $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'LocalMachine'); $store.Open('ReadWrite'); $store.Add($cert); $store.Close()"
if %errorLevel% equ 0 (
  echo.
  echo Listo. El navegador ya no mostrará avisos de seguridad para este servidor
  echo y las notificaciones funcionarán.
) else (
  echo.
  echo Error al instalar. Comprueba que ejecutaste como administrador
  echo y que cert.pem es un certificado válido.
)
echo.
pause
`
}

function downloadInstallCertBat() {
  const content = getInstallCertBatContent().replace(/\n/g, '\r\n')
  const blob = new Blob([content], { type: 'application/x-bat' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'install-cert.bat'
  a.click()
  URL.revokeObjectURL(url)
}

function downloadCertPem(onError) {
  if (onError) onError(null)
  fetch(`${API_URL}/api/settings/certificate`, { headers: getAuthHeaders() })
    .then((res) => {
      if (!res.ok) {
        if (res.status === 404) throw new Error('El servidor no tiene certificado configurado (cert.pem).')
        throw new Error('Error al descargar el certificado.')
      }
      return res.blob()
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'cert.pem'
      a.click()
      URL.revokeObjectURL(url)
    })
    .catch((err) => {
      if (onError) onError(err.message)
    })
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
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetProgress, setResetProgress] = useState(0)
  const [resetProgressMessage, setResetProgressMessage] = useState('')
  const [resetMensaje, setResetMensaje] = useState(null)
  const [resetError, setResetError] = useState(null)
  const [certError, setCertError] = useState(null)
  const [serverIp, setServerIp] = useState(null)
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

  useEffect(() => {
    fetch(`${API_URL}/api/settings/server-ip`, { headers: getAuthHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error('No se pudo obtener la IP del servidor')
        return res.json()
      })
      .then((data) => setServerIp(data.ip || null))
      .catch(() => setServerIp(null))
  }, [])

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
          Para que <strong>este equipo</strong> (el que estás usando ahora) acceda a la aplicación por el nombre <strong>www.Approx-SAT.com</strong>, descarga el script y ejecútalo aquí como administrador (clic derecho → Ejecutar como administrador). Configurará automáticamente el archivo hosts para que el dominio apunte al servidor. Solo Windows.
        </p>
        {serverIp && (
          <p className="configuracion-dominio-script-desc">
            IP del servidor: <strong>{serverIp}</strong>. El script configurará tu equipo para que <strong>www.Approx-SAT.com</strong> apunte a esta IP.
          </p>
        )}
        <p className="configuracion-dominio-script-desc configuracion-dominio-troubleshoot">
          Si no puedes acceder con el dominio: 1) Ejecuta el script como administrador, 2) Usa la URL <strong>https://www.Approx-SAT.com:8443</strong> (con puerto 8443 si usas HTTPS), 3) Comprueba que el firewall del servidor permite el puerto 8443.
        </p>
        {typeof window !== 'undefined' && (
          <div className="configuracion-dominio-script">
            <button
              type="button"
              className="btn btn-primary configuracion-dominio-download-bat"
              onClick={() => downloadHostsBat(serverIp || window.location.hostname)}
            >
              Descargar script para configurar dominio (.bat)
            </button>
          </div>
        )}
      </section>

      <section className="configuracion-form configuracion-dominio" aria-label="Certificado HTTPS">
        <h2 className="configuracion-subtitle">Instalar certificado HTTPS (notificaciones)</h2>
        <p className="configuracion-desc">
          Para que el navegador no muestre avisos de seguridad y las notificaciones funcionen en este equipo, descarga aquí el certificado y el script. Guarda ambos en la misma carpeta y ejecuta el script como administrador (clic derecho → Ejecutar como administrador). Solo Windows.
        </p>
        {typeof window !== 'undefined' && (
          <div className="configuracion-dominio-script">
            <button
              type="button"
              className="btn btn-primary configuracion-dominio-download-bat"
              onClick={() => downloadCertPem(setCertError)}
            >
              Descargar certificado (cert.pem)
            </button>
            <button
              type="button"
              className="btn btn-primary configuracion-dominio-download-bat"
              onClick={downloadInstallCertBat}
            >
              Descargar script para instalar certificado (.bat)
            </button>
            {certError && <p className="error-msg">{certError}</p>}
          </div>
        )}
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
