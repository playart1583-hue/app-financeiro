// Utilitários de interface: templates, formatação, folhas (bottom sheets), avisos, ícones e gráficos.
import { getState } from './store.js';

class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}
export const raw = (s) => new Raw(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const renderVal = (v) => (v == null || v === false ? '' : Array.isArray(v) ? v.map(renderVal).join('') : v instanceof Raw ? v.s : esc(v));
export const html = (strings, ...vals) => raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? renderVal(vals[i]) : ''), ''));

// ---------- Formatação ----------
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (v) => BRL.format(Number.isFinite(v) ? v : 0);
export function money(v, { sign = false, force = false } = {}) {
  if (!force && getState().settings.hideValues) return 'R$ ••••';
  const s = brl(Math.abs(v));
  if (!sign) return v < 0 ? `-${s}` : s;
  return v < 0 ? `- ${s}` : `+ ${s}`;
}
export const pct = (v, d = 0) => `${(v * 100).toFixed(d).replace('.', ',')}%`;
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthName = (key, short = false) => {
  const [y, m] = key.split('-').map(Number);
  const n = MONTHS[m - 1];
  return short ? `${n.slice(0, 3)}/${String(y).slice(2)}` : `${n[0].toUpperCase()}${n.slice(1)} ${y}`;
};
export const dateBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const WEEK = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export function dayLabel(iso, todayISO) {
  const d = new Date(iso + 'T12:00:00');
  const t = new Date(todayISO + 'T12:00:00');
  const diff = Math.round((t - d) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff === -1) return 'Amanhã';
  return `${WEEK[d.getDay()]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`.replace(/^./, (c) => c.toUpperCase());
}

/** Lê um campo de dinheiro digitado em formato brasileiro. */
export function readMoney(v) {
  const s = String(v || '').replace(/[^\d,.-]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return parseFloat(s);
}
export const moneyInput = (v) => (v || v === 0 ? Number(v).toFixed(2).replace('.', ',') : '');

// ---------- Ícones (traço 2px, 24x24) ----------
const P = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>',
  chevR: '<path d="M9 18l6-6-6-6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  piggy: '<path d="M5 11a7 6 0 0 1 12-3h2l-1 3 2 1v3l-2 1-1 3h-3v-2h-4v2H6l-1-4a5 5 0 0 1 0-4z"/><circle cx="15" cy="11" r=".6"/><path d="M2 9c0 1.5 1 2 3 2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  pix: '<path d="M12 3l9 9-9 9-9-9z"/><path d="M8 12h8"/>',
  bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
};
export const icon = (name, cls = '') => raw(`<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`);

// ---------- Avisos ----------
export function toast(message, { action, onAction, timeout = 4500 } = {}) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" class="toast-btn">${esc(action)}</button>` : ''}`;
  host.append(el);
  const close = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector('.toast-btn')?.addEventListener('click', () => {
    onAction?.();
    close();
  });
  setTimeout(close, timeout);
}

// ---------- Folhas (bottom sheets) ----------
const sheets = [];
export function openSheet({ title, body, onMount, wide = false }) {
  const host = document.getElementById('sheets');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop" data-close></div>
    <section class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Fechar">${icon('close')}</button></header>
      <div class="sheet-body"></div>
    </section>`;
  const bodyEl = wrap.querySelector('.sheet-body');
  bodyEl.innerHTML = String(body);
  host.append(wrap);
  document.body.classList.add('has-sheet');
  const api = {
    el: wrap,
    body: bodyEl,
    close() {
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 180);
      sheets.splice(sheets.indexOf(api), 1);
      if (!sheets.length) document.body.classList.remove('has-sheet');
    },
    setBody(content) {
      bodyEl.innerHTML = String(content);
    },
  };
  sheets.push(api);
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) api.close();
  });
  requestAnimationFrame(() => wrap.querySelector('input:not([type=hidden]):not([readonly]),select,textarea,button:not([data-close])')?.focus({ preventScroll: true }));
  onMount?.(api);
  return api;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheets.length) sheets[sheets.length - 1].close();
});
export const closeAllSheets = () => [...sheets].forEach((s) => s.close());
/** Fecha só a folha de cima (botão voltar do Android). Retorna se havia alguma aberta. */
export const closeTopSheet = () => (sheets.length ? (sheets[sheets.length - 1].close(), true) : false);

// ---------- Dicas flutuantes dos gráficos ----------
let tipEl = null;
function showTip(target) {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.append(tipEl);
  }
  tipEl.innerHTML = target.dataset.tip;
  tipEl.hidden = false;
  const r = target.getBoundingClientRect();
  const w = tipEl.offsetWidth;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const top = r.top - tipEl.offsetHeight - 8;
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${top < 8 ? r.bottom + 8 : top}px`;
}
const hideTip = () => tipEl && (tipEl.hidden = true);
document.addEventListener('pointerover', (e) => {
  const t = e.target.closest?.('[data-tip]');
  if (t) showTip(t);
});
document.addEventListener('pointerout', (e) => e.target.closest?.('[data-tip]') && hideTip());
document.addEventListener('focusin', (e) => (e.target.closest?.('[data-tip]') ? showTip(e.target.closest('[data-tip]')) : hideTip()));
document.addEventListener('scroll', hideTip, true);

// ---------- Gráficos ----------

