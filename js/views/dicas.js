import { buildInsights } from '../insights.js';
import { emptyState, html, icon } from '../ui.js';

const LEVEL = {
  alerta: { icon: 'alert', label: 'Alerta' },
  atencao: { icon: 'info', label: 'Atenção' },
  dica: { icon: 'bulb', label: 'Dica' },
  ok: { icon: 'check', label: 'Tudo certo' },
};

export function insightCard(i) {
  const l = LEVEL[i.level];
  return html`<article class="insight ${i.level}">
    <span class="insight-ic" aria-hidden="true">${icon(l.icon)}</span>
    <div><p class="insight-title"><span class="sr-only">${l.label}: </span>${i.title}</p><p>${i.text}</p>${i.action ? html`<button type="button" class="link" data-go="${i.action.route}">${i.action.label} ${icon('chevR')}</button>` : ''}</div>
  </article>`;
}

export default {
  id: 'dicas',
  title: 'Dicas',
  back: 'planejar',
  render({ state }) {
    const list = buildInsights(state);
    return html`<header class="page-head"><h1>Dicas para economizar</h1><p>Geradas a partir dos seus lançamentos, dívidas e cofrinhos. Atualizam sozinhas.</p></header>
      ${list.length ? html`<div class="insights">${list.map(insightCard)}</div>` : emptyState('Ainda sem dicas', 'Registre alguns gastos e ganhos para receber sugestões.')}`;
  },
};
