import { currentBalance, goalSaved, keyOf, monthSummary, projectMonth } from '../analytics.js';
import { getCategory } from '../categories.js';
import { buildInsights } from '../insights.js';
import { toISO } from '../parser.js';
import { clearDemo, updateSettings } from '../store.js';
import { emptyState, hbars, html, icon, money, monthName, progress } from '../ui.js';
import { txRow } from './extrato.js';
import { insightCard } from './dicas.js';
import { openPrintSheet, openTxForm, quickPreview, quickSave } from './form.js';
import { openLoanContract } from './emprestimo.js';
import { openNotificationsImport } from './importar.js';

export default {
  id: 'inicio',
  render({ state }) {
    const today = new Date();
    const key = keyOf(today);
    const bal = currentBalance(state, today);
    const sum = monthSummary(state, key);
    const proj = projectMonth(state, today);
    const insights = buildInsights(state, today).slice(0, 3);
    const recent = state.transactions.filter((t) => t.date <= toISO(today)).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 5);
    const name = state.settings.name;
    const hour = today.getHours();
    const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    const hide = state.settings.hideValues;
    const projMax = Math.max(proj.projected, proj.income, 1);

    return html`
    <header class="hero">
      <div class="hero-top">
        <div><p class="hello">${hello}${name ? `, ${name}` : ''}</p><p class="hero-month">${monthName(key)}</p></div>
        <div class="hero-actions">
          <button type="button" class="icon-btn on-brand" data-act="toggle-hide" aria-label="${hide ? 'Mostrar valores' : 'Ocultar valores'}">${icon(hide ? 'eyeOff' : 'eye')}</button>
          <button type="button" class="icon-btn on-brand" data-go="ajustes" aria-label="Ajustes">${icon('gear')}</button>
        </div>
      </div>
      <p class="hero-label">Saldo disponível</p>
      <p class="hero-value">${money(bal.available)}</p>
      <p class="hero-sub">${bal.saved > 0 ? html`${icon('piggy')} ${money(bal.saved)} guardados nos cofrinhos` : 'Comece um cofrinho para separar o que é reserva'}</p>
      <div class="hero-cards">
        <button type="button" class="mini" data-go="extrato" data-filter="income"><span class="mini-ic up">${icon('arrowUp')}</span><span><small>Receitas do mês</small><b>${money(sum.income)}</b></span></button>
        <button type="button" class="mini" data-go="extrato" data-filter="expense"><span class="mini-ic down">${icon('arrowDown')}</span><span><small>Despesas do mês</small><b>${money(sum.expense)}</b></span></button>
      </div>
    </header>

    ${state.settings.demo ? html`<div class="banner"><p><b>Você está vendo dados de exemplo.</b> Explore à vontade; quando quiser, comece do zero.</p><button type="button" class="btn sm" data-act="clear-demo">Apagar exemplos</button></div>` : ''}

    <nav class="quick" aria-label="Atalhos">
      <button type="button" data-act="new-expense"><span class="q-ic">${icon('minus')}</span>Gasto</button>
      <button type="button" data-act="new-income"><span class="q-ic">${icon('plus')}</span>Ganho</button>
      <button type="button" data-act="print"><span class="q-ic">${icon('camera')}</span>Ler print</button>
      <button type="button" data-act="notifications"><span class="q-ic">${icon('bell')}</span>Notificações</button>
      <button type="button" data-go="pix"><span class="q-ic">${icon('pix')}</span>Pix parcelado</button>
      <button type="button" data-act="contract"><span class="q-ic">${icon('calc')}</span>Empréstimo</button>
      <button type="button" data-go="cofrinhos"><span class="q-ic">${icon('piggy')}</span>Cofrinho</button>
      <button type="button" data-go="dividas"><span class="q-ic">${icon('bank')}</span>Dívidas</button>
    </nav>

    <section class="card">
      <form class="quick-entry" id="quick-form" autocomplete="off">
        <label for="quick-input" class="card-title">${icon('bolt')} Registro rápido</label>
        <div class="qe-row"><input id="quick-input" placeholder="Ex.: almoço 32,90 débito" enterkeyhint="done"><button class="btn primary" type="submit">Salvar</button></div>
        <div class="qe-preview" id="quick-preview" aria-live="polite"></div>
      </form>
    </section>

    <section class="card">
      <div class="card-head"><h2 class="card-title">Projeção do mês</h2><button type="button" class="link" data-go="relatorios">Relatório ${icon('chevR')}</button></div>
      ${proj.projected > 0 || proj.income > 0
        ? html`<p class="big-line">No ritmo atual, você vai gastar <b>${money(proj.projected)}</b> até o dia ${proj.endDate.slice(8)}.</p>
          <div class="proj-bar" role="img" aria-label="Gasto até agora ${money(proj.spent)}, projeção ${money(proj.projected)}, renda ${money(proj.income)}">
            <span class="pb-spent" style="width:${((proj.spent / projMax) * 100).toFixed(1)}%"></span>
            <span class="pb-proj" style="width:${((Math.max(0, proj.projected - proj.spent) / projMax) * 100).toFixed(1)}%"></span>
            ${proj.income ? html`<span class="pb-income" style="left:${Math.min(99.5, (proj.income / projMax) * 100).toFixed(1)}%"></span>` : ''}
          </div>
          <ul class="legend"><li><span class="swatch s1"></span>Gasto até hoje ${money(proj.spent)}</li><li><span class="swatch s1-soft"></span>Previsto</li><li><span class="swatch marker-sw"></span>Renda ${money(proj.income)}</li></ul>
          <p class="hint">${proj.projected > proj.income && proj.income > 0 ? html`<span class="pill bad">${icon('alert')} acima da renda</span> Para fechar no zero, gaste até <b>${money(proj.perDayBudget)}</b> por dia.` : proj.daysLeft > 0 ? html`Você pode gastar até <b>${money(proj.perDayBudget)}</b> por dia nos ${proj.daysLeft} dias restantes.` : ''}</p>`
        : emptyState('Sem dados ainda', 'Registre seus gastos e ganhos para ver a projeção.')}
    </section>

    ${insights.length
      ? html`<section class="card">
          <div class="card-head"><h2 class="card-title">${icon('bulb')} Dicas para você</h2><button type="button" class="link" data-go="dicas">Ver todas ${icon('chevR')}</button></div>
          <div class="insights">${insights.map(insightCard)}</div>
        </section>`
      : ''}

    <section class="card">
      <div class="card-head"><h2 class="card-title">Onde foi seu dinheiro</h2><button type="button" class="link" data-go="relatorios">Detalhes ${icon('chevR')}</button></div>
      ${sum.byCategory.length ? hbars(sum.byCategory.slice(0, 4).map((c) => ({ label: getCategory(c.id).name, icon: getCategory(c.id).icon, value: c.total, sub: `${Math.round((c.total / sum.expense) * 100)}%` }))) : emptyState('Nenhum gasto neste mês', 'Use o botão + para registrar.')}
    </section>

    ${state.goals.length
      ? html`<section class="card">
          <div class="card-head"><h2 class="card-title">Cofrinhos</h2><button type="button" class="link" data-go="cofrinhos">Abrir ${icon('chevR')}</button></div>
          <ul class="goal-mini">${state.goals.slice(0, 3).map((g) => {
            const s = goalSaved(g);
            return html`<li><span class="goal-emoji" aria-hidden="true">${g.emoji}</span><div class="grow"><div class="row-between"><b>${g.name}</b><small>${money(s)} de ${money(g.target)}</small></div>${progress(s, g.target)}</div></li>`;
          })}</ul>
        </section>`
      : ''}

    <section class="card">
      <div class="card-head"><h2 class="card-title">Últimos lançamentos</h2><button type="button" class="link" data-go="extrato">Extrato ${icon('chevR')}</button></div>
      ${recent.length ? html`<ul class="tx-list">${recent.map((t) => txRow(t, true))}</ul>` : emptyState('Nada por aqui', 'Seus lançamentos aparecem aqui.')}
    </section>`;
  },
  bind(root, { state }) {
    const input = root.querySelector('#quick-input');
    const prev = root.querySelector('#quick-preview');
    input.addEventListener('input', () => (prev.innerHTML = String(quickPreview(input.value))));
    root.querySelector('#quick-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const r = quickSave(input.value);
      if (!r.ok) prev.innerHTML = `<span class="field-error">${r.message}</span>`;
    });
    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'toggle-hide') updateSettings({ hideValues: !state.settings.hideValues });
      if (act === 'clear-demo') clearDemo();
      if (act === 'new-expense') openTxForm({ prefill: { type: 'expense' } });
      if (act === 'new-income') openTxForm({ prefill: { type: 'income', category: 'salario', method: 'transferencia' } });
      if (act === 'print') openPrintSheet();
      if (act === 'notifications') openNotificationsImport();
      if (act === 'contract') openLoanContract();
    });
  },
};
