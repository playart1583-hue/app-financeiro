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
