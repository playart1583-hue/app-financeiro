import { addMonths, averages, debtsForPlan, interestCommitments, keyOf, loanBalance, loanDueDates, loanIsOpen, loanMonthly } from '../analytics.js';
import { monthlyToAnnual, pricePayment, rateFromInstallments, simulateExtraPayment, simulatePayoff } from '../finance.js';
import { parseSerasaText, toISO } from '../parser.js';
import { analyzeSerasa } from '../receipt.js';
import { openReader } from './reader.js';
import { addLoan, amortizeLoan, deleteLoan, negotiateLoan, payLoan, payoffInstallments } from '../store.js';
import { openLoanContract } from './emprestimo.js';
import { dateBR, emptyState, html, icon, money, moneyInput, monthName, openSheet, pct, progress, readMoney, toast } from '../ui.js';

const KINDS = { emprestimo: 'Empréstimo pessoal', consignado: 'Consignado', financiamento: 'Financiamento', pix_parcelado: 'Pix parcelado', cartao: 'Cartão de crédito', cheque: 'Cheque especial', acordo: 'Acordo', serasa: 'Negativada', outro: 'Outro' };
const STRATEGIES = {
  'nome-limpo': { label: 'Nome limpo primeiro', why: 'Quita primeiro as dívidas negativadas com desconto (da menor oferta para a maior) e depois ataca os juros mais altos.' },
  avalanche: { label: 'Avalanche (maior juros)', why: 'Paga primeiro a dívida com a maior taxa. É a que gasta menos com juros.' },
  'bola-de-neve': { label: 'Bola de neve (menor saldo)', why: 'Paga primeiro a menor dívida. Você elimina dívidas mais rápido e ganha ânimo.' },
};

const months = (n) => (Number.isFinite(n) ? `${n} ${n === 1 ? 'mês' : 'meses'}` : 'não quita');
const monthAt = (k) => monthName(addMonths(keyOf(new Date()), k), true);

function loanCard(l) {
  const bal = loanBalance(l);
  const open = bal > 0.005;
  if (l.mode === 'acordo') {
    const disc = l.offer && l.balance ? 1 - l.offer / l.balance : 0;
    return html`<article class="card debt ${open ? '' : 'closed'}">
      <div class="debt-head"><span class="debt-ic neg">${icon('alert')}</span><div class="grow"><h3>${l.name}</h3><small>${l.creditor && l.creditor !== l.name ? `${l.creditor} · ` : ''}${l.since ? `desde ${dateBR(l.since)}` : 'negativada'}</small></div><b class="expense">${money(l.balance)}</b></div>
      ${open
        ? html`${l.offer ? html`<p class="offer">Oferta à vista: <b>${money(l.offer)}</b> <span class="pill ok">${pct(disc)} de desconto</span></p>` : html`<p class="hint">Sem oferta registrada. Consulte o app Serasa ou o credor.</p>`}
          ${l.offerInstallments ? html`<p class="hint">ou ${l.offerInstallments.n}x de ${money(l.offerInstallments.pmt)} (${money(l.offerInstallments.n * l.offerInstallments.pmt)} no total)</p>` : ''}
          <div class="goal-actions">
            <button type="button" class="btn primary sm" data-act="pay" data-id="${l.id}">${icon('check')} ${l.offer ? `Quitei por ${money(l.offer, { force: true })}` : 'Marcar como quitada'}</button>
            <button type="button" class="btn ghost sm" data-act="negotiate" data-id="${l.id}">Fechei acordo parcelado</button>
            <button type="button" class="icon-btn" data-act="del" data-id="${l.id}" aria-label="Excluir dívida">${icon('trash')}</button>
          </div>`
        : html`<p class="pill ok">${icon('check')} Quitada</p>`}
    </article>`;
  }
  const isParc = l.mode === 'parcelado';
  const next = isParc ? loanDueDates(l)[0] : null;
  return html`<article class="card debt ${open ? '' : 'closed'}">
    <div class="debt-head"><span class="debt-ic">${icon(l.kind === 'cartao' ? 'card' : 'bank')}</span><div class="grow"><h3>${l.name}</h3><small>${KINDS[l.kind] || 'Dívida'} · ${pct(l.rate, 2)} a.m. (${pct(monthlyToAnnual(l.rate), 0)} a.a.)</small></div><b>${money(bal)}</b></div>
    ${isParc
      ? html`${progress(l.paid, l.n)}<div class="row-between"><small>${l.paid} de ${l.n} parcelas pagas</small><small>parcela ${money(l.pmt)}</small></div>
        ${open && next ? html`<p class="hint">Próxima: ${dateBR(next.date)}${next.date < toISO(new Date()) ? html` <span class="pill bad">atrasada</span>` : ''}</p>` : ''}`
      : html`<div class="row-between"><small>Pagamento mínimo ${money(l.minPayment)}</small><small class="${l.minPayment <= bal * l.rate ? 'expense' : ''}">juros do mês ≈ ${money(bal * l.rate)}</small></div>
        ${l.minPayment <= bal * l.rate && open ? html`<p class="hint">${icon('alert')} O mínimo não cobre os juros: essa dívida só cresce. Priorize ou troque por crédito mais barato.</p>` : ''}`}
    ${open
      ? html`<div class="goal-actions">
          <button type="button" class="btn primary sm" data-act="pay" data-id="${l.id}">${icon('check')} ${isParc ? 'Paguei a parcela' : 'Registrar pagamento'}</button>
          ${isParc ? html`<button type="button" class="btn ghost sm" data-act="amortize" data-id="${l.id}">Simular amortização</button>` : ''}
          <button type="button" class="icon-btn" data-act="del" data-id="${l.id}" aria-label="Excluir dívida">${icon('trash')}</button>
        </div>`
      : html`<p class="pill ok">${icon('check')} Quitada</p>`}
  </article>`;
}

