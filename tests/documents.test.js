import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readDocx, readHtml, readRtf } from '../js/documents.js';
import { parseStatementText } from '../js/importers.js';

test('fatura em DOCX: texto, tabela e lançamentos', async () => {
  const doc = await readDocx(readFileSync(new URL('./fixtures/fatura.docx', import.meta.url)));
  assert.equal(doc.tables[0][1].join('|'), '03/10|Ifood *Restaurante|45,90');
  const st = parseStatementText(doc.text, { invoice: true, today: new Date(2026, 9, 18) });
  assert.equal(st.dueDate, '2026-11-10');
  assert.equal(st.total, 194.15);
  assert.deepEqual(st.movements.map((m) => m.kind), ['compra', 'compra', 'compra', 'pagamento']);
  assert.deepEqual(st.movements[1].installment, { i: 3, n: 10 });
});

test('extrato salvo em HTML', () => {
  const { text, tables } = readHtml('<html><head><style>x{}</style></head><body><table><tr><td>05/10/2026</td><td>PIX RECEBIDO JOAO</td><td>120,00</td></tr></table></body></html>');
  assert.equal(text, '05/10/2026  PIX RECEBIDO JOAO  120,00');
  assert.deepEqual(tables[0][0], ['05/10/2026', 'PIX RECEBIDO JOAO', '120,00']);
});

test('RTF com acentos', () => {
  assert.equal(readRtf("{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 03/10\\tab IFOOD\\tab 45,90\\par Cart\\'e3o\\par}").text, '03/10  IFOOD  45,90\nCartão');
});
