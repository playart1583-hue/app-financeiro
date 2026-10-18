// Transferências entre as suas próprias contas (ex.: Santander -> Mercado Pago): o dinheiro continua seu,
// então não entram como gasto nem como ganho. Você marca no lançamento ("Entre contas"); o app
// lembra o seu nome e marca a outra ponta (saiu de uma conta e entrou na outra com o mesmo valor em poucos minutos).
import { normalize } from './categories.js';
import { getState, updateSettings, updateTransaction } from './store.js';

const OWN_PHRASE = /\b(mesma titularidade|entre (?:suas|minhas) contas|conta propria|transferencia entre contas|voce (?:adicionou|depositou|guardou|resgatou)|dinheiro adicionado|adicionado a sua conta|recarga (?:na|da) (?:sua )?conta|para (?:a )?sua conta (?:no|do|da|em|de))\b/;
const WALLET = /^(mercado pago|nu pagamentos|nubank|picpay|pagbank|pagseguro|banco inter|inter|c6 bank|99pay|santander|itau|bradesco|caixa|banco do brasil|neon|btg)\b/;
const PAIR_MINUTES = 30;

const tokens = (s) => normalize(String(s || '')).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !['de', 'da', 'do', 'das', 'dos', 'e'].includes(w));

/** Seus nomes guardados (ajustes ou aprendidos), já normalizados. */
export const ownNames = () => getState().settings.ownNames || [];

/** "JOAO S SILVA" ou "João Silva" batem com "João da Silva Santos": mesmo primeiro nome e o resto contido (aceita iniciais). */
export function isOwnName(name, names = ownNames()) {
  const t = tokens(name);
  if (t.length < 2) return false;
  return names.some((own) => {
    const o = tokens(own);
    return o.length >= 2 && t[0] === o[0] && t.slice(1).every((w) => o.some((x) => x === w || (w.length === 1 && x.startsWith(w))));
  });
}

export function rememberOwnName(name) {
  const t = tokens(name);
  if (t.length < 2 || isOwnName(name)) return;
  updateSettings({ ownNames: [...ownNames(), t.join(' ')] });
}

/** O texto do lançamento já diz que é entre contas suas? */
export function looksOwnTransfer(d) {
  const t = normalize(`${d.raw || ''} ${d.description || ''}`);
  if (OWN_PHRASE.test(t)) return true;
  const who = d.merchant || String(d.description || '').replace(/^(Pix|Transferência) (de|para) /, '');
  if (isOwnName(who)) return true;
  return /\b(pix|transferencia|ted)\b/.test(t) && WALLET.test(normalize(who));
}

const minutesOf = (t) => {
  const [y, m, d] = t.date.split('-').map(Number);
  const [h, mi] = (t.time || '12:00').split(':').map(Number);
  return new Date(y, m - 1, d, h, mi).getTime() / 60000;
};

const nameOf = (t) => t.merchant || String(t.description || '').replace(/^(Pix|Transferência) (de|para) /, '');
// quando as duas pontas trazem nome, tem que ser a mesma pessoa (você); com nome só de um lado, vale o valor e o horário
// e, se o app já sabe o seu nome, tem que ser ele
const samePerson = (a, b) => {
  const [na, nb] = [nameOf(a), nameOf(b)];
  if (tokens(na).length < 2 || tokens(nb).length < 2) return true;
  if (!isOwnName(na, [nb]) && !isOwnName(nb, [na])) return false;
  return !ownNames().length || isOwnName(na) || isOwnName(nb);
};

/** A outra ponta: mesmo valor, lado oposto, outro app/conta, até 30 minutos de diferença. */
export function findPair(d, list = getState().transactions) {
  return list.find(
    (t) =>
      t.id !== d.id &&
      samePerson(t, d) &&
      !t.internal &&
      t.type !== d.type &&
      Math.abs(t.amount - d.amount) < 0.005 &&
      (t.card || '') !== (d.card || '') &&
      (t.time && d.time ? Math.abs(minutesOf(t) - minutesOf(d)) <= PAIR_MINUTES : t.date === d.date),
  );
}

/** "Transferência Santander → Mercado Pago" (a saída é de onde o dinheiro veio). */
export function transferLabel(a, b) {
  const out = a.type === 'expense' ? a : b;
  const inn = a.type === 'expense' ? b : a;
  return `Transferência ${out?.card || 'outra conta'} → ${inn?.card || 'outra conta'}`;
}

/** Você marcou um lançamento como entre contas: lembra o nome e marca a outra ponta, se houver. */
export function markOwnTransfer(tx) {
  rememberOwnName(tx.merchant || String(tx.description || '').replace(/^(Pix|Transferência) (de|para) /, ''));
  const pair = findPair(tx);
  if (pair) {
    const description = transferLabel(tx, pair);
    updateTransaction(pair.id, { internal: true, description });
    updateTransaction(tx.id, { description });
  }
  return pair;
}
