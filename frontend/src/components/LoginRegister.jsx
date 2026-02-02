import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import BrandLogo from './BrandLogo'

function LoginRegister() {
  const { login, register, verifyEmail, authLoading, authError, setAuthError } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState(null)
  const [codigoEnRespuesta, setCodigoEnRespuesta] = useState(null)
  const [code, setCode] = useState('')

  const handleSubmitRegister = async (e) => {
    e.preventDefault()
    setAuthError?.(null)
    setCodigoEnRespuesta(null)
    const result = await register(username, password, email)
    if (result?.ok && result?.email) {
      setPendingVerificationEmail(result.email)
      setCodigoEnRespuesta(result.codigo_verificacion ?? null)
      setCode(result.codigo_verificacion ?? '')
    }
  }

  const handleSubmitVerify = async (e) => {
    e.preventDefault()
    setAuthError?.(null)
    const ok = await verifyEmail(pendingVerificationEmail, code)
    if (ok) {
      setPendingVerificationEmail(null)
      setCode('')
    }
  }

  const handleSubmitLogin = async (e) => {
    e.preventDefault()
    setAuthError?.(null)
    await login(username, password)
  }

  const switchMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    setAuthError?.(null)
    setPassword('')
    setEmail('')
    setPendingVerificationEmail(null)
    setCode('')
  }

  const backToRegisterForm = () => {
    setPendingVerificationEmail(null)
    setCodigoEnRespuesta(null)
    setCode('')
    setAuthError?.(null)
  }

  const isVerificationStep = mode === 'register' && pendingVerificationEmail

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand-animation-wrap" aria-hidden>
            <BrandLogo />
          </div>
          <h1 className="auth-title">SAT · Iniciar sesión</h1>
          <p className="auth-subtitle">
            {mode === 'login' && 'Introduce tu usuario y contraseña.'}
            {mode === 'register' && !isVerificationStep && 'Registro: usa tu correo corporativo (@approx.es). Se enviará un código de verificación.'}
            {isVerificationStep && 'Introduce el código que te hemos enviado por correo para crear la cuenta.'}
          </p>
        </div>

        {isVerificationStep ? (
          <form className="auth-form" onSubmit={handleSubmitVerify}>
            {authError && (
              <div className="auth-error" role="alert">
                {authError}
              </div>
            )}
            <label className="auth-label">
              Correo
              <input
                type="email"
                className="auth-input"
                value={pendingVerificationEmail}
                readOnly
                disabled
                aria-readonly
              />
            </label>
            {codigoEnRespuesta && (
              <p className="auth-hint-code">
                No se pudo enviar el correo. Usa este código: <strong>{codigoEnRespuesta}</strong>
              </p>
            )}
            <label className="auth-label">
              Código de verificación
              <input
                type="text"
                className="auth-input"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                autoComplete="one-time-code"
                required
              />
            </label>
            <button type="submit" className="auth-submit" disabled={authLoading || code.length < 4}>
              {authLoading ? 'Verificando…' : 'Verificar y crear cuenta'}
            </button>
            <button type="button" className="auth-switch" onClick={backToRegisterForm}>
              Volver al formulario de registro
            </button>
          </form>
        ) : (
          <form
            className="auth-form"
            onSubmit={mode === 'login' ? handleSubmitLogin : handleSubmitRegister}
          >
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
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </label>
            {mode === 'register' && (
              <label className="auth-label">
                Correo corporativo (@approx.es)
                <input
                  type="email"
                  className="auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@approx.es"
                  required
                />
              </label>
            )}
            <button type="submit" className="auth-submit" disabled={authLoading}>
              {authLoading ? 'Espera…' : mode === 'login' ? 'Entrar' : 'Enviar código al correo'}
            </button>
            <button type="button" className="auth-switch" onClick={switchMode}>
              {mode === 'login' ? 'Crear cuenta' : 'Ya tengo cuenta'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default LoginRegister