const KIND_LABEL = { pix_parcelado: 'Pix parcelado', cartao_parcelado: 'Cartão parcelado', parcelamento: 'Parcelamento', ...KINDS };

function earlyPayoff(state) {
  const all = interestCommitments(state, new Date());
  const paid = all.filter((c) => !c.interestFree && c.savings > 1);
  const free = all.filter((c) => c.interestFree);
  if (!paid.length && !free.length) return '';
  return html`<section class="card">
    <h2 class="card-title">${icon('bolt')} Encerre primeiro para pagar menos juros</h2>
    <p class="hint">Do mais caro para o mais barato. Ao quitar antes, os juros das parcelas futuras são descontados (Código de Defesa do Consumidor, art. 52): peça ao credor o valor de quitação antecipada.</p>
    <ol class="payoff-list">${paid.map(
      (c, i) => html`<li class="payoff ${i === 0 ? 'first' : ''}">
        <div class="row-between"><b>${i + 1}. ${c.name}</b><span class="pill ${c.rate >= 0.05 ? 'bad' : 'warn'}">${pct(c.rate, 1)} a.m.</span></div>
        <small class="muted">${KIND_LABEL[c.kind] || 'Dívida'}${c.remaining ? ` · faltam ${c.remaining} de ${money(c.pmt)}` : c.neverEnds ? ' · pagando o mínimo, não acaba' : ` · mínimo ${money(c.pmt)}`}</small>
        <dl class="mini-kv"><div><dt>Falta pagar</dt><dd>${c.neverEnds ? 'sem fim' : money(c.remainingTotal)}</dd></div><div><dt>Quitar hoje</dt><dd>~${money(c.payoffToday)}</dd></div><div><dt>Economia</dt><dd class="income">${money(c.savings)}</dd></div></dl>
        <div class="goal-actions"><button type="button" class="btn sm ${i === 0 ? 'primary' : ''}" data-act="early" data-id="${c.id}">${icon('check')} Quitei antecipado</button></div>
      </li>`,
    )}</ol>
    ${free.length ? html`<p class="hint">${icon('info')} Sem juros: ${free.map((c) => c.name).join(', ')}. Não vale antecipar: deixe o dinheiro rendendo no cofrinho e pague as parcelas no prazo.</p>` : ''}
  </section>`;
}

