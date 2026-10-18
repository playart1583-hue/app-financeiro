import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCard, parseAmount, parseNotifications, parseQuickEntry, parseReceiptText, parseSerasaText, templateKeys } from '../js/parser.js';
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

import { parseLoanText } from '../js/parser.js';

test('notificações do Mercado Pago, 99 e bancos', () => {
  const list = parseNotifications('Mercado Pago\nVocê enviou um Pix de R$ 50,00 para Maria Souza.\n\n99\nSua corrida foi paga. Total R$ 18,90 às 08:15\n\n99Pay\nPix recebido: você recebeu R$ 120,00 de João Lima', today);
  assert.equal(list.length, 3);
  assert.deepEqual([list[0].type, list[0].amount, list[0].description, list[0].method, list[0].app], ['expense', 50, 'Pix para Maria Souza', 'pix', 'Mercado Pago']);
  assert.deepEqual([list[1].amount, list[1].category, list[1].time], [18.9, 'transporte', '08:15']);
  assert.deepEqual([list[2].type, list[2].amount, list[2].description], ['income', 120, 'Pix de João Lima']);
});

test('"mercado pago" não vira categoria Mercado', () => {
  assert.equal(categorize('Mercado Pago'), 'outros');
});

test('contrato de empréstimo (CCB)', () => {
  const c = parseLoanText('CÉDULA DE CRÉDITO BANCÁRIO - Banco Inter\nValor Total Financiado: R$ 5.420,50\nValor Líquido Liberado: R$ 5.000,00\nIOF: R$ 120,50\nTarifa de Cadastro: R$ 300,00\nQuantidade de Parcelas: 24\nValor da Parcela: R$ 372,15\nTaxa de Juros: 4,50% a.m. / 69,59% a.a.\nCET: 5,32% a.m. 86,24% a.a.\nVencimento da 1ª parcela: 20/11/2026', today);
  assert.deepEqual([c.creditor, c.released, c.financed, c.n, c.pmt, c.iof, c.tariff, c.firstDue], ['Inter', 5000, 5420.5, 24, 372.15, 120.5, 300, '2026-11-20']);
  assert.ok(Math.abs(c.statedRate - 0.045) < 1e-9);
  assert.ok(Math.abs(c.cetMonthly - 0.0532) < 1e-9);
});

test('simulação de consignado', () => {
  const c = parseLoanText('Simulação consignado INSS\nVocê recebe R$ 3.000,00\n84 parcelas de R$ 64,90\nTaxa 1,80% ao mês\nCET 1,95% ao mês', today);
  assert.deepEqual([c.kind, c.released, c.n, c.pmt], ['consignado', 3000, 84, 64.9]);
  assert.ok(Math.abs(c.statedRate - 0.018) < 1e-9);
});

test('notificações: entrada x saída em frases diferentes', () => {
  const cases = [
    ['Mercado Pago Pix enviado Você enviou R$ 50,00 para Maria Souza', 'expense', 'Pix para Maria Souza'],
    ['Mercado Pago Você recebeu um Pix de R$ 50,00 de João', 'income', 'Pix de João'],
    ['Mercado Pago João Silva te enviou R$ 20,00', 'income', 'João Silva'],
    ['Mercado Pago Pix enviado Maria Souza recebeu seu Pix de R$ 30,00', 'expense', 'Pix para Maria Souza'],
    ['Mercado Pago Seu Pix foi recebido por Maria R$ 30,00', 'expense', 'Pix para Maria'],
    ['Mercado Pago Transferência realizada R$ 15,00 para Ana', 'expense', 'Transferência para Ana'],
    ['Mercado Pago Ana Paula enviou um Pix de R$ 40,00 para você', 'income', 'Pix de Ana Paula'],
    ['Mercado Pago Chegou um Pix de R$ 12,00', 'income', null],
    ['Nubank Compra aprovada R$ 12,90 em PADARIA', 'expense', 'PADARIA'],
  ];
  for (const [text, type, description] of cases) {
    const [r] = parseNotifications(text, today);
    assert.deepEqual([r.type, r.description], [type, description], text);
  }
});

test('molde da notificação ignora valor, data e nome', () => {
  const a = templateKeys('Mercado Pago João Silva te enviou R$ 20,00\n18/10/2026 19:20', 'João Silva');
  const b = templateKeys('Mercado Pago Ana te enviou R$ 7,50\n19/10/2026 08:02', 'Ana');
  assert.deepEqual(a, b);
  assert.equal(a[0], 'mercado pago te enviou');
});
