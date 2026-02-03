import React, { useState, useEffect, useCallback } from 'react'
import { API_URL, AUTH_STORAGE_KEY } from '../../constants'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

/**
 * Vista Repuestos: repuestos vinculados a productos del catálogo, con inventario (cantidad).
 */
function Repuestos() {
  const [list, setList] = useState([])
  const [catalogo, setCatalogo] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null) // null | 'crear' | { tipo: 'editar', repuesto }
  const [formNombre, setFormNombre] = useState('')
  const [formDescripcion, setFormDescripcion] = useState('')
  const [formCantidad, setFormCantidad] = useState(0)
  const [formProductos, setFormProductos] = useState([]) // array of product_ref
  const [guardando, setGuardando] = useState(false)
  const [editandoCantidad, setEditandoCantidad] = useState(null) // id cuando se edita cantidad inline

  const refetch = useCallback(() => {
    setCargando(true)
    setError(null)
    Promise.all([
      fetch(`${API_URL}/api/repuestos`, { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_URL}/api/productos-catalogo`, { headers: getAuthHeaders() }).then((r) => r.json().then((d) => d.productos || [])),
    ])
      .then(([repuestos, productos]) => {
        setList(Array.isArray(repuestos) ? repuestos : [])
        setCatalogo(Array.isArray(productos) ? productos : [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const opcionesProductos = catalogo.map((p) => {
    const ref = [p.brand, p.base_serial].filter(Boolean).join('|') || p.base_serial || '-'
    const label = [p.brand, p.base_serial].filter(Boolean).join(' — ') || ref
    return { value: ref, label }
  })

  const abrirCrear = () => {
    setFormNombre('')
    setFormDescripcion('')
    setFormCantidad(0)
    setFormProductos([])
    setModal('crear')
  }

  const abrirEditar = (repuesto) => {
    setFormNombre(repuesto.nombre || '')
    setFormDescripcion(repuesto.descripcion || '')
    setFormCantidad(repuesto.cantidad ?? 0)
    setFormProductos(Array.isArray(repuesto.productos) ? [...repuesto.productos] : [])
    setModal({ tipo: 'editar', repuesto })
  }

  const cerrarModal = () => {
    setModal(null)
    setGuardando(false)
  }

  const guardarCrear = () => {
    const nombre = formNombre.trim()
    if (!nombre) return
    setGuardando(true)
    fetch(`${API_URL}/api/repuestos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        nombre,
        descripcion: formDescripcion.trim(),
        cantidad: Math.max(0, parseInt(formCantidad, 10) || 0),
        productos: formProductos.filter(Boolean),
      }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((e) => { throw new Error(e.detail || 'Error al crear') })
        return r.json()
      })
      .then(() => {
        cerrarModal()
        refetch()
      })
      .catch((err) => setError(err.message))
      .finally(() => setGuardando(false))
  }

  const guardarEditar = () => {
    const nombre = formNombre.trim()
    if (!nombre || !modal?.repuesto) return
    setGuardando(true)
    const id = modal.repuesto.id
    fetch(`${API_URL}/api/repuestos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        nombre,
        descripcion: formDescripcion.trim(),
        cantidad: Math.max(0, parseInt(formCantidad, 10) || 0),
        productos: formProductos.filter(Boolean),
      }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((e) => { throw new Error(e.detail || 'Error al actualizar') })
        return r.json()
      })
      .then(() => {
        cerrarModal()
        refetch()
      })
      .catch((err) => setError(err.message))
      .finally(() => setGuardando(false))
  }

  const eliminar = (repuesto) => {
    if (!window.confirm(`¿Eliminar el repuesto "${repuesto.nombre}"?`)) return
    fetch(`${API_URL}/api/repuestos/${repuesto.id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((e) => { throw new Error(e.detail || 'Error al eliminar') })
        return r.json()
      })
      .then(() => refetch())
      .catch((err) => setError(err.message))
  }

  const actualizarCantidad = (id, nuevaCantidad) => {
    const cant = Math.max(0, parseInt(nuevaCantidad, 10) || 0)
    fetch(`${API_URL}/api/repuestos/${id}/cantidad`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ cantidad: cant }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((e) => { throw new Error(e.detail || 'Error') })
        return r.json()
      })
      .then(() => {
        setEditandoCantidad(null)
        refetch()
      })
      .catch((err) => setError(err.message))
  }

  const toggleProducto = (ref) => {
    setFormProductos((prev) =>
      prev.includes(ref) ? prev.filter((r) => r !== ref) : [...prev, ref]
    )
  }

  if (cargando) return <p className="loading">Cargando repuestos...</p>
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <>
      <h1 className="page-title">Repuestos</h1>
      <p className="repuestos-desc">
        Repuestos para garantía. Vincula cada repuesto con uno o varios productos del catálogo y lleva el control de cantidad en inventario.
      </p>

      <div className="repuestos-actions">
        <button type="button" className="btn btn-primary" onClick={abrirCrear}>
          Nuevo repuesto
        </button>
      </div>

      {list.length === 0 ? (
        <p className="repuestos-empty">No hay repuestos. Pulsa &quot;Nuevo repuesto&quot; para crear uno.</p>
      ) : (
        <div className="table-wrapper tabla-repuestos">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Inventario (cantidad)</th>
                <th>Vinculado a productos</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const desc = r.descripcion || ''
                const descShort = desc.slice(0, 80) + (desc.length > 80 ? '…' : '')
                const productosStr = Array.isArray(r.productos) && r.productos.length > 0
                  ? r.productos.map((ref) => ref.replace(/\|/g, ' — ')).join(', ')
                  : '—'
                const productosShort = productosStr.length > 60 ? productosStr.slice(0, 60) + '…' : productosStr
                return (
                <tr key={r.id}>
                  <td title={r.nombre && r.nombre.length > 40 ? r.nombre : undefined}>
                    {r.nombre}
                  </td>
                  <td title={desc.length > 80 ? desc : undefined}>
                    {descShort}
                  </td>
                  <td className="repuestos-cantidad">
                    {editandoCantidad === r.id ? (
                      <input
                        type="number"
                        min={0}
                        defaultValue={r.cantidad}
                        onBlur={(e) => actualizarCantidad(r.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            actualizarCantidad(r.id, e.target.value)
                            setEditandoCantidad(null)
                          }
                          if (e.key === 'Escape') setEditandoCantidad(null)
                        }}
                        autoFocus
                        className="repuestos-cantidad-input"
                      />
                    ) : (
                      <button
                        type="button"
                        className="repuestos-cantidad-btn"
                        onClick={() => setEditandoCantidad(r.id)}
                        title="Clic para editar cantidad"
                      >
                        {r.cantidad}
                      </button>
                    )}
                  </td>
                  <td title={productosStr !== '—' && productosStr.length > 60 ? productosStr : undefined}>
                    {productosShort}
                  </td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirEditar(r)}>
                      Editar
                    </button>
                    {' '}
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => eliminar(r)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div
          className="modal-overlay"
          onClick={() => !guardando && cerrarModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="repuesto-modal-title"
        >
          <div className="modal modal-repuesto" onClick={(e) => e.stopPropagation()}>
            <h2 id="repuesto-modal-title" className="modal-titulo">
              {modal === 'crear' ? 'Nuevo repuesto' : 'Editar repuesto'}
            </h2>
            <div className="modal-cuerpo">
              <label className="modal-label" htmlFor="repuesto-nombre">Nombre *</label>
              <input
                id="repuesto-nombre"
                type="text"
                value={formNombre}
                onChange={(e) => setFormNombre(e.target.value)}
                placeholder="Ej. Placa base APP500"
                className="modal-input"
              />
              <label className="modal-label" htmlFor="repuesto-descripcion">Descripción</label>
              <textarea
                id="repuesto-descripcion"
                value={formDescripcion}
                onChange={(e) => setFormDescripcion(e.target.value)}
                placeholder="Opcional"
                rows={2}
                className="modal-input"
              />
              <label className="modal-label" htmlFor="repuesto-cantidad">Cantidad en inventario</label>
              <input
                id="repuesto-cantidad"
                type="number"
                min={0}
                value={formCantidad}
                onChange={(e) => setFormCantidad(e.target.value)}
                className="modal-input"
              />
              <label className="modal-label">Vinculado a productos (catálogo)</label>
              <div className="repuestos-productos-select">
                {opcionesProductos.length === 0 ? (
                  <p className="modal-hint">Carga el catálogo en Productos para elegir productos.</p>
                ) : (
                  opcionesProductos.map((opt) => (
                    <label key={opt.value} className="repuestos-productos-check">
                      <input
                        type="checkbox"
                        checked={formProductos.includes(opt.value)}
                        onChange={() => toggleProducto(opt.value)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="modal-pie modal-pie-actions">
              <button type="button" className="btn btn-secondary" onClick={cerrarModal} disabled={guardando}>
                Cancelar
              </button>
              {modal === 'crear' ? (
                <button type="button" className="btn btn-primary" onClick={guardarCrear} disabled={guardando || !formNombre.trim()}>
                  {guardando ? 'Guardando…' : 'Crear'}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={guardarEditar} disabled={guardando || !formNombre.trim()}>
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Repuestos