function plan(state, ui) {
  const debts = debtsForPlan(state, new Date());
  if (!debts.length) return '';
  const avg = averages(state, keyOf(new Date()));
  const minimos = debts.reduce((s, d) => s + (d.minPayment || 0), 0);
  const folga = Math.max(0, avg.income - avg.expense);
  const suggested = Math.ceil((minimos + folga * 0.5) / 10) * 10 || Math.ceil(minimos / 10) * 10;
  const budget = ui.planBudget || suggested;
  const hasAcordo = debts.some((d) => d.kind === 'acordo');
  const runs = Object.keys(STRATEGIES)
    .filter((k) => hasAcordo || k !== 'nome-limpo')
    .map((k) => simulatePayoff(debts, budget, k));
  const feasible = runs.filter((r) => r.feasible);
  const cheapest = feasible.length ? feasible.reduce((a, b) => (b.totalInterest < a.totalInterest - 0.5 ? b : a)) : null;
  const rec = hasAcordo ? runs.find((r) => r.strategy === 'nome-limpo') : cheapest || runs[0];
  const chosen = runs.find((r) => r.strategy === ui.planStrategy) || rec;
  const names = Object.fromEntries(debts.map((d) => [d.id, d]));
  return html`<section class="card plan">
    <h2 class="card-title">${icon('target')} Plano para zerar suas dívidas</h2>
    <label class="field"><span>Quanto você consegue pagar de dívidas por mês</span>
      <div class="qe-row"><span class="cur-inline">R$</span><input id="plan-budget" inputmode="decimal" value="${moneyInput(budget)}"><button type="button" class="btn sm" data-act="plan-apply">Simular</button></div>
    </label>
    <p class="hint">Mínimos e parcelas somam ${money(minimos)}. ${folga > 0 ? `Pela sua média, sobram ${money(folga)} por mês: sugerimos usar metade (${money(suggested)} no total).` : 'Pela sua média, não está sobrando dinheiro: corte gastos supérfluos para acelerar.'}</p>
    ${chosen.shortfall ? html`<p class="status error">${icon('alert')} Esse valor não cobre nem os mínimos (${money(minimos)}). Aumente o valor ou renegocie as parcelas.</p>` : ''}
    <div class="options" role="radiogroup" aria-label="Estratégia">${runs.map(
      (r) => html`<label class="option"><input type="radio" name="plan-s" value="${r.strategy}" ${r === chosen ? 'checked' : ''}>
        <b>${STRATEGIES[r.strategy].label}${r === rec ? html`<span class="pill ok">recomendada</span>` : ''}</b>
        <small>${Number.isFinite(r.months) ? `${months(r.months)} · ${money(r.totalInterest)} de juros${hasAcordo && r.cleanNameMonth ? ` · nome limpo em ${monthAt(r.cleanNameMonth)}` : ''}` : 'Não quita com esse valor'}</small></label>`,
    )}</div>
    <p class="hint">${STRATEGIES[chosen.strategy].why}${cheapest && chosen !== cheapest && chosen.feasible ? ` Custa ${money(chosen.totalInterest - cheapest.totalInterest)} a mais de juros que a ${STRATEGIES[cheapest.strategy].label.toLowerCase()}.` : ''}</p>
    ${chosen.feasible
      ? html`<ol class="timeline">${chosen.events.map((ev) => {
          const d = names[ev.id];
          return html`<li><span class="tl-when">${monthAt(ev.month)}</span><span>${d.kind === 'acordo' ? html`Quitar <b>${d.name}</b> pela oferta de ${money(d.balance)}${d.original ? html` <small>(economia de ${money(d.original - d.balance)})</small>` : ''}` : html`Última parcela de <b>${d.name}</b>`}</span></li>`;
        })}<li class="tl-end"><span class="tl-when">${monthAt(chosen.months)}</span><span><b>Livre das dívidas</b> 🎉</span></li></ol>`
      : html`<p class="status error">${icon('alert')} Com esse valor, as dívidas não acabam: os juros crescem mais rápido que os pagamentos. Aumente o valor mensal ou renegocie a dívida mais cara.</p>`}
    <details class="more"><summary>Dicas para sair das dívidas mais rápido</summary>
      <ul class="bullets">
        <li>Nunca pague só o mínimo do cartão: o rotativo é o crédito mais caro do país.</li>
        <li>Troque dívida cara por barata: consignado ou empréstimo com garantia costumam cobrar muito menos que cartão e cheque especial.</li>
        <li>Acompanhe os feirões de renegociação (Serasa, bancos, Desenrola): os descontos para quitar à vista podem passar de 80%.</li>
        <li>Se sua reserva passa de 3 meses de gastos, usar o excedente para quitar dívida acima de 3% ao mês costuma compensar.</li>
        <li>Enquanto paga, evite novos parcelamentos e Pix parcelado.</li>
      </ul>
    </details>
  </section>`;
}

export default {
  id: 'dividas',
  title: 'Dívidas',
  back: 'planejar',
  render({ state, ui }) {
    const open = state.loans.filter(loanIsOpen);
    const closed = state.loans.filter((l) => !loanIsOpen(l));
    const total = open.reduce((s, l) => s + loanBalance(l), 0);
    const monthly = open.reduce((s, l) => s + loanMonthly(l), 0);
    const juros = open.reduce((s, l) => s + (l.mode === 'acordo' ? 0 : loanBalance(l) * l.rate), 0);
    const neg = open.filter((l) => l.mode === 'acordo').sort((a, b) => (a.offer || a.balance) - (b.offer || b.balance));
    const juro = open.filter((l) => l.mode !== 'acordo').sort((a, b) => b.rate - a.rate);
    return html`<header class="page-head"><h1>Dívidas e empréstimos</h1></header>
      <div class="summary3">
        <div><small>Em aberto</small><b class="expense">${money(total)}</b></div>
        <div><small>Por mês</small><b>${money(monthly)}</b></div>
        <div><small>Juros no mês</small><b class="expense">${money(juros)}</b></div>
      </div>
      <div class="btn-row">
        <button type="button" class="btn primary" data-act="add">${icon('plus')} Adicionar dívida</button>
        <button type="button" class="btn" data-act="serasa">${icon('shield')} Importar do Serasa</button>
        <button type="button" class="btn" data-act="contract">${icon('camera')} Analisar contrato de empréstimo</button>
      </div>
      ${earlyPayoff(state)}
      ${plan(state, ui)}
      ${neg.length ? html`<h2 class="section-title">Negativadas · priorize para limpar o nome</h2>${neg.map(loanCard)}` : ''}
      ${juro.length ? html`<h2 class="section-title">Com juros · da mais cara para a mais barata</h2>${juro.map(loanCard)}` : ''}
      ${!open.length ? emptyState('Nenhuma dívida em aberto', 'Cadastre empréstimos, cartão no rotativo, financiamentos e dívidas negativadas para montar um plano de quitação.') : ''}
      ${closed.length ? html`<details class="more"><summary>Quitadas (${closed.length})</summary>${closed.map(loanCard)}</details>` : ''}`;
  },
  bind(root, { state, ui, rerender }) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const l = state.loans.find((x) => x.id === b.dataset.id);
      switch (b.dataset.act) {
        case 'add':
          return openLoanForm();
        case 'serasa':
          return openSerasaImport();
        case 'contract':
          return openLoanContract();
        case 'early':
          return openEarlyPayoff(b.dataset.id, state);
        case 'pay':
          return openPay(l);
        case 'negotiate':
          return openNegotiate(l);
        case 'amortize':
          return openAmortize(l);
        case 'plan-apply': {
          const v = readMoney(root.querySelector('#plan-budget').value);
          if (v > 0) ui.planBudget = v;
          return rerender();
        }
        case 'del':
          if (!b.dataset.armed) {
            b.dataset.armed = '1';
            b.classList.add('danger');
            toast('Toque de novo na lixeira para excluir a dívida.');
            return;
          }
          deleteLoan(l.id);
          return toast('Dívida excluída');
      }
    });
    root.addEventListener('change', (e) => {
      if (e.target.name === 'plan-s') {
        ui.planStrategy = e.target.value;
        rerender();
      }
    });
    root.querySelector('#plan-budget')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') root.querySelector('[data-act="plan-apply"]').click();
    });
  },
};

