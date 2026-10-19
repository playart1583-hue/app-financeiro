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

test('print da Amazon: "Visa terminando em 2223", 6x, sem confundir o final com a loja', async () => {
  const { parseReceiptText } = await import('../js/parser.js');
  const r = parseReceiptText('Pesquisar na Amazon.com.br\nResumo do pedido\nPedido realizado 14 de outubro de 2026\nTotal geral: R$ 218,00\nForma de pagamento\nVisa terminando em 2223\nEm 6x de R$ 36,35 sem juros', new Date(2026, 9, 18));
  assert.deepEqual([r.amount, r.date, r.method, r.card?.last4, r.installments, r.merchant, r.category], [218, '2026-10-14', 'credito', '2223', 6, 'Amazon', 'compras']);
});

test('boleto: vencimento à parte da data do gasto', async () => {
  const { parseReceiptText } = await import('../js/parser.js');
  const r = parseReceiptText('Boleto\nBeneficiário: ESCOLA ABC\nVencimento: 10/11/2026\nValor: R$ 350,00\nLinha digitável 23790.12345', new Date(2026, 9, 18));
  assert.deepEqual([r.method, r.amount, r.dueDate, r.date], ['boleto', 350, '2026-11-10', null]);
});

test('final do cartão: número completo mascarado e formatos de apps diferentes', async () => {
  const { findCard } = await import('../js/parser.js');
  for (const t of ['Mastercard 5502 **** *ik* 8238', '5502 **** **** 8238', 'Visa 4111-xxxx-xxxx-8238', 'xxxx xxxx xxxx 8238', 'Cartão de crédito Mastercard 8238', 'Crédito •8238', '···· 8238', 'Pagamento com Elo 8238'])
    assert.equal(findCard(t)?.last4, '8238', t);
  for (const t of ['Pedido 1234 de 2026 valor 5678', 'Cartão de crédito em 14/10/2026', 'Pedido 702-0981190-6733060'])
    assert.equal(findCard(t)?.last4 ?? null, null, t);
});

test('print do 99Pay: transferência com "Parcelamento 4 x" é Pix parcelado (o anúncio de chave Pix não engana)', async () => {
  const { parseReceiptText } = await import('../js/parser.js');
  const text = 'Transferência concluída com sucesso\nR$252,00\nPara MATHEUS FREIRE DE SOUZA\nValor original R$252,00\nDesconto nas taxas R$1,01\nParcelamento 4 x R$75,34\nData 19/10/26 17:58:09\nVer meu comprovante\nQuer mais benefícios?\nVincule sua chave Pix e ganhe até\nR$5,00\nUse seu CPF ou telefone\nVincular chave Pix\nConcluído';
  const r = parseReceiptText(text, new Date(2026, 9, 19));
  assert.deepEqual([r.method, r.amount, r.installments, r.installmentValue, r.date, r.description, r.category, r.card?.bank ?? null], ['pix_parcelado', 252, 4, 75.34, '2026-10-19', 'Pix parcelado para Matheus Freire de Souza', 'dividas', null]);
  // compra no cartão em parcelas continua sendo crédito
  assert.equal(parseReceiptText('Compra aprovada\nTotal R$ 300,00\n3x de R$ 100,00\nVisa final 8238', new Date(2026, 9, 19)).method, 'credito');
});
