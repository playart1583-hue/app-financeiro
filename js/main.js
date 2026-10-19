// Inicialização, navegação entre telas e barra inferior.
import { keyOf, addMonths } from './analytics.js';
import { activeProfile, cloud, getState, init, subscribe, switchProfile, updateSettings } from './store.js';
import { closeAllSheets, closeTopSheet, html, icon, toast } from './ui.js';
import { alignCreditToDue, undoAlign } from './cards.js';
import { openPrintSheet } from './views/form.js';
import { openAddMenu } from './views/adicionar.js';
import { openFileImport, openTextImport } from './views/arquivo.js';
import { isNativeApp, startNative } from './native.js';
import { setupLock } from './lock.js';
import { openProfiles, profileChip } from './views/perfis.js';
import { bellButton, openAlerts } from './views/avisos.js';
import { askNotificationPermission, onReminderTap, remindersAvailable, rescheduleSoon, scheduleReminders } from './reminders.js';
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
// telas abertas dentro do app desde que ele abriu: o voltar do Android percorre só estas
let depth = 0;
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
    if (opts.replace) history.replaceState(null, '', `#${route}`);
    else if (location.hash.slice(1) !== route) history.pushState(null, '', `#${route}`), depth++;
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
  // Ajustes sempre à mão, no canto de cima de toda tela (o Início já tem o seu no cabeçalho verde)
  // perfil aberto e Ajustes sempre à mão, no canto de cima de toda tela (o Início tem os seus no cabeçalho verde)
  const gear =
    view.id === 'inicio'
      ? ''
      : html`<div class="page-gear">${bellButton()}${profileChip(false, true)}${view.id === 'ajustes' ? '' : html`<button type="button" class="icon-btn" data-go="ajustes" aria-label="Ajustes">${icon('gear')}</button>`}</div>`;
  // um contêiner novo a cada render: os listeners de bind() não se acumulam
  const page = document.createElement('div');
  page.className = 'page';
  page.dataset.view = view.id;
  page.innerHTML = String(gear) + String(back) + String(view.render(ctx));
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
  if (e.target.closest('[data-profiles]')) return openProfiles();
  if (e.target.closest('[data-alerts]')) return openAlerts(go);
  const m = e.target.closest('[data-month]');
  if (m) {
    ui.month = addMonths(ui.month, +m.dataset.month);
    render();
  }
});

window.addEventListener('popstate', () => {
  depth = Math.max(0, depth - 1);
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
// compras no crédito que ficaram na data da compra vão para o mês em que a fatura vence
announceAligned(alignCreditToDue());

// Lembretes de vencimentos (app Android): pede a permissão uma vez, agenda e reagenda quando algo muda
if (remindersAvailable()) {
  (async () => {
    if (!getState().settings.remindersAsked) {
      updateSettings({ remindersAsked: true });
      await askNotificationPermission();
    }
    scheduleReminders();
  })();
  subscribe(() => rescheduleSoon());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && rescheduleSoon());
  // tocar no aviso abre o perfil e a tela do vencimento
  onReminderTap(({ profile, route }) => {
    if (profile && profile !== activeProfile().id) switchProfile(profile);
    if (route) go(route);
  });
}

export function announceAligned(moved) {
  if (!moved.length) return;
  toast(`${moved.length} lançamento${moved.length > 1 ? 's' : ''} no crédito ${moved.length > 1 ? 'foram' : 'foi'} para o mês em que a fatura vence`, { action: 'Desfazer', onAction: () => undoAlign(moved), timeout: 10000 });
}

// Entrada vinda de fora do app: menu "Compartilhar" do celular envia texto (GET ?text=) ou imagem (POST tratado pelo sw.js -> ?compartilhado=1).
// Nada é registrado sozinho: tudo abre para você conferir antes de salvar.
async function handleIncoming() {
  let params;
  try {
    params = new URLSearchParams(location.search);
  } catch {
    return;
  }
  const text = [params.get('title'), params.get('text')].filter(Boolean).join('\n').trim();
  const shared = params.has('compartilhado');
  if (!text && !shared) return;
  try {
    history.replaceState(null, '', location.pathname + location.hash);
  } catch {
    /* ignore */
  }
  if (text) return openTextImport({ text });
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
  // um print vai para a leitura de compra; vários prints, PDF, CSV, OFX e planilhas (juntos) para a importação de arquivos
  if (docs.length) openFileImport({ files, mode: /fatura|invoice/i.test(docs[0].name) ? 'fatura' : 'extrato' });
  else if (images.length > 1) openFileImport({ files: images });
  else if (images.length) openPrintSheet({ file: images[0] });
  else if (text) openTextImport({ text });
  else openPrintSheet();
}
handleIncoming();

// Botão voltar do Android (chamado pelo MainActivity): fecha a folha aberta, volta para a tela anterior do app
// e, no Início, fica no app. Para sair, use o botão de início ou o de apps recentes do celular.
window.meuBolsoVoltar = () => {
  if (document.querySelector('.lock')) return 'bloqueado';
  if (closeTopSheet()) return 'folha';
  if (depth > 0) return history.back(), 'voltou';
  if (ui.route !== 'inicio') return go(VIEWS[ui.route].back || 'inicio', { replace: true }), 'subiu';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return 'inicio';
};

// App Android: o menu Compartilhar chega pela ponte nativa
startNative({ onShared: routeShared });

// Instalação no celular (fora do Artifact e do app Android). Service worker só funciona em http(s) próprio.
if ('serviceWorker' in navigator && !window.claude && !isNativeApp && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