function openEarlyPayoff(id, state) {
  const c = interestCommitments(state, new Date()).find((x) => x.id === id);
  if (!c) return;
  openSheet({
    title: `Quitar ${c.name}`,
    body: html`<form class="form" id="ef">
      <p>Valor estimado para quitar hoje: <b>${money(c.payoffToday, { force: true })}</b>${c.savings > 0 ? html` · economia de <b class="income">${money(c.savings, { force: true })}</b> em juros` : ''}.</p>
      <label class="amount-field"><span class="cur">R$</span><input name="amount" inputmode="decimal" value="${moneyInput(c.payoffToday)}"></label>
      <p class="hint">Use o valor exato que o banco ou app informar para quitação. ${c.source === 'parcelamento' ? 'As parcelas futuras saem das projeções.' : 'A dívida fica marcada como quitada.'}</p>
      <button class="btn primary" type="submit">Confirmar quitação</button>
    </form>`,
    onMount(sheet) {
      sheet.body.querySelector('#ef').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = readMoney(e.target.amount.value);
        if (!(v > 0)) return;
        if (c.source === 'parcelamento') payoffInstallments(c.id, v);
        else if (state.loans.find((l) => l.id === c.id)?.mode === 'parcelado') amortizeLoan(c.id, v);
        else payLoan(c.id, v);
        sheet.close();
        toast(`${c.name} quitado. Menos ${money(c.pmt, { force: true })} comprometidos por mês.`);
      });
    },
  });
}

function openPay(l) {
  const suggested = l.mode === 'parcelado' ? l.pmt : l.mode === 'acordo' ? l.offer || l.balance : l.minPayment;
  openSheet({
    title: l.mode === 'acordo' ? `Quitar ${l.name}` : `Pagamento de ${l.name}`,
    body: html`<form class="form" id="pf">
      <label class="amount-field"><span class="cur">R$</span><input name="amount" inputmode="decimal" value="${moneyInput(suggested)}" ${l.mode === 'parcelado' ? 'readonly' : ''}></label>
      <label class="field"><span>Data</span><input type="date" name="date" value="${toISO(new Date())}"></label>
      <p class="hint">Vou registrar um gasto em "Dívidas e empréstimos" e atualizar o saldo da dívida.</p>
      <button class="btn primary" type="submit">Confirmar pagamento</button>
    </form>`,
    onMount(sheet) {
      sheet.body.querySelector('#pf').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = e.target;
        const v = readMoney(f.amount.value);
        if (!(v > 0)) return;
        payLoan(l.id, v, f.date.value);
        sheet.close();
        toast(l.mode === 'acordo' ? 'Dívida quitada. Em até 5 dias úteis o nome deve sair do Serasa.' : 'Pagamento registrado');
      });
    },
  });
}

function openNegotiate(l) {
  const o = l.offerInstallments || {};
  openSheet({
    title: `Acordo com ${l.name}`,
    body: html`<form class="form" id="nf">
      <div class="row2"><label class="field"><span>Parcelas</span><input name="n" type="number" min="1" max="72" value="${o.n || 6}"></label><label class="field"><span>Valor da parcela</span><input name="pmt" inputmode="decimal" value="${moneyInput(o.pmt || (l.offer || l.balance) / 6)}"></label></div>
      <label class="field"><span>1ª parcela</span><input name="first" type="date" value="${toISO(new Date())}"></label>
      <p class="hint">A dívida passa a aparecer como parcelamento, entra nas projeções e sai da lista de negativadas.</p>
      <button class="btn primary" type="submit">Salvar acordo</button>
    </form>`,
    onMount(sheet) {
      sheet.body.querySelector('#nf').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = e.target;
        const n = Math.max(1, Math.floor(+f.n.value));
        const pmt = readMoney(f.pmt.value);
        if (!(pmt > 0)) return;
        negotiateLoan(l.id, { n, pmt, firstDue: f.first.value });
        sheet.close();
        toast('Acordo salvo');
      });
    },
  });
}

function openAmortize(l) {
  const bal = loanBalance(l);
  const body = html`<form class="form" id="af">
    <p>Saldo devedor hoje: <b>${money(bal)}</b> · ${l.n - l.paid} parcelas de ${money(l.pmt)}</p>
    <label class="amount-field"><span class="cur">R$</span><input name="extra" inputmode="decimal" placeholder="valor extra" value="${moneyInput(Math.min(1000, Math.round(bal / 4)))}"></label>
    <div id="am-out" class="juros"></div>
    <button class="btn primary" type="submit">Registrar amortização</button>
    <p class="hint">Peça ao banco para abater o valor reduzindo o prazo: é o que economiza mais juros.</p>
  </form>`;
  openSheet({
    title: `Amortizar ${l.name}`,
    body,
    onMount(sheet) {
      const f = sheet.body.querySelector('#af');
      const out = f.querySelector('#am-out');
      const calc = () => {
        const extra = readMoney(f.extra.value);
        if (!(extra > 0)) return (out.innerHTML = '');
        const r = simulateExtraPayment({ balance: bal, rate: l.rate, pmt: l.pmt, extra });
        out.innerHTML = String(html`<dl><div><dt>Parcelas a menos</dt><dd>${r.monthsSaved}</dd></div><div><dt>Juros economizados</dt><dd class="income">${money(r.interestSaved, { force: true })}</dd></div><div><dt>Termina em</dt><dd>${Number.isFinite(r.monthsAfter) ? monthAt(r.monthsAfter) : '—'}</dd></div></dl>`);
      };
      f.addEventListener('input', calc);
      calc();
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const extra = readMoney(f.extra.value);
        if (!(extra > 0)) return;
        amortizeLoan(l.id, extra);
        sheet.close();
        toast('Amortização registrada');
      });
    },
  });
}

function openLoanForm() {
  const body = html`<form class="form" id="lf" novalidate>
    <div class="seg three" role="radiogroup" aria-label="Tipo de dívida">
      <label><input type="radio" name="mode" value="parcelado" checked><span>Parcelada</span></label>
      <label><input type="radio" name="mode" value="rotativo"><span>Cartão / cheque</span></label>
      <label><input type="radio" name="mode" value="acordo"><span>Negativada</span></label>
    </div>
    <label class="field"><span>Nome</span><input name="name" required placeholder="Ex.: Empréstimo Banco X"></label>
    <div data-mode="parcelado">
      <label class="field"><span>Tipo</span><select name="kind">${['emprestimo', 'consignado', 'financiamento', 'pix_parcelado', 'outro'].map((k) => html`<option value="${k}">${KINDS[k]}</option>`)}</select></label>
      <div class="row2"><label class="field"><span>Valor recebido</span><input name="principal" inputmode="decimal" placeholder="5.000,00"></label><label class="field"><span>Nº de parcelas</span><input name="n" type="number" min="1" max="480" value="12"></label></div>
      <div class="row2"><label class="field"><span>Valor da parcela</span><input name="pmt" inputmode="decimal" placeholder="se souber"></label><label class="field"><span>ou taxa % ao mês</span><input name="rate" inputmode="decimal" placeholder="ex.: 4,5"></label></div>
      <div class="row2"><label class="field"><span>1ª parcela</span><input name="firstDue" type="date" value="${toISO(new Date())}"></label><label class="field"><span>Parcelas já pagas</span><input name="paid" type="number" min="0" value="0"></label></div>
      <p class="hint" id="lf-calc">Informe a parcela para eu calcular a taxa de juros, ou a taxa para calcular a parcela.</p>
    </div>
    <div data-mode="rotativo" hidden>
      <label class="field"><span>Tipo</span><select name="kind2"><option value="cartao">Cartão de crédito (rotativo)</option><option value="cheque">Cheque especial</option><option value="outro">Outro</option></select></label>
      <div class="row2"><label class="field"><span>Saldo devedor</span><input name="balance" inputmode="decimal"></label><label class="field"><span>Taxa % ao mês</span><input name="rate2" inputmode="decimal" value="14"></label></div>
      <label class="field"><span>Pagamento mínimo / quanto paga por mês</span><input name="minPayment" inputmode="decimal"></label>
    </div>
    <div data-mode="acordo" hidden>
      <div class="row2"><label class="field"><span>Valor da dívida</span><input name="balance3" inputmode="decimal"></label><label class="field"><span>Oferta à vista</span><input name="offer" inputmode="decimal" placeholder="opcional"></label></div>
      <div class="row2"><label class="field"><span>Oferta parcelada: parcelas</span><input name="offn" type="number" min="1" placeholder="opcional"></label><label class="field"><span>Valor da parcela</span><input name="opmt" inputmode="decimal" placeholder="opcional"></label></div>
      <label class="field"><span>Desde</span><input name="since" type="date"></label>
    </div>
    <p class="field-error" hidden></p>
    <button class="btn primary" type="submit">Adicionar dívida</button>
  </form>`;
  openSheet({
    title: 'Nova dívida',
    body,
    onMount(sheet) {
      const f = sheet.body.querySelector('#lf');
      const mode = () => f.querySelector('[name=mode]:checked').value;
      const sync = () => {
        f.querySelectorAll('[data-mode]').forEach((el) => (el.hidden = el.dataset.mode !== mode()));
        if (mode() === 'parcelado') {
          const pv = readMoney(f.principal.value);
          const n = +f.n.value;
          const pmt = readMoney(f.pmt.value);
          const rate = readMoney(f.rate.value) / 100;
          const calc = f.querySelector('#lf-calc');
          if (pv > 0 && n > 0 && pmt > 0) {
            const r = rateFromInstallments(pv, pmt, n);
            calc.innerHTML = String(html`Taxa embutida: <b>${pct(r, 2)} ao mês</b> (${pct(monthlyToAnnual(r), 0)} ao ano). Total pago: ${money(pmt * n, { force: true })}.`);
          } else if (pv > 0 && n > 0 && rate > 0) {
            calc.innerHTML = String(html`Parcela calculada: <b>${money(pricePayment(pv, rate, n), { force: true })}</b>.`);
          }
        }
      };
      f.addEventListener('input', sync);
      f.addEventListener('change', sync);
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const err = f.querySelector('.field-error');
        const fail = (m) => ((err.hidden = false), (err.textContent = m));
        const name = f.elements.name.value.trim();
        if (!name) return fail('Dê um nome para a dívida.');
        const m = mode();
        if (m === 'parcelado') {
          const principal = readMoney(f.principal.value);
          const pmt = readMoney(f.pmt.value);
          const rate = readMoney(f.rate.value) / 100;
          if (!(principal > 0) || !(+f.n.value > 0)) return fail('Informe o valor e o número de parcelas.');
          if (!(pmt > 0) && !(rate >= 0)) return fail('Informe o valor da parcela ou a taxa de juros.');
          addLoan({ mode: m, name, kind: f.kind.value, principal, n: +f.n.value, pmt: pmt > 0 ? pmt : null, rate: pmt > 0 ? null : rate || 0, firstDue: f.firstDue.value, paid: +f.paid.value });
        } else if (m === 'rotativo') {
          const balance = readMoney(f.balance.value);
          if (!(balance > 0)) return fail('Informe o saldo devedor.');
          addLoan({ mode: m, name, kind: f.kind2.value, balance, rate: (readMoney(f.rate2.value) || 0) / 100, minPayment: readMoney(f.minPayment.value) || 0 });
        } else {
          const balance = readMoney(f.balance3.value);
          if (!(balance > 0)) return fail('Informe o valor da dívida.');
          const opmt = readMoney(f.opmt.value);
          addLoan({ mode: m, name, kind: 'serasa', creditor: name, balance, offer: readMoney(f.offer.value) || null, offerInstallments: +f.offn.value > 0 && opmt > 0 ? { n: +f.offn.value, pmt: opmt } : null, since: f.since.value, source: 'manual' });
        }
        sheet.close();
        toast('Dívida adicionada ao plano');
      });
      sync();
    },
  });
}

function openSerasaImport() {
  openReader({
    title: 'Importar dívidas do Serasa',
    intro: html`O Serasa não libera conexão direta com apps pessoais. Abra o app ou site do Serasa, vá em <b>Limpa Nome</b> (ou "Minhas dívidas"), tire um print da lista e envie aqui. Também dá para copiar e colar o texto.`,
    dropTitle: 'Enviar print do Serasa',
    dropText: 'Pode enviar um print de cada vez.',
    textLabel: 'Texto copiado do Serasa',
    textPlaceholder: 'Banco X\nDívida de R$ 2.345,67\nPague R$ 480,00 à vista',
    analyze: (file, o) => analyzeSerasa(file, o).then((r) => r.debts),
    parseText: (t) => parseSerasaText(t),
    onResult(debts, sheet) {
      const box = sheet.body.querySelector('#r-results');
      if (!debts.length) return sheet.status('Não encontrei dívidas nesse conteúdo. Confira se o print mostra o nome do credor e o valor.', 'error');
      box.innerHTML = String(html`<h3 class="section-title">Encontrei ${debts.length} dívida${debts.length > 1 ? 's' : ''}</h3>
        <form id="s-form" class="form">${debts.map(
          (d, i) => html`<fieldset class="card import-row"><label class="check"><input type="checkbox" name="use" value="${i}" checked> <b>${d.creditor}</b></label>
            <div class="row2"><label class="field"><span>Dívida</span><input name="bal-${i}" inputmode="decimal" value="${moneyInput(d.balance)}"></label><label class="field"><span>Oferta à vista</span><input name="off-${i}" inputmode="decimal" value="${moneyInput(d.offer)}"></label></div>
            ${d.offerInstallments ? html`<p class="hint">Parcelado: ${d.offerInstallments.n || '?'}x de ${money(d.offerInstallments.pmt, { force: true })}</p>` : ''}</fieldset>`,
        )}<button class="btn primary" type="submit">Adicionar ao plano</button></form>`);
      box.querySelector('#s-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = e.target;
        const picked = [...f.querySelectorAll('[name=use]:checked')].map((c) => +c.value);
        for (const i of picked) {
          const d = debts[i];
          addLoan({ mode: 'acordo', name: d.creditor, creditor: d.creditor, kind: 'serasa', balance: readMoney(f[`bal-${i}`].value) || d.balance, offer: readMoney(f[`off-${i}`].value) || null, offerInstallments: d.offerInstallments?.n ? d.offerInstallments : null, since: d.since || '', source: 'serasa' });
        }
        sheet.close();
        toast(`${picked.length} dívida${picked.length > 1 ? 's' : ''} importada${picked.length > 1 ? 's' : ''}. Elas entram primeiro no plano para limpar o nome.`);
      });
    },
  });
}
