// Cartões que você usa: final, banco e dia de vencimento da fatura. O app aprende quando você lança uma
// compra parcelada com vencimento, e nas próximas (à mão, por print ou arquivo) já preenche sozinho.
import { addMonthsISO } from './analytics.js';
import { commit, getState, updateSettings } from './store.js';

const cards = () => getState().settings.cards || {};

/** "Nubank · Visa · final 8238" -> { last4: '8238', bank: 'Nubank · Visa' } */
export function splitCard(label) {
  const s = String(label || '');
  const m = s.match(/(?:final|cart[aã]o:?)\s*(\d{4})\b/i) || s.match(/^\s*(\d{4})\s*$/);
  const bank = s.replace(/(?:·\s*)?(?:final|cart[aã]o:?)\s*\d{4}\b/i, '').replace(/^\s*\d{4}\s*$/, '').replace(/\s*·\s*$/, '').trim();
  return { last4: m ? m[1] : '', bank };
}

/** Rótulo guardado no lançamento: "Nubank · final 8238". */
export const cardText = (last4, bank) => [bank, last4 ? `final ${last4}` : ''].filter(Boolean).join(' · ');

/** Finais já usados (cadastro + lançamentos), para sugerir no campo. */
export function knownLast4() {
  const set = new Set(Object.keys(cards()));
  for (const t of getState().transactions) {
    const l = t.last4 || splitCard(t.card).last4;
    if (l) set.add(l);
  }
  return [...set].slice(0, 12);
}

/**
 * Final de cartão já conhecido que aparece no texto de um print ou arquivo (número de 4 dígitos solto,
 * que não faz parte de valor, data ou horário). Serve quando o texto não diz "final".
 */
export function findKnownLast4(text) {
  const t = String(text || '');
  if (!t) return '';
  return knownLast4().find((l) => new RegExp(`(?<![\\d.,/:])${l}(?![\\d.,/:])`).test(t)) || '';
}

export const cardInfo = (last4) => (last4 ? cards()[last4] || null : null);

/** Guarda banco e dia de vencimento do cartão (só o que veio preenchido). */
export function rememberCard(last4, { bank, due, dueDay, closeDay } = {}) {
  if (!/^\d{4}$/.test(last4 || '')) return;
  const old = cards()[last4] || {};
  const day = due ? +due.slice(8, 10) : +dueDay || null;
  const next = { ...old, ...(bank ? { bank } : {}), ...(day >= 1 && day <= 31 ? { dueDay: day } : {}), ...(+closeDay >= 1 && +closeDay <= 31 ? { closeDay: +closeDay } : {}) };
  if (JSON.stringify(old) !== JSON.stringify(next)) updateSettings({ cards: { ...cards(), [last4]: next } });
}

// dia `day` do mês de `iso` (dia 31 vira o último dia em meses mais curtos)
const onDay = (iso, day) => {
  const last = new Date(+iso.slice(0, 4), +iso.slice(5, 7), 0).getDate();
  return `${iso.slice(0, 8)}${String(Math.min(day, last)).padStart(2, '0')}`;
};
const monthStart = (iso, k) => addMonthsISO(`${iso.slice(0, 7)}-01`, k);

/**
 * Vencimento da fatura em que cai uma compra feita em `purchaseISO`.
 * Com o dia de fechamento: compra antes do fechamento entra na fatura que está aberta; no dia do
 * fechamento ou depois, vai para a fatura seguinte. Sem ele, usa o primeiro vencimento a pelo menos
 * 10 dias da compra (a fatura costuma fechar uns 7 a 10 dias antes de vencer).
 */
export function nextDue(purchaseISO, dueDay, closeDay = null) {
  if (!purchaseISO || !dueDay) return '';
  if (closeDay) {
    let close = '';
    for (let k = 0; k < 3 && !close; k++) {
      const c = onDay(monthStart(purchaseISO, k), closeDay);
      if (c > purchaseISO) close = c;
    }
    for (let k = 0; k < 3; k++) {
      const d = onDay(monthStart(close, k), dueDay);
      if (d > close) return d;
    }
  }
  for (let k = 0; k < 3; k++) {
    const due = onDay(monthStart(purchaseISO, k), dueDay);
    if ((new Date(due) - new Date(purchaseISO)) / 86400000 >= 10) return due;
  }
  return '';
}

