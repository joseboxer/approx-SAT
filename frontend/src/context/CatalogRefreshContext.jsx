import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { API_URL, AUTH_STORAGE_KEY } from '../constants'

const CatalogRefreshContext = createContext(null)

export function useCatalogRefresh() {
  const ctx = useContext(CatalogRefreshContext)
  return ctx
}

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

/**
 * Contexto para la actualización del catálogo en segundo plano.
 * La tarea sigue ejecutándose aunque el usuario cambie de apartado; al volver a Productos se ve el progreso o el resultado.
 */
export function CatalogRefreshProvider({ children }) {
  const [taskId, setTaskId] = useState(null)
  const [percent, setPercent] = useState(0)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState(null) // 'running' | 'done' | 'error'
  const [result, setResult] = useState(null) // { productos } cuando status === 'done'
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  const clearResult = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  const startCatalogRefresh = useCallback(() => {
    setTaskId(null)
    setPercent(0)
    setMessage('Iniciando...')
    setStatus('running')
    setResult(null)
    setError(null)
    fetch(`${API_URL}/api/productos-catalogo/refresh`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((e) => { throw new Error(e.detail || 'Error al actualizar') })
        return res.json()
      })
      .then((data) => {
        const id = data.task_id
        if (id) setTaskId(id)
        else setStatus(null)
      })
      .catch((err) => {
        setError(err.message)
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    if (!taskId) return
    const poll = () => {
      fetch(`${API_URL}/api/tasks/${taskId}`, { headers: getAuthHeaders() })
        .then((r) => r.json())
        .then((t) => {
          setPercent(t.percent ?? 0)
          setMessage(t.message ?? '')
          if (t.status === 'done') {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setTaskId(null)
            setStatus('done')
            setResult(t.result ?? null)
          } else if (t.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setTaskId(null)
            setStatus('error')
            setError(t.message || 'Error al actualizar')
          }
        })
        .catch(() => {})
    }
    poll()
    pollRef.current = setInterval(poll, 400)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [taskId])

  const value = {
    taskId,
    percent,
    message,
    status,
    result,
    error,
    startCatalogRefresh,
    clearResult,
  }

  return (
    <CatalogRefreshContext.Provider value={value}>
      {children}
    </CatalogRefreshContext.Provider>
  )
}
