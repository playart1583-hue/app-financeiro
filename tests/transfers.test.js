import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPair, isOwnName, looksOwnTransfer } from '../js/transfers.js';

test('reconhece o próprio nome com iniciais e sobrenomes', () => {
  const own = ['maria aparecida souza'];
  assert.ok(isOwnName('MARIA A SOUZA', own));
  assert.ok(isOwnName('Maria Souza', own));
  assert.ok(!isOwnName('Maria Lima', own));
  assert.ok(!isOwnName('Maria', own));
});

test('frases de transferência para conta própria', () => {
  assert.ok(looksOwnTransfer({ raw: 'Itaú Pix enviado para conta de mesma titularidade R$ 100,00' }));
  assert.ok(looksOwnTransfer({ raw: 'Mercado Pago Você adicionou R$ 50,00 à sua conta' }));
  assert.ok(looksOwnTransfer({ raw: 'Santander Pix enviado R$ 80,00 para MERCADO PAGO', merchant: 'MERCADO PAGO' }));
  assert.ok(!looksOwnTransfer({ raw: 'Santander Pix enviado R$ 80,00 para JOAO LIMA', merchant: 'JOAO LIMA' }));
});

test('par: saiu de um app e entrou no outro, mesmo valor, poucos minutos', () => {
  const out = { id: 'a', type: 'expense', amount: 200, date: '2026-10-18', time: '10:00', card: 'Santander', merchant: 'MARIA A SOUZA' };
  const inn = { id: 'b', type: 'income', amount: 200, date: '2026-10-18', time: '10:02', card: 'Mercado Pago', merchant: 'Maria Aparecida Souza' };
  assert.equal(findPair(inn, [out])?.id, 'a');
  assert.equal(findPair({ ...inn, time: '11:00' }, [out]), undefined);
  assert.equal(findPair({ ...inn, amount: 199 }, [out]), undefined);
  assert.equal(findPair({ ...inn, merchant: 'Carlos Dias' }, [out]), undefined);
});
