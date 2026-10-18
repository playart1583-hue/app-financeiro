import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCard, parseAmount, parseQuickEntry, parseReceiptText, parseSerasaText } from '../js/parser.js';
import { categorize } from '../js/categories.js';

const today = new Date(2026, 9, 18);

test('valores em formato brasileiro', () => {
  assert.equal(parseAmount('1.234,56'), 1234.56);
  assert.equal(parseAmount('R$ 52,3'), 52.3);
  assert.equal(parseAmount('12.50'), 12.5);
  assert.equal(parseAmount('1.234'), 1234);
});

test('registro rápido', () => {
  const a = parseQuickEntry('almoço 32,90 débito', today);
  assert.deepEqual([a.type, a.amount, a.method, a.category, a.date], ['expense', 32.9, 'debito', 'restaurantes', '2026-10-18']);
  const b = parseQuickEntry('+ salário 4.500', today);
  assert.deepEqual([b.type, b.amount, b.category], ['income', 4500, 'salario']);
  const c = parseQuickEntry('uber 18 ontem', today);
  assert.equal(c.date, '2026-10-17');
  const d = parseQuickEntry('tênis 3x 120 crédito', today);
  assert.deepEqual([d.amount, d.installments, d.method], [360, 3, 'credito']);
  assert.equal(parseQuickEntry('ifood 45.9', today).amount, 45.9);
});

test('notificação de compra no cartão', () => {
  const r = parseReceiptText('Nubank\nCompra de R$ 152,30 APROVADA em PADARIA DOCE PAO para o cartão com final 4321 em 3x.\n17/10/2026 às 14:32', today);
  assert.equal(r.amount, 152.3);
  assert.equal(r.merchant, 'PADARIA DOCE PAO');
  assert.equal(r.date, '2026-10-17');
  assert.equal(r.time, '14:32');
  assert.equal(r.card.last4, '4321');
  assert.equal(r.card.bank, 'Nubank');
  assert.equal(r.installments, 3);
  assert.equal(r.method, 'credito');
});

test('comprovante de Pix parcelado', () => {
  const r = parseReceiptText('Comprovante Pix\nValor\nR$ 89,90\nData e hora\n15/10/2026 - 09:12:33\nPara\nMERCADO BOM PRECO LTDA\nPix parcelado em 6x de R$ 89,90\nValor à vista R$ 450,00', today);
  assert.equal(r.method, 'pix_parcelado');
  assert.equal(r.amount, 450);
  assert.equal(r.installmentValue, 89.9);
  assert.equal(r.installments, 6);
  assert.equal(r.merchant, 'MERCADO BOM PRECO LTDA');
});

test('cartão: bandeira e final', () => {
  assert.deepEqual(findCard('Visa **** 9876'), { last4: '9876', brand: 'Visa', bank: null });
});

test('lista do Serasa', () => {
  const d = parseSerasaText('Banco Santander\nDívida de R$ 3.245,10\nPague R$ 649,02 à vista\n80% de desconto\nou 12x de R$ 98,00\nVivo\nValor atualizado R$ 412,33\nOferta: R$ 99,90\nDesde 05/03/2024');
  assert.equal(d.length, 2);
  assert.deepEqual([d[0].creditor, d[0].balance, d[0].offer], ['Banco Santander', 3245.1, 649.02]);
  assert.deepEqual(d[0].offerInstallments, { n: 12, pmt: 98 });
  assert.deepEqual([d[1].creditor, d[1].offer, d[1].since], ['Vivo', 99.9, '2024-03-05']);
});

test('categorização automática', () => {
  assert.equal(categorize('IFOOD *RESTAURANTE'), 'restaurantes');
  assert.equal(categorize('Mercado Livre'), 'compras');
  assert.equal(categorize('Supermercado Dia'), 'mercado');
  assert.equal(categorize('Drogasil'), 'saude');
  assert.equal(categorize('rendimento CDB', 'income'), 'investimentos');
});
