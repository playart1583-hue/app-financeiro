// Lembretes de pagamentos e depósitos: notificações no celular antes de cada vencimento, de todos os perfis.
// Usa as notificações agendadas do próprio Android (funcionam com o app fechado, sem internet).
import { addMonthsISO, goalSaved, loanDueDates } from './analytics.js';
import { monthlyToReach } from './finance.js';
import { isNativeApp } from './native.js';
import { toISO } from './parser.js';
import { getProfiles, getState, profileData } from './store.js';
import { dateBR, money } from './ui.js';

const LN = () => (isNativeApp ? window.Capacitor?.Plugins?.LocalNotifications || null : null);
export const remindersAvailable = () => Boolean(LN());

/** Preferências (valem para todos os perfis): ligado, quantos dias antes, horário e dia do lembrete do cofrinho. */
export const reminderPrefs = () => ({ on: true, daysBefore: 1, hour: '09:00', depositDay: 0, ...(getState().settings.reminders || {}) });

const addDays = (iso, n) => toISO(new Date(new Date(`${iso}T12:00:00`).getTime() + n * 86400000));
const atHour = (iso, hhmm) => new Date(`${iso}T${hhmm || '09:00'}:00`).getTime();
const lastOf = (card) => card?.match?.(/final (\d{4})/)?.[1] || '';

/**
 * O que vence de um perfil entre hoje e `days` dias: faturas de cartão (somadas por cartão e vencimento),
 * boletos e contas com data futura, e parcelas de empréstimos e acordos.
 */
