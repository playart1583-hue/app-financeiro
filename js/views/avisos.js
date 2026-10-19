// Central de avisos (sininho): o que vence nos próximos dias e os conselhos do app — o que pagar primeiro,
// o que cortar. O número no sininho mostra o que você ainda não viu.
import { buildInsights } from '../insights.js';
import { toISO } from '../parser.js';
import { upcomingPayments } from '../reminders.js';
import { getState, updateSettings } from '../store.js';
import { dateBR, html, icon, money, openSheet } from '../ui.js';

// conselhos de "pagar primeiro" vêm antes dos de "cortar"
const PAY_FIRST = ['serasa', 'encerrar-antes', 'divida-cara', 'parcelados-juros', 'parcelas', 'plano'];
const CUT = ['proj-negativo', 'pequenos', 'orc-', 'alta-', '50-30-20-superfluo', 'arredonda', 'reserva', 'reserva-baixa', '50-30-20-essencial'];
const rank = (id) => {
  const p = PAY_FIRST.findIndex((k) => id.startsWith(k));
  if (p >= 0) return p;
  const c = CUT.findIndex((k) => id.startsWith(k));
  return c >= 0 ? 10 + c : 30;
};

/** Conselhos do perfil, do mais importante para o menos: primeiro o que pagar, depois o que cortar. */
export function advice(state, today = new Date()) {
  return buildInsights(state, today)
    .filter((i) => i.level !== 'ok')
    .map((i) => ({ ...i, group: rank(i.id) < 10 ? 'pagar' : 'cortar' }))
    .sort((a, b) => rank(a.id) - rank(b.id));
}

/** Tudo o que aparece no sininho: vencimentos dos próximos 7 dias e conselhos. */
export function alerts(state, today = new Date()) {
  const todayISO = toISO(today);
  const dues = upcomingPayments(state, today, 7).map((it) => ({
    id: `v|${it.title}|${it.date}`,
    kind: 'vencimento',
    level: it.date === todayISO ? 'alerta' : 'atencao',
    title: `${it.date === todayISO ? 'Vence hoje' : `Vence ${dateBR(it.date).slice(0, 5)}`}: ${it.title}`,
    text: `${money(it.amount, { force: true })}${it.count > 1 ? ` · ${it.count} compras` : ''}`,
    action: { label: 'Ver', route: it.kind === 'emprestimo' ? 'dividas' : 'extrato' },
  }));
  const tips = advice(state, today).map((i) => ({ ...i, id: `i|${i.id}|${i.title}`, kind: i.group }));
  return [...dues, ...tips];
}

export const unseenCount = (state = getState()) => {
  const seen = new Set(state.settings.seenAlerts || []);
  return alerts(state).filter((a) => !seen.has(a.id)).length;
};

/** Sininho com o número de avisos novos. */
export function bellButton(onBrand = false) {
  const n = unseenCount();
  return html`<button type="button" class="icon-btn bell ${onBrand ? 'on-brand' : ''}" data-alerts aria-label="Avisos${n ? `: ${n} novo${n > 1 ? 's' : ''}` : ''}">${icon('bell')}${n ? html`<span class="badge">${n > 9 ? '9+' : n}</span>` : ''}</button>`;
}

export function openAlerts(go) {
  const state = getState();
  const list = alerts(state);
  const seen = new Set(state.settings.seenAlerts || []);
  const block = (title, items, empty) =>
    html`<h3 class="section-title">${title}</h3>${items.length
      ? html`<ul class="alert-list">${items.map(
          (a) => html`<li class="alert ${a.level} ${seen.has(a.id) ? '' : 'new'}"><button type="button" data-route="${a.action?.route || ''}">
            <span class="alert-ic" aria-hidden="true">${icon(a.kind === 'vencimento' ? 'clock' : a.kind === 'pagar' ? 'alert' : 'bulb')}</span>
            <span class="tx-main"><b>${a.title}</b><small>${a.text}</small></span>${a.action ? icon('chevR', 'muted') : ''}</button></li>`,
        )}</ul>`
      : html`<p class="hint">${empty}</p>`}`;
  openSheet({
    title: 'Avisos',
    body: html`<div class="alerts">
      ${block('Vencimentos dos próximos 7 dias', list.filter((a) => a.kind === 'vencimento'), 'Nada vencendo nos próximos 7 dias.')}
      ${block('O que pagar primeiro', list.filter((a) => a.kind === 'pagar'), 'Nenhuma dívida cara ou negativada para priorizar.')}
      ${block('Onde cortar e ajustar', list.filter((a) => a.kind === 'cortar'), 'Seus gastos estão dentro do esperado.')}
      <p class="hint">Os mesmos avisos chegam como notificação no celular (Ajustes → Lembretes).</p>
    </div>`,
    onMount(sheet) {
      // abriu: tudo o que está aqui conta como visto
      updateSettings({ seenAlerts: list.map((a) => a.id).slice(-200) });
      sheet.body.addEventListener('click', (e) => {
        const r = e.target.closest('[data-route]')?.dataset.route;
        if (r) {
          sheet.close();
          go(r);
        }
      });
    },
  });
}
