// Cache simples para o app abrir sem internet depois da primeira visita.
const CACHE = 'meubolso-v1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icons/icon.svg', './css/app.css',
  './js/main.js', './js/store.js', './js/ui.js', './js/finance.js', './js/analytics.js', './js/insights.js',
  './js/parser.js', './js/categories.js', './js/receipt.js', './js/demo.js',
  './js/views/home.js', './js/views/extrato.js', './js/views/relatorios.js', './js/views/planejar.js', './js/views/dicas.js',
  './js/views/cofrinhos.js', './js/views/dividas.js', './js/views/pix.js', './js/views/orcamentos.js', './js/views/ajustes.js', './js/views/form.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Arquivos do app: rede primeiro (pega atualizações), cache se estiver offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
  );
});
