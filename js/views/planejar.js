import { goalSaved, keyOf, loanBalance, loanIsOpen, monthSummary } from '../analytics.js';
import { buildInsights } from '../insights.js';
import { html, icon, money } from '../ui.js';
import { openLoanContract } from './emprestimo.js';
import { openFileImport } from './arquivo.js';

export default {
  id: 'planejar',
  title: 'Planejar',
  render({ state }) {
    const open = state.loans.filter(loanIsOpen);
    const debt = open.reduce((s, l) => s + loanBalance(l), 0);
    const negativadas = open.filter((l) => l.mode === 'acordo').length;
    const saved = state.goals.reduce((s, g) => s + goalSaved(g), 0);
    const sum = monthSummary(state, keyOf(new Date()));
    const budgets = Object.keys(state.budgets).length;
    const over = Object.entries(state.budgets).filter(([c, l]) => (sum.byCategory.find((x) => x.id === c)?.total || 0) > l).length;
    const tips = buildInsights(state).filter((i) => i.level !== 'ok').length;
    const tile = (route, ic, title, text, badge = '') => html`<button type="button" class="tile" ${['emprestimo', 'arquivo'].includes(route) ? html`data-open="${route}"` : html`data-go="${route}"`}><span class="tile-ic">${icon(ic)}</span><span class="tile-main"><b>${title}</b><small>${text}</small>${badge ? html`<span class="tile-badge">${badge}</span>` : ''}</span>${icon('chevR', 'muted')}</button>`;
    return html`<header class="page-head"><h1>Planejar</h1><p>Organize metas, dívidas e limites de gasto.</p></header>
      <div class="tiles">
        ${tile('dividas', 'bank', 'Dívidas e empréstimos', open.length ? `${money(debt)} em aberto · plano para quitar` : 'Cadastre empréstimos, cartão e dívidas do Serasa', negativadas ? html`<span class="pill bad">${negativadas} negativada${negativadas > 1 ? 's' : ''}</span>` : '')}
        ${tile('emprestimo', 'calc', 'Analisar empréstimo antes de contratar', 'Envie o print do contrato: custo real e impacto no seu mês')}
        ${tile('arquivo', 'upload', 'Importar arquivo ou fatura', 'CSV, TXT, OFX, Excel, JSON e PDF de outros apps, bancos e faturas')}
        ${tile('cofrinhos', 'piggy', 'Cofrinhos', state.goals.length ? `${money(saved)} guardados em ${state.goals.length} meta${state.goals.length > 1 ? 's' : ''}` : 'Crie metas e guarde dinheiro')}
        ${tile('pix', 'pix', 'Simulador de Pix parcelado', 'Descubra quanto de juros tem no parcelamento')}
        ${tile('orcamentos', 'target', 'Orçamentos por categoria', budgets ? `${budgets} limite${budgets > 1 ? 's' : ''} definido${budgets > 1 ? 's' : ''}${over ? ` · ${over} estourado${over > 1 ? 's' : ''}` : ''}` : 'Defina quanto quer gastar em cada categoria')}
        ${tile('dicas', 'bulb', 'Dicas para economizar', tips ? `${tips} sugest${tips > 1 ? 'ões' : 'ão'} agora` : 'Tudo em ordem por aqui')}
        <button type="button" class="tile" data-profiles><span class="tile-ic">${icon('home')}</span><span class="tile-main"><b>Perfis</b><small>Contas de outras pessoas (namorada, pai...) separadas das suas</small></span>${icon('chevR', 'muted')}</button>
        ${tile('ajustes', 'card', 'Meus cartões', Object.keys(state.settings.cards || {}).length ? `${Object.keys(state.settings.cards).length} cadastrado${Object.keys(state.settings.cards).length > 1 ? 's' : ''} · final e vencimento` : 'Cadastre o final e o vencimento de cada cartão')}
        ${tile('ajustes', 'gear', 'Ajustes e backup', 'Nome, tema, leitura de prints, exportar dados')}
      </div>`;
  },
  bind(root) {
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-open]')?.dataset.open;
      if (t === 'emprestimo') openLoanContract();
      if (t === 'arquivo') openFileImport();
    });
  },
};
