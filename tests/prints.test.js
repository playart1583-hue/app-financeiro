// Leitura de prints reais: valor, forma de pagamento, parcelas, taxa, destinatário e data de cada um.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import PRINTS from '../packages/comprovantes-br/test/fixtures/prints.js';

const today = new Date(2026, 9, 22);
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
  'p1.png': [50, 'pix', 1, null, null, 'Pix para Maria Souza', '2026-10-17', null],
  // Mercado Pago: "R$ 5 ³²" (centavos pequenos no alto) o OCR lê "R$ 5º"; o valor vem da segunda leitura (receipt.js)
  'mp-pix.jpg': [null, 'credito', 1, null, null, 'Pix para Ciclano Pereira da Silva', '2026-10-23', '2223'],
  'p2.png': [23.9, 'credito', 1, null, null, 'PADARIA DOCE PAO', '2026-10-16', '4321'],
  'p3.png': [300, 'credito', 3, 100, null, 'MAGAZINE LOJA', '2026-10-15', null],
  'p4.png': [80, 'credito', 1, null, null, 'LOJA CENTRO', '2026-10-12', '8238'],
  'semcartao.png': [120, 'credito', 1, null, null, 'LOJA BAIRRO', '2026-10-13', null],
};

for (const [name, text] of Object.entries(PRINTS)) {
  test(`print ${name}`, async () => {
    const { parseReceiptText } = await import('../js/parser.js');
    const r = parseReceiptText(text, today);
    assert.deepEqual([r.amount, r.method, r.installments, r.installmentValue, r.fee, r.description, r.date, r.card?.last4 ?? null], EXPECTED[name]);
  });
}

test('mesmo Pix em dois prints (resumo do app e comprovante detalhado) dá o mesmo lançamento', async () => {
  const { parseReceiptText } = await import('../js/parser.js');
  const a = parseReceiptText(PRINTS['am-99.jpg'], today);
  const b = parseReceiptText(PRINTS['am-det.jpg'], today);
  for (const k of ['amount', 'method', 'installments', 'installmentValue', 'description', 'date']) assert.equal(a[k], b[k], k);
});

test('anúncio no fim do comprovante não muda categoria nem forma de pagamento', async () => {
  const { parseReceiptText, stripAds } = await import('../js/parser.js');
  assert.ok(!/telefone|vincule/i.test(stripAds(PRINTS['99jc.jpg'])));
  assert.notEqual(parseReceiptText(PRINTS['am-det.jpg'], today).category, 'contas');
});

test('valor sem centavos no texto pede a segunda leitura dos centavos', async () => {
  const { parseReceiptText } = await import('../js/parser.js');
  const r = parseReceiptText(PRINTS['mp-pix.jpg'], today);
  assert.equal(r.time, '07:39'); // horário da linha da data, não o relógio do celular
  assert.equal(r.card?.bank, 'Bradesco');
});
