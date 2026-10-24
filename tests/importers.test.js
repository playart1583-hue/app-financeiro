import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSource, extractInstallment, guessColumns, invoiceSum, parseCSV, parseDateAny, parseJSONData, parseOFX, parseSignedAmount, parseStatementText, tableToMovements } from '../js/importers.js';

const today = new Date(2026, 9, 18);
const fromCSV = (csv, opts = {}) => {
  const t = parseCSV(csv);
  const src = detectSource(t.headers);
  return { src, list: tableToMovements(t.rows, guessColumns(t.headers, t.rows), { positiveIsExpense: src.positiveIsExpense, ...opts }) };
};

test('valores com sinal em vários formatos', () => {
  assert.equal(parseSignedAmount('-1.234,56'), -1234.56);
  assert.equal(parseSignedAmount('(12,00)'), -12);
  assert.equal(parseSignedAmount('12,00 D'), -12);
  assert.equal(parseSignedAmount('1,234.56'), 1234.56);
  assert.equal(parseSignedAmount(45.9), 45.9);
});

test('datas em vários formatos', () => {
  assert.equal(parseDateAny('03/10/2026'), '2026-10-03');
  assert.equal(parseDateAny('2026-10-03'), '2026-10-03');
  assert.equal(parseDateAny('20261003120000[-3:BRT]'), '2026-10-03');
  assert.equal(parseDateAny('03 OUT', 2026), '2026-10-03');
  assert.equal(parseDateAny(46298), '2026-10-03');
});

test('fatura do Nubank em CSV: pagamento, estorno, IOF e parcela', () => {
  const { src, list } = fromCSV('date,title,amount\n2026-10-03,Ifood *Restaurante,45.90\n2026-10-05,Amazon - Parcela 3/10,129.90\n2026-10-08,Pagamento recebido,-1500.00\n2026-10-09,Estorno de compra,-20.00\n2026-10-10,IOF de compra internacional,3.45');
  assert.equal(src.id, 'nubank-cartao');
  assert.deepEqual(list.map((m) => [m.type, m.amount, m.kind]), [['expense', 45.9, 'compra'], ['expense', 129.9, 'compra'], ['income', 1500, 'pagamento'], ['income', 20, 'estorno'], ['expense', 3.45, 'encargo']]);
  assert.deepEqual(list[1].installment, { i: 3, n: 10 });
  assert.equal(list[1].description, 'Amazon');
  assert.equal(list[0].category, 'restaurantes');
});

test('extrato do Inter junta histórico e descrição', () => {
  const { list } = fromCSV('Extrato\nData Lançamento;Histórico;Descrição;Valor;Saldo\n10/10/2026;Pix enviado;UBER DO BRASIL;-18,90;1.234,56\n11/10/2026;Pix recebido;JOAO LIMA;120,00;1.354,56');
  assert.equal(list[0].description, 'Pix enviado - UBER DO BRASIL');
  assert.equal(list[0].category, 'transporte');
  assert.equal(list[1].type, 'income');
});

test('colunas de débito e crédito separadas, e categoria de outro app', () => {
  assert.deepEqual(fromCSV('Data;Descrição;Débito;Crédito;Saldo\n10/10/2026;Mercado Assaí;245,30;;1.000,00\n11/10/2026;Salário;;4.200,00;5.200,00').list.map((m) => [m.type, m.amount]), [['expense', 245.3], ['income', 4200]]);
  const { list } = fromCSV('Data;Descrição;Valor;Conta;Categoria\n03/10/2026;Almoço;-32,90;Nubank;Alimentação');
  assert.deepEqual([list[0].category, list[0].card], ['restaurantes', 'Nubank']);
});

test('OFX', () => {
  const o = parseOFX('<OFX><BANKACCTFROM><BANKID>0341<ACCTID>123456</BANKACCTFROM><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010<TRNAMT>-45.90<FITID>A1<MEMO>IFOOD *RESTAURANTE</STMTTRN><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>4200.00<FITID>A2<NAME>SALARIO</STMTTRN></OFX>');
  assert.equal(o.movements.length, 2);
  assert.deepEqual([o.movements[0].fitid, o.movements[0].type, o.movements[1].type], ['A1', 'expense', 'income']);
});

test('fatura em texto (PDF): cabeçalho, ano anterior e soma', () => {
  const st = parseStatementText('Fatura\nVencimento: 10/01/2027\nTotal da fatura R$ 194,15\nCartão final 4321\n15 DEZ Ifood 45,90\n20 DEZ Amazon Parcela 3/10 129,90\n03 JAN Uber 18,90\n28 NOV Pagamento em 10 NOV -980,00', { today });
  assert.equal(st.isInvoice, true);
  assert.equal(st.dueDate, '2027-01-10');
  assert.equal(st.total, 194.15);
  assert.equal(st.movements[0].date, '2026-12-15');
  assert.equal(st.movements[2].date, '2027-01-03');
  assert.equal(st.movements[3].kind, 'pagamento');
  assert.ok(Math.abs(invoiceSum(st.movements) - 194.7) < 0.01);
});

test('extrato em texto com D/C', () => {
  const st = parseStatementText('05/10 PIX RECEBIDO JOAO 120,00 C\n06/10 COMPRA DROGASIL 89,90 D', { today });
  assert.deepEqual(st.movements.map((m) => m.type), ['income', 'expense']);
});

test('parcela na descrição', () => {
  assert.deepEqual(extractInstallment('LOJA X PARC 02/06'), { i: 2, n: 6 });
  assert.equal(extractInstallment('12/10 compra'), null);
});

test('JSON: backup ou lista de outro app', () => {
  assert.ok(parseJSONData(JSON.stringify({ settings: {}, transactions: [] })).backup);
  const t = parseJSONData(JSON.stringify([{ data: '03/10/2026', descricao: 'Café', valor: -8.5 }]));
  assert.deepEqual(t.headers, ['data', 'descricao', 'valor']);
});
