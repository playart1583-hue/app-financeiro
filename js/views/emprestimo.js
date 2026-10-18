// Contrato de empréstimo: ler o print, analisar o impacto antes de contratar e, se quiser, adicionar ao app.
import { addMonthsISO, interestCommitments } from '../analytics.js';
import { pricePayment } from '../finance.js';
import { loanImpact } from '../impact.js';
import { parseLoanText, toISO } from '../parser.js';
import { analyzeLoanContract } from '../receipt.js';
import { addLoan, addTransaction, amortizeLoan, getState, payLoan, payoffInstallments } from '../store.js';
import { dateBR, html, icon, money, moneyInput, monthName, openSheet, pct, readMoney, toast } from '../ui.js';
import { openReader } from './reader.js';

const KINDS = { emprestimo: 'Empréstimo pessoal', consignado: 'Consignado', financiamento: 'Financiamento', pix_parcelado: 'Pix parcelado', outro: 'Outro' };
const LEVEL_ICON = { ok: 'check', atencao: 'info', alerta: 'alert' };

export function openLoanContract({ file, text } = {}) {
  openReader({
    title: 'Ler contrato de empréstimo',
    intro: 'Envie o print da proposta, simulação ou contrato (CCB) antes de assinar. Eu calculo o custo real e mostro o que muda no seu mês.',
    dropTitle: 'Enviar print do contrato',
    dropText: 'Tela do app do banco, proposta do consignado, simulação ou página do contrato com valores e taxas.',
    textLabel: 'Texto da proposta ou contrato',
    textPlaceholder: 'Valor liberado: R$ 5.000,00\nParcelas: 24 de R$ 372,15\nTaxa: 4,5% a.m. · CET: 5,3% a.m.',
    initialFile: file,
    initialText: text,
    analyze: analyzeLoanContract,
    // várias páginas do mesmo contrato: cada campo vem da primeira página que o mostra
    merge: (pages) => ({
      data: pages.reduce((acc, p) => {
        for (const [k, v] of Object.entries(p.data || {})) if (acc[k] == null && v != null) acc[k] = v;
        return acc;
      }, {}),
      engine: pages[0].engine,
    }),
    parseText: (t) => {
      const data = parseLoanText(t);
      return data.n || data.pmt || data.released || data.financed ? { data, engine: { label: 'texto colado' } } : { error: 'Não encontrei valores de empréstimo nesse texto (valor, parcelas, taxa).' };
    },
    footer: html`<button type="button" class="btn ghost" data-manual>${icon('edit')} Não tenho print: preencher à mão</button>`,
    onMount(sheet) {
      sheet.body.querySelector('[data-manual]').addEventListener('click', () => {
        sheet.close();
        openLoanReview({});
      });
    },
    onResult({ data, engine }, sheet) {
      sheet.close();
      openLoanReview(data, engine);
    },
  });
}

function impactHTML(r) {
  if (!r) return html`<p class="hint">Preencha quanto você recebe, o número de parcelas e o valor da parcela (ou a taxa) para ver a análise.</p>`;
  const o = r.offer;
  const list = (title, items, cls) => (items.length ? html`<h3 class="impact-title">${title}</h3><ul class="impact ${cls}">${items.map((t) => html`<li>${t}</li>`)}</ul>` : '');
  return html`<div class="verdict-box ${r.verdict.level}">${icon(LEVEL_ICON[r.verdict.level])}<b>${r.verdict.title}</b></div>
    <dl class="kv">
      <div><dt>Você recebe</dt><dd>${money(o.base, { force: true })}</dd></div>
      <div><dt>Você paga no total</dt><dd>${money(o.total, { force: true })}</dd></div>
      <div class="strong"><dt>Juros e custos</dt><dd class="expense">${money(o.cost, { force: true })} (${pct(o.costPct)})</dd></div>
      <div><dt>Taxa real (o que você recebe × o que paga)</dt><dd>${pct(o.effRate, 2)} a.m. · ${pct(o.effAnnual, 0)} a.a.</dd></div>
      ${o.fees ? html`<div><dt>IOF, tarifas e seguro embutidos</dt><dd>${money(o.fees, { force: true })}</dd></div>` : ''}
      <div><dt>Parcelas e dívidas na renda</dt><dd>${pct(r.ratioBefore)} → <b>${pct(r.ratioAfter)}</b></dd></div>
      <div><dt>Última parcela</dt><dd>${dateBR(r.endDate)}</dd></div>
    </dl>
    ${list('O que melhora', r.good, 'good')}
    ${list('O que piora ou aumenta', r.bad, 'bad')}
    ${list('No seu dia a dia', r.daily, '')}
    <h3 class="impact-title">Sobra prevista por mês</h3>
    <div class="table-wrap"><table><thead><tr><th>Mês</th><th>Sem o empréstimo</th><th>Com o empréstimo</th></tr></thead>
      <tbody>${r.months.map((m) => html`<tr><td>${monthName(m.key, true)}</td><td class="${m.before < 0 ? 'expense' : ''}">${money(m.before, { force: true })}</td><td class="${m.after < 0 ? 'expense' : m.after > m.before ? 'income' : ''}">${money(m.after, { force: true })}</td></tr>`)}</tbody></table></div>`;
}

