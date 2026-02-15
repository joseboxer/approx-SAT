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
export const NOTIFICATIONS_TAB_KEY = 'garantia-notifications-tab' // 'recibidos' | 'enviados' | 'borrados'
export const NOTIFICATIONS_CATEGORY_KEY = 'garantia-notifications-category' // 'abono' | 'envio' | 'sin_categoria'
export const LAST_NOTIFICATION_TO_USER_KEY = 'garantia-last-notification-to-user-id'

/** Filtros de notificaciones: Sin filtro (todas) + Abono, Envío, Sin categoría, Fuera de garantía */
export const NOTIFICATION_CATEGORY_SIN_FILTRO = ''
export const NOTIFICATION_CATEGORIES = {
  [NOTIFICATION_CATEGORY_SIN_FILTRO]: 'Sin filtro',
  abono: 'Abono',
  envio: 'Envío',
  sin_categoria: 'Sin categoría',
  fuera_garantia: 'Fuera de garantía',
}
export const NOTIFICATION_CATEGORY_VALUES = [NOTIFICATION_CATEGORY_SIN_FILTRO, 'abono', 'envio', 'sin_categoria', 'fuera_garantia']

export const OPCIONES_ESTADO = [
  { value: '', label: '—' },
  { value: 'abonado', label: 'Abonado' },
  { value: 'reparado', label: 'Reparado' },
  { value: 'no_anomalias', label: 'No tiene anomalías' },
  { value: 'fuera_garantia', label: 'Fuera de garantía' },
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
  EN_REVISION: 'en-revision',
  REPARACIONES_HUB: 'reparaciones-hub',
  CLIENTES: 'clientes',
  PRODUCTOS: 'productos',
  PRODUCTOS_RMA: 'productos-rma',
  REPUESTOS: 'repuestos',
  PRODUCTOS_HUB: 'productos-hub',
  OCULTA: 'oculta',
  INFORMES: 'informes',
  CONFIGURACION: 'configuracion',
  NOTIFICACIONES: 'notificaciones',
  ADMIN: 'admin',
}

/** Vista -> vista padre (para breadcrumbs navegables). */
export const VISTA_PARENT = {
  [VISTAS.REPARACIONES_HUB]: VISTAS.INICIO,
  [VISTAS.RMA]: VISTAS.REPARACIONES_HUB,
  [VISTAS.RMA_ESPECIALES]: VISTAS.REPARACIONES_HUB,
  [VISTAS.EN_REVISION]: VISTAS.REPARACIONES_HUB,
  [VISTAS.PRODUCTOS_RMA]: VISTAS.REPARACIONES_HUB,
  [VISTAS.OCULTA]: VISTAS.REPARACIONES_HUB,
  [VISTAS.PRODUCTOS_HUB]: VISTAS.INICIO,
  [VISTAS.PRODUCTOS]: VISTAS.PRODUCTOS_HUB,
  [VISTAS.REPUESTOS]: VISTAS.PRODUCTOS_HUB,
  [VISTAS.CLIENTES]: VISTAS.INICIO,
  [VISTAS.NOTIFICACIONES]: VISTAS.INICIO,
  [VISTAS.CONFIGURACION]: VISTAS.INICIO,
  [VISTAS.ADMIN]: VISTAS.INICIO,
  [VISTAS.INFORMES]: VISTAS.INICIO,
}

/** Etiquetas para breadcrumbs y títulos. */
export const VISTAS_LABELS = {
  [VISTAS.INICIO]: 'Inicio',
  [VISTAS.RMA]: 'Lista RMA',
  [VISTAS.RMA_ESPECIALES]: 'RMA especiales',
  [VISTAS.EN_REVISION]: 'En revisión',
  [VISTAS.REPARACIONES_HUB]: 'Reparaciones',
  [VISTAS.CLIENTES]: 'Clientes',
  [VISTAS.PRODUCTOS]: 'Catálogo de productos',
  [VISTAS.PRODUCTOS_RMA]: 'Productos con RMA',
  [VISTAS.REPUESTOS]: 'Repuestos',
  [VISTAS.PRODUCTOS_HUB]: 'Productos',
  [VISTAS.OCULTA]: 'Reparaciones ocultas',
  [VISTAS.INFORMES]: 'Informes',
  [VISTAS.CONFIGURACION]: 'Ajustes',
  [VISTAS.NOTIFICACIONES]: 'Mensajes',
  [VISTAS.ADMIN]: 'Administración',
}

/** Atajos de teclado: Alt + número -> vista. */
export const VISTAS_ATAJOS = {
  1: VISTAS.INICIO,
  2: VISTAS.CLIENTES,
  3: VISTAS.RMA,
  4: VISTAS.PRODUCTOS_RMA,
  5: VISTAS.PRODUCTOS,
  6: VISTAS.NOTIFICACIONES,
  7: VISTAS.CONFIGURACION,
  8: VISTAS.INFORMES,
}

/** Vista -> atajo (ej. 'Alt+1') para tooltips. */
export const ATAJO_POR_VISTA = Object.fromEntries(
  Object.entries(VISTAS_ATAJOS).map(([num, v]) => [v, `Alt+${num}`])
)

export const NOTIFICATION_TYPES = {
  rma: 'Lista RMA',
  rma_especial: 'RMA especial',
  catalogo: 'Catálogo',
  producto_rma: 'Productos RMA',
  cliente: 'Clientes',
}
