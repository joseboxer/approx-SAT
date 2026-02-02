import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useGarantia } from '../../context/GarantiaContext'
import { POR_PAGINA, COLUMNAS_CLIENTES, API_URL, AUTH_STORAGE_KEY } from '../../constants'
import { compararValores } from '../../utils/garantia'
import HerramientasTabla from '../HerramientasTabla'
import Paginacion from '../Paginacion'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

function norm(s) {
  return (s ?? '').toString().trim()
}

function Clientes({ clienteDestacado }) {
  const { productosVisibles, cargando, error, refetchProductos } = useGarantia()
  const [columnaFiltro, setColumnaFiltro] = useState('nombre')
  const [valorFiltro, setValorFiltro] = useState('')
  const [columnaOrden, setColumnaOrden] = useState('nombre')
  const [ordenAsc, setOrdenAsc] = useState(true)
  const [pagina, setPagina] = useState(1)
  const [clientGroups, setClientGroups] = useState([])
  const [gruposCargando, setGruposCargando] = useState(true)
  const [selectedKeys, setSelectedKeys] = useState(new Set())
  const [unificarEstado, setUnificarEstado] = useState(null)
  const [unificarCargando, setUnificarCargando] = useState(false)

  const refetchGrupos = useCallback(() => {
    setGruposCargando(true)
    fetch(`${API_URL}/api/clientes/grupos`, { headers: getAuthHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setClientGroups(Array.isArray(data) ? data : []))
      .catch(() => setClientGroups([]))
      .finally(() => setGruposCargando(false))
  }, [])

  useEffect(() => {
    refetchGrupos()
  }, [refetchGrupos])

  useEffect(() => {
    setPagina(1)
  }, [valorFiltro, columnaFiltro])

  // Mapa (nombre, email) de miembro -> (nombre, email) canónico
  const memberToCanonical = useMemo(() => {
    const map = new Map()
    clientGroups.forEach((g) => {
      const canonKey = `${norm(g.canonical_name)}|${norm(g.canonical_email)}`
      map.set(canonKey, { nombre: g.canonical_name, email: g.canonical_email ?? '' })
      ;(g.members || []).forEach((m) => {
        const memberKey = `${norm(m.client_name)}|${norm(m.client_email)}`
        map.set(memberKey, { nombre: g.canonical_name, email: g.canonical_email ?? '' })
      })
    })
    return map
  }, [clientGroups])

  const clientesUnicos = useMemo(() => {
    const byEffective = {}
    productosVisibles.forEach((p) => {
      const nom = norm(p['RAZON SOCIAL O NOMBRE'])
      if (!nom) return
      const email = norm(p.EMAIL ?? '')
      const memberKey = `${nom}|${email}`
      const canon = memberToCanonical.get(memberKey)
      const effectiveNombre = canon ? canon.nombre : nom
      const effectiveEmail = canon ? canon.email : email
      const key = `${effectiveNombre}|${effectiveEmail}`
      if (!byEffective[key]) {
        byEffective[key] = {
          nombre: effectiveNombre,
          email: effectiveEmail,
          telefono: canon ? '' : (p.TELEFONO ?? ''),
          count: 0,
          groupId: null,
          members: [],
        }
      }
      byEffective[key].count++
      if (!byEffective[key].telefono && (p.TELEFONO ?? '')) {
        byEffective[key].telefono = p.TELEFONO
      }
    })
    clientGroups.forEach((g) => {
      const key = `${norm(g.canonical_name)}|${norm(g.canonical_email)}`
      if (byEffective[key]) {
        byEffective[key].groupId = g.id
        byEffective[key].members = (g.members || []).map((m) => ({
          client_name: m.client_name,
          client_email: m.client_email ?? '',
        }))
        if (g.canonical_phone && !byEffective[key].telefono) {
          byEffective[key].telefono = g.canonical_phone
        }
      }
    })
    return Object.values(byEffective)
  }, [productosVisibles, memberToCanonical, clientGroups])

  const clientesBase = useMemo(() => {
    if (!clienteDestacado) return clientesUnicos
    return clientesUnicos.filter((c) =>
      c.nombre.toLowerCase().includes((clienteDestacado || '').toLowerCase())
    )
  }, [clientesUnicos, clienteDestacado])

  const getValor = (c, key) => (key === 'count' ? c.count : (c[key] ?? ''))

  const filtrados = useMemo(() => {
    if (!valorFiltro.trim()) return clientesBase
    const busqueda = valorFiltro.trim().toLowerCase()
    return clientesBase.filter((c) =>
      String(getValor(c, columnaFiltro)).toLowerCase().includes(busqueda)
    )
  }, [clientesBase, valorFiltro, columnaFiltro])

  const ordenados = useMemo(
    () =>
      [...filtrados].sort((a, b) =>
        compararValores(
          getValor(a, columnaOrden),
          getValor(b, columnaOrden),
          ordenAsc
        )
      ),
    [filtrados, columnaOrden, ordenAsc]
  )

  const totalPaginas = Math.ceil(ordenados.length / POR_PAGINA) || 1
  const inicio = (pagina - 1) * POR_PAGINA
  const enPagina = ordenados.slice(inicio, inicio + POR_PAGINA)

  const rowKey = (c) => `${c.nombre}|${c.email ?? ''}`

  const toggleSelected = (c) => {
    const key = rowKey(c)
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAllPage = () => {
    const keys = new Set(enPagina.map(rowKey))
    const allSelected = keys.size > 0 && [...keys].every((k) => selectedKeys.has(k))
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (allSelected) keys.forEach((k) => next.delete(k))
      else keys.forEach((k) => next.add(k))
      return next
    })
  }

  const clearSelection = () => setSelectedKeys(new Set())

  const selectedCount = selectedKeys.size
  const puedeUnificar = selectedCount >= 2 && !unificarCargando

  const handleUnificar = async () => {
    if (!puedeUnificar) return
    setUnificarEstado(null)
    setUnificarCargando(true)
    try {
      const nombres = Array.from(selectedKeys).map((k) => k.split('|')[0])
      const res = await fetch(`${API_URL}/api/clientes/unificar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ nombres }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setUnificarEstado({ error: data.detail || 'Error al unificar clientes' })
        return
      }
      setUnificarEstado({ ok: true })
      setSelectedKeys(new Set())
      refetchGrupos()
      refetchProductos()
    } catch (e) {
      setUnificarEstado({ error: e.message || 'Error de conexión' })
    } finally {
      setUnificarCargando(false)
    }
  }

  const handleSacarDelGrupo = async (groupId, client_name, client_email) => {
    try {
      const res = await fetch(
        `${API_URL}/api/clientes/grupos/${groupId}/miembros`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            client_name: client_name ?? '',
            client_email: client_email ?? '',
          }),
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        console.error(data.detail || 'Error al sacar del grupo')
        return
      }
      refetchGrupos()
      refetchProductos()
    } catch (e) {
      console.error(e)
    }
  }

  if (cargando) return <p className="loading">Cargando...</p>
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <>
      <h1 className="page-title">Clientes</h1>

      <section className="unificar-clientes-seccion" aria-labelledby="unificar-clientes-titulo">
        <h2 id="unificar-clientes-titulo" className="unificar-clientes-titulo">
          Unificar clientes
        </h2>
        <p className="unificar-clientes-desc">
          Marca con el checkbox los clientes que son el mismo y pulsa &quot;Unificar seleccionados&quot;.
          Se conservan el nombre y el correo del que tiene más RMAs; el resto se muestran bajo ese canónico.
        </p>
        <div className="unificar-clientes-controls">
          <button
            type="button"
            className="btn btn-primary unificar-clientes-btn"
            disabled={!puedeUnificar}
            onClick={handleUnificar}
          >
            {unificarCargando ? 'Unificando…' : `Unificar seleccionados (${selectedCount})`}
          </button>
          {selectedCount > 0 && (
            <button
              type="button"
              className="btn unificar-clientes-btn-clear"
              onClick={clearSelection}
            >
              Quitar selección
            </button>
          )}
        </div>
        {unificarEstado?.error && (
          <p className="unificar-clientes-error" role="alert">
            {unificarEstado.error}
          </p>
        )}
        {unificarEstado?.ok && (
          <p className="unificar-clientes-ok" role="status">
            Clientes unificados correctamente.
          </p>
        )}
      </section>

      {clientGroups.length > 0 && (
        <section className="clientes-grupos-seccion" aria-labelledby="clientes-grupos-titulo">
          <h2 id="clientes-grupos-titulo" className="clientes-grupos-titulo">
            Clientes unificados
          </h2>
          <p className="clientes-grupos-desc">
            Puedes sacar del grupo a cualquier cliente para que vuelva a mostrarse por separado.
          </p>
          {gruposCargando ? (
            <p className="clientes-grupos-cargando">Cargando grupos…</p>
          ) : (
            <ul className="clientes-grupos-lista">
              {clientGroups.map((g) => (
                <li key={g.id} className="clientes-grupos-item">
                  <span className="clientes-grupos-canonical">
                    {g.canonical_name}
                    {g.canonical_email ? ` (${g.canonical_email})` : ''}
                  </span>
                  {(g.members || []).length > 0 && (
                    <ul className="clientes-grupos-members">
                      {(g.members || []).map((m, i) => (
                        <li key={i} className="clientes-grupos-member">
                          {m.client_name}
                          {m.client_email ? ` (${m.client_email})` : ''}
                          <button
                            type="button"
                            className="btn btn-small clientes-grupos-sacar"
                            onClick={() =>
                              handleSacarDelGrupo(g.id, m.client_name, m.client_email)
                            }
                          >
                            Sacar del grupo
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <HerramientasTabla
        columnas={COLUMNAS_CLIENTES}
        columnaFiltro={columnaFiltro}
        setColumnaFiltro={setColumnaFiltro}
        valorFiltro={valorFiltro}
        setValorFiltro={setValorFiltro}
        columnaOrden={columnaOrden}
        setColumnaOrden={setColumnaOrden}
        ordenAsc={ordenAsc}
        setOrdenAsc={setOrdenAsc}
        onPaginaReset={setPagina}
        idPrefix="clientes"
      />
      <div className="table-wrapper table-wrapper-clientes">
        <table>
          <thead>
            <tr>
              <th className="col-checkbox">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos de la página"
                  onChange={selectAllPage}
                  checked={enPagina.length > 0 && enPagina.every((c) => selectedKeys.has(rowKey(c)))}
                />
              </th>
              <th>Cliente</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th>Nº RMAs</th>
            </tr>
          </thead>
          <tbody>
            {enPagina.map((c) => {
              const key = rowKey(c)
              const isSelected = selectedKeys.has(key)
              return (
                <tr key={key} className={isSelected ? 'row-selected' : ''}>
                  <td className="col-checkbox">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${c.nombre}`}
                      checked={isSelected}
                      onChange={() => toggleSelected(c)}
                    />
                  </td>
                  <td>{c.nombre}</td>
                  <td>{c.email || '-'}</td>
                  <td>{c.telefono || '-'}</td>
                  <td>{c.count}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Paginacion
        inicio={inicio}
        fin={inicio + POR_PAGINA}
        total={ordenados.length}
        pagina={pagina}
        totalPaginas={totalPaginas}
        setPagina={setPagina}
      />
    </>
  )
}

export default Clientes
