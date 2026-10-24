// Importação de arquivos de outros apps e bancos: CSV/TSV/TXT, OFX, planilhas (linhas já lidas), JSON,
// texto de extrato e fatura de cartão (PDF/print/texto). Tudo puro: recebe texto ou linhas e devolve movimentos.
//
// Movimento: { date, time, description, amount (positivo), type: 'expense'|'income', category?, rawCategory?,
//              installment?: { i, n }, kind?: 'compra'|'pagamento'|'estorno'|'encargo'|'transferencia', fitid?, card? }
import { categorize, normalize } from './categories.js';
import { findCard, pad, parseAmount } from './parser.js';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// ---------- Números e datas ----------

/** "-1.234,56" | "(12,00)" | "12,00 D" | "1,234.56" | "R$ -5" | 12.5 -> número com sinal */
export function parseSignedAmount(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim();
  if (!s) return NaN;
  let sign = 1;
  if (/^\(.*\)$/.test(s) || /-/.test(s.replace(/\d-\d/g, '')) || /\s[dD]$/.test(s) || /\bd[eé]bito\b/i.test(s)) sign = -1;
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  // formato americano "1,234.56": vírgula antes do ponto
  if (/,\d{3}\./.test(s) || (/\.\d{1,2}$/.test(s) && /,/.test(s) && s.indexOf(',') < s.lastIndexOf('.'))) s = s.replace(/,/g, '');
  const n = parseAmount(s);
  return Number.isFinite(n) ? sign * n : NaN;
}

/** Datas em formatos comuns. refYear completa "dd/mm" sem ano. */
export function parseDateAny(v, refYear = new Date().getFullYear()) {
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // número serial do Excel
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = normalize(String(v ?? '').trim());
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})/); // OFX 20261018120000
  if (m && +m[2] <= 12) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) {
    let y = m[3] ? +m[3] : refYear;
    if (y < 100) y += 2000;
    return `${y}-${pad(+m[2])}-${pad(+m[1])}`;
  }
  m = s.match(/^(\d{1,2})\s*(?:de\s*)?([a-z]{3})[a-z]*\.?(?:\s*(?:de\s*)?(\d{2,4}))?/);
  if (m) {
    let mon = MONTHS.indexOf(m[2]);
    if (mon < 0) mon = MONTHS_EN.indexOf(m[2]);
    if (mon >= 0) {
      let y = m[3] ? +m[3] : refYear;
      if (y < 100) y += 2000;
      return `${y}-${pad(mon + 1)}-${pad(+m[1])}`;
    }
  }
  return null;
}

// ---------- CSV ----------

export function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let best = ',';
  let bestScore = -1;
  for (const d of [';', ',', '\t', '|']) {
    const counts = sample.map((l) => splitLine(l, d).length);
    const consistent = counts.filter((c) => c === counts[0]).length;
    const score = counts[0] > 1 ? counts[0] * 10 + consistent : 0;
    if (score > bestScore) (best = d), (bestScore = score);
  }
  return best;
}

function splitLine(line, d) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') (cur += '"'), i++;
      else q = !q;
    } else if (c === d && !q) out.push(cur), (cur = '');
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/** CSV/TSV com aspas, ; , tab ou |. Pula linhas de cabeçalho do banco antes da tabela. */
export function parseCSV(text) {
  const clean = String(text || '').replace(/^﻿/, '');
  const d = detectDelimiter(clean);
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.map((l) => splitLine(l, d));
  const width = Math.max(...rows.map((r) => r.length));
  // cabeçalho = primeira linha com a largura da tabela e sem valores monetários
  let h = rows.findIndex((r) => r.length >= Math.min(width, 3) && !r.some((c) => /^-?r?\$?\s*-?\d[\d.]*,\d{2}$/i.test(c)));
  if (h < 0) h = 0;
  const looksHeader = rows[h].some((c) => /[a-z]{3,}/i.test(c)) && !rows[h].some((c) => parseDateAny(c) && /\d/.test(c));
  return looksHeader ? { headers: rows[h], rows: rows.slice(h + 1).filter((r) => r.some(Boolean)) } : { headers: rows[0].map((_, i) => `Coluna ${i + 1}`), rows };
}

