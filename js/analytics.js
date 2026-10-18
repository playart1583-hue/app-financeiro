// Agregações e projeções sobre o estado do app (puro, sem DOM).
import { interestOver, outstandingBalance, presentValue, rateFromInstallments, round2 } from './finance.js';
import { getCategory } from './categories.js';
import { pad, toISO } from './parser.js';

export const monthKey = (iso) => iso.slice(0, 7);
export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export function addMonths(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return keyOf(d);
}

export function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Data ISO somando meses, preservando o dia quando possível (31/01 + 1 mês = 28/02). */
export function addMonthsISO(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(y, m - 1 + delta + 1, 0).getDate();
  return toISO(new Date(y, m - 1 + delta, Math.min(d, last)));
}

export const txOfMonth = (state, key) => state.transactions.filter((t) => monthKey(t.date) === key);

// Categorias de contas que vencem uma vez por mês: não entram no "ritmo diário" de gastos.
const MONTHLY_BILLS = new Set(['moradia', 'contas', 'educacao', 'impostos', 'dividas', 'assinaturas']);

/** Gasto "variável": do dia a dia, não é parcela, conta fixa, recorrência ou pagamento de dívida. */
export const isVariable = (t) => t.type === 'expense' && !t.installment && !t.recurringId && !t.loanId && !MONTHLY_BILLS.has(t.category);
const isLooseBill = (t) => t.type === 'expense' && !t.installment && !t.recurringId && !t.loanId && MONTHLY_BILLS.has(t.category);

/**
 * Contas mensais que ainda devem aparecer no mês `key` (média dos 3 meses anteriores por categoria),
 * descontando o que já foi lançado e ignorando categorias que já têm lançamento recorrente no mês.
 */
export function pendingBills(state, key, avgKey = key) {
  const txs = txOfMonth(state, key);
  let total = 0;
  for (const cat of MONTHLY_BILLS) {
    if (txs.some((t) => t.category === cat && (t.recurringId || t.installment))) continue;
    const avg = averageOf(state, avgKey, 3, (m) => sum(m, (t) => isLooseBill(t) && t.category === cat));
    const done = sum(txs, (t) => isLooseBill(t) && t.category === cat);
    total += Math.max(0, avg - done);
  }
  return total;
}

export function monthSummary(state, key) {
  const txs = txOfMonth(state, key);
  let income = 0;
  let expense = 0;
  const cat = {};
  const cls = { essencial: 0, importante: 0, superfluo: 0 };
  const method = {};
  for (const t of txs) {
    if (t.type === 'income') income += t.amount;
    else {
      expense += t.amount;
      cat[t.category] = cat[t.category] || { id: t.category, total: 0, count: 0 };
      cat[t.category].total += t.amount;
      cat[t.category].count++;
      cls[t.classification || 'importante'] += t.amount;
      method[t.method] = (method[t.method] || 0) + t.amount;
    }
  }
  const byCategory = Object.values(cat).sort((a, b) => b.total - a.total);
  return {
    key,
    income: round2(income),
    expense: round2(expense),
    balance: round2(income - expense),
    savingsRate: income > 0 ? (income - expense) / income : 0,
    byCategory,
    byClass: cls,
    byMethod: method,
    count: txs.length,
    txs,
  };
}

/** Média mensal dos últimos n meses completos antes de `key`. */
export function averageOf(state, key, n, pick) {
  let sum = 0;
  let months = 0;
  for (let k = 1; k <= n; k++) {
    const mk = addMonths(key, -k);
    const txs = txOfMonth(state, mk);
    if (!txs.length) continue;
    sum += pick(txs);
    months++;
  }
  return months ? sum / months : 0;
}

const sum = (txs, f) => txs.filter(f).reduce((s, t) => s + t.amount, 0);

export function averages(state, key, n = 3) {
  return {
    // dinheiro de empréstimo não é renda: fica fora das médias e projeções
    income: averageOf(state, key, n, (txs) => sum(txs, (t) => t.type === 'income' && !t.loanId)),
    expense: averageOf(state, key, n, (txs) => sum(txs, (t) => t.type === 'expense')),
    variable: averageOf(state, key, n, (txs) => sum(txs, isVariable)),
    essencial: averageOf(state, key, n, (txs) => sum(txs, (t) => t.type === 'expense' && t.classification === 'essencial')),
  };
}

