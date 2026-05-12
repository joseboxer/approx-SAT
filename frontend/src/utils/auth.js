import { AUTH_STORAGE_KEY, AUTH_USER_KEY } from '../constants'

/** Disparado al detectar JWT inválido o caducado (401 con token, o exp local). */
export const AUTH_SESSION_EXPIRED_EVENT = 'garantia-auth-expired'

export function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch (err) {
    void err
  }
  return {}
}

export function clearStoredAuth() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
  } catch (_) {}
}

/** Limpia almacenamiento y avisa a la app (AuthProvider vuelve al login). */
export function notifySessionExpired() {
  clearStoredAuth()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT))
  }
}

function isPublicAuthUrl(url) {
  const s = typeof url === 'string' ? url : ''
  return (
    s.includes('/api/auth/login')
    || s.includes('/api/auth/register')
    || s.includes('/api/auth/verify')
  )
}

/** 401 esperado sin caducar sesión (p. ej. contraseña actual incorrecta). */
function isAuth401WithoutSessionEnd(url) {
  const s = typeof url === 'string' ? url : ''
  return s.includes('/api/auth/change-password')
}

/**
 * fetch hacia la API con cabeceras de auth.
 * Si la respuesta es 401 y había token (y no es login/register/verify), limpia sesión y dispara AUTH_SESSION_EXPIRED_EVENT.
 */
export async function apiFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : (input && typeof input.url === 'string' ? input.url : '')
  const headers = { ...getAuthHeaders(), ...(init.headers || {}) }
  let tokenBefore = null
  try {
    tokenBefore = localStorage.getItem(AUTH_STORAGE_KEY)
  } catch (_) {}
  const res = await fetch(input, { ...init, headers })
  if (res.status === 401 && tokenBefore && !isPublicAuthUrl(url) && !isAuth401WithoutSessionEnd(url)) {
    notifySessionExpired()
  }
  return res
}

const DEFAULT_FETCH_TIMEOUT_MS = 30000

/** apiFetch con AbortController por tiempo máximo (p. ej. /api/auth/me). */
export async function apiFetchWithTimeout(input, init = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await apiFetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

/** Timestamp en ms del campo exp del JWT guardado, o null si no se puede leer. */
export function getStoredTokenExpiresAtMs() {
  try {
    const t = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!t || typeof t !== 'string') return null
    const parts = t.split('.')
    if (parts.length < 2) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = '='.repeat((4 - (b64.length % 4)) % 4)
    const json = JSON.parse(atob(b64 + pad))
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch (_) {
    return null
  }
}