// ---------- Colunas ----------

const COL = {
  date: /^(data|date|dt|dia|data (?:da )?(?:compra|transacao|lancamento|movimento|operacao)|release_date|data lancamento)/,
  description: /(descri|historico|title|titulo|estabelecimento|lancamento$|detalhe|memo|nome|transaction_type|identificacao|favorecido)/,
  amount: /^(valor|amount|quantia|montante|transaction_net_amount|valor \(r\$\)|valor r\$|value)/,
  debit: /(debito|saida|despesa|retirada|^debit)/,
  credit: /(credito|entrada|receita|deposito|^credit)/,
  type: /^(tipo|type|natureza|d\/c|c\/d|operacao)$/,
  category: /(categoria|category|classificacao)/,
  time: /^(hora|horario|time)/,
  account: /^(conta|cartao|account|carteira|banco)$/,
};

/** Adivinha quais colunas são data, descrição, valor etc. pelo cabeçalho e, se preciso, pelo conteúdo. */
export function guessColumns(headers, rows) {
  const h = headers.map(normalize);
  const pick = (re, used = []) => h.findIndex((x, i) => re.test(x) && !used.includes(i));
  const m = { date: pick(COL.date), time: pick(COL.time) };
  m.amount = pick(COL.amount);
  m.debit = m.amount < 0 ? pick(COL.debit) : -1;
  m.credit = m.amount < 0 ? pick(COL.credit) : -1;
  m.type = pick(COL.type);
  m.category = pick(COL.category);
  m.account = pick(COL.account);
  m.description = pick(COL.description, [m.date, m.amount, m.category, m.type]);
  // bancos que separam "Histórico" e "Descrição": junta as duas ("Pix enviado - UBER DO BRASIL")
  m.description2 = m.description >= 0 ? pick(COL.description, [m.date, m.amount, m.category, m.type, m.description]) : -1;
  const sample = rows.slice(0, 30);
  const share = (i, f) => sample.filter((r) => f(r[i])).length / Math.max(1, sample.length);
  if (m.date < 0) m.date = headers.findIndex((_, i) => share(i, (v) => parseDateAny(v) && /\d/.test(String(v))) > 0.6);
  if (m.amount < 0 && m.debit < 0) {
    const used = [m.date];
    // valor = coluna numérica mais à direita que não seja saldo
    for (let i = headers.length - 1; i >= 0; i--) {
      if (used.includes(i) || /saldo|balance/.test(h[i])) continue;
      if (share(i, (v) => Number.isFinite(parseSignedAmount(v)) && !parseDateAny(v)) > 0.6) {
        m.amount = i;
        break;
      }
    }
  }
  if (m.description < 0) {
    let bestLen = 0;
    headers.forEach((_, i) => {
      if ([m.date, m.amount, m.debit, m.credit, m.category, m.type].includes(i)) return;
      const len = sample.reduce((s, r) => s + (Number.isFinite(parseSignedAmount(r[i])) ? 0 : String(r[i] || '').length), 0);
      if (len > bestLen) (bestLen = len), (m.description = i);
    });
  }
  return m;
}

/** Reconhece exportações conhecidas pelo cabeçalho. */
export function detectSource(headers) {
  const h = headers.map(normalize).join('|');
  if (/^date\|title\|amount/.test(h)) return { id: 'nubank-cartao', label: 'Nubank (fatura do cartão)', invoice: true, positiveIsExpense: true };
  if (/data\|valor\|identificador\|descricao/.test(h)) return { id: 'nubank-conta', label: 'Nubank (conta)' };
  if (/release_date/.test(h) && /transaction_net_amount/.test(h)) return { id: 'mercadopago', label: 'Mercado Pago (extrato)' };
  if (/data lancamento\|historico\|descricao\|valor/.test(h)) return { id: 'inter', label: 'Banco Inter (extrato)' };
  if (/conta/.test(h) && /categoria/.test(h)) return { id: 'app-financas', label: 'App de finanças (Mobills, Organizze ou similar)' };
  return { id: 'generico', label: 'Planilha' };
}

