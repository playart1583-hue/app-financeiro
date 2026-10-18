import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeInstallments, monthlyToAnnual, outstandingBalance, periodsToPayoff, pricePayment, rateFromInstallments, simulateExtraPayment, simulatePayoff } from '../js/finance.js';

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

test('parcela Price e taxa embutida são inversas', () => {
  const pmt = pricePayment(5000, 0.045, 24);
  close(pmt, 344.94);
  close(rateFromInstallments(5000, pmt, 24), 0.045, 1e-6);
});

test('Pix parcelado: R$ 450 à vista em 6x de R$ 89,90', () => {
  const a = analyzeInstallments({ cashPrice: 450, installment: 89.9, n: 6, investRate: 0.008 });
  close(a.total, 539.4);
  close(a.interest, 89.4);
  close(a.rate, 0.0544, 0.0005);
  assert.equal(a.worthIt, false);
});

test('sem juros quando parcelas somam o preço à vista', () => {
  assert.equal(rateFromInstallments(300, 100, 3), 0);
  const a = analyzeInstallments({ cashPrice: 300, installment: 100, n: 3, investRate: 0.008 });
  assert.equal(a.interest, 0);
  assert.equal(a.worthIt, true);
});

test('1ª parcela no ato aumenta a taxa efetiva', () => {
  assert.ok(rateFromInstallments(450, 89.9, 6, true) > rateFromInstallments(450, 89.9, 6, false));
});

test('saldo devedor zera no fim e bate com a tabela', () => {
  close(outstandingBalance(5000, 0.045, 24, 24), 0);
  close(outstandingBalance(5000, 0, 10, 4), 3000);
  assert.ok(outstandingBalance(5000, 0.045, 24, 8) < 5000);
});

test('periodsToPayoff detecta dívida que nunca acaba', () => {
  assert.equal(periodsToPayoff(1800, 0.14, 200), Infinity);
  assert.equal(periodsToPayoff(1000, 0, 100), 10);
});

test('amortização extra reduz prazo e juros', () => {
  const r = simulateExtraPayment({ balance: 3875, rate: 0.045, pmt: 344.94, extra: 1000 });
  assert.ok(r.monthsSaved > 0);
  assert.ok(r.interestSaved > 0);
});

test('taxa anual composta', () => close(monthlyToAnnual(0.01), 0.1268, 0.0001));

const debts = [
  { id: 'card', name: 'Cartão', kind: 'juros', balance: 1800, rate: 0.14, minPayment: 270 },
  { id: 'loan', name: 'Empréstimo', kind: 'juros', balance: 3875, rate: 0.045, minPayment: 344.94 },
  { id: 'vivo', name: 'Vivo', kind: 'acordo', balance: 99.9 },
];

test('avalanche paga menos juros que bola de neve', () => {
  const av = simulatePayoff(debts, 900, 'avalanche');
  const bn = simulatePayoff(debts, 900, 'bola-de-neve');
  assert.ok(av.feasible && bn.feasible);
  assert.ok(av.totalInterest <= bn.totalInterest);
});

test('nome limpo quita o acordo no primeiro mês', () => {
  const r = simulatePayoff(debts, 900, 'nome-limpo');
  assert.equal(r.events[0].id, 'vivo');
  assert.equal(r.cleanNameMonth, 1);
});

test('orçamento menor que os mínimos sinaliza falta', () => {
  const r = simulatePayoff(debts, 300, 'avalanche', 120);
  assert.equal(r.shortfall, true);
});
