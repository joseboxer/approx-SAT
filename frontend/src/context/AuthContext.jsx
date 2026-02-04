import React, { createContext, useContext, useState, useCallback } from 'react'
import { API_URL, AUTH_STORAGE_KEY, AUTH_USER_KEY } from '../constants'

const FETCH_TIMEOUT_MS = 30000 // 30 s; evita carga infinita si el backend no responde

function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id))
}

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}

function loadStoredUser() {
  try {
    if (typeof localStorage === 'undefined') return null
    const t = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!t || typeof t !== 'string') return null
    const u = localStorage.getItem(AUTH_USER_KEY)
    if (u != null && u !== '') {
      try {
        const parsed = JSON.parse(u)
        if (parsed && typeof parsed.username === 'string') {
          return { username: parsed.username, token: t, isAdmin: Boolean(parsed.is_admin) }
        }
      } catch (_) {}
      // Formato antiguo: u era solo el username (string). Dejamos isAdmin undefined para que refreshUser llame a /me
      const name = typeof u === 'string' ? u : String(u)
      return { username: name, token: t, isAdmin: undefined }
    }
    return null
  } catch (_) {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadStoredUser)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState(null)

  const login = useCallback(async (username, password) => {
    setAuthError(null)
    setAuthLoading(true)
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Error al iniciar sesión')
      localStorage.setItem(AUTH_STORAGE_KEY, data.access_token)
      const userPayload = { username: data.username, is_admin: data.is_admin === true }
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userPayload))
      setUser({ username: data.username, token: data.access_token, isAdmin: userPayload.is_admin })
      return true
    } catch (err) {
      setAuthError(err.name === 'AbortError' ? 'Tiempo de espera agotado. Comprueba que el servidor esté en marcha.' : err.message)
      return false
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const register = useCallback(async (username, password, email) => {
    setAuthError(null)
    setAuthLoading(true)
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Error al solicitar registro')
      return { ok: true, email: data.email, message: data.message, codigo_verificacion: data.codigo_verificacion }
    } catch (err) {
      setAuthError(err.name === 'AbortError' ? 'Tiempo de espera agotado. El servidor de correo puede estar lento o inaccesible.' : err.message)
      return { ok: false }
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const verifyEmail = useCallback(async (email, code) => {
    setAuthError(null)
    setAuthLoading(true)
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Código incorrecto o expirado')
      localStorage.setItem(AUTH_STORAGE_KEY, data.access_token)
      const userPayload = { username: data.username, is_admin: data.is_admin === true }
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userPayload))
      setUser({ username: data.username, token: data.access_token, isAdmin: userPayload.is_admin })
      return true
    } catch (err) {
      setAuthError(err.name === 'AbortError' ? 'Tiempo de espera agotado.' : err.message)
      return false
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
    setUser(null)
  }, [])

  // Al montar, si hay token pero user sin isAdmin, obtener /me para completar datos (p. ej. sesión antigua)
  const refreshUser = useCallback(async () => {
    const t = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!t || user?.isAdmin !== undefined) return
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (!res.ok) return
      const data = await res.json().catch(() => ({}))
      const payload = { username: data.username, is_admin: data.is_admin === true }
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(payload))
      setUser((prev) => (prev ? { ...prev, username: data.username, isAdmin: payload.is_admin } : null))
    } catch (_) {}
  }, [user?.isAdmin])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const value = {
    user,
    login,
    register,
    verifyEmail,
    logout,
    authLoading,
    authError,
    setAuthError,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