/** Revisão + análise de impacto. Fecha sem salvar se for só simulação. */
export function openLoanReview(data = {}, engine = null) {
  const today = toISO(new Date());
  const candidates = interestCommitments(getState()).filter((c) => !c.interestFree);
  const found = [
    data.creditor && `Credor: ${data.creditor}`,
    data.released && `Liberado: ${money(data.released, { force: true })}`,
    data.financed && `Financiado: ${money(data.financed, { force: true })}`,
    data.n && data.pmt && `${data.n}x de ${money(data.pmt, { force: true })}`,
    data.statedRate != null && `Juros: ${pct(data.statedRate, 2)} a.m.`,
    data.cetMonthly != null && `CET: ${pct(data.cetMonthly, 2)} a.m.`,
    data.iof && `IOF: ${money(data.iof, { force: true })}`,
    data.tariff && `Tarifas: ${money(data.tariff, { force: true })}`,
    data.insurance && `Seguro: ${money(data.insurance, { force: true })}`,
  ].filter(Boolean);
  const body = html`<form class="form" id="lr" novalidate>
    ${engine ? html`<div class="extracted"><p class="extracted-title">${icon('spark')} Lido do contrato <small>· ${engine.label}</small>${data.confidence != null && data.confidence < 0.75 ? html` <span class="pill warn">confira os dados</span>` : ''}</p>
      <p class="hint">${found.length ? found.join(' · ') : 'Não encontrei os valores. Preencha abaixo.'}</p>${data.note ? html`<p class="hint">${icon('info')} ${data.note}</p>` : ''}</div>` : ''}
    <div class="row2">
      <label class="field"><span>Banco / financeira</span><input name="creditor" value="${data.creditor || ''}" placeholder="Ex.: Banco Inter"></label>
      <label class="field"><span>Tipo</span><select name="kind">${Object.entries(KINDS).map(([k, l]) => html`<option value="${k}" ${data.kind === k ? 'selected' : ''}>${l}</option>`)}</select></label>
    </div>
    <div class="row2">
      <label class="field"><span>Valor que cai na conta</span><input name="released" inputmode="decimal" value="${moneyInput(data.released)}" placeholder="5.000,00"></label>
      <label class="field"><span>Valor financiado (com IOF/tarifas)</span><input name="financed" inputmode="decimal" value="${moneyInput(data.financed)}" placeholder="opcional"></label>
    </div>
    <div class="row2">
      <label class="field"><span>Parcelas</span><input name="n" type="number" min="1" max="480" value="${data.n || ''}"></label>
      <label class="field"><span>Valor da parcela</span><input name="pmt" inputmode="decimal" value="${moneyInput(data.pmt)}"></label>
    </div>
    <div class="row2">
      <label class="field"><span>Juros informados (% a.m.)</span><input name="rate" inputmode="decimal" value="${data.statedRate != null ? (data.statedRate * 100).toFixed(2).replace('.', ',') : ''}" placeholder="opcional"></label>
      <label class="field"><span>CET (% a.m.)</span><input name="cet" inputmode="decimal" value="${data.cetMonthly != null ? (data.cetMonthly * 100).toFixed(2).replace('.', ',') : ''}" placeholder="opcional"></label>
    </div>
    <label class="field"><span>1ª parcela</span><input name="firstDue" type="date" value="${data.firstDue || addMonthsISO(today, 1)}"></label>
    ${candidates.length
      ? html`<fieldset class="field"><legend>Vai usar o dinheiro para quitar alguma dívida?</legend>
          ${candidates.map((c) => html`<label class="check"><input type="checkbox" name="payoff" value="${c.id}"> <span>${c.name} · quitar hoje por ~${money(c.payoffToday, { force: true })} (${pct(c.rate, 1)} a.m.)</span></label>`)}
        </fieldset>`
      : ''}
    <div id="lr-impact" class="impact-box" aria-live="polite"></div>
    <label class="check"><input type="checkbox" name="credit" checked> <span>Ao adicionar, lançar o valor recebido no saldo</span></label>
    <p class="field-error" hidden></p>
    <div class="btn-row"><button type="button" class="btn ghost grow" data-close>Só simulando</button><button type="submit" class="btn primary grow">Adicionar ao app</button></div>
  </form>`;
  openSheet({
    title: 'Analisar empréstimo',
    body,
    onMount(sheet) {
      const f = sheet.body.querySelector('#lr');
      const read = () => {
        const released = readMoney(f.released.value);
        const financed = readMoney(f.financed.value);
        const n = Math.floor(+f.n.value || 0);
        const rate = readMoney(f.rate.value) / 100;
        let pmt = readMoney(f.pmt.value);
        if (!(pmt > 0) && n > 0 && rate > 0 && (financed > 0 || released > 0)) pmt = pricePayment(financed || released, rate, n);
        return {
          creditor: f.creditor.value.trim(),
          kind: f.kind.value,
          released: released > 0 ? released : null,
          financed: financed > 0 ? financed : null,
          n,
          pmt: pmt > 0 ? pmt : null,
          statedRate: rate > 0 ? rate : null,
          cetMonthly: readMoney(f.cet.value) > 0 ? readMoney(f.cet.value) / 100 : null,
          firstDue: f.firstDue.value,
        };
      };
      const payoffIds = () => [...f.querySelectorAll('[name=payoff]:checked')].map((c) => c.value);
      let timer = null;
      const render = () => {
        const o = read();
        const r = o.n > 0 && o.pmt > 0 && (o.released || o.financed) ? loanImpact(getState(), o, payoffIds()) : null;
        sheet.body.querySelector('#lr-impact').innerHTML = String(impactHTML(r));
      };
      f.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(render, 250);
      });
      f.addEventListener('change', render);
      render();
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const o = read();
        const err = f.querySelector('.field-error');
        if (!(o.n > 0) || !(o.pmt > 0) || !(o.released || o.financed)) {
          err.hidden = false;
          err.textContent = 'Preencha o valor, o número de parcelas e o valor da parcela (ou a taxa).';
          return;
        }
        const name = `${KINDS[o.kind]}${o.creditor ? ` · ${o.creditor}` : ''}`;
        const principal = o.financed || o.released;
        const id = addLoan({ mode: 'parcelado', name, kind: o.kind, principal, n: o.n, pmt: o.pmt, rate: null, firstDue: o.firstDue, paid: 0, creditor: o.creditor, released: o.released, fees: o.financed && o.released ? o.financed - o.released : null, cetMonthly: o.cetMonthly, statedRate: o.statedRate, source: engine ? 'contrato' : 'manual' });
        if (f.credit.checked) addTransaction({ type: 'income', amount: o.released || o.financed, description: `Empréstimo recebido${o.creditor ? ` · ${o.creditor}` : ''}`, category: 'emprestimo-recebido', date: today, method: 'transferencia', source: 'emprestimo', loanId: id });
        const chosen = candidates.filter((c) => payoffIds().includes(c.id));
        for (const c of chosen) {
          if (c.source === 'parcelamento') payoffInstallments(c.id, c.payoffToday);
          else if (getState().loans.find((l) => l.id === c.id)?.mode === 'parcelado') amortizeLoan(c.id, c.payoffToday);
          else payLoan(c.id, c.payoffToday);
        }
        sheet.close();
        toast(chosen.length ? `Empréstimo adicionado e ${chosen.length} dívida${chosen.length > 1 ? 's' : ''} quitada${chosen.length > 1 ? 's' : ''}` : `Empréstimo adicionado: ${o.n}x de ${money(o.pmt, { force: true })}`);
      });
    },
  });
}
