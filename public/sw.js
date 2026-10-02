// BLOW SALON - Service Worker for Appointment Reminders

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

// Handle notification click: focus existing BLOW SALON window tab or open a new one
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const appointmentId = data.appointmentId;
  const targetUrl = data.url || (appointmentId ? `/appointments?id=${appointmentId}` : "/appointments");

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // 1. If an existing BLOW SALON tab is open, focus it and navigate to appointment
      for (const client of windowClients) {
        if (client.url && client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus().then((focusedClient) => {
            if (focusedClient && "navigate" in focusedClient) {
              return focusedClient.navigate(targetUrl);
            }
          });
        }
      }
      // 2. If no tab is open, open a new window with the appointment details
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Handle background Web Push notification event
self.addEventListener("push", (event) => {
  let payload = {
    title: "🔔 BLOW SALON",
    body: "Appointment in 30 minutes",
    url: "/appointments",
    appointmentId: "",
  };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || "/logoo.jpeg",
    badge: payload.badge || "/logoo.jpeg",
    tag: payload.tag || `blow-salon-appt-${payload.appointmentId || "reminder"}`,
    data: {
      url: payload.url || (payload.appointmentId ? `/appointments?id=${payload.appointmentId}` : "/appointments"),
      appointmentId: payload.appointmentId,
    },
    silent: false,
    requireInteraction: true,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "🔔 BLOW SALON", options)
  );
});
