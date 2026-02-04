import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { API_URL, AUTH_STORAGE_KEY, VISTAS } from '../../constants'
import ProgressBar from '../ProgressBar'
import HelpTip from '../HelpTip'

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
  // Escribimos un .ps1 temporal para evitar problemas de escape batch->PowerShell. En batch %% se convierte en % al guardar.
  return `@echo off
chcp 65001 >nul
:: Script para añadir www.Approx-SAT.com al archivo hosts (Windows).
:: Ejecutar como administrador: clic derecho -> Ejecutar como administrador.

cd /d "%~dp0"

set "HOSTS_PATH=%SystemRoot%\\System32\\drivers\\etc\\hosts"
set "SERVER_HOST=${host}"
set "DOMAIN=www.Approx-SAT.com"
set "PS1=%TEMP%\\hosts_approx_sat.ps1"

net session >nul 2>&1
if %errorLevel% neq 0 (
  echo Solicitando permisos de administrador...
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)

:: Crear script PowerShell temporal (evita escape de variables en una sola linea)
echo $path = '%HOSTS_PATH%' > "%PS1%"
echo $server = '%SERVER_HOST%' >> "%PS1%"
echo $domain = 'www.Approx-SAT.com' >> "%PS1%"
echo $newLine = $server + [char]9 + $domain >> "%PS1%"
echo try { >> "%PS1%"
echo   $content = Get-Content -LiteralPath $path -Raw -Encoding Default >> "%PS1%"
echo   $lines = $content -split "\`r?\`n" >> "%PS1%"
echo   $filtered = $lines ^| Where-Object { $_ -notmatch 'Approx-SAT\\.com' } >> "%PS1%"
echo   $crlf = [char]13 + [char]10 >> "%PS1%"
echo   $newContent = ($filtered -join $crlf).TrimEnd() + $crlf + $newLine + $crlf >> "%PS1%"
echo   Set-Content -LiteralPath $path -Value $newContent -NoNewline -Encoding Default >> "%PS1%"
echo   exit 0 >> "%PS1%"
echo } catch { Write-Error $_; exit 1 } >> "%PS1%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
if %errorLevel% equ 0 (
  echo Listo: %DOMAIN% configurado para apuntar a %SERVER_HOST%.
  del "%PS1%" 2>nul
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
function Configuracion({ setVista }) {
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
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordRepeat, setNewPasswordRepeat] = useState('')
  const [changePasswordLoading, setChangePasswordLoading] = useState(false)
  const [changePasswordError, setChangePasswordError] = useState(null)
  const [changePasswordOk, setChangePasswordOk] = useState(null)
  const [status, setStatus] = useState(null)
  const [validateResult, setValidateResult] = useState(null)
  const [validateLoading, setValidateLoading] = useState(false)
  const [auditLog, setAuditLog] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const resetPollRef = useRef(null)
  const { user } = useAuth()

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

  const cargarEstado = useCallback(() => {
    fetch(`${API_URL}/api/settings/status`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => setStatus(data))
      .catch(() => setStatus(null))
  }, [])

  useEffect(() => {
    cargarEstado()
  }, [cargarEstado])

  const comprobarRutas = () => {
    setValidateLoading(true)
    setValidateResult(null)
    fetch(`${API_URL}/api/settings/validate-paths`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excel_path: excelSyncPath || '',
        catalog_path: productosCatalogPath || '',
      }),
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => setValidateResult(data))
      .catch(() => setValidateResult({ excel: { message: 'Error al comprobar' }, catalog: { message: 'Error al comprobar' } }))
      .finally(() => setValidateLoading(false))
  }

  const cargarAuditLog = () => {
    setAuditLoading(true)
    fetch(`${API_URL}/api/audit-log?limit=30`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => setAuditLog(data.items || []))
      .catch(() => setAuditLog([]))
      .finally(() => setAuditLoading(false))
  }

  const descargarExport = (path, filename) => {
    fetch(`${API_URL}${path}`, { headers: getAuthHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error('Error al exportar')
        return r.blob()
      })
      .then((blob) => {
        const u = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = u
        a.download = filename
        a.click()
        URL.revokeObjectURL(u)
      })
      .catch(() => {})
  }

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

  const cambiarContrasena = () => {
    if (!currentPassword.trim()) {
      setChangePasswordError('Introduce tu contraseña actual')
      setChangePasswordOk(null)
      return
    }
    if (!newPassword.trim() || newPassword.length < 4) {
      setChangePasswordError('La nueva contraseña debe tener al menos 4 caracteres')
      setChangePasswordOk(null)
      return
    }
    if (newPassword !== newPasswordRepeat) {
      setChangePasswordError('La nueva contraseña y la repetición no coinciden')
      setChangePasswordOk(null)
      return
    }
    setChangePasswordLoading(true)
    setChangePasswordError(null)
    setChangePasswordOk(null)
    fetch(`${API_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => { throw new Error(d.detail || 'Error al cambiar contraseña') })
        return res.json()
      })
      .then(() => {
        setChangePasswordOk('Contraseña actualizada. En la próxima sesión usa la nueva contraseña.')
        setCurrentPassword('')
        setNewPassword('')
        setNewPasswordRepeat('')
      })
      .catch((err) => setChangePasswordError(err.message))
      .finally(() => setChangePasswordLoading(false))
  }

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
                cargarEstado()
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

  useEffect(() => {
    if (!showResetConfirm) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !resetting) setShowResetConfirm(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showResetConfirm, resetting])

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
        cargarEstado()
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

      <section className="configuracion-form configuracion-estado" aria-label="Estado del sistema">
        <h2 className="configuracion-subtitle">
          Estado y operación
          <HelpTip text="Aquí ves la última vez que se recargó la lista RMA o se actualizó el catálogo. Usa «Comprobar rutas» antes de guardar para verificar que el servidor puede leer Excel y la carpeta del catálogo." />
        </h2>
        <p className="configuracion-desc">
          Última sincronización RMA y último refresco de catálogo. Comprueba que las rutas configuradas existen y son accesibles antes de ejecutar una recarga.
        </p>
        {status && (
          <div className="configuracion-estado-grid">
            <div className="configuracion-estado-block">
              <strong>Sincronización RMA</strong>
              <p className="configuracion-estado-line">
                {status.last_sync_at ? `${status.last_sync_at} — ${status.last_sync_status === 'ok' ? 'OK' : 'Error'}` : 'Aún no ejecutada'}
              </p>
              {status.last_sync_message && <p className="configuracion-hint">{status.last_sync_message}</p>}
            </div>
            <div className="configuracion-estado-block">
              <strong>Catálogo de productos</strong>
              <p className="configuracion-estado-line">
                {status.last_catalog_at ? `${status.last_catalog_at} — ${status.last_catalog_status === 'ok' ? 'OK' : 'Error'}` : 'Aún no ejecutado'}
              </p>
              {status.last_catalog_message && <p className="configuracion-hint">{status.last_catalog_message}</p>}
            </div>
          </div>
        )}
        <div className="configuracion-actions" style={{ marginTop: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={comprobarRutas} disabled={validateLoading}>
            {validateLoading ? 'Comprobando…' : 'Comprobar rutas (Excel y catálogo)'}
          </button>
        </div>
        {validateResult && (
          <div className="configuracion-validate-result">
            <p><strong>Excel:</strong> {validateResult.excel?.message ?? '—'}</p>
            {validateResult.excel?.path_used && <p className="configuracion-hint">Ruta comprobada: {validateResult.excel.path_used}</p>}
            <p><strong>Catálogo:</strong> {validateResult.catalog?.message ?? '—'}</p>
            {validateResult.catalog?.path_used && <p className="configuracion-hint">Ruta comprobada: {validateResult.catalog.path_used}</p>}
          </div>
        )}
      </section>

      <section className="configuracion-form" aria-label="Rutas">
        <h2 className="configuracion-subtitle">
          Rutas
          <HelpTip text="Ruta de red (ej. \\\\servidor\\carpeta) o local. El Excel de RMA debe ser un archivo .xlsx; el catálogo es una carpeta con subcarpetas de productos. Para QNAP: quien accede a los archivos es el servidor donde corre la app; ese equipo debe tener acceso de lectura a la unidad de red (misma red, usuario con permiso en el QNAP). Usa «Comprobar rutas» para verificar antes de guardar." />
        </h2>
        {!user?.isAdmin && (
          <p className="configuracion-desc" style={{ marginBottom: '0.5rem' }}>
            Solo el administrador puede modificar las rutas de catálogo y Excel.
          </p>
        )}
        <div className="configuracion-field">
          <label htmlFor="config-productos-catalog-path">
            Ruta catálogo de productos (QNAP)
          </label>
          <input
            id="config-productos-catalog-path"
            type="text"
            value={productosCatalogPath}
            onChange={(e) => user?.isAdmin && setProductosCatalogPath(e.target.value)}
            placeholder="Ej. \\\\Qnap-approx2\\z\\DEPT. TEC\\PRODUCTOS"
            className="configuracion-input"
            readOnly={!user?.isAdmin}
            disabled={!user?.isAdmin}
            aria-readonly={!user?.isAdmin}
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
            onChange={(e) => user?.isAdmin && setExcelSyncPath(e.target.value)}
            placeholder="Ej. \\\\Qnap-approx2\\ruta\\productos.xlsx o ruta local"
            className="configuracion-input"
            readOnly={!user?.isAdmin}
            disabled={!user?.isAdmin}
            aria-readonly={!user?.isAdmin}
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
          Si no puedes acceder con el dominio: 1) Ejecuta el script como administrador, 2) Usa la URL <strong>https://www.Approx-SAT.com</strong> (puerto 443 por defecto; el servidor debe arrancarse como administrador), 3) Comprueba que el firewall del servidor permite el puerto 443.
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
          Para que el navegador muestre el candado como seguro y las notificaciones funcionen, descarga aquí el certificado y el script. Guarda ambos en la misma carpeta y ejecuta el script como administrador (clic derecho → Ejecutar como administrador). Solo Windows.
        </p>
        <p className="configuracion-dominio-script-desc configuracion-dominio-troubleshoot">
          Si tras instalar el certificado sigue saliendo &quot;No seguro&quot;, el certificado del servidor debe haberse generado con SAN (en el servidor ejecuta <strong>generate-cert.bat</strong> en la carpeta backend, reinicia el servidor y vuelve a descargar e instalar cert.pem aquí). Si usas puerto 443, arranca el servidor como administrador.
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

      {user?.isAdmin && setVista && (
        <section className="configuracion-form" aria-label="Usuarios">
          <h2 className="configuracion-subtitle">Usuarios</h2>
          <p className="configuracion-desc">
            Para crear usuarios, editar email y rol de administrador, restablecer contraseñas o eliminar cuentas, usa el Panel de administrador.
          </p>
          <div className="configuracion-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setVista(VISTAS.ADMIN)}
            >
              Abrir Panel de administrador
            </button>
          </div>
        </section>
      )}

      <section className="configuracion-form" aria-label="Cambiar mi contraseña">
        <h2 className="configuracion-subtitle">Cambiar mi contraseña</h2>
        <p className="configuracion-desc">
          Cambia la contraseña del usuario con el que has iniciado sesión (<strong>{user?.username ?? '—'}</strong>).
        </p>
        <div className="configuracion-field">
          <label htmlFor="config-current-password">Contraseña actual</label>
          <input
            id="config-current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => { setCurrentPassword(e.target.value); setChangePasswordError(null); setChangePasswordOk(null); }}
            className="configuracion-input"
            autoComplete="current-password"
          />
        </div>
        <div className="configuracion-field">
          <label htmlFor="config-new-password">Nueva contraseña</label>
          <input
            id="config-new-password"
            type="password"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setChangePasswordError(null); setChangePasswordOk(null); }}
            className="configuracion-input"
            autoComplete="new-password"
            minLength={4}
          />
        </div>
        <div className="configuracion-field">
          <label htmlFor="config-new-password-repeat">Repetir nueva contraseña</label>
          <input
            id="config-new-password-repeat"
            type="password"
            value={newPasswordRepeat}
            onChange={(e) => { setNewPasswordRepeat(e.target.value); setChangePasswordError(null); setChangePasswordOk(null); }}
            className="configuracion-input"
            autoComplete="new-password"
            minLength={4}
          />
        </div>
        <div className="configuracion-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={cambiarContrasena}
            disabled={changePasswordLoading}
          >
            {changePasswordLoading ? 'Cambiando…' : 'Cambiar contraseña'}
          </button>
        </div>
        {changePasswordOk && <p className="configuracion-ok">{changePasswordOk}</p>}
        {changePasswordError && <p className="error-msg">{changePasswordError}</p>}
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
        {resetError && (
          <p className="error-msg">
            {resetError}
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: '0.75rem' }} onClick={() => { setResetError(null); setShowResetConfirm(true); }}>
              Reintentar
            </button>
          </p>
        )}
      </section>

      <section className="configuracion-form" aria-label="Exportar datos">
        <h2 className="configuracion-subtitle">Exportar datos (trazabilidad)</h2>
        <p className="configuracion-desc">
          Descarga los datos en CSV para copias de seguridad o uso externo.
        </p>
        <div className="configuracion-actions">
          <button type="button" className="btn btn-primary" onClick={() => descargarExport('/api/export/rma', 'export-rma.csv')}>
            Exportar RMA (CSV)
          </button>
          <button type="button" className="btn btn-primary" onClick={() => descargarExport('/api/export/clientes', 'export-clientes.csv')}>
            Exportar clientes (CSV)
          </button>
        </div>
      </section>

      <section className="configuracion-form" aria-label="Registro de actividad">
        <h2 className="configuracion-subtitle">Registro de actividad</h2>
        <p className="configuracion-desc">
          Quién hizo qué y cuándo (sincronizaciones, cambios de configuración, usuarios creados).
        </p>
        <div className="configuracion-actions">
          <button type="button" className="btn btn-secondary" onClick={cargarAuditLog} disabled={auditLoading}>
            {auditLoading ? 'Cargando…' : 'Cargar registro'}
          </button>
        </div>
        {auditLog.length > 0 && (
          <div className="configuracion-audit-table-wrap">
            <table className="tabla configuracion-audit-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((item) => (
                  <tr key={item.id}>
                    <td>{item.at}</td>
                    <td>{item.username}</td>
                    <td>{item.action}</td>
                    <td>{item.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
