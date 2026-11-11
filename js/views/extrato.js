import { monthKey, monthSummary } from '../analytics.js';
import { PAYMENT_METHODS, getCategory, normalize } from '../categories.js';
import { toISO } from '../parser.js';
import { dayLabel, emptyState, html, icon, money, monthName } from '../ui.js';
import { cardInfo, splitCard } from '../cards.js';
import { openTxForm } from './form.js';
import { openFileImport } from './arquivo.js';

const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** `inCard`: linha dentro da fatura do cartão (mostra a data da compra, sem horário). */
export function txRow(t, compact = false, { inCard = false } = {}) {
  const c = getCategory(t.category);
  const sign = t.type === 'income' ? 1 : -1;
  if (t.internal) {
    return html`<li><button type="button" class="tx" data-tx="${t.id}">
    <span class="tx-ic" aria-hidden="true">↔️</span>
    <span class="tx-main"><b>${t.description || 'Transferência entre suas contas'}</b><small>Entre suas contas · não conta como gasto nem ganho${t.time ? ` · ${t.time}` : ''}</small></span>
    <span class="tx-val neutral">${money(t.amount)}</span>
  </button></li>`;
  }
  const meta = [
    // na fatura vale o dia da compra, não o horário
    inCard ? `compra ${ddmm(t.purchaseDate || t.date)}` : t.time,
    PAYMENT_METHODS[t.method],
    // no crédito o lançamento fica no mês do vencimento; mostra quando a compra foi feita
    !inCard && t.purchaseDate ? `compra ${ddmm(t.purchaseDate)}` : null,
    t.installment ? `${t.installment.i}/${t.installment.n}` : null,
    t.recurringId ? 'fixo' : null,
    t.fee > 0 ? `${money(t.fee)} de ${t.feeKind === 'juros' ? 'juros' : 'taxa'}` : null,
    compact ? dayLabel(t.date, toISO(new Date())) : null,
  ].filter(Boolean);
  return html`<li><button type="button" class="tx" data-tx="${t.id}">
    <span class="tx-ic" aria-hidden="true">${c.icon}</span>
    <span class="tx-main"><b>${t.description || c.name}</b><small>${inCard ? `${meta.join(' · ')} · ${c.name}` : `${c.name}${meta.length ? ` · ${meta.join(' · ')}` : ''}`}${t.source === 'print' ? ' · 📷' : ''}</small></span>
    <span class="tx-val ${t.type}">${money(sign * t.amount, { sign: true })}</span>
  </button></li>`;
}

export function monthNav(key) {
  return html`<div class="month-nav"><button type="button" class="icon-btn" data-month="-1" aria-label="Mês anterior">${icon('chevL')}</button><b>${monthName(key)}</b><button type="button" class="icon-btn" data-month="1" aria-label="Próximo mês">${icon('chevR')}</button></div>`;
}

