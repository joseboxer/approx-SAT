import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import BrandLogo from './BrandLogo'

function LoginRegister() {
  const { login, authLoading, authError, setAuthError } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmitLogin = async (e) => {
    e.preventDefault()
    setAuthError?.(null)
    await login(username, password)
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand-animation-wrap" aria-hidden>
            <BrandLogo />
          </div>
          <h1 className="auth-title">SAT · Iniciar sesión</h1>
          <p className="auth-subtitle">
            Introduce tu usuario y contraseña.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmitLogin}>
          {authError && (
            <div className="auth-error" role="alert">
              {authError}
            </div>
          )}
          <label className="auth-label">
            Usuario
            <input
              type="text"
              className="auth-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="auth-label">
            Contraseña
            <input
              type="password"
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="auth-submit" disabled={authLoading}>
            {authLoading ? 'Espera…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginRegister
