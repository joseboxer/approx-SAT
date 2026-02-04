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

/**
 * Registra la suscripción Web Push si el navegador y el servidor lo permiten.
 * Se llama cuando el usuario tiene permiso de notificaciones (granted).
 * Si el servidor no tiene VAPID configurado, no hace nada.
 */
export async function registerPushSubscription() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (Notification.permission !== 'granted') return

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
