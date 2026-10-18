// Cache simples para o app abrir sem internet depois da primeira visita.
const CACHE = 'meubolso-v4';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icons/icon.svg', './css/app.css',
  './js/main.js', './js/store.js', './js/ui.js', './js/finance.js', './js/analytics.js', './js/insights.js',
  './js/parser.js', './js/categories.js', './js/receipt.js', './js/demo.js', './js/impact.js',
  './js/views/reader.js', './js/views/emprestimo.js', './js/views/importar.js', './js/views/arquivo.js', './js/views/adicionar.js', './js/importers.js', './js/documents.js', './js/native.js', './js/lock.js',
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
// Menu "Compartilhar" do celular: guarda o texto/imagem recebidos e abre o app para importar.
async function receiveShare(request) {
  const form = await request.formData();
  const cache = await caches.open('meubolso-share');
  const text = [form.get('title'), form.get('text'), form.get('url')].filter(Boolean).join('\n');
  if (text) await cache.put('share/text', new Response(text));
  const file = form.getAll('files').find((f) => f && f.size);
  if (file) await cache.put('share/file', new Response(file, { headers: { 'content-type': file.type || 'application/octet-stream', 'x-name': encodeURIComponent(file.name || 'arquivo') } }));
  return Response.redirect('./?compartilhado=1', 303);
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/compartilhar')) {
    e.respondWith(receiveShare(e.request));
    return;
  }
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