export default {
  id: 'extrato',
  title: 'Extrato',
  render({ state, ui }) {
    const sum = monthSummary(state, ui.month);
    const f = ui.filter || 'all';
    const q = normalize(ui.query || '');
    // a lista mostra também as transferências entre contas suas, que ficam fora dos totais
    const txs = state.transactions
      .filter((t) => monthKey(t.date) === ui.month)
      .filter((t) => (f === 'all' ? true : !t.internal && t.type === f))
      .filter((t) => !q || normalize(`${t.description} ${getCategory(t.category).name} ${t.merchant} ${t.card}`).includes(q))
      .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
    // compras no cartão: uma fatura por cartão e vencimento, separadas pelo dia da compra. Um parcelado é do cartão
    // se qualquer parcela tiver o final (parcelas antigas podem ter ficado sem)
    const finalOf = new Map();
    for (const t of state.transactions) {
      const l = t.last4 || splitCard(t.card).last4;
      if (l && t.installment?.groupId) finalOf.set(t.installment.groupId, l);
    }
    const cardOf = (t) => (t.type === 'expense' && !t.internal && ['credito', 'pix_parcelado'].includes(t.method) ? t.last4 || splitCard(t.card).last4 || finalOf.get(t.installment?.groupId) || '' : '');
    const invoices = new Map();
    const days = new Map();
    for (const t of txs) {
      const l = cardOf(t);
      if (l) {
        const k = `${t.date}|${l}`;
        (invoices.get(k) || invoices.set(k, { due: t.date, last4: l, list: [] }).get(k)).list.push(t);
      } else (days.get(t.date) || days.set(t.date, []).get(t.date)).push(t);
    }
    const todayISO = toISO(new Date());
    const byPurchase = (list) => {
      const m = new Map();
      for (const t of [...list].sort((a, b) => (b.purchaseDate || b.date).localeCompare(a.purchaseDate || a.date))) {
        const d = t.purchaseDate || t.date;
        (m.get(d) || m.set(d, []).get(d)).push(t);
      }
      return [...m.entries()];
    };
    const invoiceBlock = ({ due, last4, list }) => {
      const total = list.reduce((s, t) => s + t.amount, 0);
      const bank = cardInfo(last4)?.bank || splitCard(list.find((t) => t.card)?.card).bank || '';
      return html`<details class="fatura card" open>
        <summary><span class="tile-ic">${icon('card')}</span><span class="tx-main"><b>${bank ? `${bank} · ` : ''}final ${last4}</b><small>Fatura ${due > todayISO ? 'vence' : 'venceu'} ${ddmm(due)} · ${list.length} compra${list.length > 1 ? 's' : ''}</small></span><b class="tx-val expense">${money(-total, { sign: true })}</b>${icon('chevR', 'chev')}</summary>
        ${byPurchase(list).map(
          ([d, items]) => html`<section class="day"><div class="day-head"><span>${dayLabel(d, todayISO)}${items.length > 1 ? ` · ${items.length} compras` : ''}</span><span>${money(-items.reduce((s, t) => s + t.amount, 0), { sign: true })}</span></div><ul class="tx-list flat">${items.map((t) => txRow(t, false, { inCard: true }))}</ul></section>`,
        )}
      </details>`;
    };
    return html`
      <header class="page-head"><h1>Extrato</h1>
        <div class="head-actions"><button type="button" class="btn sm" data-import="extrato">${icon('upload')} Importar arquivo</button><button type="button" class="btn sm" data-import="fatura">${icon('card')} Importar fatura</button></div>
      </header>
      ${monthNav(ui.month)}
      <div class="summary3">
        <div><small>Receitas</small><b class="income">${money(sum.income)}</b></div>
        <div><small>Despesas</small><b class="expense">${money(sum.expense)}</b></div>
        <div><small>Saldo</small><b>${money(sum.balance)}</b></div>
      </div>
      <div class="toolbar">
        <label class="search">${icon('search')}<span class="sr-only">Buscar</span><input id="ex-q" type="search" placeholder="Buscar descrição, loja, cartão" value="${ui.query || ''}"></label>
        <div class="seg sm" role="radiogroup" aria-label="Filtro">
          ${[['all', 'Todos'], ['expense', 'Gastos'], ['income', 'Ganhos']].map(([k, l]) => html`<label><input type="radio" name="ex-f" value="${k}" ${f === k ? 'checked' : ''}><span>${l}</span></label>`)}
        </div>
      </div>
      ${[...invoices.values()].sort((a, b) => b.due.localeCompare(a.due) || a.last4.localeCompare(b.last4)).map(invoiceBlock)}
      ${txs.length
        ? [...days.entries()].map(([d, list]) => {
            const total = list.reduce((s, t) => s + (t.internal ? 0 : t.type === 'income' ? t.amount : -t.amount), 0);
            return html`<section class="day"><div class="day-head"><span>${dayLabel(d, todayISO)}${d > todayISO ? ' · previsto' : ''}</span><span>${money(total, { sign: true })}</span></div><ul class="tx-list card flat">${list.map((t) => txRow(t))}</ul></section>`;
          })
        : emptyState(q ? 'Nada encontrado' : 'Sem lançamentos neste mês', q ? 'Tente outra palavra.' : 'Toque no + para registrar um gasto ou ganho.')}
    `;
  },
  bind(root, { ui, rerender }) {
    const q = root.querySelector('#ex-q');
    q.addEventListener('input', () => {
      ui.query = q.value;
      rerender({ keepFocus: '#ex-q' });
    });
    root.addEventListener('click', (e) => {
      const m = e.target.closest('[data-import]')?.dataset.import;
      if (m) openFileImport({ mode: m });
    });
    root.addEventListener('change', (e) => {
      if (e.target.name === 'ex-f') {
        ui.filter = e.target.value;
        rerender();
      }
    });
  },
};

// clique em qualquer lançamento abre a edição
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-tx]');
  if (b) openTxForm({ editId: b.dataset.tx });
});
