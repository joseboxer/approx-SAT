/**
 * Constantes de la aplicación de Gestión de garantías.
 */

export const POR_PAGINA = 20

// En desarrollo usa el backend en localhost. En producción, si el backend sirve el frontend, usa misma origen ('').
// Para frontend y backend en puertos/servidores distintos, define VITE_API_URL al compilar (ej: VITE_API_URL=http://192.168.1.10:8000 npm run build).
export const API_URL = typeof import.meta.env?.VITE_API_URL === 'string' && import.meta.env.VITE_API_URL !== ''
  ? import.meta.env.VITE_API_URL
  : (import.meta.env.DEV ? 'http://localhost:8000' : '')

export const AUTH_STORAGE_KEY = 'garantia-sat-token'
export const AUTH_USER_KEY = 'garantia-sat-user'
export const NOTIFICATIONS_TAB_KEY = 'garantia-notifications-tab' // 'recibidos' | 'enviados'
export const NOTIFICATIONS_CATEGORY_KEY = 'garantia-notifications-category' // 'abono' | 'envio' | 'sin_categoria'
export const LAST_NOTIFICATION_TO_USER_KEY = 'garantia-last-notification-to-user-id'

/** Filtros de notificaciones: Sin filtro (todas) + Abono, Envío, Sin categoría */
export const NOTIFICATION_CATEGORY_SIN_FILTRO = ''
export const NOTIFICATION_CATEGORIES = {
  [NOTIFICATION_CATEGORY_SIN_FILTRO]: 'Sin filtro',
  abono: 'Abono',
  envio: 'Envío',
  sin_categoria: 'Sin categoría',
}
export const NOTIFICATION_CATEGORY_VALUES = [NOTIFICATION_CATEGORY_SIN_FILTRO, 'abono', 'envio', 'sin_categoria']

export const OPCIONES_ESTADO = [
  { value: '', label: '—' },
  { value: 'abonado', label: 'Abonado' },
  { value: 'reparado', label: 'Reparado' },
  { value: 'no_anomalias', label: 'No tiene anomalías' },
]

export const COLUMNAS_CLIENTES = [
  { label: 'Cliente', key: 'nombre' },
  { label: 'Email', key: 'email' },
  { label: 'Teléfono', key: 'telefono' },
  { label: 'Nº RMAs', key: 'count' },
]

export const COLUMNAS_PRODUCTOS = [
  { label: 'Producto', key: 'producto' },
  { label: 'Nº RMAs', key: 'count' },
]

export const COLUMNAS_PRODUCTOS_RMA = [
  { label: 'Nº de serie', key: 'serial' },
  { label: 'Producto', key: 'product_name' },
  { label: 'Nº RMAs', key: 'count' },
  { label: 'Primera fecha', key: 'first_date' },
  { label: 'Última fecha', key: 'last_date' },
  { label: 'Garantía vigente', key: 'garantia_vigente' },
]

export const VISTAS = {
  INICIO: 'inicio',
  RMA: 'rma',
  RMA_ESPECIALES: 'rma-especiales',
  CLIENTES: 'clientes',
  PRODUCTOS: 'productos',
  PRODUCTOS_RMA: 'productos-rma',
  REPUESTOS: 'repuestos',
  OCULTA: 'oculta',
  INFORMES: 'informes',
  CONFIGURACION: 'configuracion',
  NOTIFICACIONES: 'notificaciones',
  ADMIN: 'admin',
}

export const NOTIFICATION_TYPES = {
  rma: 'Lista RMA',
  rma_especial: 'RMA especial',
  catalogo: 'Catálogo',
  producto_rma: 'Productos RMA',
  cliente: 'Clientes',
}
