// Formulário de lançamento (gasto/ganho), leitura de print e registro rápido por texto.
import { addTransaction, deleteTransaction, findDuplicate, getState, restoreTransactions, updateTransaction } from '../store.js';
import { flipAll, learnFlow, similarFlow, swapLabel } from '../learn.js';
import { markOwnTransfer } from '../transfers.js';
import { CLASSIFICATIONS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS, categorize, defaultClassification, getCategory } from '../categories.js';
import { analyzeInstallments } from '../finance.js';
import { cardLabel, parseQuickEntry, parseReceiptText, toISO } from '../parser.js';
import { analyzePurchase } from '../receipt.js';
import { openReader } from './reader.js';
import { openFileImport } from './arquivo.js';
import { dateBR, html, icon, money, moneyInput, openSheet, pct, readMoney, toast } from '../ui.js';

const INSTALLMENT_METHODS = ['credito', 'pix_parcelado', 'boleto'];

function knownCards() {
  return [...new Set(getState().transactions.map((t) => t.card).filter(Boolean))].slice(0, 12);
}
function knownDescriptions() {
  const seen = new Map();
  for (const t of getState().transactions) if (t.description && !seen.has(t.description)) seen.set(t.description, t);
  return [...seen.keys()].slice(-40);
}

const catChips = (type, selected) =>
  (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(
    (c) => html`<label class="chip cat-chip"><input type="radio" name="category" value="${c.id}" ${c.id === selected ? 'checked' : ''}><span><span aria-hidden="true">${c.icon}</span>${c.name}</span></label>`,
  );

function extractedBanner(x, engine) {
  if (!x) return '';
  const items = [
    x.merchant && ['pin', 'Onde', x.merchant + (x.location ? ` · ${x.location}` : '')],
    x.date && ['clock', 'Quando', `${dateBR(x.date)}${x.time ? ` às ${x.time}` : ''}`],
    !x.date && x.time && ['clock', 'Horário', x.time],
    x.card && (x.card.last4 || x.card.brand || x.card.bank) && ['card', 'Cartão', cardLabel(x.card)],
    x.method && ['wallet', 'Pagamento', `${PAYMENT_METHODS[x.method]}${x.app && !(x.card && x.card.bank) ? ` · ${x.app}` : ''}`],
    x.installments > 1 && ['calc', 'Parcelas', `${x.installments}x${x.installmentValue ? ` de ${money(x.installmentValue, { force: true })}` : ''}`],
    x.amount && ['bolt', 'Valor', money(x.amount, { force: true })],
  ].filter(Boolean);
  const missing = [!x.amount && 'valor', !x.date && 'data', !x.merchant && 'local'].filter(Boolean);
  return html`<div class="extracted">
    <p class="extracted-title">${icon('spark')} Lido do print ${engine ? html`<small>· ${engine.label}</small>` : ''}${x.confidence != null ? html` <span class="pill ${x.confidence >= 0.75 ? 'ok' : 'warn'}">${x.confidence >= 0.75 ? 'leitura confiável' : 'confira os dados'}</span>` : ''}</p>
    <ul>${items.map(([ic, k, v]) => html`<li>${icon(ic)}<span>${k}</span><b>${v}</b></li>`)}</ul>
    ${missing.length ? html`<p class="hint">Não encontrei: ${missing.join(', ')}. Preencha abaixo.</p>` : ''}
    ${x.note ? html`<p class="hint">${icon('info')} ${x.note}</p>` : ''}
  </div>`;
}

/**
 * Abre o formulário. prefill: campos do lançamento. editId: edição de um lançamento existente.
 */
export function openTxForm({ prefill = {}, editId = null, extracted = null, engine = null } = {}) {
  const state = getState();
  const editing = editId ? state.transactions.find((t) => t.id === editId) : null;
  const v = {
    type: 'expense',
    amount: '',
    description: '',
    category: null,
    classification: null,
    date: toISO(new Date()),
    time: '',
    method: 'pix',
    card: '',
    merchant: '',
    location: '',
    installments: 1,
    installmentValue: '',
    ...prefill,
    ...(editing ? { ...editing, installments: 1 } : {}),
  };
  if (!v.category) v.category = v.type === 'income' ? 'salario' : 'outros';
  if (!v.classification && v.type === 'expense') v.classification = defaultClassification(v.category);
  let userPickedCategory = Boolean(prefill.category || editing);
  const dupTx = !editing && extracted && v.amount ? findDuplicate({ type: v.type, amount: +v.amount, date: v.date, time: v.time }) : null;
  const group = editing && (editing.installment || editing.recurringId);

  const body = html`<form id="txf" class="form" novalidate>
    ${!editing ? html`<div class="form-shortcuts"><button type="button" class="btn ghost sm" data-print>${icon('camera')} Ler print da compra</button></div>` : ''}
    ${extractedBanner(extracted, engine)}
    ${dupTx ? html`<p class="status error">${icon('alert')}<span>Parece que você já registrou isso: <b>${dupTx.description}</b> em ${dateBR(dupTx.date)}${dupTx.time ? ` às ${dupTx.time}` : ''}. Salve só se for outra movimentação.</span></p>` : ''}
    <div class="seg" role="radiogroup" aria-label="Tipo">
      <label><input type="radio" name="type" value="expense" ${v.type === 'expense' && !v.internal ? 'checked' : ''}><span>${icon('arrowDown')} Gasto</span></label>
      <label><input type="radio" name="type" value="income" ${v.type === 'income' && !v.internal ? 'checked' : ''}><span>${icon('arrowUp')} Ganho</span></label>
      <label><input type="radio" name="type" value="transfer" ${v.internal ? 'checked' : ''}><span>↔ Entre contas</span></label>
    </div>
    <p class="hint" id="f-transfer-hint" ${v.internal ? '' : 'hidden'}>Dinheiro passando de uma conta sua para outra (ex.: Mercado Pago → Santander). Aparece no extrato, mas não conta como gasto nem ganho.</p>
    <label class="amount-field"><span class="sr-only">Valor</span><span class="cur">R$</span>
      <input id="f-amount" name="amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${moneyInput(v.amount)}" required>
    </label>
    ${editing?.installment ? html`<p class="hint">Parcela ${editing.installment.i} de ${editing.installment.n} · compra de ${money(editing.installment.cash, { force: true })}</p>` : ''}
    <p class="field-error" id="f-err" hidden></p>
    <label class="field"><span>Descrição</span><input id="f-desc" name="description" list="f-desc-list" autocomplete="off" placeholder="Ex.: Mercado, Uber, Salário" value="${v.description}"></label>
    <datalist id="f-desc-list">${knownDescriptions().map((d) => html`<option value="${d}"></option>`)}</datalist>
    <fieldset class="field" id="f-cat-wrap" ${v.internal ? 'hidden' : ''}><legend>Categoria</legend><div class="chips wrap" id="f-cats">${catChips(v.type, v.category)}</div></fieldset>
    <fieldset class="field" id="f-cls-wrap" ${v.type === 'income' || v.internal ? 'hidden' : ''}><legend>Classificação</legend>
      <div class="seg three" role="radiogroup">${Object.entries(CLASSIFICATIONS).map(([k, c]) => html`<label title="${c.hint}"><input type="radio" name="classification" value="${k}" ${v.classification === k ? 'checked' : ''}><span>${c.label}</span></label>`)}</div>
    </fieldset>
    <div class="row2">
      <label class="field"><span>Data</span><input id="f-date" type="date" name="date" value="${v.date}" required></label>
      <label class="field"><span>Horário</span><input id="f-time" type="time" name="time" value="${v.time || ''}"></label>
    </div>
    <fieldset class="field"><legend>Forma de pagamento</legend><div class="chips scroll" id="f-methods">${Object.entries(PAYMENT_METHODS).map(([k, label]) => html`<label class="chip"><input type="radio" name="method" value="${k}" ${v.method === k ? 'checked' : ''}><span>${label}</span></label>`)}</div></fieldset>
    <label class="field" id="f-card-wrap"><span>Cartão / conta</span><input id="f-card" name="card" list="f-card-list" autocomplete="off" placeholder="Ex.: Nubank · final 4321" value="${v.card}"></label>
    <datalist id="f-card-list">${knownCards().map((c) => html`<option value="${c}"></option>`)}</datalist>
    ${!editing
      ? html`<div class="row2" id="f-inst-wrap">
          <label class="field"><span>Parcelas</span><input id="f-inst" type="number" name="installments" min="1" max="72" inputmode="numeric" value="${v.installments || 1}"></label>
          <label class="field" id="f-pmt-wrap"><span>Valor da parcela</span><input id="f-pmt" name="installmentValue" inputmode="decimal" placeholder="sem juros" value="${moneyInput(v.installmentValue)}"></label>
        </div>
        <div id="f-juros" class="juros" hidden></div>
        <label class="check" id="f-rec-wrap"><input type="checkbox" id="f-rec" name="recurring"> <span>Repetir todo mês (conta fixa, salário)</span></label>`
      : ''}
    <details class="more" ${extracted || v.merchant ? 'open' : ''}><summary>Mais detalhes</summary>
      <div class="row2">
        <label class="field"><span>Estabelecimento</span><input id="f-merchant" name="merchant" value="${v.merchant || ''}" autocomplete="off"></label>
        <label class="field"><span>Local</span><input id="f-location" name="location" value="${v.location || ''}" autocomplete="off" placeholder="Cidade, bairro"></label>
      </div>
    </details>
    ${group ? html`<label class="check"><input type="checkbox" id="f-group"> <span>Aplicar descrição, categoria e cartão a todas as ${editing.installment ? 'parcelas' : 'repetições'}</span></label>` : ''}
    <div class="form-actions">
      ${editing ? html`<button type="button" class="btn danger ghost" data-del>${icon('trash')} Excluir</button>` : ''}
      <button type="submit" class="btn primary grow" id="f-submit">${editing ? 'Salvar alterações' : v.type === 'income' ? 'Salvar ganho' : 'Salvar gasto'}</button>
    </div>
  </form>`;

  openSheet({
    title: editing ? 'Editar lançamento' : 'Novo lançamento',
    body,
    onMount(sheet) {
      const f = sheet.body.querySelector('#txf');
      const $ = (s) => f.querySelector(s);
      const val = (name) => f.elements[name]?.value;
      const radio = (name) => f.querySelector(`input[name="${name}"]:checked`)?.value;

      const sync = () => {
        const type = radio('type');
        const method = radio('method');
        $('#f-cls-wrap').hidden = type !== 'expense';
        $('#f-cat-wrap').hidden = type === 'transfer';
        $('#f-transfer-hint').hidden = type !== 'transfer';
        $('#f-card-wrap').hidden = !['credito', 'debito', 'pix_parcelado'].includes(method) && !val('card');
        if ($('#f-inst-wrap')) {
          const canInstall = type === 'expense' && INSTALLMENT_METHODS.includes(method);
          $('#f-inst-wrap').hidden = !canInstall;
          const n = canInstall ? +val('installments') || 1 : 1;
          $('#f-pmt-wrap').hidden = n <= 1;
          $('#f-pmt').placeholder = method === 'pix_parcelado' ? 'com juros' : 'sem juros';
          $('#f-rec-wrap').hidden = n > 1;
          renderJuros(n, method);
        }
        $('#f-submit').textContent = editing ? 'Salvar alterações' : type === 'income' ? 'Salvar ganho' : type === 'transfer' ? 'Salvar transferência' : 'Salvar gasto';
      };

      const renderJuros = (n, method) => {
        const box = $('#f-juros');
        const cash = readMoney(val('amount'));
        const pmt = readMoney(val('installmentValue'));
        if (n <= 1 || !(cash > 0)) return (box.hidden = true);
        box.hidden = false;
        if (!(pmt > 0)) {
          box.innerHTML = String(html`<p>${n}x de <b>${money(cash / n, { force: true })}</b> sem juros. ${method === 'pix_parcelado' ? 'No Pix parcelado quase sempre há juros: informe o valor da parcela para ver quanto.' : 'Se houver juros, informe o valor da parcela.'}</p>`);
          return;
        }
        const a = analyzeInstallments({ cashPrice: cash, installment: pmt, n, investRate: getState().settings.savingsRate });
        box.innerHTML = String(
          a.interest > 0
            ? html`<p class="juros-head">${icon('alert')} Juros de <b>${money(a.interest, { force: true })}</b> (${pct(a.interestPct, 1)} a mais)</p>
              <dl><div><dt>Taxa ao mês</dt><dd>${pct(a.rate, 2)}</dd></div><div><dt>Taxa ao ano</dt><dd>${pct(a.annualRate, 1)}</dd></div><div><dt>Total pago</dt><dd>${money(a.total, { force: true })}</dd></div></dl>
              <p class="hint">${a.worthIt ? 'Seu dinheiro rendendo no cofrinho cobriria esses juros: parcelar pode compensar.' : 'Esses juros são maiores do que seu dinheiro renderia guardado: se tiver o valor, pagar à vista sai mais barato.'}</p>`
            : html`<p>${icon('check')} Sem juros: ${n}x de ${money(pmt, { force: true })}.</p>`,
        );
      };

      const setCategory = (id) => {
        const input = f.querySelector(`input[name="category"][value="${id}"]`);
        if (input) input.checked = true;
        if (radio('type') === 'expense') {
          const cls = f.querySelector(`input[name="classification"][value="${defaultClassification(id)}"]`);
          if (cls) cls.checked = true;
        }
      };

      f.addEventListener('change', (e) => {
        if (e.target.name === 'type' && radio('type') === 'transfer') {
          if (!val('description') || val('description') === getCategory(radio('category')).name) f.elements.description.value = 'Transferência entre contas';
        } else if (e.target.name === 'type') {
          const type = radio('type');
          f.elements.description.value = swapLabel(val('description'), type);
          $('#f-cats').innerHTML = String(html`${catChips(type, type === 'income' ? 'salario' : 'outros')}`);
          userPickedCategory = false;
          const guess = categorize(val('description'), type);
          if (guess) setCategory(guess);
        }
        if (e.target.name === 'category') {
          userPickedCategory = true;
          setCategory(e.target.value);
        }
        sync();
      });
      f.addEventListener('input', (e) => {
        if (e.target.id === 'f-desc' && !userPickedCategory) {
          const guess = categorize(e.target.value, radio('type'));
          if (guess) setCategory(guess);
        }
        if (['f-amount', 'f-pmt', 'f-inst'].includes(e.target.id)) sync();
      });
      f.querySelector('[data-print]')?.addEventListener('click', () => {
        sheet.close();
        openPrintSheet();
      });
      f.querySelector('[data-del]')?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        if (group && !btn.dataset.armed) {
          btn.dataset.armed = '1';
          btn.insertAdjacentHTML(
            'afterend',
            String(html`<div class="confirm-row"><button type="button" class="btn danger sm" data-del-one>Só esta</button><button type="button" class="btn danger sm" data-del-future>Esta e as próximas</button></div>`),
          );
          f.querySelector('[data-del-one]').onclick = () => doDelete(false);
          f.querySelector('[data-del-future]').onclick = () => doDelete(true);
          return;
        }
        if (!group) {
          if (!btn.dataset.armed) {
            btn.dataset.armed = '1';
            btn.innerHTML = 'Toque de novo para excluir';
            return;
          }
          doDelete(false);
        }
      });
      const doDelete = (all) => {
        const removed = deleteTransaction(editId, { wholeGroup: all, futureOnly: true });
        sheet.close();
        toast(removed.length > 1 ? `${removed.length} lançamentos excluídos` : 'Lançamento excluído', { action: 'Desfazer', onAction: () => restoreTransactions(removed) });
      };

      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const amount = readMoney(val('amount'));
        const err = $('#f-err');
        if (!(amount > 0)) {
          err.hidden = false;
          err.textContent = 'Informe um valor maior que zero.';
          $('#f-amount').focus();
          return;
        }
        if (!val('date')) {
          err.hidden = false;
          err.textContent = 'Escolha a data.';
          return;
        }
        // "Entre contas" guarda o lado original (saiu/entrou) e marca como interna
        const internal = radio('type') === 'transfer';
        const type = internal ? editing?.type || 'expense' : radio('type');
        const method = radio('method');
        const category = radio('category') || (type === 'income' ? 'outros-ganhos' : 'outros');
        const n = !internal && type === 'expense' && INSTALLMENT_METHODS.includes(method) ? Math.max(1, Math.min(72, Math.floor(+val('installments') || 1))) : 1;
        const pmt = readMoney(val('installmentValue'));
        const draft = {
          type,
          amount,
          description: val('description') || getCategory(category).name,
          category,
          classification: type === 'expense' ? radio('classification') : null,
          date: val('date'),
          time: val('time'),
          method,
          card: val('card')?.trim() || '',
          merchant: val('merchant')?.trim() || '',
          location: val('location')?.trim() || '',
          internal,
        };
        if (editing) {
          const { amount: _a, ...rest } = draft;
          const before = { ...editing }; // updateTransaction altera o próprio objeto
          updateTransaction(editId, { ...rest, amount }, { wholeGroup: f.querySelector('#f-group')?.checked });
          sheet.close();
          if (draft.internal && !before.internal) {
            // lembra seu nome e marca a outra ponta (o Pix que saiu de um app e entrou no outro)
            const pair = markOwnTransfer({ ...before, ...draft, id: editId });
            return toast(pair ? 'Marcado como transferência entre suas contas, junto com a outra ponta. Não conta mais como gasto nem ganho.' : 'Marcado como transferência entre suas contas. Não conta mais como gasto nem ganho.');
          }
          // corrigiu receita/despesa de uma notificação: aprende e oferece corrigir as parecidas
          if (before.source === 'notificacao' && before.type !== type) {
            learnFlow(before, type);
            const similar = similarFlow(before, before.type);
            const label = type === 'income' ? 'receita' : 'despesa';
            if (similar.length) {
              return toast(`Corrigido. As próximas notificações iguais entram como ${label}. Há mais ${similar.length} parecida${similar.length > 1 ? 's' : ''} como ${before.type === 'income' ? 'receita' : 'despesa'}.`, {
                action: `Corrigir ${similar.length > 1 ? 'todas' : ''}`.trim(),
                onAction: () => {
                  flipAll(similar, type);
                  toast(`${similar.length} lançamento${similar.length > 1 ? 's' : ''} corrigido${similar.length > 1 ? 's' : ''} para ${label}`);
                },
                timeout: 15000,
              });
            }
            return toast(`Corrigido. As próximas notificações iguais entram como ${label}.`);
          }
          toast('Lançamento atualizado');
          return;
        }
        const ids = addTransaction({ ...draft, installments: n, installmentValue: n > 1 && pmt > 0 ? pmt : null, recurring: n === 1 && f.querySelector('#f-rec')?.checked, source: extracted ? 'print' : 'manual' });
        sheet.close();
        const what = internal ? 'Transferência' : type === 'income' ? 'Ganho' : 'Gasto';
        toast(n > 1 ? `${what} salvo em ${n} parcelas` : ids.length > 1 ? `${what} salvo para os próximos 12 meses` : `${what} de ${money(amount, { force: true })} salvo`, {
          action: 'Desfazer',
          onAction: () => ids.forEach((id) => deleteTransaction(id)),
        });
      });
      sync();
      if (!editing && !extracted) requestAnimationFrame(() => $('#f-amount').focus());
    },
  });
}