const CATEGORY_NAMES = {
  alimentacao: 'restaurantes', restaurante: 'restaurantes', restaurantes: 'restaurantes', delivery: 'restaurantes', lanche: 'restaurantes',
  supermercado: 'mercado', mercado: 'mercado', feira: 'mercado',
  transporte: 'transporte', combustivel: 'transporte', carro: 'transporte', uber: 'transporte',
  moradia: 'moradia', casa: 'moradia', aluguel: 'moradia',
  contas: 'contas', 'contas da casa': 'contas', servicos: 'contas', utilidades: 'contas',
  saude: 'saude', farmacia: 'saude', educacao: 'educacao', lazer: 'lazer', entretenimento: 'lazer',
  compras: 'compras', eletronicos: 'compras', vestuario: 'vestuario', roupas: 'vestuario',
  assinaturas: 'assinaturas', streaming: 'assinaturas', beleza: 'beleza', cuidados: 'beleza', pets: 'pets', viagem: 'viagem', viagens: 'viagem',
  impostos: 'impostos', taxas: 'impostos', tarifas: 'impostos', presentes: 'presentes', doacoes: 'presentes',
  dividas: 'dividas', emprestimos: 'dividas', 'cartao de credito': 'dividas',
  salario: 'salario', investimentos: 'investimentos', rendimentos: 'investimentos', freelance: 'extra', 'renda extra': 'extra', vendas: 'vendas', reembolso: 'reembolso',
};

/** Traduz a categoria de outro app para uma deste, ou cai na categorização pela descrição. */
export function mapCategory(rawCategory, description, type) {
  const key = normalize(rawCategory || '').trim();
  const hit = CATEGORY_NAMES[key] || Object.entries(CATEGORY_NAMES).find(([k]) => key && key.includes(k))?.[1];
  const incomeIds = ['salario', 'extra', 'investimentos', 'vendas', 'reembolso'];
  if (hit && (type === 'income') === incomeIds.includes(hit)) return hit;
  return categorize(description, type) || (type === 'income' ? 'outros-ganhos' : 'outros');
}

