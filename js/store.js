// Estado do app, persistência local (localStorage) e sincronização opcional com a conta Claude
// quando o app roda como Artifact (capacidade `db`, pasta privada de cada pessoa).
import { addMonthsISO, monthKey } from './analytics.js';
import { defaultClassification } from './categories.js';
import { toISO } from './parser.js';
import { outstandingBalance, periodsToPayoff, pricePayment, rateFromInstallments, round2 } from './finance.js';
import { buildDemo } from './demo.js';

const LS_KEY = 'meubolso:v1';
const LS_SECRET = 'meubolso:apikey';
// Perfis: cada pessoa (você, namorada, pai...) tem os próprios lançamentos, cartões, dívidas e cofrinhos.
// O perfil principal continua na chave antiga; os outros em meubolso:v1:perfil:<id>.
const LS_PROFILES = 'meubolso:perfis';
export const MAIN_PROFILE = 'eu';
const profileKey = (id) => (id === MAIN_PROFILE ? LS_KEY : `${LS_KEY}:perfil:${id}`);
// preferências do aparelho que valem para todos os perfis
const SHARED_PREFS = ['theme', 'lock', 'autoSavePrints', 'hideValues'];

function readProfiles() {
  try {
    const p = JSON.parse(localStorage.getItem(LS_PROFILES) || 'null');
    if (p?.list?.some((x) => x.id === MAIN_PROFILE)) return p;
  } catch {
    /* sem perfis salvos */
  }
  return { active: MAIN_PROFILE, list: [{ id: MAIN_PROFILE, name: '', color: 0 }] };
}
let profiles = readProfiles();
function writeProfiles() {
  try {
    localStorage.setItem(LS_PROFILES, JSON.stringify(profiles));
  } catch {
    /* segue só em memória */
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const empty = () => ({
  version: 1,
  updatedAt: 0,
  settings: { name: '', hideValues: false, theme: 'system', savingsRate: 0.008, demo: false },
  transactions: [],
  budgets: {},
  goals: [],
  loans: [],
});

let state = empty();
const listeners = new Set();

export const getState = () => state;
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));

