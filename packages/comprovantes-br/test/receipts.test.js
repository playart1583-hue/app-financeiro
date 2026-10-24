import { test } from 'node:test';
import assert from 'node:assert/strict';
import PRINTS from './fixtures/prints.js';
import { findCard, findDate, findInstallments, nameCase, normalize, parseAmount, parseReceipt, stripAds } from '../src/index.js';

const today = new Date(2026, 9, 22);

// Texto real lido por OCR de prints de bancos e carteiras (dados pessoais trocados).
// [valor, forma, parcelas, valor da parcela, taxa, descrição, data, final do cartão]
const EXPECTED = {
  '99jc.jpg': [41.95, 'pix_parcelado', 2, 23.91, null, 'Pix parcelado para JC Servicos e Apoio Administrativos', '2026-10-22', null],
  '99parc.jpg': [252, 'pix_parcelado', 4, 75.34, null, 'Pix parcelado para Fulano de Tal', '2026-10-19', null],
  'am-99.jpg': [42.96, 'pix_parcelado', 2, 24.49, null, 'Pix parcelado para A&M 2Business', '2026-10-22', null],
  'am-det.jpg': [42.96, 'pix_parcelado', 2, 24.49, null, 'Pix parcelado para A&M 2Business', '2026-10-22', null],
  'amazon.jpg': [218, 'credito', 6, 36.35, null, 'Amazon', '2026-10-14', '2223'],
  'boleto.png': [350, 'boleto', 1, null, null, 'ESCOLA ABC', null, null],
  'csf.jpg': [31.49, 'pix', 1, null, 1.49, 'BANCO CSF', '2026-10-22', null],
  'mc8238.png': [150, null, 1, null, null, 'MAGAZINE CENTRO', '2026-10-15', '8238'],
  'mp-pix.jpg': [null, 'credito', 1, null, null, 'Pix para Ciclano Pereira da Silva', '2026-10-23', '2223'],
  'p1.png': [50, 'pix', 1, null, null, 'Pix para Maria Souza', '2026-10-17', null],
  'p2.png': [23.9, 'credito', 1, null, null, 'PADARIA DOCE PAO', '2026-10-16', '4321'],
  'p3.png': [300, 'credito', 3, 100, null, 'MAGAZINE LOJA', '2026-10-15', null],
  'p4.png': [80, 'credito', 1, null, null, 'LOJA CENTRO', '2026-10-12', '8238'],
  'semcartao.png': [120, 'credito', 1, null, null, 'LOJA BAIRRO', '2026-10-13', null],
};

for (const [name, text] of Object.entries(PRINTS)) {
  test(`print real: ${name}`, () => {
    const r = parseReceipt(text, { today });
    assert.deepEqual([r.amount, r.method, r.installments, r.installmentValue, r.fee, r.description, r.date, r.card?.last4 ?? null], EXPECTED[name]);
  });
}

test('categoria vem da função passada nas opções', () => {
  const categorize = (text) => (/padaria/i.test(text) ? 'restaurantes' : null);
  assert.equal(parseReceipt(PRINTS['p2.png'], { today, categorize }).category, 'restaurantes');
  assert.equal(parseReceipt(PRINTS['p2.png'], { today }).category, null);
});

test('valores em reais', () => {
  assert.equal(parseAmount('1.234,56'), 1234.56);
  assert.equal(parseAmount('R$ 52'), 52);
  assert.equal(parseAmount('12.50'), 12.5);
  assert.ok(Number.isNaN(parseAmount('sem valor')));
});

test('datas', () => {
  assert.equal(findDate('Data 22/10/26 12:47:58', today), '2026-10-22');
  assert.equal(findDate('Pedido realizado 14 de outubro de 2026', today), '2026-10-14');
  assert.equal(findDate('23/out - 07:39', today), '2026-10-23');
  assert.equal(findDate('ontem', today), '2026-10-21');
});

test('parcelas: formatos e armadilhas', () => {
  const n = (s) => findInstallments(normalize(s))?.n ?? null;
  assert.equal(n('Em 6x de R$ 36,35 sem juros'), 6);
  assert.equal(n('Parcelamento 2xR$24,49'), 2);
  assert.equal(n('Parcelamento 2'), 2);
  assert.equal(n('em 10 parcelas de 199,90'), 10);
  assert.equal(n('12:48\nx'), null); // relógio do celular + X de fechar
  assert.equal(n('parcela 2/10'), null); // parcela atual, não o total
});

test('final do cartão', () => {
  for (const t of ['Compra aprovada no cartão final 8238', 'Visa terminando em 8238', 'Mastercard 5502 **** *ik* 8238', 'Cartão: 8238', 'Crédito •8238'])
    assert.equal(findCard(t)?.last4, '8238', t);
  assert.equal(findCard('Pedido 1234 de 2026 valor 5678')?.last4 ?? null, null);
});

test('propaganda e nomes', () => {
  assert.equal(stripAds('Pix enviado\nR$ 10,00\nQuer mais benefícios?\nVincule sua chave Pix e ganhe até\nR$5,00\nConcluído'), 'Pix enviado\nR$ 10,00');
  assert.equal(nameCase('JC SERVICOS E APOIO ADMINISTRATIVOS LTDA'), 'JC Servicos e Apoio Administrativos');
  assert.equal(nameCase('A&M 2BUSINESS LTDA'), 'A&M 2Business');
});