/** "AMAZON PARCELA 3/10" -> {i:3, n:10}; "Parcela 2 de 6" -> {i:2, n:6} */
export function extractInstallment(desc) {
  const s = normalize(desc);
  const m = s.match(/(?:parc(?:ela)?\.?\s*)?\b(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/);
  if (!m) return null;
  const i = +m[1];
  const n = +m[2];
  if (n < 2 || n > 72 || i < 1 || i > n) return null;
  // evita confundir datas "12/10" sem a palavra parcela no começo da descrição
  if (!/parc/.test(s) && s.indexOf(m[0]) < 3) return null;
  return { i, n };
}

export function cleanDescription(desc) {
  return String(desc || '')
    .replace(/\s*-?\s*parc(?:ela)?\.?\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}/i, '')
    .replace(/\s+\d{1,2}\/\d{1,2}$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Classifica linhas especiais de fatura e extrato. */
export function lineKind(desc, signed) {
  const s = normalize(desc);
  if (/pagamento (recebido|efetuado|da fatura|de fatura|em \d|online)|pgto fatura|pagamento fatura|pag fatura/.test(s)) return 'pagamento';
  if (/estorno|reembolso|cashback|credito de|devolucao|chargeback/.test(s)) return 'estorno';
  if (/\biof\b|juros|encargos|multa|tarifa|anuidade|rotativo/.test(s)) return 'encargo';
  if (/transferencia entre contas|aplicacao|resgate/.test(s)) return 'transferencia';
  return signed != null && signed < 0 ? null : 'compra';
}

/**
 * Converte linhas de tabela em movimentos.
 * map: índices (date, description, amount | debit/credit, type, category, time).
 * opts.positiveIsExpense: em faturas os gastos vêm positivos; em extratos, negativos.
 */
export function tableToMovements(rows, map, { positiveIsExpense = false, refYear } = {}) {
  const out = [];
  for (const r of rows) {
    const date = parseDateAny(r[map.date], refYear);
    if (!date) continue;
    let signed;
    if (map.amount >= 0) signed = parseSignedAmount(r[map.amount]);
    else {
      const deb = parseSignedAmount(r[map.debit]);
      const cred = parseSignedAmount(r[map.credit]);
      signed = Number.isFinite(cred) && cred !== 0 ? Math.abs(cred) : Number.isFinite(deb) ? -Math.abs(deb) : NaN;
    }
    if (!Number.isFinite(signed) || signed === 0) continue;
    if (map.type >= 0) {
      const t = normalize(r[map.type]);
      if (/^(d|debito|saida|despesa|debit)/.test(t)) signed = -Math.abs(signed);
      else if (/^(c|credito|entrada|receita|credit)/.test(t)) signed = Math.abs(signed);
    }
    if (positiveIsExpense) signed = -signed;
    const description = [r[map.description], map.description2 >= 0 ? r[map.description2] : null].map((v) => String(v ?? '').trim()).filter(Boolean).join(' - ') || 'Sem descrição';
    const type = signed < 0 ? 'expense' : 'income';
    out.push(finishMovement({ date, time: map.time >= 0 ? String(r[map.time] || '').slice(0, 5) : '', description, signed, type, rawCategory: map.category >= 0 ? r[map.category] : '', card: map.account >= 0 ? String(r[map.account] || '').trim() : '' }));
  }
  return out;
}

function finishMovement({ date, time = '', description, signed, type, rawCategory = '', fitid, card }) {
  const kind = lineKind(description, signed);
  const t = kind === 'estorno' ? 'income' : type;
  return {
    date,
    time: /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, '0') : '',
    description: cleanDescription(description),
    amount: Math.abs(signed),
    type: t,
    kind: kind || 'compra',
    installment: extractInstallment(description),
    rawCategory,
    category: kind === 'encargo' ? 'impostos' : kind === 'estorno' ? 'reembolso' : mapCategory(rawCategory, description, t),
    ...(fitid ? { fitid } : {}),
    ...(card ? { card } : {}),
  };
}

export { finishMovement };

// ---------- OFX ----------

export function parseOFX(text) {
  const s = String(text || '');
  const tag = (block, name) => block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() || '';
  const bank = tag(s, 'ORG') || tag(s, 'BANKID');
  const acct = tag(s, 'ACCTID');
  const isCard = /<CCSTMTRS>|<CCACCTFROM>/i.test(s);
  const movements = [];
  for (const m of s.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi)) {
    const b = m[1];
    const signed = parseFloat(tag(b, 'TRNAMT').replace(',', '.'));
    const date = parseDateAny(tag(b, 'DTPOSTED'));
    if (!date || !Number.isFinite(signed) || signed === 0) continue;
    const description = [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' - ') || tag(b, 'TRNTYPE');
    movements.push(finishMovement({ date, description, signed, type: signed < 0 ? 'expense' : 'income', fitid: tag(b, 'FITID') }));
  }
  return { movements, bank, account: acct ? `final ${acct.slice(-4)}` : '', isCard };
}

// ---------- Texto de extrato e fatura ----------

// "12/10  IFOOD *RESTAURANTE  45,90"  ·  "12 OUT UBER *TRIP 18,90"  ·  "05/10/2026 PIX ENVIADO MARIA -50,00"
const LINE = /^(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|\d{1,2}\s+(?:de\s+)?(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?:\s+\d{4})?)\s+(.+?)\s+(-\s*)?(?:r\$\s*)?(-?\s*\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})\s*(-|[dc])?$/i;