export function goalSaved(goal) {
  return round2(goal.history.reduce((s, h) => s + h.amount, 0));
}

export function currentBalance(state, today = new Date()) {
  const iso = toISO(today);
  let b = 0;
  for (const t of state.transactions) if (t.date <= iso) b += t.type === 'income' ? t.amount : -t.amount;
  const saved = state.goals.reduce((s, g) => s + goalSaved(g), 0);
  return { available: round2(b - saved), saved: round2(saved), total: round2(b) };
}

// ---------- Empréstimos e dívidas ----------

export function loanBalance(loan) {
  if (loan.mode === 'parcelado') return round2(outstandingBalance(loan.principal, loan.rate, loan.n, loan.paid));
  if (loan.mode === 'acordo') return loan.status === 'quitada' ? 0 : loan.balance;
  return Math.max(0, round2(loan.balance));
}

export const loanIsOpen = (loan) => loanBalance(loan) > 0.005;

/** Valor mensal comprometido com a dívida. */
export function loanMonthly(loan) {
  if (!loanIsOpen(loan)) return 0;
  if (loan.mode === 'parcelado') return loan.pmt;
  if (loan.mode === 'rotativo') return loan.minPayment || 0;
  return 0;
}

export function loanDueDates(loan) {
  if (loan.mode !== 'parcelado') return [];
  const out = [];
  for (let k = loan.paid; k < loan.n; k++) out.push({ k: k + 1, date: addMonthsISO(loan.firstDue, k), amount: loan.pmt });
  return out;
}

/**
 * Tudo que cobra juros e pode ser encerrado antes: Pix parcelado e cartão parcelado com juros,
 * empréstimos parcelados e rotativo. Quitar antes dá direito a desconto proporcional dos juros (CDC, art. 52).
 * Ordenado do mais caro para o mais barato; parcelamentos sem juros vão para o fim (não vale antecipar).
 */
export function interestCommitments(state, today = new Date()) {
  const iso = toISO(today);
  const out = [];
  const groups = new Map();
  for (const t of state.transactions) {
    if (t.type !== 'expense' || !t.installment?.groupId) continue;
    if (!groups.has(t.installment.groupId)) groups.set(t.installment.groupId, []);
    groups.get(t.installment.groupId).push(t);
  }
  for (const [id, list] of groups) {
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = list[0];
    const future = list.filter((t) => t.date > iso);
    if (!future.length || !first.installment.cash) continue;
    const { n, cash } = first.installment;
    const pmt = first.amount;
    const rate = rateFromInstallments(cash, pmt, n);
    const remainingTotal = future.reduce((s, t) => s + t.amount, 0);
    const payoffToday = rate > 0 ? presentValue(pmt, rate, future.length) : remainingTotal;
    out.push({
      id,
      source: 'parcelamento',
      kind: first.method === 'pix_parcelado' ? 'pix_parcelado' : first.method === 'credito' ? 'cartao_parcelado' : 'parcelamento',
      name: first.description,
      rate,
      pmt,
      remaining: future.length,
      n,
      remainingTotal: round2(remainingTotal),
      payoffToday: round2(payoffToday),
      savings: round2(remainingTotal - payoffToday),
      interestFree: rate < 0.0005,
      endDate: future[future.length - 1].date,
    });
  }
  for (const l of state.loans.filter(loanIsOpen)) {
    if (l.mode === 'parcelado') {
      const remaining = l.n - l.paid;
      const payoffToday = loanBalance(l);
      const due = loanDueDates(l);
      out.push({ id: l.id, source: 'loan', kind: l.kind, name: l.name, rate: l.rate, pmt: l.pmt, remaining, n: l.n, remainingTotal: round2(l.pmt * remaining), payoffToday, savings: round2(l.pmt * remaining - payoffToday), interestFree: l.rate < 0.0005, endDate: due[due.length - 1]?.date || '' });
    } else if (l.mode === 'rotativo') {
      const sim = interestOver(l.balance, l.rate, l.minPayment, 120);
      out.push({ id: l.id, source: 'loan', kind: l.kind, name: l.name, rate: l.rate, pmt: l.minPayment, remaining: null, n: null, remainingTotal: round2(l.balance + sim.interest), payoffToday: l.balance, savings: sim.interest, interestFree: false, endDate: '', neverEnds: sim.left > 0 });
    }
  }
  return out.sort((a, b) => a.interestFree - b.interestFree || b.rate - a.rate);
}

