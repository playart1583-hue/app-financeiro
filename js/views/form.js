// Formulário de lançamento (gasto/ganho), leitura de print e registro rápido por texto.
import { addTransaction, deleteTransaction, findDuplicate, getState, restoreTransactions, setDueDates, updateTransaction } from '../store.js';
import { addMonthsISO } from '../analytics.js';
import { markOwnTransfer } from '../transfers.js';
import { alignCreditToDue, cardInfo, cardText, cycleText, dueFor, findKnownLast4, knownLast4, rememberCard, saveCard, splitCard, undoAlign } from '../cards.js';
import { CLASSIFICATIONS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS, categorize, defaultClassification, getCategory } from '../categories.js';
import { analyzeInstallments } from '../finance.js';
import { cardLabel, parseQuickEntry, parseReceiptText, toISO } from '../parser.js';
import { analyzePurchase } from '../receipt.js';
import { openReader } from './reader.js';
import { openFileImport, reviewMovements } from './arquivo.js';
import { finishMovement } from '../importers.js';
import { dateBR, html, icon, money, moneyInput, openSheet, pct, readMoney, toast } from '../ui.js';

const INSTALLMENT_METHODS = ['credito', 'pix_parcelado', 'boleto'];

function knownBanks() {
  return [...new Set([...Object.values(getState().settings.cards || {}).map((c) => c.bank), ...getState().transactions.map((t) => splitCard(t.card).bank)].filter(Boolean))].slice(0, 12);
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
  // editando compra já no mês do vencimento: "Data" mostra a data da compra e o vencimento vem preenchido
  if (editing?.purchaseDate) {
    v.date = editing.purchaseDate;
    v.firstDue = addMonthsISO(editing.date, -((editing.installment?.i || 1) - 1));
  }
  // cartão em dois campos: final (8238) e banco/conta
  const split = splitCard(v.card);
  v.last4 = v.last4 || split.last4;
  v.bank = v.bank ?? split.bank;
  if (v.last4 && !v.bank) v.bank = cardInfo(v.last4)?.bank || '';
  if (!v.classification && v.type === 'expense') v.classification = defaultClassification(v.category);
  let userPickedCategory = Boolean(prefill.category || editing);
  const dupTx = !editing && extracted && v.amount ? findDuplicate({ type: v.type, amount: +v.amount, date: v.date, time: v.time }) : null;
  const group = editing && (editing.installment || editing.recurringId);

  const body = html`<form id="txf" class="form" novalidate>
    ${!editing ? html`<div class="form-shortcuts"><button type="button" class="btn ghost sm" data-print>${icon('camera')} Ler print da compra</button></div>` : ''}
    ${extractedBanner(extracted, engine)}
    ${dupTx ? html`<p class="status error">${icon('alert')}<span>Parece que você já registrou isso: <b>${dupTx.description}</b> em ${dateBR(dupTx.date)}${dupTx.time ? ` às ${dupTx.time}` : ''}. Salve só se for outra movimentação.</span></p>` : ''}
    <div class="seg three type-seg" role="radiogroup" aria-label="Tipo">
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
    <div class="row2" id="f-card-wrap">
      <label class="field"><span>Final do cartão</span><input id="f-last4" name="last4" inputmode="numeric" maxlength="4" autocomplete="off" list="f-last4-list" placeholder="Ex.: 8238" value="${v.last4 || ''}"></label>
      <label class="field"><span>Banco / conta</span><input id="f-bank" name="bank" list="f-bank-list" autocomplete="off" placeholder="Ex.: Nubank" value="${v.bank || ''}"></label>
    </div>
    <datalist id="f-last4-list">${knownLast4().map((c) => html`<option value="${c}">${cardInfo(c)?.bank || ''}</option>`)}</datalist>
    <datalist id="f-bank-list">${knownBanks().map((c) => html`<option value="${c}"></option>`)}</datalist>
    ${!editing
      ? html`<div class="row2" id="f-inst-wrap">
          <label class="field"><span>Parcelas</span><input id="f-inst" type="number" name="installments" min="1" max="72" inputmode="numeric" value="${v.installments || 1}"></label>
          <label class="field" id="f-pmt-wrap"><span>Valor da parcela</span><input id="f-pmt" name="installmentValue" inputmode="decimal" placeholder="sem juros" value="${moneyInput(v.installmentValue)}"></label>
        </div>
        <div id="f-juros" class="juros" hidden></div>
        <label class="check" id="f-rec-wrap"><input type="checkbox" id="f-rec" name="recurring"> <span>Repetir todo mês (conta fixa, salário)</span></label>`
      : ''}
    <label class="field" id="f-due-wrap" hidden><span id="f-due-label">Vencimento da 1ª parcela</span><input id="f-due" type="date" name="firstDue" value="${v.firstDue || ''}"><small class="hint"><span id="f-cycle"></span><span id="f-due-hint">As próximas parcelas entram nos meses seguintes, no mesmo dia.</span></small></label>
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
        $('#f-card-wrap').hidden = !['credito', 'debito', 'pix_parcelado'].includes(method) && !val('last4') && !val('bank');
        if ($('#f-inst-wrap')) {
          const canInstall = type === 'expense' && INSTALLMENT_METHODS.includes(method);
          $('#f-inst-wrap').hidden = !canInstall;
          const n = canInstall ? +val('installments') || 1 : 1;
          $('#f-pmt-wrap').hidden = n <= 1;
          // crédito (à vista ou parcelado) e parcelados: o lançamento vai para o vencimento da fatura
          const withDue = canInstall && (n > 1 || method === 'credito');
          $('#f-due-wrap').hidden = !withDue;
          $('#f-due-label').textContent = n > 1 ? 'Vencimento da 1ª parcela' : 'Vencimento da fatura';
          $('#f-due-hint').textContent = n > 1 ? 'As próximas parcelas entram nos meses seguintes, no mesmo dia.' : 'A compra entra no mês em que a fatura vence.';
          if (withDue) autoDue();
          $('#f-pmt').placeholder = method === 'pix_parcelado' ? 'com juros' : 'sem juros';
          $('#f-rec-wrap').hidden = n > 1;
          renderJuros(n, method);
        } else {
          // editando: compra no crédito mostra o vencimento (da fatura, ou da 1ª parcela se for parcelada)
          const withDue = type === 'expense' && method === 'credito';
          const group = Boolean(editing?.installment);
          $('#f-due-wrap').hidden = !withDue;
          $('#f-due-label').textContent = group ? 'Vencimento da 1ª parcela' : 'Vencimento da fatura';
          $('#f-due-hint').textContent = group ? 'Todas as parcelas mudam junto: cada uma no mês seguinte, no mesmo dia.' : 'A compra fica no mês em que a fatura vence.';
          if (withDue) autoDue();
        }
        $('#f-submit').textContent = editing ? 'Salvar alterações' : type === 'income' ? 'Salvar ganho' : type === 'transfer' ? 'Salvar transferência' : 'Salvar gasto';
      };

      // vencimento: vem do cartão cadastrado (dia da fatura); muda junto com a data enquanto você não mexer nele
      let dueTouched = Boolean(v.firstDue);
      const autoDue = () => {
        const due = $('#f-due');
        if (!due || dueTouched) return;
        const info = cardInfo(val('last4'));
        $('#f-cycle').textContent = cycleText(info) ? `Cartão ${val('last4')}: ${cycleText(info)}. ` : '';
        due.value = dueFor(val('date'), info);
      };
      f.querySelector('#f-due')?.addEventListener('input', () => (dueTouched = true));
      f.querySelector('#f-last4').addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
        const info = cardInfo(e.target.value);
        if (info?.bank && !val('bank')) f.elements.bank.value = info.bank;
        autoDue();
      });
      f.querySelector('#f-date').addEventListener('change', autoDue);

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
          card: cardText(val('last4'), val('bank')?.trim()),
          last4: val('last4') || '',
          merchant: val('merchant')?.trim() || '',
          location: val('location')?.trim() || '',
          internal,
        };
        if (editing) {
          const { amount: _a, ...rest } = draft;
          const before = { ...editing }; // updateTransaction altera o próprio objeto
          updateTransaction(editId, { ...rest, amount }, { wholeGroup: f.querySelector('#f-group')?.checked });
          // vencimento escrito (ou vindo do cartão): a compra e suas parcelas vão para os meses em que vencem
          const due = type === 'expense' && method === 'credito' && !internal ? val('firstDue') || '' : '';
          // data da compra: a que está no campo (parcela k sem vencimento ainda: volta k-1 meses até a compra)
          const purchase = before.purchaseDate ? draft.date : addMonthsISO(draft.date, -((before.installment?.i || 1) - 1));
          setDueDates(editId, { purchaseDate: purchase, firstDue: due });
          if (due) rememberCard(draft.last4, { bank: val('bank')?.trim(), due });
          sheet.close();
          if (due && due !== before.date && !before.purchaseDate) return toast(`Lançamento atualizado e levado para o vencimento (${dateBR(due)})`);
          if (draft.internal && !before.internal) {
            // lembra seu nome e marca a outra ponta (o Pix que saiu de um app e entrou no outro)
            const pair = markOwnTransfer({ ...before, ...draft, id: editId });
            return toast(pair ? 'Marcado como transferência entre suas contas, junto com a outra ponta. Não conta mais como gasto nem ganho.' : 'Marcado como transferência entre suas contas. Não conta mais como gasto nem ganho.');
          }
          // colocou o cartão numa compra no crédito: vai para o mês em que a fatura vence
          const moved = alignCreditToDue();
          if (moved.length) return toast(`Lançamento atualizado e levado para o vencimento da fatura (${dateBR(moved[0].to)})`, { action: 'Desfazer', onAction: () => undoAlign(moved) });
          toast('Lançamento atualizado');
          return;
        }
        const firstDue = !internal && type === 'expense' && (n > 1 || method === 'credito') ? val('firstDue') || '' : '';
        rememberCard(draft.last4, { bank: val('bank')?.trim(), due: firstDue });
        const ids = addTransaction({ ...draft, firstDue, installments: n, installmentValue: n > 1 && pmt > 0 ? pmt : null, recurring: n === 1 && f.querySelector('#f-rec')?.checked, source: extracted ? 'print' : 'manual' });
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
    last4: x.card?.last4 || findKnownLast4(x.rawText),
    bank: x.card && (x.card.bank || x.card.brand) ? [x.card.bank, x.card.brand].filter(Boolean).join(' · ') : x.app || '',
    merchant: x.merchant || '',
    location: x.location || '',
    installments: x.installments || 1,
    installmentValue: x.installments > 1 && x.installmentValue && Math.abs(x.installmentValue * x.installments - x.amount) > 0.05 ? x.installmentValue : '',
  };
}

/** "Pix de Maria" <-> "Pix para Maria" ao trocar entre ganho e gasto. */
const swapLabel = (description, type) => String(description || '').replace(/^(Pix|Transferência) (de|para) /, (_, what) => `${what} ${type === 'income' ? 'de' : 'para'} `);

// "PADARIA DOCE PAO LTDA" -> "Padaria Doce Pao"
const tidy = (s) =>
  String(s)
    .replace(/\b(ltda|me|eireli|s\.?a\.?|epp)\b\.?/gi, '')
    .replace(/[*_]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/** Folha para enviar um print (ou colar o texto) de uma compra. `file`/`text` vêm do compartilhamento do celular. */
export function openPrintSheet({ file, files, text } = {}) {
  openReader({
    title: 'Ler prints de compras',
    dropTitle: 'Escolher prints',
    dropText: 'Comprovante Pix, nota fiscal, recibo ou tela da compra.',
    initialFiles: files,
    textLabel: 'Texto do comprovante',
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
      // registra sozinho; só abre o formulário se faltar o valor, se parecer repetido ou se você desligou isso em Ajustes
      if (autoSave()) {
        const r = saveFromPrint(data);
        if (r.saved) return announceSaved([r]);
      }
      openTxForm({ prefill: prefillFromExtract(data), extracted: data, engine });
    },
    // vários prints: registra cada um sozinho (ou numa lista para conferir, se o registro automático estiver desligado)
    onMany(results, sheet) {
      if (autoSave()) {
        sheet.close();
        const saved = results.map(({ data }) => saveFromPrint(data));
        return announceSaved(saved);
      }
      const movements = results.map(({ data }) => purchaseMovement(data)).filter((m) => m.amount > 0);
      if (!movements.length) return sheet.status('Não achei valores nesses prints.', 'error');
      reviewMovements({ label: `${results.length} prints · ${results[0].engine?.label || ''}`, movements }, sheet);
    },
  });
}

const autoSave = () => getState().settings.autoSavePrints !== false;

/**
 * Salva direto o que foi lido de um print: valor, data, parcelas, cartão (final + banco cadastrado) e,
 * no crédito com o cartão cadastrado, o mês em que a fatura vence. Repetido ou sem valor não salva.
 */
export function saveFromPrint(data) {
  const p = prefillFromExtract(data);
  const amount = +p.amount;
  if (!(amount > 0)) return { saved: false, reason: 'sem valor', data };
  const info = cardInfo(p.last4);
  const n = p.type === 'expense' && INSTALLMENT_METHODS.includes(p.method) ? Math.max(1, Math.min(72, p.installments || 1)) : 1;
  const draft = {
    ...p,
    amount,
    description: p.description || p.merchant || getCategory(p.category).name,
    card: p.last4 ? cardText(p.last4, info?.bank || p.bank) : p.card,
    firstDue: p.type === 'expense' && (n > 1 || p.method === 'credito') ? dueFor(p.date, info) : '',
    installments: n,
    installmentValue: n > 1 && p.installmentValue > 0 ? +p.installmentValue : null,
    source: 'print',
  };
  if (findDuplicate({ type: draft.type, amount: n > 1 ? draft.installmentValue || amount / n : amount, date: draft.date, time: draft.time, installment: n > 1 ? { i: 1, n } : null, last4: draft.last4, description: draft.description }))
    return { saved: false, reason: 'repetido', data, draft };
  rememberCard(draft.last4, { bank: info?.bank ? '' : p.bank });
  return { saved: true, ids: addTransaction(draft), draft, known: Boolean(info?.dueDay) };
}

/** Aviso do que foi registrado, com Desfazer; o que não deu para salvar abre para você completar. */
function announceSaved(results) {
  const ok = results.filter((r) => r.saved);
  const left = results.filter((r) => !r.saved);
  const ids = ok.flatMap((r) => r.ids);
  if (ok.length) {
    const d = ok[0].draft;
    const one = `${d.description} · ${money(d.amount, { force: true })}${d.installments > 1 ? ` em ${d.installments}x` : ''}${d.last4 ? ` · cartão ${d.last4}` : ''}${d.firstDue ? ` · vence ${dateBR(d.firstDue)}` : ''}`;
    const unknown = ok.find((r) => r.draft.last4 && r.draft.method === 'credito' && !r.known);
    const tip = '';
    toast(`${ok.length === 1 ? `Registrado: ${one}` : `${ok.length} lançamentos registrados`}${left.length ? ` · ${left.length} não registrado${left.length > 1 ? 's' : ''}` : ''}.${tip}`, {
      action: 'Desfazer',
      onAction: () => ids.forEach((id) => deleteTransaction(id)),
      timeout: tip ? 12000 : 8000,
    });
  }
  // cartão lido no print sem fechamento/vencimento: pergunta agora e já leva a compra para o mês da fatura
  const unknownCard = ok.find((r) => r.draft.last4 && r.draft.method === 'credito' && !r.known);
  if (unknownCard && !left.length) return openCardCycle(unknownCard.draft.last4, cardInfo(unknownCard.draft.last4)?.bank || unknownCard.draft.bank);
  // repetido ou sem valor: abre o primeiro para você decidir (os outros ficam no aviso)
  const first = left[0];
  if (first) openTxForm({ prefill: prefillFromExtract(first.data), extracted: first.data, engine: { label: first.reason === 'repetido' ? 'print (parece repetido)' : 'print' } });
  else if (!ok.length) toast('Não achei valores nesses prints.');
}

/** Pergunta o fechamento e o vencimento de um cartão novo e move as compras dele para o mês da fatura. */
export function openCardCycle(last4, bank = '') {
  openSheet({
    title: `Cartão ${last4}`,
    body: html`<form class="form" id="cyclef">
      <p class="hint">Li no print uma compra no crédito com o cartão final <b>${last4}</b>. Em que dia a fatura dele fecha e em que dia vence? Assim a compra vai para o mês em que você paga, e as próximas desse cartão também.</p>
      <label class="field"><span>Banco</span><input name="bank" value="${bank || ''}" placeholder="Ex.: Nubank"></label>
      <div class="row2">
        <label class="field"><span>Fatura fecha dia</span><input name="closeDay" type="number" min="1" max="31" inputmode="numeric" placeholder="Ex.: 28" required></label>
        <label class="field"><span>Vence dia</span><input name="dueDay" type="number" min="1" max="31" inputmode="numeric" placeholder="Ex.: 5" required></label>
      </div>
      <div class="form-actions"><button type="button" class="btn ghost" data-close>Agora não</button><button type="submit" class="btn primary grow">Salvar cartão</button></div>
    </form>`,
    onMount(sheet) {
      const f = sheet.body.querySelector('#cyclef');
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        saveCard(last4, { bank: f.bank.value, closeDay: f.closeDay.value, dueDay: f.dueDay.value });
        sheet.close();
        const moved = alignCreditToDue();
        toast(moved.length ? `Cartão ${last4} salvo. ${moved.length} lançamento${moved.length > 1 ? 's foram' : ' foi'} para o mês do vencimento (${dateBR(moved[0].to)}).` : `Cartão ${last4} salvo`, moved.length ? { action: 'Desfazer', onAction: () => undoAlign(moved), timeout: 10000 } : {});
      });
    },
  });
}

/** Compra lida de um print -> linha da lista de conferência (parcelada: o valor da 1ª parcela). */
function purchaseMovement(d) {
  const n = d.installments > 1 ? d.installments : 1;
  const value = n > 1 ? d.installmentValue || (d.amount || 0) / n : d.amount || 0;
  const m = finishMovement({ date: d.date || toISO(new Date()), time: d.time || '', description: d.description || d.merchant || 'Compra', signed: d.type === 'income' ? value : -value, type: d.type || 'expense' });
  return { ...m, amount: Math.round(m.amount * 100) / 100, category: d.category || m.category, method: d.method || (n > 1 ? 'credito' : null), card: d.card && (d.card.last4 || d.card.brand || d.card.bank) ? cardLabel(d.card) : '', last4: d.card?.last4 || findKnownLast4(d.rawText), installment: n > 1 ? { i: 1, n } : m.installment };
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

