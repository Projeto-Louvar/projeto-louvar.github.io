// Guarda só a "casca" do site. O áudio nunca é guardado aqui.
const CACHE = 'louvores-v2';
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/sample-audio/') || /\.(mp3|m4a|aac|ogg|opus|zip)$/i.test(url.pathname)) return;

  const guarda = (res) => caches.open(CACHE).then((c) => c.put(req, res)).catch(() => {});

  const networkFirst = req.mode === 'navigate' || url.pathname.endsWith('/catalog.json');
  if (networkFirst) {
    const doCache = () =>
      caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
    const rede = fetch(req).then((res) => {
      if (res.ok) event.waitUntil(guarda(res.clone()));
      return res;
    });
    // Se a rede demorar mais de ~4 s e houver cópia guardada, usa a cópia; senão continua esperando a rede.
    const limite = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
    event.respondWith(
      Promise.race([rede, limite])
        .then((res) => res || doCache().then((hit) => hit || rede))
        .catch(() => doCache().then((hit) => hit || rede)),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res.ok) event.waitUntil(guarda(res.clone()));
        return res;
      })),
  );
});