export function upcomingPayments(state, today = new Date(), days = 45) {
  const from = toISO(today);
  const to = addDays(from, days);
  const out = [];
  const invoices = new Map();
  for (const t of state.transactions) {
    if (t.type !== 'expense' || t.internal || t.date < from || t.date > to) continue;
    const last4 = t.last4 || lastOf(t.card);
    if (t.method === 'credito' && last4) {
      const key = `${last4}|${t.date}`;
      const inv = invoices.get(key) || { kind: 'fatura', date: t.date, amount: 0, count: 0, last4, title: `Fatura do cartão ${last4}${state.settings.cards?.[last4]?.bank ? ` (${state.settings.cards[last4].bank})` : ''}` };
      inv.amount += t.amount;
      inv.count += 1;
      invoices.set(key, inv);
    } else out.push({ kind: t.method === 'boleto' ? 'boleto' : 'conta', date: t.date, amount: t.amount, title: t.method === 'boleto' ? `Boleto: ${t.description}` : t.description });
  }
  out.push(...invoices.values());
  for (const l of state.loans || []) {
    if (l.status === 'quitada') continue;
    for (const d of loanDueDates(l)) if (d.date >= from && d.date <= to) out.push({ kind: 'emprestimo', date: d.date, amount: d.amount, title: `Parcela ${d.k}/${l.n} · ${l.name}` });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

/** Depósitos sugeridos nos cofrinhos com prazo, no dia escolhido de cada mês (próximos 2 meses). */
function depositReminders(state, today, day) {
  if (!day) return [];
  const out = [];
  const rate = state.settings.savingsRate || 0;
  for (const g of state.goals || []) {
    const saved = goalSaved(g);
    if (!g.deadline || saved >= g.target) continue;
    for (let k = 0; k < 2; k++) {
      const month = addMonthsISO(`${toISO(today).slice(0, 7)}-01`, k);
      const last = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();
      const date = `${month.slice(0, 8)}${String(Math.min(day, last)).padStart(2, '0')}`;
      const months = Math.max(1, (+g.deadline.slice(0, 4) - +date.slice(0, 4)) * 12 + (+g.deadline.slice(5, 7) - +date.slice(5, 7)));
      const need = monthlyToReach(g.target, saved, rate, months);
      if (need > 0 && date <= g.deadline) out.push({ kind: 'deposito', date, amount: need, title: `Guardar no cofrinho ${g.name}` });
    }
  }
  return out;
}

// id numérico estável para cada lembrete (o Android pede um inteiro)
const idOf = (s) => {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 2000000000;
};

/** Monta os avisos dos próximos 60 dias de todos os perfis. */
export function buildNotifications(now = new Date()) {
  const prefs = reminderPrefs();
  const profiles = getProfiles();
  const list = [];
  for (const p of profiles) {
    const st = profileData(p.id);
    const who = profiles.length > 1 ? `${p.label} · ` : '';
    const items = [...upcomingPayments(st, now, 60), ...depositReminders(st, now, +prefs.depositDay || 0)];
    for (const it of items) {
      for (const before of [...new Set([+prefs.daysBefore || 0, 0])]) {
        const at = atHour(addDays(it.date, -before), prefs.hour);
        if (at <= now.getTime()) continue;
        const when = it.kind === 'deposito' ? 'Hoje' : before === 0 ? 'Vence hoje' : before === 1 ? 'Vence amanhã' : `Vence em ${before} dias`;
        list.push({
          id: idOf(`${p.id}|${it.kind}|${it.title}|${it.date}|${before}`),
          title: `${who}${it.title}`,
          body: `${when}${it.kind === 'deposito' ? '' : ` (${dateBR(it.date)})`} · ${money(it.amount, { force: true })}${it.count > 1 ? ` · ${it.count} compras` : ''}`,
          schedule: { at: new Date(at), allowWhileIdle: true },
          channelId: 'vencimentos',
          smallIcon: 'ic_stat_notify',
          extra: { profile: p.id, route: it.kind === 'emprestimo' ? 'dividas' : it.kind === 'deposito' ? 'cofrinhos' : 'extrato' },
        });
      }
    }
  }
  // o Android guarda até 500; os mais próximos bastam (o app reagenda sempre que abre ou muda algo)
  return list.sort((a, b) => a.schedule.at - b.schedule.at).slice(0, 64);
}

let channelReady = false;
async function ensureChannel(ln) {
  if (channelReady) return;
  try {
    await ln.createChannel({ id: 'vencimentos', name: 'Vencimentos e lembretes', description: 'Faturas, boletos, parcelas e depósitos nos cofrinhos', importance: 4, visibility: 1, vibration: true });
  } catch {
    /* Android antigo: sem canais */
  }
  channelReady = true;
}

export async function notificationPermission() {
  const ln = LN();
  if (!ln) return 'indisponivel';
  try {
    return (await ln.checkPermissions()).display;
  } catch {
    return 'indisponivel';
  }
}

export async function askNotificationPermission() {
  const ln = LN();
  if (!ln) return 'indisponivel';
  try {
    return (await ln.requestPermissions()).display;
  } catch {
    return 'denied';
  }
}

/** Cancela os avisos agendados e agenda de novo com os dados atuais. */
export async function scheduleReminders() {
  const ln = LN();
  if (!ln) return 0;
  try {
    const pending = await ln.getPending();
    if (pending.notifications?.length) await ln.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if (!reminderPrefs().on || (await notificationPermission()) !== 'granted') return 0;
    await ensureChannel(ln);
    const list = buildNotifications();
    if (list.length) await ln.schedule({ notifications: list });
    return list.length;
  } catch (e) {
    console.warn('Lembretes indisponíveis', e);
    return 0;
  }
}

let timer = null;
/** Reagenda logo depois que algo mudar (vários lançamentos seguidos viram um reagendamento só). */
export function rescheduleSoon() {
  if (!LN()) return;
  clearTimeout(timer);
  timer = setTimeout(scheduleReminders, 2500);
}

/** Aviso de teste em 5 segundos. */
export async function testNotification() {
  const ln = LN();
  if (!ln) return false;
  await ensureChannel(ln);
  await ln.schedule({ notifications: [{ id: 1999999999, title: 'Meu Bolso', body: 'Assim você vai ser avisado antes de cada vencimento.', schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, channelId: 'vencimentos', smallIcon: 'ic_stat_notify' }] });
  return true;
}

/** Tocar no aviso abre o app no perfil e na tela certos. */
export function onReminderTap(handler) {
  const ln = LN();
  ln?.addListener?.('localNotificationActionPerformed', ({ notification }) => handler(notification?.extra || {}));
}
