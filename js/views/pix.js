import { analyzeInstallments, pricePayment } from '../finance.js';
import { html, icon, money, moneyInput, pct, readMoney } from '../ui.js';
import { openTxForm } from './form.js';

export default {
  id: 'pix',
  title: 'Pix parcelado',
  back: 'planejar',
  render({ state, ui }) {
    const s = ui.pix || (ui.pix = { cash: 450, n: 6, pmt: 89.9, antecipada: false });
    const rate = state.settings.savingsRate;
    return html`<header class="page-head"><h1>Simulador de Pix parcelado</h1><p>Informe o preço à vista e a parcela oferecida. Eu calculo os juros escondidos.</p></header>
      <section class="card">
        <form class="form" id="pixf" novalidate>
          <label class="field"><span>Preço à vista</span><input name="cash" inputmode="decimal" value="${moneyInput(s.cash)}"></label>
          <div class="row2">
            <label class="field"><span>Parcelas</span><input name="n" type="number" min="1" max="48" value="${s.n}"></label>
            <label class="field"><span>Valor da parcela</span><input name="pmt" inputmode="decimal" value="${moneyInput(s.pmt)}"></label>
          </div>
          <label class="check"><input type="checkbox" name="antecipada" ${s.antecipada ? 'checked' : ''}> <span>1ª parcela paga no dia da compra</span></label>
        </form>
        <div id="pix-out" aria-live="polite"></div>
      </section>
      <section class="card">
        <h2 class="card-title">${icon('calc')} Quanto fica a parcela com uma taxa?</h2>
        <p class="hint">Útil para comparar ofertas: Pix parcelado costuma cobrar de 3% a 9% ao mês; cartão parcelado com juros, de 2% a 9%.</p>
        <div class="table-wrap"><table><thead><tr><th>Taxa a.m.</th>${[3, 6, 10, 12].map((n) => html`<th>${n}x</th>`)}</tr></thead>
          <tbody>${[0.02, 0.04, 0.06, 0.08].map((r) => html`<tr><td>${pct(r)}</td>${[3, 6, 10, 12].map((n) => html`<td>${money(pricePayment(s.cash || 0, r, n), { force: true })}</td>`)}</tr>`)}</tbody></table></div>
        <p class="hint">Valores para um preço à vista de ${money(s.cash || 0, { force: true })}. Seu cofrinho rende cerca de ${pct(rate, 2)} ao mês (ajuste em Ajustes).</p>
      </section>`;
  },
  bind(root, { state, ui }) {
    const f = root.querySelector('#pixf');
    const out = root.querySelector('#pix-out');
    const calc = () => {
      const s = (ui.pix = { cash: readMoney(f.cash.value), n: Math.max(1, Math.floor(+f.n.value || 1)), pmt: readMoney(f.pmt.value), antecipada: f.antecipada.checked });
      if (!(s.cash > 0) || !(s.pmt > 0)) {
        out.innerHTML = '<p class="hint">Preencha o preço à vista e a parcela.</p>';
        return;
      }
      const a = analyzeInstallments({ cashPrice: s.cash, installment: s.pmt, n: s.n, antecipada: s.antecipada, investRate: state.settings.savingsRate });
      out.innerHTML = String(html`
        <div class="pix-result ${a.interest > 0 ? 'bad' : 'good'}">
          <p class="pix-big">${a.interest > 0 ? html`Você paga <b>${money(a.interest, { force: true })}</b> de juros` : html`<b>Sem juros</b>`}</p>
          <dl>
            <div><dt>Total pago</dt><dd>${money(a.total, { force: true })}</dd></div>
            <div><dt>A mais que à vista</dt><dd>${pct(a.interestPct, 1)}</dd></div>
            <div><dt>Taxa ao mês</dt><dd>${pct(a.rate, 2)}</dd></div>
            <div><dt>Taxa ao ano (CET aprox.)</dt><dd>${pct(a.annualRate, 1)}</dd></div>
          </dl>
        </div>
        <p class="verdict">${icon(a.worthIt ? 'check' : 'alert')} ${
          a.interest <= 0
            ? 'Parcelar sem juros é vantagem: deixe o dinheiro rendendo no cofrinho e pague as parcelas.'
            : a.worthIt
              ? `Os juros são menores que o rendimento do seu dinheiro guardado (${pct(state.settings.savingsRate, 2)} a.m.). Parcelar pode compensar se o valor ficar rendendo.`
              : `Se você tem o dinheiro, pague à vista: economiza ${money(a.interest, { force: true })}. Se não tem, prefira juntar por ${Math.ceil(s.cash / s.pmt)} meses no cofrinho e comprar à vista.`
        }</p>
        <button type="button" class="btn primary" id="pix-reg">${icon('plus')} Registrar essa compra</button>`);
      out.querySelector('#pix-reg').onclick = () => openTxForm({ prefill: { type: 'expense', amount: s.cash, method: 'pix_parcelado', installments: s.n, installmentValue: s.pmt, category: 'compras' } });
    };
    f.addEventListener('input', calc);
    f.addEventListener('change', calc);
    calc();
  },
};
