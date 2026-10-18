import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemo } from '../js/demo.js';
import { currentBalance, debtsForPlan, loanBalance, monthSummary, projectMonth, projectNextMonths, keyOf } from '../js/analytics.js';
import { buildInsights } from '../js/insights.js';

const today = new Date(2026, 9, 18);
const state = buildDemo(today);

test('resumo do mês soma receitas e despesas', () => {
  const s = monthSummary(state, keyOf(today));
  assert.ok(s.income > 0 && s.expense > 0);
  const cats = s.byCategory.reduce((a, c) => a + c.total, 0);
  assert.ok(Math.abs(cats - s.expense) < 0.01);
});

test('saldo desconta o que está nos cofrinhos', () => {
  const b = currentBalance(state, today);
  assert.equal(b.saved, 2850);
  assert.ok(Math.abs(b.total - b.saved - b.available) < 0.01);
});

test('projeções são coerentes', () => {
  const p = projectMonth(state, today);
  assert.ok(p.projected >= p.spent);
  const next = projectNextMonths(state, today, 6);
  assert.equal(next.length, 6);
  for (const m of next) assert.ok(m.total >= m.committed);
});

test('dívidas para o plano incluem acordos do Serasa', () => {
  const d = debtsForPlan(state);
  assert.ok(d.some((x) => x.kind === 'acordo' && x.balance === 99.9));
  assert.ok(loanBalance(state.loans[0]) > 0);
});

test('sugestões são geradas e ordenadas por gravidade', () => {
  const list = buildInsights(state, today);
  assert.ok(list.length >= 3);
  const rank = { alerta: 0, atencao: 1, dica: 2, ok: 3 };
  for (let i = 1; i < list.length; i++) assert.ok(rank[list[i - 1].level] <= rank[list[i].level]);
  assert.ok(list.some((i) => i.id === 'serasa'));
});

import { interestCommitments } from '../js/analytics.js';
import { loanImpact } from '../js/impact.js';
import { analyzeLoanOffer } from '../js/finance.js';

test('encerrar antes: ordena por juros e ignora parcelamento sem juros', () => {
  const list = interestCommitments(state, today);
  const paid = list.filter((c) => !c.interestFree);
  for (let i = 1; i < paid.length; i++) assert.ok(paid[i - 1].rate >= paid[i].rate);
  const pix = list.find((c) => c.id === 'demo-pix');
  assert.ok(pix.savings > 0 && pix.payoffToday < pix.remainingTotal);
  assert.equal(list.at(-1).interestFree, true);
});

test('custo real de oferta com IOF e tarifas', () => {
  const a = analyzeLoanOffer({ released: 5000, financed: 5420.5, pmt: 372.15, n: 24, statedRate: 0.045 });
  assert.equal(a.fees, 420.5);
  assert.ok(a.effRate > a.nominal);
  assert.equal(a.cost, 3931.6);
});

test('impacto: trocar rotativo por consignado economiza juros e libera parcela', () => {
  const r = loanImpact(state, { released: 3000, financed: 3200, pmt: 160, n: 24, statedRate: 0.025, kind: 'consignado' }, ['demo-rot'], today);
  assert.ok(r.payoff.oldInterest > r.payoff.loanInterestShare);
  assert.equal(r.payoff.freed, 270);
  assert.ok(r.surplusAfter > r.surplusBefore);
  assert.notEqual(r.verdict.level, 'alerta');
});

test('impacto: empréstimo caro sem finalidade aperta o mês', () => {
  const r = loanImpact(state, { released: 5000, pmt: 520, n: 24, kind: 'emprestimo' }, [], today);
  assert.ok(r.surplusAfter < r.surplusBefore);
  assert.equal(r.verdict.level, 'alerta');
});
