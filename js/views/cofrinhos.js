import { averages, currentBalance, goalSaved, keyOf } from '../analytics.js';
import { futureValue, monthlyToAnnual, monthlyToReach } from '../finance.js';
import { addGoal, deleteGoal, goalMove } from '../store.js';
import { dateBR, emptyState, html, icon, money, moneyInput, openSheet, pct, progress, readMoney, toast } from '../ui.js';

const EMOJIS = ['🐷', '🛟', '🏖️', '🏠', '🚗', '🎓', '💍', '🎁', '📱', '👶', '🩺', '✈️'];

function monthsUntil(iso) {
  if (!iso) return 0;
  const now = new Date();
  const d = new Date(iso + 'T12:00:00');
  return Math.max(0, (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth());
}

export default {
  id: 'cofrinhos',
  title: 'Cofrinhos',
  back: 'planejar',
  render({ state }) {
    const rate = state.settings.savingsRate;
    const avg = averages(state, keyOf(new Date()));
    const bal = currentBalance(state);
    const sobra = Math.max(0, avg.income - avg.expense);
    const sugestao = Math.max(avg.income * 0.1, Math.min(sobra, avg.income * 0.2));
    return html`<header class="page-head"><h1>Cofrinhos</h1><p>Separe o dinheiro de cada objetivo. O valor guardado sai do saldo disponível.</p></header>
      <div class="summary3 two">
        <div><small>Total guardado</small><b class="income">${money(bal.saved)}</b></div>
        <div><small>Rendimento estimado</small><b>${pct(rate, 2)} a.m.</b><small>${pct(monthlyToAnnual(rate), 1)} ao ano</small></div>
      </div>
      ${avg.income > 0
        ? html`<section class="card tip-card"><p class="card-title">${icon('bulb')} Quanto guardar por mês</p>
            <p>Sugestão: <b>${money(sugestao)}</b> por mês${sobra > 0 ? `, perto do que costuma sobrar (${money(sobra)})` : ' (10% da sua renda)'}. Em 12 meses, rendendo ${pct(rate, 2)} ao mês, isso vira <b>${money(futureValue(sugestao, rate, 12))}</b>.</p>
            <p class="hint">Guarde no dia em que o salário cai, antes de gastar: é o jeito que mais funciona.</p></section>`
        : ''}
      <div class="row-between"><h2 class="section-title">Suas metas</h2><button type="button" class="btn primary sm" data-act="new-goal">${icon('plus')} Novo cofrinho</button></div>
      ${state.goals.length
        ? html`<div class="goals">${state.goals.map((g) => {
            const s = goalSaved(g);
            const m = monthsUntil(g.deadline);
            const need = g.deadline ? monthlyToReach(g.target, s, rate, m) : 0;
            const done = s >= g.target;
            return html`<article class="card goal">
              <div class="goal-head"><span class="goal-emoji" aria-hidden="true">${g.emoji}</span><div class="grow"><h3>${g.name}</h3><small>${g.deadline ? `Até ${dateBR(g.deadline)}` : 'Sem prazo'}</small></div><b>${pct(g.target ? s / g.target : 0)}</b></div>
              ${progress(s, g.target, { cls: done ? 'done' : '' })}
              <div class="row-between"><span>${money(s)}</span><small>meta ${money(g.target)}</small></div>
              ${done ? html`<p class="pill ok">${icon('check')} Meta atingida</p>` : g.deadline ? html`<p class="hint">Guarde <b>${money(need)}</b> por mês para chegar lá em ${m} ${m === 1 ? 'mês' : 'meses'}.</p>` : ''}
              <div class="goal-actions"><button type="button" class="btn primary sm" data-act="deposit" data-id="${g.id}">${icon('plus')} Guardar</button><button type="button" class="btn ghost sm" data-act="withdraw" data-id="${g.id}">${icon('minus')} Retirar</button><button type="button" class="icon-btn" data-act="del-goal" data-id="${g.id}" aria-label="Excluir cofrinho">${icon('trash')}</button></div>
            </article>`;
          })}</div>`
        : emptyState('Nenhum cofrinho ainda', 'Comece pela reserva de emergência: 6 meses dos seus gastos essenciais.', html`<button type="button" class="btn primary" data-act="new-goal">Criar reserva de emergência</button>`)}`;
  },
  bind(root, { state }) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const g = state.goals.find((x) => x.id === b.dataset.id);
      if (b.dataset.act === 'new-goal') openGoalForm(state);
      if (b.dataset.act === 'deposit' || b.dataset.act === 'withdraw') openMove(g, b.dataset.act === 'deposit' ? 1 : -1);
      if (b.dataset.act === 'del-goal') {
        if (!b.dataset.armed) {
          b.dataset.armed = '1';
          b.classList.add('danger');
          b.setAttribute('aria-label', 'Toque de novo para excluir');
          toast('Toque de novo na lixeira para excluir o cofrinho. O valor volta para o saldo.');
          return;
        }
        deleteGoal(g.id);
        toast('Cofrinho excluído');
      }
    });
  },
};

