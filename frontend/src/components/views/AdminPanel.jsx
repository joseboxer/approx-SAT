import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { API_URL, AUTH_STORAGE_KEY } from '../../constants'
import HelpTip from '../HelpTip'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

/**
 * Panel de administrador: crear usuarios, listar, editar (email, rol admin), restablecer contraseña y eliminar.
 * Solo visible para usuarios con is_admin.
 */
function AdminPanel() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newUsername, setNewUsername] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [createOk, setCreateOk] = useState(null)

  const [editUser, setEditUser] = useState(null)
  const [editEmail, setEditEmail] = useState('')
  const [editIsAdmin, setEditIsAdmin] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState(null)

  const [resetTarget, setResetTarget] = useState(null)
  const [resetLoading, setResetLoading] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const loadUsers = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`${API_URL}/api/users/admin`, { headers: getAuthHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 403 ? 'No tienes permiso' : 'Error al cargar usuarios')
        return res.json()
      })
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setEditUser(null)
        setResetTarget(null)
        setDeleteTarget(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const handleCreateUser = () => {
    const name = (newUsername || '').trim()
    if (!name) {
      setCreateError('El nombre de usuario no puede estar vacío')
      return
    }
    setCreateError(null)
    setCreateOk(null)
    setCreateLoading(true)
    fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setCreateOk(data.mensaje || 'Usuario creado')
          setNewUsername('')
          loadUsers()
        } else {
          setCreateError(data.detail || 'Error al crear usuario')
        }
      })
      .catch((err) => setCreateError(err.message))
      .finally(() => setCreateLoading(false))
  }

  const openEdit = (u) => {
    setEditUser(u)
    setEditEmail(u.email || '')
    setEditIsAdmin(Boolean(u.is_admin))
    setEditError(null)
  }

  const handleSaveEdit = () => {
    if (!editUser) return
    setEditSaving(true)
    setEditError(null)
    const body = {}
    if (editEmail.trim() !== (editUser.email || '')) body.email = editEmail.trim()
    if (editIsAdmin !== editUser.is_admin) body.is_admin = editIsAdmin
    if (Object.keys(body).length === 0) {
      setEditUser(null)
      setEditSaving(false)
      return
    }
    fetch(`${API_URL}/api/users/${editUser.id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setEditUser(null)
          loadUsers()
        } else {
          setEditError(data.detail || 'Error al actualizar')
        }
      })
      .catch((err) => setEditError(err.message))
      .finally(() => setEditSaving(false))
  }

  const handleResetPassword = () => {
    if (!resetTarget) return
    setResetLoading(true)
    fetch(`${API_URL}/api/users/${resetTarget.id}/reset-password`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok }) => {
        if (ok) {
          setResetTarget(null)
        }
      })
      .finally(() => setResetLoading(false))
  }

  const handleDeleteUser = () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    fetch(`${API_URL}/api/users/${deleteTarget.id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setDeleteTarget(null)
          loadUsers()
        } else {
          setError(data.detail || 'Error al eliminar')
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setDeleteLoading(false))
  }

  const isSelf = (u) => currentUser && String(u.username) === String(currentUser.username)

  return (
    <div className="configuracion-page">
      <h1 className="configuracion-title">
        Panel de administrador
        <HelpTip text="Crear usuarios, editar email y rol de administrador, restablecer contraseñas y eliminar cuentas. Solo visible para administradores." />
      </h1>

      <section className="configuracion-form" aria-label="Crear usuario">
        <h2 className="configuracion-subtitle">Crear usuario</h2>
        <p className="configuracion-desc">
          La contraseña por defecto será <strong>approx2026</strong>. El usuario puede cambiarla en Configuración.
        </p>
        <div className="configuracion-field">
          <label htmlFor="admin-new-username">Nombre de usuario</label>
          <input
            id="admin-new-username"
            type="text"
            value={newUsername}
            onChange={(e) => {
              setNewUsername(e.target.value)
              setCreateError(null)
              setCreateOk(null)
            }}
            placeholder="Ej. maria"
            className="configuracion-input"
            autoComplete="off"
          />
        </div>
        <div className="configuracion-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCreateUser}
            disabled={createLoading}
          >
            {createLoading ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
        {createOk && <p className="configuracion-ok">{createOk}</p>}
        {createError && <p className="error-msg">{createError}</p>}
      </section>

      <section className="configuracion-form" aria-label="Listado de usuarios">
        <h2 className="configuracion-subtitle">Usuarios</h2>
        {error && <p className="error-msg">{error}</p>}
        {loading ? (
          <p className="configuracion-desc">Cargando…</p>
        ) : (
          <div className="table-wrap">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Email</th>
                  <th>Administrador</th>
                  <th>Fecha alta</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.email || '—'}</td>
                    <td>{u.is_admin ? 'Sí' : 'No'}</td>
                    <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => openEdit(u)}
                      >
                        Editar
                      </button>
                      {' '}
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => setResetTarget(u)}
                      >
                        Restablecer contraseña
                      </button>
                      {' '}
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => setDeleteTarget(u)}
                        disabled={isSelf(u)}
                        title={isSelf(u) ? 'No puedes eliminarte a ti mismo' : 'Eliminar usuario'}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal Editar usuario */}
      {editUser && (
        <div
          className="modal-overlay"
          onClick={() => setEditUser(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-title"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="edit-user-title" className="modal-titulo">Editar usuario: {editUser.username}</h2>
            <div className="configuracion-field">
              <label htmlFor="edit-email">Email</label>
              <input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="configuracion-input"
                autoComplete="off"
              />
            </div>
            <div className="configuracion-field">
              <label>
                <input
                  type="checkbox"
                  checked={editIsAdmin}
                  onChange={(e) => setEditIsAdmin(e.target.checked)}
                />
                {' '}
                Es administrador
              </label>
            </div>
            {editError && <p className="error-msg">{editError}</p>}
            <div className="modal-pie modal-pie-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setEditUser(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveEdit} disabled={editSaving}>
                {editSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Restablecer contraseña */}
      {resetTarget && (
        <div
          className="modal-overlay"
          onClick={() => !resetLoading && setResetTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-title"
        >
          <div className="modal modal-confirm" onClick={(e) => e.stopPropagation()}>
            <h2 id="reset-title" className="modal-titulo">Restablecer contraseña</h2>
            <p className="modal-confirm-text">
              ¿Restablecer la contraseña de <strong>{resetTarget.username}</strong> a <strong>approx2026</strong>?
            </p>
            <div className="modal-pie modal-pie-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setResetTarget(null)} disabled={resetLoading}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={handleResetPassword} disabled={resetLoading}>
                {resetLoading ? 'Restableciendo…' : 'Restablecer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Eliminar usuario */}
      {deleteTarget && (
        <div
          className="modal-overlay"
          onClick={() => !deleteLoading && setDeleteTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
        >
          <div className="modal modal-confirm" onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-title" className="modal-titulo">Eliminar usuario</h2>
            <p className="modal-confirm-text">
              ¿Eliminar la cuenta de <strong>{deleteTarget.username}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="modal-pie modal-pie-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>
                Cancelar
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDeleteUser} disabled={deleteLoading}>
                {deleteLoading ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPanel
