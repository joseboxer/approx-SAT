import React, { useState, useEffect, useCallback, useRef } from 'react'
import { API_URL } from '../../constants'
import { apiFetch } from '../../utils/auth'
import ConfirmModal from '../ConfirmModal'
import { useDialogFocus } from '../../hooks/useDialogFocus'

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
  const [filtroProductoRef, setFiltroProductoRef] = useState('') // búsqueda por nº serie base / referencia
  const [guardando, setGuardando] = useState(false)
  const [editandoCantidad, setEditandoCantidad] = useState(null) // id cuando se edita cantidad inline
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const repuestoModalPanelRef = useRef(null)

  const refetch = useCallback(() => {
    setCargando(true)
    setError(null)
    Promise.all([
      apiFetch(`${API_URL}/api/repuestos`).then((r) => (r.ok ? r.json() : [])),
      apiFetch(`${API_URL}/api/productos-catalogo`).then((r) => r.json().then((d) => d.productos || [])),
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
    const brand = (p.brand || '').replace(/^PRODUCTOS\s+/i, '').trim()
    const baseSerial = String(p.base_serial ?? '').trim()
    const ref = [p.brand, p.base_serial].filter(Boolean).join('|') || baseSerial || '-'
    const label = [brand, baseSerial].filter(Boolean).join(' — ') || ref
    return { value: ref, label, base_serial: baseSerial }
  })

  const opcionesProductosFiltradas = React.useMemo(() => {
    const q = (filtroProductoRef || '').trim().toLowerCase()
    if (!q) return opcionesProductos
    return opcionesProductos.filter((opt) => {
      const serie = (opt.base_serial || '').toLowerCase()
      return serie.includes(q)
    })
  }, [opcionesProductos, filtroProductoRef])

  const abrirCrear = () => {
    setFormNombre('')
    setFormDescripcion('')
    setFormCantidad(0)
    setFormProductos([])
    setFiltroProductoRef('')
    setModal('crear')
  }

  const abrirEditar = (repuesto) => {
    setFormNombre(repuesto.nombre || '')
    setFormDescripcion(repuesto.descripcion || '')
    setFormCantidad(repuesto.cantidad ?? 0)
    setFormProductos(Array.isArray(repuesto.productos) ? [...repuesto.productos] : [])
    setFiltroProductoRef('')
    setModal({ tipo: 'editar', repuesto })
  }

  const cerrarModal = () => {
    setModal(null)
    setGuardando(false)
  }

  useDialogFocus(!!modal, repuestoModalPanelRef, {
    onClose: () => {
      if (!guardando) cerrarModal()
    },
  })

  const guardarCrear = () => {
    const nombre = formNombre.trim()
    if (!nombre) return
    setGuardando(true)
    apiFetch(`${API_URL}/api/repuestos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    apiFetch(`${API_URL}/api/repuestos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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
    setDeleteConfirm(repuesto)
  }

  const confirmarEliminarRepuesto = () => {
    const repuesto = deleteConfirm
    setDeleteConfirm(null)
    if (!repuesto) return
    apiFetch(`${API_URL}/api/repuestos/${repuesto.id}`, {
      method: 'DELETE',
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
    apiFetch(`${API_URL}/api/repuestos/${id}/cantidad`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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
    <div data-tour="repuestos">
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
          <div ref={repuestoModalPanelRef} className="modal modal-repuesto" onClick={(e) => e.stopPropagation()}>
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
              {opcionesProductos.length > 0 && (
                <div className="repuestos-productos-busqueda">
                  <input
                    type="text"
                    value={filtroProductoRef}
                    onChange={(e) => setFiltroProductoRef(e.target.value)}
                    placeholder="Buscar por nº serie base..."
                    className="modal-input repuestos-productos-busqueda-input"
                  />
                </div>
              )}
              <div className="repuestos-productos-select">
                {opcionesProductos.length === 0 ? (
                  <p className="modal-hint">Carga el catálogo en Productos para elegir productos.</p>
                ) : opcionesProductosFiltradas.length === 0 ? (
                  <p className="modal-hint">No hay productos que coincidan con la búsqueda.</p>
                ) : (
                  opcionesProductosFiltradas.map((opt) => (
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

      <ConfirmModal
        open={!!deleteConfirm}
        title="Eliminar repuesto"
        message={deleteConfirm ? `¿Eliminar el repuesto "${deleteConfirm.nombre}"?` : ''}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={confirmarEliminarRepuesto}
        danger
      />
    </div>
  )
}

export default Repuestos
