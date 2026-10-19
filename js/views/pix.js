import { analyzeInstallments, pricePayment } from '../finance.js';
import { html, icon, money, moneyInput, pct, readMoney } from '../ui.js';
import { openTxForm } from './form.js';

export default {
  id: 'pix',
  title: 'Pix parcelado',
  back: 'planejar',
  render({ state, ui }) {
    const s = ui.pix || (ui.pix = { cash: 450, n: 6, pmt: 89.9, antecipada: false });
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
        <h2 class="card-title">${icon('calc')} Simular com a taxa do banco</h2>
        <p class="hint">Cada banco cobra uma taxa diferente, então o app não supõe nenhuma. Se o banco ou o app informou a taxa, escreva aqui para ver a parcela em outros prazos.</p>
        <form class="form" id="ratef" novalidate><label class="field"><span>Taxa informada pelo banco (% ao mês)</span><input name="rate" inputmode="decimal" value="${s.bankRate ? String(s.bankRate * 100).replace('.', ',') : ''}" placeholder="Em branco = sem simulação"></label></form>
        ${s.bankRate > 0
          ? html`<div class="table-wrap"><table><thead><tr><th>Parcelas</th><th>Parcela (R$)</th><th>Total (R$)</th></tr></thead>
              <tbody>${[3, 6, 10, 12].map((n) => html`<tr><td>${n}x</td><td>${money(pricePayment(s.cash || 0, s.bankRate, n), { force: true, bare: true })}</td><td>${money(pricePayment(s.cash || 0, s.bankRate, n) * n, { force: true, bare: true })}</td></tr>`)}</tbody></table></div>
            <p class="hint">Preço à vista de ${money(s.cash || 0, { force: true })} com ${pct(s.bankRate, 2)} ao mês.</p>`
          : ''}
      </section>`;
  },
  bind(root, { state, ui, rerender }) {
    root.querySelector('#ratef').addEventListener('change', (e) => {
      const r = readMoney(e.target.value) / 100;
      ui.pix.bankRate = r > 0 && r < 1 ? r : 0;
      // o "change" chega quando o campo perde o foco: redesenha depois, fora do evento
      setTimeout(() => rerender());
    });
    const f = root.querySelector('#pixf');
    const out = root.querySelector('#pix-out');
    const calc = () => {
      const s = (ui.pix = { ...ui.pix, cash: readMoney(f.cash.value), n: Math.max(1, Math.floor(+f.n.value || 1)), pmt: readMoney(f.pmt.value), antecipada: f.antecipada.checked });
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