/** Converte dívidas abertas (inclusive parcelamentos com juros) para o simulador de quitação. */
export function debtsForPlan(state, today = new Date()) {
  const loans = state.loans.filter(loanIsOpen).map((l) => {
    if (l.mode === 'acordo') return { id: l.id, name: l.name, kind: 'acordo', balance: l.offer || l.balance, original: l.balance };
    return { id: l.id, name: l.name, kind: 'juros', balance: loanBalance(l), rate: l.rate || 0, minPayment: loanMonthly(l) };
  });
  const parcelamentos = interestCommitments(state, today)
    .filter((c) => c.source === 'parcelamento' && !c.interestFree)
    .map((c) => ({ id: c.id, name: c.name, kind: 'juros', balance: c.payoffToday, rate: c.rate, minPayment: c.pmt }));
  return [...loans, ...parcelamentos];
}

// ---------- Projeções ----------

/** Projeção do mês corrente no ritmo atual. */
export function projectMonth(state, today = new Date()) {
  const key = keyOf(today);
  const iso = toISO(today);
  const txs = txOfMonth(state, key);
  const dim = daysInMonth(key);
  const day = today.getDate();
  const spent = sum(txs, (t) => t.type === 'expense' && t.date <= iso);
  const scheduled = sum(txs, (t) => t.type === 'expense' && t.date > iso);
  const variableSoFar = sum(txs, (t) => isVariable(t) && t.date <= iso);
  const avg = averages(state, key);
  // mistura o ritmo do mês com a média histórica: no começo do mês a média pesa mais
  const w = Math.min(1, day / dim + 0.15);
  const dailyNow = variableSoFar / day;
  const dailyHist = avg.variable / dim;
  const daily = avg.variable ? dailyNow * w + dailyHist * (1 - w) : dailyNow;
  const loanDue = state.loans.reduce((s, l) => {
    if (l.mode === 'parcelado') return s + loanDueDates(l).filter((d) => monthKey(d.date) === key && d.date > iso).reduce((a, d) => a + d.amount, 0);
    return s;
  }, 0);
  const bills = pendingBills(state, key);
  const projected = spent + scheduled + loanDue + bills + daily * (dim - day);
  const incomeIn = sum(txs, (t) => t.type === 'income' && !t.loanId);
  const income = Math.max(incomeIn, txs.some((t) => t.type === 'income' && !t.loanId) ? incomeIn : avg.income);
  return {
    key,
    spent: round2(spent),
    scheduled: round2(scheduled + loanDue + bills),
    projected: round2(projected),
    income: round2(income),
    dailyAvg: round2(daily),
    daysLeft: dim - day,
    endDate: `${key}-${pad(dim)}`,
    // quanto ainda dá para gastar por dia sem ficar no vermelho
    perDayBudget: dim - day > 0 ? round2(Math.max(0, income - spent - scheduled - loanDue - bills) / (dim - day)) : 0,
  };
}

/** Próximos n meses: compromissos já assumidos + estimativa de gastos variáveis. */
export function projectNextMonths(state, today = new Date(), n = 6) {
  const base = keyOf(today);
  const avg = averages(state, base);
  const out = [];
  for (let k = 1; k <= n; k++) {
    const key = addMonths(base, k);
    const txs = txOfMonth(state, key);
    const committedTx = sum(txs, (t) => t.type === 'expense');
    const loans = state.loans.reduce((s, l) => {
      if (l.mode === 'parcelado') return s + loanDueDates(l).filter((d) => monthKey(d.date) === key).reduce((a, d) => a + d.amount, 0);
      if (l.mode === 'rotativo' && loanIsOpen(l)) return s + (l.minPayment || 0);
      return s;
    }, 0);
    const incomeTx = sum(txs, (t) => t.type === 'income' && !t.loanId);
    // renda fixa lançada (salário recorrente) ou a média, o que for maior: a média inclui rendas extras
    const income = Math.max(incomeTx, avg.income);
    const committed = committedTx + loans;
    const variable = avg.variable + pendingBills(state, key, base);
    out.push({
      key,
      committed: round2(committed),
      installments: round2(sum(txs, (t) => t.type === 'expense' && t.installment) + loans),
      variable: round2(variable),
      total: round2(committed + variable),
      income: round2(income),
      balance: round2(income - committed - variable),
    });
  }
  return out;
}

export function categoryName(id) {
  return getCategory(id).name;
}