/** Converte o resultado da leitura em pré-preenchimento do formulário. */
export function prefillFromExtract(x) {
  const type = x.type || 'expense';
  const category = x.category || categorize(`${x.merchant || ''} ${x.description || ''}`, type) || (type === 'income' ? 'outros-ganhos' : 'outros');
  const method = x.method || (x.installments > 1 ? 'credito' : x.card ? 'credito' : 'pix');
  return {
    type,
    amount: x.amount || '',
    description: x.description ? (/^(Pix|Transferência) (para|de) /.test(x.description) ? x.description : tidy(x.description)) : '',
    category,
    classification: x.classification || (type === 'expense' ? defaultClassification(category) : null),
    date: x.date || toISO(new Date()),
    time: x.time || '',
    method,
    card: x.card && (x.card.last4 || x.card.brand || x.card.bank) ? cardLabel(x.card) : x.app || '',
    merchant: x.merchant || '',
    location: x.location || '',
    installments: x.installments || 1,
    installmentValue: x.installments > 1 && x.installmentValue && Math.abs(x.installmentValue * x.installments - x.amount) > 0.05 ? x.installmentValue : '',
  };
}

// "PADARIA DOCE PAO LTDA" -> "Padaria Doce Pao"
const tidy = (s) =>
  String(s)
    .replace(/\b(ltda|me|eireli|s\.?a\.?|epp)\b\.?/gi, '')
    .replace(/[*_]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/** Folha para enviar um print (ou colar o texto) de uma compra. `file`/`text` vêm do compartilhamento do celular. */
export function openPrintSheet({ file, text } = {}) {
  openReader({
    title: 'Ler print da compra',
    dropTitle: 'Escolher print da compra',
    dropText: 'Notificação do banco, Mercado Pago, 99, comprovante Pix, nota fiscal ou fatura.',
    textLabel: 'Texto da notificação ou comprovante',
    textPlaceholder: 'Ex.: Você enviou um Pix de R$ 50,00 para Maria Souza',
    initialFile: file,
    initialText: text,
    analyze: analyzePurchase,
    parseText: (t) => {
      const data = parseReceiptText(t);
      return data.amount ? { data, engine: { label: 'texto colado' } } : { error: 'Não achei o valor nesse texto. Confira se ele tem algo como "R$ 52,30".' };
    },
    footer: html`<button type="button" class="btn ghost" data-docs>${icon('upload')} É PDF, DOCX ou fatura? Importar arquivo</button>`,
    onMount(sheet) {
      sheet.body.querySelector('[data-docs]').addEventListener('click', () => {
        sheet.close();
        openFileImport({ mode: 'fatura' });
      });
    },
    onResult({ data, engine }, sheet) {
      sheet.close();
      openTxForm({ prefill: prefillFromExtract(data), extracted: data, engine });
    },
  });
}

/** Registro rápido: interpreta o texto e salva na hora. */
export function quickSave(text) {
  const p = parseQuickEntry(text);
  if (!(p.amount > 0)) return { ok: false, message: 'Não encontrei o valor. Ex.: "almoço 32,90 débito"' };
  const ids = addTransaction({ ...p, description: p.description || getCategory(p.category).name, classification: p.type === 'expense' ? defaultClassification(p.category) : null, source: 'rapido' });
  toast(`${p.type === 'income' ? 'Ganho' : 'Gasto'} de ${money(p.amount, { force: true })} em ${getCategory(p.category).name}`, {
    action: 'Editar',
    onAction: () => openTxForm({ editId: ids[0] }),
  });
  return { ok: true, ids };
}

export function quickPreview(text) {
  const p = parseQuickEntry(text);
  if (!text.trim()) return '';
  const c = getCategory(p.category);
  return html`<span class="pill ${p.type === 'income' ? 'ok' : ''}">${p.type === 'income' ? 'Ganho' : 'Gasto'}</span>
    <span class="pill">${p.amount > 0 ? money(p.amount, { force: true }) : 'sem valor'}</span>
    <span class="pill">${c.icon} ${c.name}</span>
    <span class="pill">${PAYMENT_METHODS[p.method]}</span>
    ${p.installments > 1 ? html`<span class="pill">${p.installments}x</span>` : ''}
    <span class="pill">${dateBR(p.date)}</span>`;
}

