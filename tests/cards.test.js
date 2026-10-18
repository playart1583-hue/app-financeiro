import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardText, nextDue, splitCard } from '../js/cards.js';

test('separa final e banco do rótulo do cartão', () => {
  assert.deepEqual(splitCard('Nubank · Visa · final 8238'), { last4: '8238', bank: 'Nubank · Visa' });
  assert.deepEqual(splitCard('final 4321'), { last4: '4321', bank: '' });
  assert.deepEqual(splitCard('Cartão: 8238'), { last4: '8238', bank: '' });
  assert.deepEqual(splitCard('Mercado Pago'), { last4: '', bank: 'Mercado Pago' });
  assert.equal(cardText('8238', 'Nubank'), 'Nubank · final 8238');
});

test('próximo vencimento da fatura depois da compra', () => {
  assert.equal(nextDue('2026-10-18', 10), '2026-11-10');
  assert.equal(nextDue('2026-10-02', 20), '2026-10-20');
  assert.equal(nextDue('2026-10-15', 20), '2026-11-20');
  assert.equal(nextDue('2026-01-25', 31), '2026-02-28');
});

test('com o fechamento: antes fica na fatura aberta, no dia ou depois vai para a próxima', () => {
  // fecha dia 3, vence dia 10
  assert.equal(nextDue('2026-10-02', 10, 3), '2026-10-10');
  assert.equal(nextDue('2026-10-03', 10, 3), '2026-11-10');
  assert.equal(nextDue('2026-10-18', 10, 3), '2026-11-10');
  // fecha dia 28, vence dia 5 do mês seguinte
  assert.equal(nextDue('2026-10-27', 5, 28), '2026-11-05');
  assert.equal(nextDue('2026-10-28', 5, 28), '2026-12-05');
  // fecha 31 em mês curto: último dia
  assert.equal(nextDue('2026-02-27', 8, 31), '2026-03-08');
  assert.equal(nextDue('2026-02-28', 8, 31), '2026-04-08');
});

test('reconhece o final do cartão em formatos diferentes', async () => {
  const { findCard } = await import('../js/parser.js');
  for (const t of ['Compra aprovada no cartão final 8238', 'Cartão de crédito 8238 R$ 50,00', 'Cartão: 8238', 'VISA •••• 8238', 'Mastercard ****8238'])
    assert.equal(findCard(t)?.last4, '8238', t);
  assert.equal(findCard('Total R$ 1.234,56 em 10/10/2026')?.last4 ?? null, null);
});