function readLocal(id = profiles.active) {
  try {
    const raw = localStorage.getItem(profileKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocal() {
  try {
    localStorage.setItem(profileKey(profiles.active), JSON.stringify(state));
  } catch {
    /* modo privado ou armazenamento cheio: segue só em memória */
  }
}

function migrate(s) {
  const base = empty();
  return { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
}

export function commit(mutator, { silent = false } = {}) {
  mutator(state);
  state.updatedAt = Date.now();
  writeLocal();
  cloud.schedule();
  if (!silent) listeners.forEach((fn) => fn(state));
}

export function replaceState(next) {
  state = migrate(next);
  state.updatedAt = Date.now();
  writeLocal();
  cloud.schedule();
  listeners.forEach((fn) => fn(state));
}

/** Tira os dados de exemplo (marcados com demo) e mantém tudo o que a pessoa registrou. */
function purgeDemo(s) {
  const demo = buildDemo(new Date());
  s.transactions = s.transactions.filter((t) => !t.demo);
  s.goals = s.goals.filter((g) => !g.demo);
  s.loans = s.loans.filter((l) => !l.demo);
  for (const [k, v] of Object.entries(demo.budgets)) if (s.budgets[k] === v) delete s.budgets[k];
  if (s.settings.name === demo.settings.name) s.settings.name = '';
  s.settings.demo = false;
}

// Recomeço pedido no app Android (versão 1.3.2): os lançamentos registrados com a leitura antiga das
// notificações (Pix enviado como receita e recebido como despesa) são apagados uma única vez.
// Ficam só as preferências; uma cópia do que existia fica guardada no aparelho por segurança.
const RESET_ID = '2026-10-recomeco';
const isNativeApp = () => Boolean(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());

function resetOnce(s) {
  if (s.settings.resetDone === RESET_ID || !isNativeApp()) return s;
  const had = s.transactions.length || s.loans.length || s.goals.length || Object.keys(s.budgets).length;
  if (had) {
    try {
      localStorage.setItem('meubolso:antes-do-recomeco', JSON.stringify(s));
    } catch {
      /* sem espaço: segue sem a cópia */
    }
  }
  const { name, hideValues, theme, savingsRate, lock } = s.settings;
  const next = empty();
  next.settings = { ...next.settings, name, hideValues, theme, savingsRate, ...(lock !== undefined ? { lock } : {}), resetDone: RESET_ID };
  return next;
}

export function init() {
  const local = readLocal();
  // o app começa vazio; quem ainda tinha os exemplos de versões antigas fica só com os próprios dados
  state = migrate(local || empty());
  if (state.settings.demo) purgeDemo(state);
  state = resetOnce(state);
  writeLocal();
  cloud.connect();
  return state;
}

// ---------- Perfis ----------

/** Perfis cadastrados, com o nome de exibição (o principal usa o seu nome dos Ajustes). */
export function getProfiles() {
  return profiles.list.map((p) => ({ ...p, active: p.id === profiles.active, label: p.id === MAIN_PROFILE ? (p.id === profiles.active ? state.settings.name : readLocal(p.id)?.settings?.name) || 'Eu' : p.name }));
}
export const activeProfile = () => getProfiles().find((p) => p.active);

/** Dados guardados de um perfil (sem trocar), para mostrar o resumo de cada um. */
export const profileData = (id) => (id === profiles.active ? state : migrate(readLocal(id) || empty()));

export function addProfile(name) {
  const clean = String(name || '').trim().slice(0, 30);
  if (!clean) return null;
  const id = uid();
  const used = new Set(profiles.list.map((p) => p.color));
  const color = [1, 2, 3, 4, 5, 6, 7].find((c) => !used.has(c)) ?? profiles.list.length % 8;
  profiles.list.push({ id, name: clean, color });
  writeProfiles();
  return id;
}

export function renameProfile(id, name) {
  const clean = String(name || '').trim().slice(0, 30);
  if (!clean) return;
  if (id === MAIN_PROFILE) return updateSettings({ name: clean });
  const p = profiles.list.find((x) => x.id === id);
  if (p) p.name = clean;
  writeProfiles();
  if (id === profiles.active) return updateSettings({ name: clean });
  listeners.forEach((fn) => fn(state));
}

/** Remove um perfil que não está aberto (e os dados dele). O principal não sai. */
export function removeProfile(id) {
  if (id === MAIN_PROFILE || id === profiles.active) return false;
  profiles.list = profiles.list.filter((p) => p.id !== id);
  writeProfiles();
  try {
    localStorage.removeItem(profileKey(id));
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(state));
  return true;
}

/** Abre outro perfil: guarda o atual, carrega o outro e mantém as preferências do aparelho. */
export function switchProfile(id) {
  const target = profiles.list.find((p) => p.id === id);
  if (!target || id === profiles.active) return false;
  writeLocal();
  const shared = Object.fromEntries(SHARED_PREFS.filter((k) => k in state.settings).map((k) => [k, state.settings[k]]));
  profiles.active = id;
  writeProfiles();
  const loaded = readLocal(id);
  state = migrate(loaded || empty());
  if (!loaded && id !== MAIN_PROFILE) state.settings.name = target.name;
  state.settings = { ...state.settings, ...shared, resetDone: RESET_ID };
  writeLocal();
  listeners.forEach((fn) => fn(state));
  return true;
}

// ---------- Chave da API (só neste aparelho, nunca sincroniza) ----------
export function getApiKey() {
  try {
    return localStorage.getItem(LS_SECRET) || '';
  } catch {
    return '';
  }
}
export function setApiKey(v) {
  try {
    if (v) localStorage.setItem(LS_SECRET, v);
    else localStorage.removeItem(LS_SECRET);
  } catch {
    /* ignore */
  }
}

// ---------- Lançamentos ----------

/**
 * Adiciona um lançamento. Se tiver parcelas, gera uma por mês; se for recorrente, gera 12 meses.
 * draft: { type, amount, description, category, classification, date, time, method, card, merchant,
 *          installments, installmentValue, recurring, source, location }
 * amount = valor da compra (à vista). installmentValue (opcional) = parcela com juros.
 */
export function addTransaction(draft) {
  const ids = [];
  const n = Math.max(1, Math.floor(draft.installments || 1));
  const base = {
    type: draft.type,
    description: draft.description?.trim() || '',
    category: draft.category,
    classification: draft.type === 'expense' ? draft.classification || defaultClassification(draft.category) : null,
    time: draft.time || '',
    method: draft.method || 'pix',
    card: draft.card || '',
    merchant: draft.merchant || '',
    location: draft.location || '',
    source: draft.source || 'manual',
    ...(draft.last4 ? { last4: draft.last4 } : {}),
    // parcelada com vencimento: cada parcela fica no mês em que vence; a data da compra fica guardada
    // no crédito com vencimento: o lançamento fica no mês em que a fatura vence; a data da compra fica guardada
    ...(draft.firstDue && draft.firstDue !== draft.date ? { purchaseDate: draft.date } : {}),
    // vencimento estimado (Pix parcelado sem o cartão): o cartão, quando você disser qual é, acerta o mês
    ...(draft.dueGuess && draft.firstDue ? { dueGuess: true } : {}),
    // parte do valor que foi taxa ou juros (o valor continua inteiro; a tela Juros e taxas mostra essa parte)
    ...(draft.type === 'expense' && n === 1 && draft.fee > 0 ? { fee: round2(Math.min(draft.fee, draft.amount)), feeKind: draft.feeKind === 'juros' ? 'juros' : 'taxa' } : {}),
    // transferência entre contas suas: aparece no extrato, mas não conta como gasto nem ganho
    ...(draft.internal ? { internal: true } : {}),
    ...(draft.loanId ? { loanId: draft.loanId } : {}),
    createdAt: Date.now(),
  };
  commit((s) => {
    if (n > 1) {
      const groupId = uid();
      const pmt = draft.installmentValue ? round2(draft.installmentValue) : round2(draft.amount / n);
      const cash = round2(draft.amount);
      for (let i = 0; i < n; i++) {
        const id = uid();
        ids.push(id);
        s.transactions.push({ ...base, id, amount: pmt, date: addMonthsISO(draft.firstDue || draft.date, i), installment: { i: i + 1, n, groupId, cash } });
      }
    } else if (draft.recurring) {
      const recurringId = uid();
      for (let i = 0; i < 12; i++) {
        const id = uid();
        ids.push(id);
        s.transactions.push({ ...base, id, amount: round2(draft.amount), date: addMonthsISO(draft.date, i), recurringId });
      }
    } else {
      const id = uid();
      ids.push(id);
      s.transactions.push({ ...base, id, amount: round2(draft.amount), date: draft.firstDue || draft.date });
    }
  });
  return ids;
}

/**
 * Importação em lote (um único salvamento). Cada rascunho pode trazer `installment: {i, n}` (parcela de fatura):
 * com `futureInstallments`, cria também as parcelas seguintes para entrarem nas projeções.
 */
export function addTransactions(drafts, { futureInstallments = true } = {}) {
  const ids = [];
  commit((s) => {
    for (const d of drafts) {
      const base = {
        type: d.type,
        description: d.description?.trim() || '',
        category: d.category,
        classification: d.type === 'expense' ? d.classification || defaultClassification(d.category) : null,
        time: d.time || '',
        method: d.method || 'pix',
        card: d.card || '',
        merchant: d.merchant || '',
        location: '',
        source: d.source || 'importacao',
        ...(d.fitid ? { fitid: d.fitid } : {}),
        ...(d.last4 ? { last4: d.last4 } : {}),
        ...(d.firstDue && d.firstDue !== d.date ? { purchaseDate: d.date } : {}),
        ...(d.type === 'expense' && !(d.installment?.n > 1) && d.fee > 0 ? { fee: round2(Math.min(d.fee, d.amount)), feeKind: d.feeKind === 'juros' ? 'juros' : 'taxa' } : {}),
        createdAt: Date.now(),
      };
      const amount = round2(d.amount);
      if (d.installment && d.installment.n > 1) {
        const groupId = uid();
        const { i, n } = d.installment;
        const last = futureInstallments ? n : i;
        for (let k = i; k <= last; k++) {
          const id = uid();
          ids.push(id);
          // com vencimento: a parcela desta fatura/compra fica no vencimento e as próximas nos meses seguintes
          s.transactions.push({ ...base, id, amount, date: addMonthsISO(d.firstDue || d.date, k - i), installment: { i: k, n, groupId, cash: round2(amount * n) } });
        }
      } else {
        const id = uid();
        ids.push(id);
        s.transactions.push({ ...base, id, amount, date: d.firstDue || d.date });
      }
    }
  });
  return ids;
}

export function updateTransaction(id, patch, { wholeGroup = false } = {}) {
  commit((s) => {
    const t = s.transactions.find((x) => x.id === id);
    if (!t) return;
    const groupKey = t.installment?.groupId || t.recurringId;
    const targets = wholeGroup && groupKey ? s.transactions.filter((x) => (x.installment?.groupId || x.recurringId) === groupKey) : [t];
    for (const x of targets) {
      const { date, amount, ...rest } = patch;
      Object.assign(x, rest);
      if (x === t) {
        if (date) x.date = date;
        if (amount != null) x.amount = round2(amount);
      } else if (amount != null && !x.installment) x.amount = round2(amount);
    }
  });
}

export function deleteTransaction(id, { wholeGroup = false, futureOnly = false } = {}) {
  let removed = [];
  commit((s) => {
    const t = s.transactions.find((x) => x.id === id);
    if (!t) return;
    const groupKey = t.installment?.groupId || t.recurringId;
    const del = (x) => {
      if (x.id === id) return true;
      if (!wholeGroup || !groupKey) return false;
      if ((x.installment?.groupId || x.recurringId) !== groupKey) return false;
      return futureOnly ? x.date >= t.date : true;
    };
    removed = s.transactions.filter(del);
    s.transactions = s.transactions.filter((x) => !del(x));
  });
  return removed;
}

export function deleteTransactions(ids) {
  const set = new Set(ids);
  commit((s) => (s.transactions = s.transactions.filter((t) => !set.has(t.id))));
}

export function restoreTransactions(list) {
  commit((s) => s.transactions.push(...list));
}

export function clearDemo() {
  commit(purgeDemo);
}

export function loadDemo() {
  const demo = buildDemo(new Date());
  commit((s) => {
    s.transactions.push(...demo.transactions);
    s.goals.push(...demo.goals);
    s.loans.push(...demo.loans);
    s.budgets = { ...demo.budgets, ...s.budgets };
    s.settings.demo = true;
  });
}

export function resetAll() {
  replaceState({ ...empty(), settings: { ...empty().settings, name: state.settings.name } });
}

// ---------- Cofrinhos ----------
export function addGoal({ name, emoji, target, deadline }) {
  commit((s) => s.goals.push({ id: uid(), name, emoji: emoji || '🐷', target: +target || 0, deadline: deadline || '', history: [], createdAt: Date.now() }));
}
export function goalMove(id, amount, note = '') {
  commit((s) => {
    const g = s.goals.find((x) => x.id === id);
    if (g) g.history.push({ date: toISO(new Date()), amount: round2(amount), note });
  });
}
export function updateGoal(id, patch) {
  commit((s) => Object.assign(s.goals.find((x) => x.id === id) || {}, patch));
}
export function deleteGoal(id) {
  commit((s) => (s.goals = s.goals.filter((g) => g.id !== id)));
}

// ---------- Empréstimos e dívidas ----------

/**
 * mode 'parcelado': principal, n, firstDue e (rate OU pmt); o outro é calculado.
 * mode 'rotativo': balance, rate, minPayment (cartão, cheque especial).
 * mode 'acordo': dívida negativada (Serasa): balance, offer, offerInstallments, since.
 */
export function addLoan(input) {
  const loan = { id: uid(), name: input.name, kind: input.kind || 'emprestimo', mode: input.mode, createdAt: Date.now(), payments: [], source: input.source || 'manual' };
  for (const k of ['creditor', 'released', 'fees', 'cetMonthly', 'statedRate']) if (input[k] != null && input[k] !== '') loan[k] = input[k];
  if (input.mode === 'parcelado') {
    loan.principal = +input.principal;
    loan.n = Math.max(1, +input.n);
    loan.firstDue = input.firstDue || toISO(new Date());
    loan.paid = Math.min(loan.n, Math.max(0, +input.paid || 0));
    if (input.pmt && !input.rate) {
      loan.pmt = +input.pmt;
      loan.rate = rateFromInstallments(loan.principal, loan.pmt, loan.n);
    } else {
      loan.rate = +input.rate || 0;
      loan.pmt = round2(pricePayment(loan.principal, loan.rate, loan.n));
    }
  } else if (input.mode === 'rotativo') {
    loan.balance = +input.balance;
    loan.rate = +input.rate || 0;
    loan.minPayment = +input.minPayment || 0;
  } else {
    loan.creditor = input.creditor || input.name;
    loan.balance = +input.balance;
    loan.offer = input.offer ? +input.offer : null;
    loan.offerInstallments = input.offerInstallments || null;
    loan.since = input.since || '';
    loan.status = 'aberta';
    loan.rate = 0;
  }
  commit((s) => s.loans.push(loan));
  return loan.id;
}

export function deleteLoan(id) {
  commit((s) => (s.loans = s.loans.filter((l) => l.id !== id)));
}

/** Registra pagamento: gera um gasto em "Dívidas e empréstimos" e atualiza a dívida. */
export function payLoan(id, amount, date = toISO(new Date())) {
  commit((s) => {
    const l = s.loans.find((x) => x.id === id);
    if (!l) return;
    const value = round2(amount ?? (l.mode === 'parcelado' ? l.pmt : l.mode === 'acordo' ? l.offer || l.balance : l.minPayment));
    l.payments.push({ date, amount: value });
    if (l.mode === 'parcelado') l.paid = Math.min(l.n, l.paid + 1);
    else if (l.mode === 'rotativo') l.balance = Math.max(0, round2(l.balance - value));
    else l.status = 'quitada';
    s.transactions.push({
      id: uid(),
      type: 'expense',
      amount: value,
      description: l.mode === 'parcelado' ? `${l.name} (parcela ${l.paid}/${l.n})` : l.mode === 'acordo' ? `Quitação ${l.name}` : `Pagamento ${l.name}`,
      category: 'dividas',
      classification: 'essencial',
      date,
      time: '',
      method: 'pix',
      card: '',
      merchant: l.creditor || '',
      location: '',
      source: 'divida',
      loanId: l.id,
      createdAt: Date.now(),
    });
  });
}

/** Amortização extra num parcelado: mantém a parcela e reduz o prazo. */
export function amortizeLoan(id, extra, date = toISO(new Date())) {
  commit((s) => {
    const l = s.loans.find((x) => x.id === id);
    if (!l || l.mode !== 'parcelado') return;
    const bal = outstandingBalance(l.principal, l.rate, l.n, l.paid);
    const value = round2(Math.min(extra, bal));
    const left = bal - value;
    const nextDue = addMonthsISO(l.firstDue, l.paid);
    const n = left > 0.005 ? periodsToPayoff(left, l.rate, l.pmt) : 0;
    l.payments.push({ date, amount: value, extra: true });
    if (n > 0 && Number.isFinite(n)) Object.assign(l, { principal: round2(left), n, paid: 0, firstDue: nextDue, pmt: round2(pricePayment(left, l.rate, n)) });
    else Object.assign(l, { paid: l.n });
    s.transactions.push({ id: uid(), type: 'expense', amount: value, description: `Amortização ${l.name}`, category: 'dividas', classification: 'essencial', date, time: '', method: 'pix', card: '', merchant: '', location: '', source: 'divida', loanId: l.id, createdAt: Date.now() });
  });
}

/** Lançamento parecido já registrado (mesmo tipo, valor e data próxima): evita importar o mesmo lançamento duas vezes. */
// mesma compra parcelada: mesmo cartão (quando os dois têm) e descrição parecida
const sameCompra = (a, b) => {
  if (a.last4 && b.last4 && a.last4 !== b.last4) return false;
  const key = (x) => String(x.description || x.merchant || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 6);
  return !key(a) || !key(b) || key(a) === key(b);
};

export function findDuplicate(draft) {
  const d = new Date((draft.date || toISO(new Date())) + 'T12:00:00');
  return state.transactions.find((t) => {
    if (draft.fitid && t.fitid) return draft.fitid === t.fitid;
    // parcela de fatura que já foi criada como "parcela futura" numa importação anterior
    if (draft.installment && t.installment && t.installment.i === draft.installment.i && t.installment.n === draft.installment.n && Math.abs(t.amount - draft.amount) < 0.01 && sameCompra(t, draft)) {
      // até ~2,5 meses: a parcela pode ter sido guardada no vencimento, e a da fatura vem com a data da compra
      return Math.abs(new Date(t.date + 'T12:00:00') - d) / 86400000 <= 75;
    }
    if (t.type !== draft.type || Math.abs(t.amount - draft.amount) > 0.009) return false;
    const diff = Math.abs(new Date(t.date + 'T12:00:00') - d) / 86400000;
    if (diff > 1) return false;
    if (draft.time && t.time && draft.time !== t.time) return false;
    return true;
  });
}

/**
 * Vencimento de uma compra no crédito: com `firstDue`, cada parcela vai para o mês em que vence (a k-ésima,
 * k-1 meses depois) e a data da compra fica em purchaseDate; sem ele, volta tudo para a data da compra.
 */
export function setDueDates(id, { purchaseDate, firstDue }) {
  commit((s) => {
    const t = s.transactions.find((x) => x.id === id);
    if (!t) return;
    const group = t.installment?.groupId ? s.transactions.filter((x) => x.installment?.groupId === t.installment.groupId) : [t];
    for (const x of group) {
      const k = (x.installment?.i || 1) - 1;
      delete x.dueGuess;
      if (firstDue) Object.assign(x, { date: addMonthsISO(firstDue, k), purchaseDate });
      else if (x.purchaseDate) {
        x.date = addMonthsISO(purchaseDate, k);
        delete x.purchaseDate;
      }
    }
  });
}

/** Fechar acordo parcelado de uma dívida negativada: vira um parcelamento sem juros. */
export function negotiateLoan(id, { n, pmt, firstDue }) {
  commit((s) => {
    const l = s.loans.find((x) => x.id === id);
    if (!l) return;
    Object.assign(l, { mode: 'parcelado', principal: round2(n * pmt), n, pmt, rate: 0, paid: 0, firstDue, status: 'negociada', kind: 'acordo' });
  });
}

export function setBudget(catId, value) {
  commit((s) => {
    if (value > 0) s.budgets[catId] = value;
    else delete s.budgets[catId];
  });
}

export function updateSettings(patch) {
  // "Seu nome" num perfil que não é o principal também renomeia o perfil
  if (patch.name && profiles.active !== MAIN_PROFILE) {
    const p = profiles.list.find((x) => x.id === profiles.active);
    if (p) (p.name = patch.name), writeProfiles();
  }
  commit((s) => Object.assign(s.settings, patch));
}

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

/** Junta um backup com os dados atuais (sem duplicar pelo id). Retorna quantos lançamentos entraram. */
export function mergeBackup(data) {
  let added = 0;
  commit((s) => {
    const has = new Set(s.transactions.map((t) => t.id));
    for (const t of data.transactions || []) if (!has.has(t.id)) s.transactions.push(t), added++;
    for (const key of ['goals', 'loans']) {
      const ids = new Set(s[key].map((x) => x.id));
      for (const x of data[key] || []) if (!ids.has(x.id)) s[key].push(x);
    }
    s.budgets = { ...(data.budgets || {}), ...s.budgets };
  });
  return added;
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.transactions)) throw new Error('Arquivo não parece um backup deste app.');
  replaceState(data);
}

// ---------- Sincronização com a conta Claude (só quando roda como Artifact) ----------
// Os dados ficam em data/users/<id>/ — pasta privada de cada pessoa no banco do artifact.
// Documentos: "meta" (ajustes, orçamentos), "goals", "loans" e um por mês de lançamentos ("tx-AAAA-MM").

export const cloud = {
  status: 'local', // 'local' | 'conectando' | 'sincronizado' | 'erro'
  col: null,
  timer: null,
  written: new Map(),
  onStatus: () => {},

  setStatus(s) {
    this.status = s;
    this.onStatus(s);
  },

  async connect() {
    const c = typeof window !== 'undefined' ? window.claude : null;
    if (!c?.use || profiles.active !== MAIN_PROFILE) return;
    this.setStatus('conectando');
    try {
      const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
      if (!db || !user) return this.setStatus('local');
      const id = await user.id();
      if (!id) return this.setStatus('local');
      this.col = db.collection(`data/users/${id}`);
      const snap = await this.col.get();
      const docs = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
      const remoteAt = docs.meta?.updatedAt || 0;
      if (remoteAt > (state.settings.demo ? 0 : state.updatedAt)) {
        const remote = {
          ...empty(),
          updatedAt: remoteAt,
          settings: { ...empty().settings, ...(docs.meta.settings || {}) },
          budgets: docs.meta.budgets || {},
          goals: docs.goals?.items || [],
          loans: docs.loans?.items || [],
          transactions: Object.entries(docs)
            .filter(([k]) => k.startsWith('tx-'))
            .flatMap(([, v]) => v.items || []),
        };
        for (const [k, v] of Object.entries(docs)) this.written.set(k, JSON.stringify(v));
        state = migrate(remote);
        writeLocal();
        listeners.forEach((fn) => fn(state));
      } else {
        for (const [k, v] of Object.entries(docs)) this.written.set(k, JSON.stringify(v));
        await this.flush();
      }
      this.setStatus('sincronizado');
    } catch (e) {
      console.warn('Sincronização indisponível', e);
      this.col = null;
      this.setStatus('local');
    }
  },

  schedule() {
    // a pasta da conta guarda só o perfil principal
    if (!this.col || profiles.active !== MAIN_PROFILE) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 800);
  },

  async flush() {
    if (!this.col) return;
    const docs = {
      meta: { updatedAt: state.updatedAt, settings: state.settings, budgets: state.budgets },
      goals: { items: state.goals },
      loans: { items: state.loans },
    };
    for (const t of state.transactions) {
      const k = `tx-${monthKey(t.date)}`;
      (docs[k] = docs[k] || { items: [] }).items.push(t);
    }
    try {
      // "meta" por último: o horário dela só avança depois que o resto foi gravado
      const entries = Object.entries(docs).sort(([a], [b]) => (a === 'meta') - (b === 'meta'));
      for (const [k, v] of entries) {
        const json = JSON.stringify(v);
        if (this.written.get(k) === json) continue;
        await this.col.doc(k).set(v);
        this.written.set(k, json);
      }
      for (const k of [...this.written.keys()]) {
        if (!docs[k]) {
          await this.col.doc(k).delete();
          this.written.delete(k);
        }
      }
      this.setStatus('sincronizado');
    } catch (e) {
      console.warn('Falha ao sincronizar', e);
      this.setStatus('erro');
    }
  },
};