function openGoalForm(state) {
  const avg = averages(state, keyOf(new Date()));
  const first = !state.goals.length;
  openSheet({
    title: 'Novo cofrinho',
    body: html`<form class="form" id="gf">
      <label class="field"><span>Nome</span><input name="name" required value="${first ? 'Reserva de emergência' : ''}" placeholder="Ex.: Viagem, Reserva, Notebook"></label>
      <fieldset class="field"><legend>Ícone</legend><div class="chips wrap">${EMOJIS.map((em, i) => html`<label class="chip emoji"><input type="radio" name="emoji" value="${em}" ${i === (first ? 1 : 0) ? 'checked' : ''}><span>${em}</span></label>`)}</div></fieldset>
      <div class="row2">
        <label class="field"><span>Meta (R$)</span><input name="target" inputmode="decimal" required value="${first && avg.essencial ? moneyInput(Math.round(avg.essencial * 6)) : ''}"></label>
        <label class="field"><span>Prazo</span><input name="deadline" type="date"></label>
      </div>
      ${first && avg.essencial ? html`<p class="hint">Sugestão: 6× seus gastos essenciais médios (${money(avg.essencial)} por mês).</p>` : ''}
      <p class="field-error" hidden></p>
      <button class="btn primary" type="submit">Criar cofrinho</button>
    </form>`,
    onMount(sheet) {
      const f = sheet.body.querySelector('#gf');
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const target = readMoney(f.elements.target.value);
        if (!f.elements.name.value.trim() || !(target > 0)) {
          const err = f.querySelector('.field-error');
          err.hidden = false;
          err.textContent = 'Dê um nome e uma meta maior que zero.';
          return;
        }
        addGoal({ name: f.elements.name.value.trim(), emoji: f.querySelector('[name=emoji]:checked')?.value, target, deadline: f.deadline.value });
        sheet.close();
        toast('Cofrinho criado');
      });
    },
  });
}

function openMove(goal, dir) {
  const saved = goalSaved(goal);
  openSheet({
    title: dir > 0 ? `Guardar em ${goal.name}` : `Retirar de ${goal.name}`,
    body: html`<form class="form" id="mv">
      <label class="amount-field"><span class="cur">R$</span><input name="amount" inputmode="decimal" placeholder="0,00" required></label>
      ${dir < 0 ? html`<p class="hint">Disponível no cofrinho: ${money(saved)}</p>` : html`<div class="chips">${[50, 100, 200, 500].map((v) => html`<button type="button" class="chip-btn" data-v="${v}">+ ${money(v, { force: true })}</button>`)}</div>`}
      <p class="field-error" hidden></p>
      <button class="btn primary" type="submit">${dir > 0 ? 'Guardar' : 'Retirar'}</button>
    </form>`,
    onMount(sheet) {
      const f = sheet.body.querySelector('#mv');
      f.addEventListener('click', (e) => {
        const v = e.target.closest('[data-v]')?.dataset.v;
        if (v) f.amount.value = moneyInput((readMoney(f.amount.value) || 0) + +v);
      });
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = readMoney(f.amount.value);
        const err = f.querySelector('.field-error');
        if (!(v > 0)) {
          err.hidden = false;
          err.textContent = 'Informe um valor maior que zero.';
          return;
        }
        if (dir < 0 && v > saved + 0.001) {
          err.hidden = false;
          err.textContent = `O cofrinho tem só ${money(saved, { force: true })}.`;
          return;
        }
        goalMove(goal.id, dir * v);
        sheet.close();
        toast(dir > 0 ? `${money(v, { force: true })} guardados` : `${money(v, { force: true })} retirados`);
      });
    },
  });
}
