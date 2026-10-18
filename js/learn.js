// Aprende com as correções de receita/despesa nos lançamentos vindos de notificações.
// Cada app escreve as notificações do seu jeito; quando você inverte um lançamento, o "molde" daquela
// notificação (texto sem valor, data e nome) fica lembrado e as próximas iguais já entram do lado certo.
import { categorize, defaultClassification } from './categories.js';
import { templateKeys } from './parser.js';
import { getState, updateSettings, updateTransaction } from './store.js';

const rules = () => getState().settings.flowRules || {};

/** Tipo lembrado para esta notificação, ou null. */
export function learnedType(raw, name) {
  if (!raw) return null;
  const r = rules();
  return templateKeys(raw, name).map((k) => r[k]).find(Boolean) || null;
}

/** "Pix de Maria" <-> "Pix para Maria" conforme o lado. */
export function swapLabel(description, type) {
  return String(description || '').replace(/^(Pix|Transferência) (de|para) /, (_, what) => `${what} ${type === 'income' ? 'de' : 'para'} `);
}

/** Campos que mudam ao trocar o lado de um lançamento (ou rascunho). */
export function flipPatch(tx, type) {
  const description = swapLabel(tx.description, type);
  const category = categorize(`${tx.merchant || ''} ${description}`, type) || (type === 'income' ? 'outros-ganhos' : 'outros');
  return { type, description, category, classification: type === 'expense' ? defaultClassification(category) : null };
}

/** Guarda a correção para as próximas notificações iguais. */
export function learnFlow(tx, type) {
  const keys = templateKeys(tx.raw, tx.merchant);
  if (!keys.length) return;
  updateSettings({ flowRules: { ...rules(), ...Object.fromEntries(keys.map((k) => [k, type])) } });
}

/**
 * Outros lançamentos de notificação que provavelmente estão do lado errado como `tx` estava:
 * mesmo molde de notificação; nos antigos (sem o texto guardado), mesmo app e mesmo lado.
 */
export function similarFlow(tx, oldType) {
  const keys = new Set(templateKeys(tx.raw, tx.merchant));
  return getState().transactions.filter((t) => {
    if (t.id === tx.id || t.source !== 'notificacao' || t.type !== oldType) return false;
    if (t.raw && keys.size) return templateKeys(t.raw, t.merchant).some((k) => keys.has(k));
    return !t.raw && (t.card || '') === (tx.card || '');
  });
}

/** Inverte vários lançamentos de uma vez. */
export function flipAll(list, type) {
  for (const t of list) updateTransaction(t.id, flipPatch(t, type));
}
