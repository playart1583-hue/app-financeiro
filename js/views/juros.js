// Tela Juros e taxas: quanto do que você pagou foi juro, taxa, tarifa ou multa, em cada operação.
// Os valores continuam inteiros nas suas contas; aqui fica só a parte que dava para economizar.
import { keyOf, monthSummary } from '../analytics.js';
import { INTEREST_KINDS, interestByMonth, interestOfMonth, interestOperations } from '../interest.js';
import { toISO } from '../parser.js';
import { columns, dateBR, emptyState, hbars, html, money, monthName, pct } from '../ui.js';
import { monthNav } from './extrato.js';
import { openTxForm } from './form.js';

export default {
  id: 'juros',
  title: 'Juros e taxas',
  back: 'planejar',
  render({ state, ui }) {
    const key = ui.month;
    const m = interestOfMonth(state, key);
    // gastos do mês, contando as parcelas de empréstimo ainda a pagar que entram na conta dos juros
    const expense = monthSummary(state, key).expense + m.items.filter((i) => i.scheduled).reduce((s, i) => s + i.t.amount, 0);
    const history = interestByMonth(state, key, 6);
    const year = key.slice(0, 4);
    const yearTotal = state.transactions.length ? interestByMonth(state, `${year}-12`, 12).filter((x) => x.key <= key).reduce((s, x) => s + x.total, 0) : 0;
    const ops = interestOperations(state, toISO(new Date()));
    const avoidable = m.byKind.filter((k) => k.kind !== 'emprestimo').reduce((s, k) => s + k.total, 0);

    return html`
      <header class="page-head"><h1>Juros e taxas</h1><p>Quanto do que você pagou foi juro, taxa, tarifa ou multa. O valor inteiro continua nas suas contas; aqui fica só essa parte.</p></header>
      ${monthNav(key)}
      <div class="summary3">
        <div><small>Juros e taxas no mês</small><b class="expense">${money(m.total)}</b></div>
        <div><small>Dos gastos do mês</small><b>${expense > 0 ? pct(m.total / expense) : '—'}</b></div>
        <div><small>Em ${year} até ${monthName(key, true).slice(0, 3)}</small><b>${money(yearTotal)}</b></div>
      </div>

      ${m.total > 0
        ? html`<section class="card save-card"><h2 class="card-title">Quanto daria para economizar</h2>
            <p>Se essas operações fossem feitas sem juros nem taxa, você teria gasto <b>${money(m.total)}</b> a menos em ${monthName(key).toLowerCase()}${avoidable < m.total && avoidable > 0 ? html`. Desse total, <b>${money(avoidable)}</b> eram evitáveis (o resto já estava no contrato de empréstimo)` : ''}.</p>
            <ul class="save-tips">${m.byKind.map((k) => html`<li><span aria-hidden="true">${INTEREST_KINDS[k.kind].icon}</span><span><b>${INTEREST_KINDS[k.kind].label}: ${money(k.total)}</b><small>${INTEREST_KINDS[k.kind].tip}</small></span></li>`)}</ul>
          </section>
          <section class="card"><h2 class="card-title">Por tipo</h2>
            ${hbars(m.byKind.map((k) => ({ label: INTEREST_KINDS[k.kind].label, icon: INTEREST_KINDS[k.kind].icon, value: k.total, sub: `${k.count} ${k.count > 1 ? 'operações' : 'operação'}` })))}
          </section>
          <section class="card"><h2 class="card-title">Operação por operação</h2>
            <ul class="fee-list">${m.items.map(
              (i) => html`<li><button type="button" class="fee-row" ${i.t.id ? html`data-tx="${i.t.id}"` : html`data-go="dividas"`}>
                <span class="tx-main"><b>${i.t.description || INTEREST_KINDS[i.kind].label}</b><small>${dateBR(i.t.date).slice(0, 5)} · ${INTEREST_KINDS[i.kind].label}${i.t.installment ? ` · parcela ${i.t.installment.i}/${i.t.installment.n}` : ''}${i.scheduled ? ' · a pagar' : ''}</small>
                  <small class="fee-math">${i.base > 0.005
                    ? html`${money(i.t.amount)} ${i.scheduled ? 'a pagar' : 'pagos'} = ${money(i.base)} ${i.kind === 'emprestimo' ? 'do valor recebido' : 'sem juros'} + <b>${money(i.amount)} de ${i.kind === 'taxa' ? 'taxa' : 'juros'}</b>${i.kind === 'emprestimo' ? ' (média do contrato)' : ''}`
                    : html`<b>${money(i.amount)}</b>, todo o valor é ${i.kind === 'taxa' ? 'taxa ou tarifa' : 'juros ou encargo'}`}</small></span>
                <span class="tx-val expense">${money(i.amount)}</span>
              </button></li>`,
            )}</ul>
          </section>`
        : html`<section class="card">${emptyState('Nenhum juro ou taxa neste mês', 'Quando um comprovante mostrar taxa, tarifa, juros ou multa, ou você parcelar com juros, a parte de juros aparece aqui. No lançamento, o campo "Juros e taxas incluídos" também conta.')}</section>`}

      ${history.some((h) => h.total > 0)
        ? html`<section class="card"><h2 class="card-title">Últimos 6 meses</h2>
            ${columns(history.map((h) => ({ label: monthName(h.key), short: monthName(h.key, true).slice(0, 3), abbr: monthName(h.key, true), a: h.total })), { aName: 'Juros e taxas' })}
          </section>`
        : ''}

      ${ops.length
        ? html`<section class="card"><h2 class="card-title">Parcelados e empréstimos com juros</h2>
            <p class="hint">A operação inteira: quanto custaria à vista (ou quanto você recebeu), quanto paga no total e quanto disso é juro.</p>
            <ul class="fee-list">${ops.map(
              (o) => html`<li><button type="button" class="fee-row" ${o.txId ? html`data-tx="${o.txId}"` : html`data-go="dividas"`}>
                <span class="tx-main"><b>${o.name}</b><small>${INTEREST_KINDS[o.kind].label} · ${o.n}x de ${money(o.pmt)} · ${o.open ? `${o.paid} de ${o.n} pagas` : 'encerrado'}</small>
                  <small class="fee-math">${money(o.total)} no total = ${money(o.base)} ${o.kind === 'emprestimo' ? 'recebidos' : 'à vista'} + <b>${money(o.interest)} de juros</b> (${pct(o.interest / o.base)} a mais)</small></span>
                <span class="tx-val expense">${money(o.interest)}</span>
              </button></li>`,
            )}</ul>
          </section>`
        : ''}`;
  },
  bind(root) {
    root.addEventListener('click', (e) => {
      const id = e.target.closest('[data-tx]')?.dataset.tx;
      if (id) openTxForm({ editId: id });
    });
  },
};

/** Total de juros e taxas do mês atual (para os atalhos no Início e em Relatórios). */
export const monthInterest = (state, key = keyOf(new Date())) => interestOfMonth(state, key).total;