export function looksLikeInvoice(text) {
  const t = normalize(text);
  return /fatura/.test(t) && /(vencimento|total (da|desta) fatura|pagamento minimo|limite)/.test(t);
}

/** Dados do cabeçalho da fatura: vencimento, total, cartão. */
export function invoiceHeader(text, today = new Date()) {
  const lines = String(text || '').split(/\r?\n/);
  const find = (re) => {
    for (let k = 0; k < lines.length; k++) {
      const n = normalize(lines[k]);
      if (re.test(n)) {
        const seg = `${lines[k]} ${lines[k + 1] || ''}`;
        return seg;
      }
    }
    return '';
  };
  const dueSeg = find(/vencimento|vence em/);
  const dueM = dueSeg.match(/(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+(?:de\s+)?[a-zç]{3,}\.?\s+(?:de\s+)?\d{4})/i);
  const dueDate = dueM ? parseDateAny(dueM[1], today.getFullYear()) : null;
  const totSeg = find(/total (da|desta|a pagar)|valor (total|da fatura)|total fatura/);
  const totM = totSeg.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
  return { dueDate, total: totM ? parseAmount(totM[1]) : null, card: findCard(text) };
}

/**
 * Lê texto de extrato ou fatura (PDF convertido em texto, TXT, OCR).
 * Em fatura, gastos são positivos e pagamentos/estornos vêm negativos ou marcados.
 */
export function parseStatementText(text, { invoice = null, today = new Date() } = {}) {
  const isInvoice = invoice ?? looksLikeInvoice(text);
  const header = isInvoice ? invoiceHeader(text, today) : { dueDate: null, total: null, card: findCard(text) };
  const due = header.dueDate ? new Date(header.dueDate + 'T12:00:00') : today;
  const movements = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\s{2,}/g, ' ').trim();
    const m = line.match(LINE);
    if (!m) continue;
    const [, d, desc, negBefore, val, suffix] = m;
    let date = parseDateAny(d, due.getFullYear());
    if (!date) continue;
    // compra de novembro numa fatura que vence em janeiro é do ano anterior
    if (!/\d{4}/.test(d) && new Date(date + 'T12:00:00') > (isInvoice ? due : today)) date = `${+date.slice(0, 4) - 1}${date.slice(4)}`;
    let signed = parseSignedAmount(val);
    if (negBefore || suffix === '-' || /^d$/i.test(suffix || '')) signed = -Math.abs(signed);
    if (/^c$/i.test(suffix || '')) signed = Math.abs(signed);
    if (isInvoice) signed = -signed; // na fatura, positivo = gasto
    else if (!negBefore && !suffix && !/-/.test(val) && !/(recebid|deposito|salario|credito em conta|pix recebido|transferencia recebida)/.test(normalize(desc))) signed = -Math.abs(signed);
    if (!Number.isFinite(signed) || signed === 0) continue;
    if (/^(saldo|total|subtotal|limite)/i.test(normalize(desc))) continue;
    movements.push(finishMovement({ date, description: desc, signed, type: signed < 0 ? 'expense' : 'income' }));
  }
  return { movements, isInvoice, ...header };
}

// ---------- JSON ----------

/** JSON de backup deste app, ou lista de objetos de outro app (tratada como tabela). */
export function parseJSONData(text) {
  const data = JSON.parse(text);
  if (data && Array.isArray(data.transactions) && data.settings) return { backup: data };
  const list = Array.isArray(data) ? data : Object.values(data).find(Array.isArray);
  if (!Array.isArray(list) || !list.length || typeof list[0] !== 'object') throw new Error('Não encontrei uma lista de lançamentos nesse JSON.');
  const headers = [...new Set(list.flatMap((o) => Object.keys(o)))];
  return { headers, rows: list.map((o) => headers.map((k) => o[k])) };
}

/** Soma da fatura para conferir com o total impresso. */
export function invoiceSum(movements) {
  return movements.reduce((s, m) => (m.kind === 'pagamento' ? s : s + (m.type === 'expense' ? m.amount : -m.amount)), 0);
}