/** Vencimento da 1ª parcela pelo cartão cadastrado (fechamento + vencimento), ou '' se não souber. */
export const dueFor = (purchaseISO, info) => (info?.dueDay ? nextDue(purchaseISO, info.dueDay, info.closeDay) : '');

/** "fecha dia 28 · vence dia 5" */
export const cycleText = (info) => [info?.closeDay ? `fecha dia ${info.closeDay}` : '', info?.dueDay ? `vence dia ${info.dueDay}` : ''].filter(Boolean).join(' · ');

/** Cadastro em Ajustes → Meus cartões. */
const day = (v) => (+v >= 1 ? Math.min(31, Math.floor(+v)) : null);

export function saveCard(last4, { bank = '', dueDay = null, closeDay = null } = {}) {
  if (!/^\d{4}$/.test(last4 || '')) return false;
  updateSettings({ cards: { ...cards(), [last4]: { bank: bank.trim(), ...(day(dueDay) ? { dueDay: day(dueDay) } : {}), ...(day(closeDay) ? { closeDay: day(closeDay) } : {}) } } });
  return true;
}

export function removeCard(last4) {
  const next = { ...cards() };
  delete next[last4];
  updateSettings({ cards: next });
}

export const cardList = () => Object.entries(cards()).map(([last4, c]) => ({ last4, ...c }));

/**
 * Compras no crédito (e Pix parcelado, que vem na fatura) já lançadas na data da compra, ou com o vencimento
 * só estimado: passam para o mês em que a fatura vence, pelo fechamento e vencimento do cartão. Parcelas: a
 * k-ésima vence k-1 meses depois da primeira. Retorna o que mudou, para poder desfazer.
 */
export function alignCreditToDue() {
  const moved = [];
  const groups = new Map();
  for (const t of getState().transactions) {
    if (t.type !== 'expense' || !['credito', 'pix_parcelado'].includes(t.method) || (t.purchaseDate && !t.dueGuess) || t.internal) continue;
    const info = cardInfo(t.last4 || splitCard(t.card).last4);
    if (!info?.dueDay) continue;
    if (t.installment?.groupId) (groups.get(t.installment.groupId) || groups.set(t.installment.groupId, []).get(t.installment.groupId)).push([t, info]);
    else {
      const purchase = t.dueGuess ? t.purchaseDate : t.date;
      const due = dueFor(purchase, info);
      if (due && (due !== t.date || t.dueGuess)) moved.push({ id: t.id, from: t.date, to: due, purchase, guess: t.dueGuess });
    }
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a[0].installment.i - b[0].installment.i);
    const [first, info] = list[0];
    // a parcela de menor número ficou na data da compra (à mão: a 1ª; fatura: a parcela daquele mês)
    const purchase = first.dueGuess ? first.purchaseDate : first.date;
    const due1 = dueFor(purchase, info);
    if (!due1) continue;
    for (const [t] of list) {
      const to = addMonthsISO(due1, t.installment.i - 1);
      if (to !== t.date || t.dueGuess) moved.push({ id: t.id, from: t.date, to, purchase, guess: t.dueGuess });
    }
  }
  if (!moved.length) return [];
  const byId = new Map(moved.map((m) => [m.id, m]));
  commit((s) => {
    for (const t of s.transactions) {
      const m = byId.get(t.id);
      if (m) {
        Object.assign(t, { date: m.to, purchaseDate: m.purchase });
        delete t.dueGuess;
      }
    }
  });
  return moved.filter((m) => m.to !== m.from);
}

/** Desfaz o alinhamento acima. */
export function undoAlign(moved) {
  const byId = new Map(moved.map((m) => [m.id, m]));
  commit((s) => {
    for (const t of s.transactions) {
      const m = byId.get(t.id);
      if (!m) continue;
      t.date = m.from;
      if (m.guess) Object.assign(t, { purchaseDate: m.purchase, dueGuess: true });
      else delete t.purchaseDate;
    }
  });
}
