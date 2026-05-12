import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { API_URL, OPCIONES_ESTADO } from '../constants'
import { getRmaId as getRmaIdUtil, getClaveSerieReal, getSerie as getSerieUtil } from '../utils/garantia'
import { apiFetch } from '../utils/auth'

const GarantiaContext = createContext(null)

export function useGarantia() {
  const ctx = useContext(GarantiaContext)
  if (!ctx) throw new Error('useGarantia debe usarse dentro de GarantiaProvider')
  return ctx
}

export function GarantiaProvider({ children }) {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [editandoRmaId, setEditandoRmaId] = useState(null)

  const refetchProductos = useCallback(() => {
    setCargando(true)
    setError(null)
    apiFetch(`${API_URL}/api/productos`)
      .then((res) => {
        if (!res.ok) throw new Error('Error al cargar datos')
        return res.json()
      })
      .then((data) => setProductos(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => {
    refetchProductos()
  }, [refetchProductos])

  // No refetch al cambiar de pestaña: los datos se cargan una vez y se actualizan solo tras sync/editar/ocultar

  const hiddenRmas = useMemo(
    () => productos.filter((p) => p.hidden === true),
    [productos]
  )
  const hiddenIds = useMemo(() => new Set(hiddenRmas.map(getRmaIdUtil)), [hiddenRmas])
  const productosVisibles = useMemo(
    () => productos.filter((p) => !p.hidden),
    [productos]
  )
  const estadoRma = useMemo(() => {
    const out = {}
    productos.forEach((p) => {
      const id = getRmaIdUtil(p)
      if (id !== undefined && id !== '') out[id] = p.estado ?? ''
    })
    return out
  }, [productos])
  const fechaRecogidaRma = useMemo(() => {
    const out = {}
    productos.forEach((p) => {
      const id = getRmaIdUtil(p)
      if (id !== undefined && id !== '') {
        const f = p['FECHA RECOGIDA']
        out[id] = f && String(f).trim() ? String(f).trim().slice(0, 10) : ''
      }
    })
    return out
  }, [productos])
  const claveSerieReal = useMemo(
    () => (productosVisibles.length && productosVisibles[0] ? getClaveSerieReal(productosVisibles[0]) : 'Nº DE SERIE'),
    [productosVisibles]
  )

  const guardarEstadoRma = useCallback(
    async (rmaId, value) => {
      const estado = value ? String(value).trim() : ''
      const res = await apiFetch(`${API_URL}/api/rmas/${encodeURIComponent(rmaId)}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      })
      if (!res.ok) return
      refetchProductos()
    },
    [refetchProductos]
  )

  const guardarFechaRecogidaRma = useCallback(
    async (rmaId, value) => {
      const fecha = value ? String(value).trim().slice(0, 10) : ''
      const res = await apiFetch(
        `${API_URL}/api/rmas/${encodeURIComponent(rmaId)}/fecha-recogida`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fecha_recogida: fecha }),
        }
      )
      if (!res.ok) return
      refetchProductos()
    },
    [refetchProductos]
  )

  const ocultarRmaGroup = useCallback(
    async (grupo) => {
      const rmaNumber = grupo?.rmaId ?? getRmaIdUtil(grupo?.items?.[0])
      if (!rmaNumber) return
      const res = await apiFetch(`${API_URL}/api/rmas/${encodeURIComponent(rmaNumber)}/ocultar`, {
        method: 'PATCH',
      })
      if (!res.ok) return
      refetchProductos()
    },
    [refetchProductos]
  )

  const desocultarRma = useCallback(
    async (rma) => {
      const rmaNumber = getRmaIdUtil(rma)
      if (!rmaNumber) return
      const res = await apiFetch(`${API_URL}/api/rmas/${encodeURIComponent(rmaNumber)}/desocultar`, {
        method: 'PATCH',
      })
      if (!res.ok) return
      refetchProductos()
    },
    [refetchProductos]
  )

  const getEstadoLabel = (value) =>
    OPCIONES_ESTADO.find((o) => o.value === value)?.label ?? '-'
  const getSerie = (p) => getSerieUtil(p, claveSerieReal)

  const value = {
    productos,
    cargando,
    error,
    hiddenRmas,
    hiddenIds,
    productosVisibles,
    estadoRma,
    guardarEstadoRma,
    fechaRecogidaRma,
    guardarFechaRecogidaRma,
    ocultarRmaGroup,
    desocultarRma,
    editandoRmaId,
    setEditandoRmaId,
    getRmaId: getRmaIdUtil,
    getSerie,
    getEstadoLabel,
    claveSerieReal,
    OPCIONES_ESTADO,
    refetchProductos,
  }

  return (
    <GarantiaContext.Provider value={value}>
      {children}
    </GarantiaContext.Provider>
  )
}
