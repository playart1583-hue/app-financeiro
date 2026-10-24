// Juros e taxas: quanto de cada operação foi juro, taxa, tarifa ou multa. O valor inteiro continua nas suas
// contas (gastos, saldo, relatórios); aqui aparece só essa parte, para ver quanto dava para economizar.
// Nada é suposto: a taxa vem do comprovante (ou você escreve), e nos parcelados sai do preço à vista × parcelas.
import { addMonths, loanDueDates, monthKey } from './analytics.js';
import { normalize } from './categories.js';

const round2 = (v) => Math.round(v * 100) / 100;

export const INTEREST_KINDS = {
  taxa: { label: 'Taxas e tarifas', icon: '🧾', tip: 'Taxa de transação, tarifa e IOF. Pagando pelo app do próprio banco ou por Pix sem taxa, não são cobradas.' },
  juros: { label: 'Juros, multas e encargos', icon: '⏰', tip: 'Atraso, rotativo e encargos da fatura. Conta e fatura pagas inteiras até o vencimento não têm.' },
  pix_parcelado: { label: 'Pix parcelado', icon: '💠', tip: 'Pagando à vista (ou juntando antes e pagando de uma vez), não teria esses juros.' },
  parcelado: { label: 'Compras parceladas com juros', icon: '💳', tip: 'À vista ou em parcelas sem juros, não teria esses juros.' },
  emprestimo: { label: 'Empréstimos e financiamentos', icon: '🏦', tip: 'Os juros já estão no contrato. Antes de contratar outro, compare o total a pagar com o valor que você recebe.' },
};

// lançamento que é inteiro encargo (linha de fatura "IOF", "Juros rotativo", "Anuidade", "Multa por atraso")
const ENCARGO = /\b(juros|iof|multa|encargos?|mora|rotativo|anuidade|tarifa)\b/;

/** Parte de um gasto que foi juro ou taxa: { amount, kind } ou null. */
export function interestOf(t, loans = []) {
  if (t.type !== 'expense' || t.internal || !(t.amount > 0)) return null;
  if (t.fee > 0) return { amount: round2(Math.min(t.fee, t.amount)), kind: t.feeKind === 'juros' ? 'juros' : 'taxa' };
  // parcela de compra com juros: o que passa do preço à vista dividido pelas parcelas
  if (t.installment?.cash > 0 && t.installment.n > 0) {
    const extra = t.amount - t.installment.cash / t.installment.n;
    return extra > 0.005 ? { amount: round2(extra), kind: t.method === 'pix_parcelado' ? 'pix_parcelado' : 'parcelado' } : null;
  }
  // parcela de empréstimo: a parte de juros pela média do contrato (total das parcelas menos o que você recebeu)
  if (t.loanId) {
    const l = loans.find((x) => x.id === t.loanId);
    if (!l || l.mode !== 'parcelado' || !(l.pmt > 0) || /^Amortiza/.test(t.description || '')) return null;
    const total = l.pmt * l.n;
    const share = (total - (l.released || l.principal)) / total;
    return share > 0.0005 ? { amount: round2(t.amount * share), kind: 'emprestimo' } : null;
  }
  const d = normalize(t.description || '');
  if (ENCARGO.test(d) && !/sem juros/.test(d)) return { amount: t.amount, kind: /tarifa|anuidade|iof/.test(d) ? 'taxa' : 'juros' };
  return null;
}

/** Operações com juros ou taxa num mês (pela data em que você paga). */
export function interestOfMonth(state, key) {
  const items = [];
  for (const t of state.transactions) {
    if (monthKey(t.date) !== key) continue;
    const i = interestOf(t, state.loans);
    if (i) items.push({ t, ...i, base: round2(t.amount - i.amount) });
  }
  // parcelas de empréstimo que ainda vão vencer neste mês (as pagas já viraram lançamento acima)
  for (const l of state.loans || []) {
    if (l.status === 'quitada') continue;
    for (const d of loanDueDates(l)) {
      if (monthKey(d.date) !== key) continue;
      const t = { id: '', type: 'expense', amount: d.amount, description: `${l.name} (parcela ${d.k}/${l.n})`, date: d.date, loanId: l.id };
      const i = interestOf(t, state.loans);
      if (i) items.push({ t, ...i, base: round2(t.amount - i.amount), scheduled: true });
    }
  }
  items.sort((a, b) => (b.t.date + (b.t.time || '')).localeCompare(a.t.date + (a.t.time || '')));
  const total = round2(items.reduce((s, i) => s + i.amount, 0));
  const byKind = Object.keys(INTEREST_KINDS)
    .map((kind) => ({ kind, total: round2(items.filter((i) => i.kind === kind).reduce((s, i) => s + i.amount, 0)), count: items.filter((i) => i.kind === kind).length }))
    .filter((k) => k.total > 0)
    .sort((a, b) => b.total - a.total);
  const paid = round2(items.reduce((s, i) => s + i.t.amount, 0));
  return { items, total, byKind, paid };
}

/** Juros e taxas mês a mês (`n` meses terminando em `key`). */
export function interestByMonth(state, key, n = 6) {
  return Array.from({ length: n }, (_, k) => {
    const m = addMonths(key, k - n + 1);
    return { key: m, total: interestOfMonth(state, m).total };
  });
}

/**
 * Cada compra parcelada com juros e cada empréstimo, inteiros: quanto custa à vista (ou quanto você recebeu),
 * quanto paga no total e quanto disso é juro. `today` separa o que já foi pago do que falta.
 */
export function interestOperations(state, todayISO) {
  const out = [];
  const groups = new Map();
  for (const t of state.transactions) {
    if (t.type !== 'expense' || t.internal || !t.installment?.groupId || !(t.installment.cash > 0)) continue;
    (groups.get(t.installment.groupId) || groups.set(t.installment.groupId, []).get(t.installment.groupId)).push(t);
  }
  for (const list of groups.values()) {
    const { n, cash } = list[0].installment;
    const pmt = list[0].amount;
    const total = pmt * n;
    if (total - cash < 0.01 * n) continue; // sem juros
    const paid = list.filter((t) => t.date <= todayISO).length;
    out.push({ id: list[0].installment.groupId, txId: list[0].id, name: list[0].description, kind: list[0].method === 'pix_parcelado' ? 'pix_parcelado' : 'parcelado', base: round2(cash), total: round2(total), interest: round2(total - cash), n, pmt, paid, open: paid < n });
  }
  for (const l of state.loans || []) {
    if (l.mode !== 'parcelado' || !(l.pmt > 0)) continue;
    const base = l.released || l.principal;
    const total = l.pmt * l.n;
    if (total - base < 0.01) continue;
    out.push({ id: l.id, loanId: l.id, name: l.name, kind: 'emprestimo', base: round2(base), total: round2(total), interest: round2(total - base), n: l.n, pmt: l.pmt, paid: l.paid, open: l.paid < l.n && l.status !== 'quitada' });
  }
  return out.sort((a, b) => b.open - a.open || b.interest - a.interest);
}
