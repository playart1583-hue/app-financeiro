import { averageOf, keyOf, monthSummary } from '../analytics.js';
import { EXPENSE_CATEGORIES } from '../categories.js';
import { setBudget } from '../store.js';
import { html, money, moneyInput, pct, progress, readMoney, toast } from '../ui.js';
import { monthNav } from './extrato.js';

export default {
  id: 'orcamentos',
  title: 'Orçamentos',
  back: 'planejar',
  render({ state, ui }) {
    const key = ui.month;
    const sum = monthSummary(state, key);
    const now = keyOf(new Date());
    const rows = EXPENSE_CATEGORIES.map((c) => {
      const spent = sum.byCategory.find((x) => x.id === c.id)?.total || 0;
      const avg = averageOf(state, now, 3, (txs) => txs.filter((t) => t.type === 'expense' && t.category === c.id).reduce((s, t) => s + t.amount, 0));
      return { c, spent, avg, limit: state.budgets[c.id] || 0 };
    }).sort((a, b) => (b.limit > 0) - (a.limit > 0) || b.spent - a.spent || b.avg - a.avg);
    const totalLimit = rows.reduce((s, r) => s + r.limit, 0);
    return html`<header class="page-head"><h1>Orçamentos</h1><p>Defina um limite mensal por categoria. Você recebe alerta ao chegar em 80%.</p></header>
      ${monthNav(key)}
      ${totalLimit ? html`<div class="summary3 two"><div><small>Planejado</small><b>${money(totalLimit)}</b></div><div><small>Gasto nas categorias planejadas</small><b>${money(rows.filter((r) => r.limit).reduce((s, r) => s + r.spent, 0))}</b></div></div>` : ''}
      <form id="bf" class="budgets">
        ${rows.map(
          (r) => html`<div class="card budget ${r.limit && r.spent > r.limit ? 'over' : ''}">
            <div class="row-between"><span class="hbar-label"><span class="cat-dot" aria-hidden="true">${r.c.icon}</span>${r.c.name}</span>
              <label class="budget-input"><span class="sr-only">Limite para ${r.c.name}</span><span>R$</span><input name="${r.c.id}" inputmode="decimal" placeholder="${r.avg ? moneyInput(Math.round(r.avg / 10) * 10) : 'sem limite'}" value="${r.limit ? moneyInput(r.limit) : ''}"></label></div>
            ${r.limit ? html`${progress(r.spent, r.limit, { cls: r.spent > r.limit ? 'over' : r.spent > r.limit * 0.8 ? 'warn' : '' })}<div class="row-between"><small>${money(r.spent)} gastos · ${pct(r.spent / r.limit)}</small><small>${r.spent > r.limit ? `${money(r.spent - r.limit)} acima` : `restam ${money(r.limit - r.spent)}`}</small></div>` : html`<small class="muted">${r.spent ? `${money(r.spent)} neste mês · ` : ''}${r.avg ? `média de ${money(r.avg)}/mês` : 'sem gastos recentes'}</small>`}
          </div>`,
        )}
      </form>`;
  },
  bind(root) {
    root.querySelector('#bf').addEventListener('change', (e) => {
      const v = readMoney(e.target.value);
      setBudget(e.target.name, v > 0 ? v : 0);
      toast(v > 0 ? `Limite salvo: ${money(v, { force: true })}` : 'Limite removido');
    });
  },
};
