import { addMonths, keyOf, monthSummary, projectMonth, projectNextMonths } from '../analytics.js';
import { PAYMENT_METHODS, getCategory } from '../categories.js';
import { columns, emptyState, hbars, html, money, monthName, pct, stackBar } from '../ui.js';
import { monthNav } from './extrato.js';

export default {
  id: 'relatorios',
  title: 'Relatórios',
  render({ state, ui }) {
    const key = ui.month;
    const sum = monthSummary(state, key);
    const isCurrent = key === keyOf(new Date());
    const proj = isCurrent ? projectMonth(state) : null;
    const months = [-5, -4, -3, -2, -1, 0].map((d) => {
      const k = addMonths(key, d);
      const s = monthSummary(state, k);
      return { label: monthName(k), short: monthName(k, true).slice(0, 3), abbr: monthName(k, true), a: s.income, b: s.expense };
    });
    const next = projectNextMonths(state, new Date(), 6);
    const top = [...sum.txs].filter((t) => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5);
    const base = sum.income || sum.expense;
    const methods = Object.entries(sum.byMethod).sort((a, b) => b[1] - a[1]);

    return html`
      <header class="page-head"><h1>Relatórios</h1></header>
      ${monthNav(key)}
      <div class="summary3">
        <div><small>Receitas</small><b class="income">${money(sum.income)}</b></div>
        <div><small>Despesas</small><b class="expense">${money(sum.expense)}</b></div>
        <div><small>Sobrou</small><b>${sum.income > 0 ? pct(Math.max(0, sum.savingsRate)) : '—'}</b></div>
      </div>

      ${proj
        ? html`<section class="card"><h2 class="card-title">Projeção até o fim do mês</h2>
            <dl class="kv">
              <div><dt>Gasto até hoje</dt><dd>${money(proj.spent)}</dd></div>
              <div><dt>Já agendado (parcelas, contas fixas, dívidas)</dt><dd>${money(proj.scheduled)}</dd></div>
              <div><dt>Média por dia (variáveis)</dt><dd>${money(proj.dailyAvg)}</dd></div>
              <div class="strong"><dt>Gasto previsto no mês</dt><dd>${money(proj.projected)}</dd></div>
              <div><dt>Renda prevista</dt><dd>${money(proj.income)}</dd></div>
              <div class="strong"><dt>Deve sobrar</dt><dd class="${proj.income - proj.projected < 0 ? 'expense' : 'income'}">${money(proj.income - proj.projected)}</dd></div>
            </dl></section>`
        : ''}

      <section class="card"><h2 class="card-title">Gastos por categoria</h2>
        ${sum.byCategory.length
          ? hbars(
              sum.byCategory.map((c) => {
                const limit = state.budgets[c.id];
                return { label: getCategory(c.id).name, icon: getCategory(c.id).icon, value: c.total, sub: pct(c.total / sum.expense), note: limit ? `Limite ${money(limit)}${c.total > limit ? ` · passou ${money(c.total - limit)}` : ''}` : '', limit, over: limit && c.total > limit };
              }),
            )
          : emptyState('Sem gastos neste mês', 'Os gastos aparecem aqui separados por categoria.')}
      </section>

      <section class="card"><h2 class="card-title">Classificação dos gastos</h2>
        ${sum.expense > 0
          ? html`${stackBar(
              [
                { label: 'Essencial', value: sum.byClass.essencial, cls: 's1', ref: '50%' },
                { label: 'Importante', value: sum.byClass.importante, cls: 's2' },
                { label: 'Supérfluo', value: sum.byClass.superfluo, cls: 's3', ref: '30%' },
              ],
              sum.expense,
            )}
            <p class="hint">Regra 50/30/20: até 50% da renda no essencial, até 30% em desejos e pelo menos 20% guardado. ${base ? html`Neste mês: essencial ${pct(sum.byClass.essencial / base)} da renda, supérfluo ${pct(sum.byClass.superfluo / base)}, guardado ${pct(Math.max(0, sum.savingsRate))}.` : ''}</p>`
          : emptyState('Sem gastos', 'Classifique cada gasto como essencial, importante ou supérfluo.')}
      </section>

      <section class="card"><h2 class="card-title">Receitas e despesas, últimos 6 meses</h2>
        ${columns(months, { aName: 'Receitas', bName: 'Despesas' })}
        <details class="more"><summary>Ver tabela</summary>
          <div class="table-wrap"><table><thead><tr><th>Mês</th><th>Receitas (R$)</th><th>Despesas (R$)</th><th>Saldo (R$)</th></tr></thead>
          <tbody>${months.map((m) => html`<tr><td>${m.abbr}</td><td>${money(m.a, { bare: true })}</td><td>${money(m.b, { bare: true })}</td><td class="${m.a - m.b < 0 ? 'expense' : ''}">${money(m.a - m.b, { bare: true })}</td></tr>`)}</tbody></table></div>
        </details>
      </section>

      <section class="card"><h2 class="card-title">Projeção dos próximos 6 meses</h2>
        <p class="hint">Compromissos já assumidos (parcelas, contas fixas, dívidas) mais a média dos seus gastos do dia a dia e contas dos últimos 3 meses.</p>
        ${columns(
          next.map((m) => ({ label: monthName(m.key), short: monthName(m.key, true).slice(0, 3), a: m.committed, b: m.variable, marker: m.income })),
          { aName: 'Compromissos', bName: 'Dia a dia e contas (estimado)', stacked: true, markerName: 'Renda prevista' },
        )}
        <div class="table-wrap"><table><thead><tr><th>Mês</th><th>Compromissos (R$)</th><th>Previsto (R$)</th><th>Sobra (R$)</th></tr></thead>
          <tbody>${next.map((m) => html`<tr><td>${monthName(m.key, true)}</td><td>${money(m.committed, { bare: true })}</td><td>${money(m.total, { bare: true })}</td><td class="${m.balance < 0 ? 'expense' : 'income'}">${money(m.balance, { bare: true })}</td></tr>`)}</tbody></table></div>
      </section>

      ${top.length
        ? html`<section class="card"><h2 class="card-title">Maiores gastos do mês</h2>
            <ol class="rank">${top.map((t) => html`<li><button type="button" class="tx" data-tx="${t.id}"><span class="tx-ic" aria-hidden="true">${getCategory(t.category).icon}</span><span class="tx-main"><b>${t.description}</b><small>${t.date.slice(8)}/${t.date.slice(5, 7)}${t.merchant ? ` · ${t.merchant}` : ''}</small></span><span class="tx-val expense">${money(t.amount)}</span></button></li>`)}</ol>
          </section>`
        : ''}

      ${methods.length
        ? html`<section class="card"><h2 class="card-title">Por forma de pagamento</h2>
            ${hbars(methods.map(([k, v]) => ({ label: PAYMENT_METHODS[k] || k, value: v, sub: pct(v / sum.expense) })))}
          </section>`
        : ''}
    `;
  },
};
