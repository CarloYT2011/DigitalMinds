/*
  Service Worker de Digital Minds
  - Cachea el "app shell" (HTML, fuentes, iconos) para que abra offline/instantaneo.
  - Deja pasar sin tocar las peticiones a Supabase (auth y datos en la nube),
    para no interferir nunca con el login ni la sincronizacion.
*/

const CACHE_NAME = 'digital-minds-v4';

const APP_SHELL = [
  './digital-minds.html',
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

  // Nunca cachear ni interceptar llamadas a Supabase o al Asistente IA (Llama API):
  // siempre a la red, directo, sin pasar por esta capa de cache.
  if (url.hostname.endsWith('supabase.co') || url.hostname === 'api.llama.com') {
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
