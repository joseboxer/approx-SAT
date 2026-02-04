import { API_URL, AUTH_STORAGE_KEY } from '../constants'

function getAuthHeaders() {
  try {
    const token = localStorage.getItem(AUTH_STORAGE_KEY)
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

function isPushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
}

/**
 * Registra la suscripción Web Push si el navegador y el servidor lo permiten.
 * Se llama cuando el usuario tiene permiso de notificaciones (granted).
 * Si el servidor no tiene VAPID configurado, no hace nada.
 */
export async function registerPushSubscription() {
  if (!isPushSupported() || Notification.permission !== 'granted') return

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await reg.update()

    const res = await fetch(`${API_URL}/api/push/vapid-public`, { headers: getAuthHeaders() })
    if (!res.ok) return
    const { publicKey } = await res.json()
    if (!publicKey) return

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })

    const sub = subscription.toJSON()
    await fetch(`${API_URL}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: sub.keys,
      }),
    })
  } catch (_) {
    // Servidor sin VAPID, o push no soportado: ignorar
  }
}

/**
 * Comprueba si el usuario está suscrito al servicio push y ejecuta el proceso necesario.
 * - Si ya tiene permiso granted: registra/envía la suscripción al backend (idempotente).
 * - Si el permiso es "default": indica que hay que mostrar el modal para pedir permiso.
 * Llamar al iniciar sesión, al recuperar visibilidad de la pestaña y de forma periódica.
 *
 * @returns {{ showModal: boolean }} showModal true si el permiso es "default" y la app debe mostrar el modal de activación.
 */
export async function ensurePushSubscription() {
  if (!isPushSupported()) return { showModal: false }

  const permission = Notification.permission

  if (permission === 'granted') {
    await registerPushSubscription()
    return { showModal: false }
  }

  if (permission === 'default') {
    return { showModal: true }
  }

  // denied
  return { showModal: false }
}
