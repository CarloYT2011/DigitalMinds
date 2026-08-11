/*
  Service Worker de Digital Minds
  - Cachea el "app shell" (HTML, fuentes, iconos) para que abra offline/instantaneo.
  - Deja pasar sin tocar las peticiones a Supabase (auth y datos en la nube),
    para no interferir nunca con el login ni la sincronizacion.
  - Recibe notificaciones push reales (funciona aunque la pestaña este cerrada)
    y las muestra usando la API de notificaciones del sistema operativo.
*/

const CACHE_NAME = 'digital-minds-v10';

const APP_SHELL = [
  './',
  './manifest.json',
  './icon.svg',
  './icon.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll falla entero si un solo recurso no existe; los agregamos uno por uno
      // para que la instalacion no truene si falta algun icono todavia.
      return Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn('No se pudo cachear', url, err))
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cachear ni interceptar llamadas a Supabase o al Asistente IA (Groq):
  // siempre a la red, directo, sin pasar por esta capa de cache.
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('groq.com')) {
    return; // deja que el navegador maneje la peticion normalmente
  }

  // Para todo lo demas (HTML, fuentes, iconos): cache-first con fallback a red.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Guarda una copia en cache para la proxima vez (solo si la respuesta es valida)
          if (response && response.status === 200 && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // si no hay red y no hay cache, no queda mas remedio
    })
  );
});

/* ============================================================
   NOTIFICACIONES PUSH
   Se disparan desde el servidor (Edge Function de Supabase) y
   llegan aqui aunque la pestaña/app este cerrada.
============================================================ */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Digital Minds', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Digital Minds';
  const options = {
    body: data.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: data.tag || 'dm-push',
    data: { url: data.url || './' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});