/** Barras horizontais (uma série): ranking de categorias. items: [{label, icon, value, sub}] */
export function hbars(items, { max } = {}) {
  const top = max || Math.max(...items.map((i) => i.value), 1);
  return html`<ul class="hbars">${items.map(
    (i) => html`<li>
      <div class="hbar-head"><span class="hbar-label">${i.icon ? html`<span class="cat-dot" aria-hidden="true">${i.icon}</span>` : ''}${i.label}</span><span class="hbar-val">${money(i.value)}${i.sub ? html` <small>${i.sub}</small>` : ''}</span></div>
      <div class="hbar-track"><div class="hbar-fill${i.over ? ' over' : ''}" style="width:${Math.max(1.5, (i.value / top) * 100).toFixed(1)}%" tabindex="0" data-tip="${`<b>${esc(i.label)}</b><br>${money(i.value)}${i.sub ? ` · ${esc(i.sub)}` : ''}`}"></div>${i.limit ? html`<span class="hbar-limit" style="left:${Math.min(100, (i.limit / top) * 100).toFixed(1)}%" title="Limite"></span>` : ''}</div>
    </li>`,
  )}</ul>`;
}

/** Barra empilhada única com rótulos diretos. parts: [{label, value, cls}] */
export function stackBar(parts, total) {
  const t = total || parts.reduce((s, p) => s + p.value, 0) || 1;
  return html`<div class="stack" role="img" aria-label="${parts.map((p) => `${p.label} ${pct(p.value / t)}`).join(', ')}">
      ${parts.filter((p) => p.value > 0).map((p) => html`<span class="stack-seg ${p.cls}" style="flex-basis:${((p.value / t) * 100).toFixed(2)}%" tabindex="0" data-tip="${`<b>${esc(p.label)}</b><br>${money(p.value)} · ${pct(p.value / t)}`}"></span>`)}
    </div>
    <ul class="legend">${parts.map((p) => html`<li><span class="swatch ${p.cls}"></span>${p.label} <b>${pct(p.value / t)}</b>${p.ref ? html` <small>ideal ${p.ref}</small>` : ''}</li>`)}</ul>`;
}

/**
 * Colunas agrupadas por mês (até 2 séries) com escala única e eixo com 3 marcas.
 * months: [{label, a, b, aLabel, bLabel, marker}] - `marker` desenha um traço de referência (renda).
 */
export function columns(months, { aName, bName, stacked = false, markerName } = {}) {
  const W = 340;
  const H = 168;
  const padL = 44;
  const padB = 22;
  const padT = 10;
  const vmax = Math.max(1, ...months.map((m) => (stacked ? m.a + m.b : Math.max(m.a, m.b || 0))), ...months.map((m) => m.marker || 0));
  const step = niceStep(vmax / 3);
  const top = Math.ceil(vmax / step) * step;
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const slot = (W - padL) / months.length;
  const bw = stacked || bName == null ? Math.min(26, slot * 0.5) : Math.min(14, slot * 0.3);
  const ticks = [];
  for (let v = 0; v <= top + 0.001; v += step) ticks.push(v);
  const k = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0).replace('.', ',')} mil` : `${Math.round(v)}`);
  const bar = (x, y0, y1, cls, tip, roundTop = true) => {
    const h = Math.max(0, y0 - y1);
    if (h < 0.5) return '';
    const r = roundTop ? Math.min(4, bw / 2, h) : 0;
    const d = `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0} Z`;
    return `<path class="col ${cls}" d="${d}" tabindex="0" data-tip="${esc(tip)}"></path>`;
  };
  let marks = '';
  months.forEach((m, i) => {
    const cx = padL + slot * i + slot / 2;
    if (stacked) {
      const x = cx - bw / 2;
      marks += bar(x, y(0), y(m.a) + (m.b > 0 ? 1 : 0), 's1', `<b>${m.label}</b><br>${aName}: ${money(m.a)}<br>${bName}: ${money(m.b)}`, !(m.b > 0));
      if (m.b > 0) marks += bar(x, y(m.a) - 1, y(m.a + m.b), 's2', `<b>${m.label}</b><br>${aName}: ${money(m.a)}<br>${bName}: ${money(m.b)}`);
    } else if (bName == null) {
      marks += bar(cx - bw / 2, y(0), y(m.a), 's1', `<b>${m.label}</b><br>${aName}: ${money(m.a)}`);
    } else {
      const tip = `<b>${m.label}</b><br>${aName}: ${money(m.a)}<br>${bName}: ${money(m.b)}<br>Saldo: ${money(m.a - m.b)}`;
      marks += bar(cx - bw - 1, y(0), y(m.a), 's1', tip);
      marks += bar(cx + 1, y(0), y(m.b), 's2', tip);
    }
    if (m.marker) marks += `<line class="marker" x1="${cx - slot * 0.36}" x2="${cx + slot * 0.36}" y1="${y(m.marker)}" y2="${y(m.marker)}"><title>${markerName}: ${esc(money(m.marker))}</title></line>`;
    marks += `<text class="ax" x="${cx}" y="${H - 6}" text-anchor="middle">${esc(m.short || m.label)}</text>`;
  });
  const grid = ticks.map((v) => `<line class="grid${v === 0 ? ' base' : ''}" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"></line><text class="ax" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${k(v)}</text>`).join('');
  const legend = [
    html`<li><span class="swatch s1"></span>${aName}</li>`,
    bName != null ? html`<li><span class="swatch s2"></span>${bName}</li>` : '',
    markerName ? html`<li><span class="swatch marker-sw"></span>${markerName}</li>` : '',
  ];
  return html`<figure class="cols"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${aName}${bName ? ` e ${bName}` : ''} por mês">${raw(grid)}${raw(marks)}</svg><ul class="legend">${legend}</ul></figure>`;
}

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export function progress(value, max, { cls = '' } = {}) {
  const p = max > 0 ? Math.min(1, value / max) : 0;
  return html`<div class="progress ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}"><span style="width:${(p * 100).toFixed(1)}%"></span></div>`;
}

export function emptyState(title, text, actionHTML = '') {
  return html`<div class="empty"><p class="empty-title">${title}</p><p>${text}</p>${raw(String(actionHTML))}</div>`;
}
