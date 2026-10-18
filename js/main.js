// Inicialização, navegação entre telas e barra inferior.
import { keyOf, addMonths } from './analytics.js';
import { cloud, getState, init, subscribe } from './store.js';
import { closeAllSheets, html, icon } from './ui.js';
import { openPrintSheet } from './views/form.js';
import { openAddMenu } from './views/adicionar.js';
import { ingestExternalText, openNotificationsImport } from './views/importar.js';
import { openFileImport } from './views/arquivo.js';
import { isNativeApp, startNative } from './native.js';
import { setupLock } from './lock.js';
import inicio from './views/home.js';
import extrato from './views/extrato.js';
import relatorios from './views/relatorios.js';
import planejar from './views/planejar.js';
import dicas from './views/dicas.js';
import cofrinhos from './views/cofrinhos.js';
import dividas from './views/dividas.js';
import pix from './views/pix.js';
import orcamentos from './views/orcamentos.js';
import ajustes from './views/ajustes.js';

const VIEWS = Object.fromEntries([inicio, extrato, relatorios, planejar, dicas, cofrinhos, dividas, pix, orcamentos, ajustes].map((v) => [v.id, v]));
const TABS = [
  ['inicio', 'home', 'Início'],
  ['extrato', 'list', 'Extrato'],
  null,
  ['relatorios', 'chart', 'Relatórios'],
  ['planejar', 'target', 'Planejar'],
];
const TAB_OF = { dicas: 'planejar', cofrinhos: 'planejar', dividas: 'planejar', pix: 'planejar', orcamentos: 'planejar', ajustes: 'planejar' };

const ui = { route: 'inicio', month: keyOf(new Date()), filter: 'all', query: '' };
const viewEl = document.getElementById('view');
const navEl = document.getElementById('tabbar');

function routeFromHash() {
  const h = location.hash.replace('#', '');
  return VIEWS[h] ? h : 'inicio';
}

export function go(route, opts = {}) {
  if (!VIEWS[route]) return;
  closeAllSheets();
  const changed = route !== ui.route;
  ui.route = route;
  if (opts.filter) ui.filter = opts.filter;
  try {
    if (location.hash.slice(1) !== route) history.pushState(null, '', `#${route}`);
  } catch {
    /* alguns ambientes bloqueiam history */
  }
  render();
  if (changed) window.scrollTo({ top: 0 });
}

function applyTheme() {
  const t = getState().settings.theme;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function render({ keepFocus } = {}) {
  const state = getState();
  applyTheme();
  const view = VIEWS[ui.route];
  const ctx = { state, ui, go, rerender: render };
  const caret = keepFocus ? document.querySelector(keepFocus)?.selectionStart : null;
  const back = view.back ? html`<button type="button" class="back" data-go="${view.back}">${icon('chevL')} Voltar</button>` : '';
  // um contêiner novo a cada render: os listeners de bind() não se acumulam
  const page = document.createElement('div');
  page.className = 'page';
  page.dataset.view = view.id;
  page.innerHTML = String(back) + String(view.render(ctx));
  viewEl.replaceChildren(page);
  view.bind?.(page, ctx);
  if (keepFocus) {
    const el = page.querySelector(keepFocus);
    el?.focus();
    if (caret != null) el?.setSelectionRange(caret, caret);
  }
  const active = TAB_OF[ui.route] || ui.route;
  navEl.innerHTML = TABS.map((t) =>
    t
      ? `<button type="button" class="tab${t[0] === active ? ' on' : ''}" data-go="${t[0]}" ${t[0] === active ? 'aria-current="page"' : ''}>${icon(t[1])}<span>${t[2]}</span></button>`
      : `<button type="button" class="fab" data-new aria-label="Novo lançamento">${icon('plus')}</button>`,
  ).join('');
}

document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]');
  if (g) {
    e.preventDefault();
    return go(g.dataset.go, { filter: g.dataset.filter });
  }
  if (e.target.closest('[data-new]')) return openAddMenu();
  const m = e.target.closest('[data-month]');
  if (m) {
    ui.month = addMonths(ui.month, +m.dataset.month);
    render();
  }
});

window.addEventListener('popstate', () => {
  ui.route = routeFromHash();
  closeAllSheets();
  render();
});

init();
setupLock();
ui.route = routeFromHash();
subscribe(() => render());
cloud.onStatus = () => ui.route === 'ajustes' && render();
render();

// Entradas vindas de fora do app:
// - automação do Android (MacroDroid/Tasker) abre  .../?registrar=<texto da notificação>
// - menu "Compartilhar" do celular envia texto (GET ?text=) ou imagem (POST tratado pelo sw.js -> ?compartilhado=1)
async function handleIncoming() {
  let params;
  try {
    params = new URLSearchParams(location.search);
  } catch {
    return;
  }
  const text = [params.get('registrar'), params.get('title'), params.get('text')].filter(Boolean).join('\n').trim();
  const shared = params.has('compartilhado');
  if (!text && !shared) return;
  try {
    history.replaceState(null, '', location.pathname + location.hash);
  } catch {
    /* ignore */
  }
  if (text) return ingestExternalText(text);
  try {
    const cache = await caches.open('meubolso-share');
    const fileRes = await cache.match('share/file');
    const textRes = await cache.match('share/text');
    const sharedText = textRes ? await textRes.text() : '';
    const file = fileRes ? new File([await fileRes.blob()], decodeURIComponent(fileRes.headers.get('x-name') || 'arquivo'), { type: fileRes.headers.get('content-type') || '' }) : null;
    await cache.delete('share/file');
    await cache.delete('share/text');
    routeShared({ text: sharedText, files: file ? [file] : [] });
  } catch {
    openPrintSheet();
  }
}

/** Decide o destino do que chegou pelo Compartilhar (navegador ou app Android). */
function routeShared({ text, files }) {
  const images = files.filter((f) => f.type.startsWith('image/'));
  const docs = files.filter((f) => !f.type.startsWith('image/'));
  // prints vão para notificações (várias movimentações por imagem); PDF, CSV, OFX e planilhas para a importação de arquivos
  if (docs.length) openFileImport({ files: docs, mode: /fatura|invoice/i.test(docs[0].name) ? 'fatura' : 'extrato' });
  else if (images.length > 1) openFileImport({ files: images });
  else if (images.length) openNotificationsImport({ file: images[0] });
  else if (text) ingestExternalText(text);
  else openPrintSheet();
}
handleIncoming();

// App Android: notificações de bancos/carteiras e menu Compartilhar chegam pela ponte nativa
startNative({ onText: (text) => ingestExternalText(text, { silent: true }), onShared: routeShared });

// Instalação no celular (fora do Artifact e do app Android). Service worker só funciona em http(s) próprio.
if ('serviceWorker' in navigator && !window.claude && !isNativeApp && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
