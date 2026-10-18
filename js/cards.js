// Cartões que você usa: final, banco e dia de vencimento da fatura. O app aprende quando você lança uma
// compra parcelada com vencimento, e nas próximas (à mão, por print ou arquivo) já preenche sozinho.
import { addMonthsISO } from './analytics.js';
import { getState, updateSettings } from './store.js';

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

export const cardInfo = (last4) => (last4 ? cards()[last4] || null : null);

/** Guarda banco e dia de vencimento do cartão (só o que veio preenchido). */
export function rememberCard(last4, { bank, due, dueDay } = {}) {
  if (!/^\d{4}$/.test(last4 || '')) return;
  const old = cards()[last4] || {};
  const day = due ? +due.slice(8, 10) : +dueDay || null;
  const next = { ...old, ...(bank ? { bank } : {}), ...(day >= 1 && day <= 31 ? { dueDay: day } : {}) };
  if (JSON.stringify(old) !== JSON.stringify(next)) updateSettings({ cards: { ...cards(), [last4]: next } });
}

/**
 * Próximo vencimento da fatura para uma compra feita em `purchaseISO`: o dia de vencimento do cartão
 * no mês seguinte à compra que fique pelo menos 10 dias depois dela (a fatura fecha uns dias antes).
 */
export function nextDue(purchaseISO, dueDay) {
  if (!purchaseISO || !dueDay) return '';
  for (let k = 0; k < 3; k++) {
    const month = addMonthsISO(`${purchaseISO.slice(0, 7)}-01`, k);
    const last = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();
    const due = `${month.slice(0, 8)}${String(Math.min(dueDay, last)).padStart(2, '0')}`;
    if ((new Date(due) - new Date(purchaseISO)) / 86400000 >= 10) return due;
  }
  return '';
}

/** Cadastro em Ajustes → Meus cartões. */
export function saveCard(last4, { bank = '', dueDay = null } = {}) {
  if (!/^\d{4}$/.test(last4 || '')) return false;
  updateSettings({ cards: { ...cards(), [last4]: { bank: bank.trim(), ...(dueDay ? { dueDay: Math.min(31, Math.max(1, +dueDay)) } : {}) } } });
  return true;
}

export function removeCard(last4) {
  const next = { ...cards() };
  delete next[last4];
  updateSettings({ cards: next });
}

export const cardList = () => Object.entries(cards()).map(([last4, c]) => ({ last4, ...c }));
