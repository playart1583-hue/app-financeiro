// Notificações (Mercado Pago, 99, bancos): várias de uma vez por print ou texto, e registro automático
// quando o texto chega por automação do celular ou pelo menu "Compartilhar".
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS, defaultClassification, getCategory } from '../categories.js';
import { flipPatch, learnedType } from '../learn.js';
import { classifyTransfer } from '../transfers.js';
import { parseNotifications, parseReceiptText } from '../parser.js';
import { analyzeNotifications } from '../receipt.js';
import { addTransaction, deleteTransaction, findDuplicate, getState } from '../store.js';
import { dateBR, html, money, moneyInput, readMoney, toast } from '../ui.js';
import { openTxForm, prefillFromExtract } from './form.js';
import { openReader } from './reader.js';

/** Converte um item lido em rascunho de lançamento. */
function draftOf(x) {
  const p = prefillFromExtract(x);
  const d = { ...p, description: p.description || getCategory(p.category).name, installments: 1, source: 'notificacao', raw: x.raw || '' };
  // você já corrigiu uma notificação igual a esta: segue a correção
  const learned = learnedType(d.raw, d.merchant);
  return learned && learned !== d.type ? { ...d, ...flipPatch(d, learned) } : d;
}

export function openNotificationsImport({ file, text } = {}) {
  openReader({
    title: 'Importar notificações',
    intro: 'Funciona com Mercado Pago, 99, 99Pay e bancos. Tire print da central de notificações ou da tela de atividades do app, ou copie o texto das notificações. O que já estiver registrado aparece como repetido.',
    dropTitle: 'Enviar print das notificações',
    dropText: 'Pode ter várias movimentações no mesmo print.',
    textLabel: 'Texto das notificações (uma por bloco)',
    textPlaceholder: 'Mercado Pago\nVocê enviou um Pix de R$ 50,00 para Maria Souza\n\n99\nSua corrida foi paga: R$ 18,90',
    initialFile: file,
    initialText: text,
    analyze: (f, o) => analyzeNotifications(f, o).then((r) => r.items),
    parseText: (t) => {
      const items = parseNotifications(t);
      return items.length ? items : { error: 'Não encontrei movimentações com valor nesse texto.' };
    },
    onResult(items, sheet) {
      if (!items.length) return sheet.status('Não encontrei movimentações com valor nesse print.', 'error');
      if (items.length === 1) {
        sheet.close();
        return openTxForm({ prefill: prefillFromExtract(items[0]), extracted: items[0], engine: { label: 'notificação' } });
      }
      renderReview(items, sheet);
    },
  });
}

function renderReview(items, sheet) {
  const drafts = items.map(draftOf);
  const dup = drafts.map((d) => Boolean(findDuplicate(d)));
  const box = sheet.body.querySelector('#r-results');
  const catOptions = (type, sel) => (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => html`<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.icon} ${c.name}</option>`);
  box.innerHTML = String(html`<h3 class="section-title">Encontrei ${drafts.length} movimentações</h3>
    <form id="n-form" class="form">${drafts.map(
      (d, i) => html`<fieldset class="card import-row ${dup[i] ? 'dup' : ''}">
        <label class="check"><input type="checkbox" name="use" value="${i}" ${dup[i] ? '' : 'checked'}> <b class="${d.type}">${d.type === 'income' ? '+' : '−'} ${money(d.amount, { force: true })}</b> <span class="muted">${dateBR(d.date)}${d.time ? ` ${d.time}` : ''} · ${PAYMENT_METHODS[d.method] || ''}${d.card ? ` · ${d.card}` : ''}</span></label>
        ${dup[i] ? html`<p class="pill warn">parece já registrado</p>` : ''}
        <div class="row2"><label class="field"><span>Descrição</span><input name="desc-${i}" value="${d.description}"></label>
        <label class="field"><span>Categoria</span><select name="cat-${i}">${catOptions(d.type, d.category)}</select></label></div>
        <label class="field"><span>Valor</span><input name="val-${i}" inputmode="decimal" value="${moneyInput(d.amount)}"></label>
      </fieldset>`,
    )}<button class="btn primary" type="submit">Registrar selecionados</button></form>`);
  box.querySelector('#n-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const ids = [];
    for (const c of f.querySelectorAll('[name=use]:checked')) {
      const i = +c.value;
      const category = f[`cat-${i}`].value;
      ids.push(...addTransaction({ ...drafts[i], description: f[`desc-${i}`].value.trim() || drafts[i].description, category, classification: drafts[i].type === 'expense' ? defaultClassification(category) : null, amount: readMoney(f[`val-${i}`].value) || drafts[i].amount }));
    }
    sheet.close();
    toast(`${ids.length} lançamento${ids.length === 1 ? '' : 's'} registrado${ids.length === 1 ? '' : 's'}`, { action: 'Desfazer', onAction: () => ids.forEach((id) => deleteTransaction(id)) });
  });
  box.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/**
 * Texto que chegou de fora (automação do Android, menu Compartilhar).
 * Com o registro automático ligado, salva direto o que for claro e novo; o resto abre para revisão.
 */
export function ingestExternalText(text, { silent = false } = {}) {
  let items = parseNotifications(text);
  if (!items.length) {
    const one = parseReceiptText(text);
    if (one.amount) items = [{ ...one, raw: text }];
  }
  // vindo das automações, texto sem valor é ignorado em silêncio (o diagnóstico em Ajustes mostra o que chegou)
  if (!items.length) return silent ? null : openNotificationsImport({ text });
  const auto = getState().settings.autoRegister !== false;
  const drafts = items.map(draftOf);
  if (!auto || drafts.some((d) => findDuplicate(d))) return items.length === 1 && !auto ? openTxForm({ prefill: prefillFromExtract(items[0]), extracted: items[0], engine: { label: 'notificação' } }) : openNotificationsImport({ text });
  // entre contas suas (ou a outra ponta já registrada): não conta como gasto nem ganho
  const ids = [];
  for (let k = 0; k < drafts.length; k++) {
    drafts[k] = classifyTransfer(drafts[k]);
    ids.push(...addTransaction(drafts[k]));
  }
  const first = drafts[0];
  toast(drafts.length === 1 ? `Registrado: ${first.internal ? 'transferência entre suas contas (não conta como gasto nem ganho)' : first.type === 'income' ? 'ganho' : 'gasto'} de ${money(first.amount, { force: true })} · ${first.description}` : `${drafts.length} lançamentos registrados da notificação`, {
    action: 'Desfazer',
    onAction: () => ids.forEach((id) => deleteTransaction(id)),
    timeout: 8000,
  });
}
