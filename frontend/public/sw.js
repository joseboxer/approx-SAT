/* Service Worker para Web Push. Muestra notificación cuando llega un push aunque la pestaña esté cerrada. */
self.addEventListener("push", function (event) {
  if (!event.data) return
  let data
  try {
    data = event.data.json()
  } catch {
    data = { title: "SAT", body: event.data.text() || "Nueva notificación" }
  }
  const title = data.title || "SAT · Garantías"
  const body = data.body || "Tienes un nuevo mensaje."
  const tag = data.tag || "garantia-notification"
  const options = {
    body,
    tag,
    icon: "/logo-aqprox.png",
    badge: "/logo-aqprox.png",
    data: { url: "/", message: data.message },
    renotify: true,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", function (event) {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      if (clientList.length > 0 && "focus" in clientList[0]) {
        clientList[0].focus()
        clientList[0].navigate("/")
      } else if (self.clients.openWindow) {
        self.clients.openWindow("/")
      }
    })
  )
})
