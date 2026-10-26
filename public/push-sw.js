// Service Worker Background Push Handler para República Canta Grillo PWA
// Acorda em background mesmo com o app fechado quando o servidor envia Web Push via VAPID

self.addEventListener('push', (event) => {
  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification('República Canta Grillo', {
        body: 'Você tem uma nova atualização na república.',
        icon: '/logo.png',
        badge: '/logo.png',
        data: { url: '/' },
      })
    );
    return;
  }

  try {
    const payload = event.data.json();
    const title = payload.title || 'República Canta Grillo';
    const options = {
      body: payload.body || 'Você tem uma nova notificação.',
      icon: payload.icon || '/logo.png',
      badge: payload.badge || '/logo.png',
      tag: payload.tag || 'canta-grillo-' + Date.now(),
      renotify: true,
      vibrate: [100, 50, 100],
      data: {
        url: payload.url || '/',
      },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    // Fallback se payload for texto puro
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('República Canta Grillo', {
        body: text,
        icon: '/logo.png',
        badge: '/logo.png',
        data: { url: '/' },
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se já houver uma aba aberta da aplicação, foca nela e navega para a tela
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Se não houver janela aberta, abre uma nova
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
