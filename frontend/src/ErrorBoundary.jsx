import React from 'react'

/**
 * Captura errores de render y muestra un mensaje en lugar de pantalla en blanco.
 * Incluye opción de limpiar sesión y recargar por si el fallo viene de datos guardados.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info?.componentStack)
  }

  handleReset = () => {
    try {
      localStorage.removeItem('garantia-sat-token')
      localStorage.removeItem('garantia-sat-user')
    } catch (_) {}
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{
          padding: '2rem',
          maxWidth: '600px',
          margin: '2rem auto',
          fontFamily: 'system-ui, sans-serif',
          background: '#f8f8f8',
          borderRadius: '8px',
          border: '1px solid #ccc',
        }}>
          <h1 style={{ color: '#c00', marginTop: 0 }}>Error en la aplicación</h1>
          <p style={{ color: '#333' }}>
            Se ha producido un error. Prueba a cerrar sesión y volver a entrar.
          </p>
          <pre style={{
            background: '#fff',
            padding: '1rem',
            overflow: 'auto',
            fontSize: '12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
          }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              background: '#0066cc',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Cerrar sesión y recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
