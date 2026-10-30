// Interpretação de texto no app: registro rápido ("mercado 52,30 débito"), notificações coladas, contratos de
// empréstimo e lista de dívidas do Serasa. A leitura de comprovantes fica no pacote comprovantes-br
// (packages/comprovantes-br), que também pode ser usado fora do app.
import { categorize, normalize } from './categories.js';
import { MONEY_RE, cardLabel, findApp, findCard, findDate, findInstallments, findTime, flowDirection, methodFrom, nameCase, pad, parseAmount, parseReceipt, stripAds, toISO } from '../packages/comprovantes-br/src/index.js';

export { cardLabel, findApp, findCard, findDate, findTime, flowDirection, nameCase, pad, parseAmount, stripAds, toISO };

/** Comprovante lido com as categorias do app; Pix parcelado sem outra pista vai para Dívidas e empréstimos. */
export function parseReceiptText(text, today = new Date()) {
  const r = parseReceipt(text, { today, categorize });
  if (!r.category && r.method === 'pix_parcelado' && r.type === 'expense') r.category = 'dividas';
  return r;
}

/**
 * Registro rápido por texto: "almoço 32,90 débito", "+ salário 4500", "uber 18 ontem", "tênis 3x 120 crédito".
 */
export function parseQuickEntry(input, today = new Date()) {
  const raw = String(input || '').trim();
  const t = normalize(raw);
  const income = /^\+/.test(raw) || /\b(recebi|ganhei|salario|entrada|freela|reembolso|rendimento|vendi)\b/.test(t);
  const inst = findInstallments(t);
  // remove trechos de parcelas e datas antes de procurar o valor
  let rest = t
    .replace(/\b\d{1,2}\s*x\s*(?:de\s*)?/g, ' ')
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, ' ')
    .replace(/\b([01]?\d|2[0-3])(?::|h)[0-5]\d\b/g, ' ');
  const nums = [...rest.matchAll(new RegExp(MONEY_RE.source, 'g'))].map((m) => parseAmount(m[1])).filter((v) => v > 0);
  let amount = nums.length ? nums[nums.length - 1] : NaN;
  if (inst?.pmt && !nums.length) amount = inst.pmt * inst.n;
  else if (inst && inst.n > 1 && amount > 0 && /\d\s*x\s*(?:de\s*)?(?:r\$\s*)?\d/.test(t)) amount = amount * inst.n; // "3x 120" = 360

  const method = methodFrom(t);
  const date = findDate(t, today) || toISO(today);
  const description = raw
    .replace(/^\+\s*/, '')
    .replace(/r\$\s*/gi, '')
    .replace(/\b\d{1,2}\s*x\s*(?:de\s*)?/gi, '')
    .replace(/\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?/g, '')
    .replace(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/g, '')
    .replace(/(?<![\p{L}])(hoje|ontem|anteontem|no|na|de|em|via|pix parcelado|pix|cr[eé]dito|d[eé]bito|cart[aã]o|dinheiro|boleto|recebi|ganhei)(?![\p{L}])/giu, '')
    .replace(/[/:]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const type = income ? 'income' : 'expense';
  return {
    type,
    amount: Number.isFinite(amount) ? amount : NaN,
    description: description ? description[0].toUpperCase() + description.slice(1) : '',
    category: categorize(raw, type) || (income ? 'outros-ganhos' : 'outros'),
    method: method || (income ? 'pix' : 'pix'),
    date,
    installments: inst && inst.n > 1 ? inst.n : 1,
  };
}


/**
 * Separa um bloco com várias notificações (coladas ou lidas de um print da central de notificações)
 * e interpreta cada uma. Blocos sem valor são descartados.
 */
export function parseNotifications(text, today = new Date()) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  // separadores: linha em branco, ou início de nova notificação conhecida
  const starts = /^(?:mercado pago|99pay|99|nubank|inter|picpay|itau|itaú|bradesco|santander|caixa|c6|pix (?:enviado|recebido)|compra (?:aprovada|realizada)|você (?:enviou|recebeu|pagou)|voce (?:enviou|recebeu|pagou)|transferência|transferencia|pagamento)/i;
  const blocks = [];
  let cur = [];
  for (const line of raw.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) {
      if (cur.length) blocks.push(cur), (cur = []);
      continue;
    }
    if (cur.length && starts.test(l) && cur.some((x) => /\d+[.,]\d{2}/.test(x))) blocks.push(cur), (cur = []);
    cur.push(l);
  }
  if (cur.length) blocks.push(cur);
  return blocks
    .map((b) => ({ ...parseReceiptText(b.join('\n'), today), raw: b.join(' · ') }))
    .filter((r) => r.amount > 0);
}

/**
 * Lê o texto de um contrato/proposta de empréstimo (CCB, simulação do banco, consignado, financiamento).
 * Percentuais retornam como fração (4,5% -> 0.045).
 */
export function parseLoanText(text, today = new Date()) {
  const original = String(text || '');
  const lines = original.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const norm = lines.map(normalize);
  const MONEY = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i;
  const money = (re) => {
    for (let k = 0; k < norm.length; k++) {
      if (!re.test(norm[k])) continue;
      const after = lines[k].slice(norm[k].search(re));
      const m = after.match(MONEY) || (lines[k + 1] || '').match(MONEY);
      if (m) return parseAmount(m[1]);
    }
    return null;
  };
  const pcts = (re) => {
    const out = { m: null, a: null };
    for (let k = 0; k < norm.length; k++) {
      if (!re.test(norm[k])) continue;
      const seg = `${norm[k]} ${/%/.test(norm[k]) ? '' : norm[k + 1] || ''}`;
      for (const p of seg.matchAll(/(\d{1,3}(?:[.,]\d{1,4})?)\s*%\s*(a\.?\s*m\.?|a\.?\s*a\.?|ao mes|ao ano|mensal|anual)?/g)) {
        const v = parseFloat(p[1].replace(',', '.')) / 100;
        const unit = p[2] || (/anual|ao ano|a\.a/.test(seg.slice(0, p.index)) && !/mensal|ao mes|a\.m/.test(seg.slice(0, p.index)) ? 'a.a' : 'a.m');
        if (/a\.?\s*a|ano|anual/.test(unit)) out.a = out.a ?? v;
        else out.m = out.m ?? v;
      }
      if (out.m != null && out.a != null) break;
    }
    return out;
  };
  const nMatch = original.match(/(\d{1,3})\s*(?:parcelas|prestacoes|prestações|meses|x\b)/i) || normalize(original).match(/(?:quantidade de parcelas|prazo|numero de parcelas|n[ºo°] de parcelas)\D{0,12}(\d{1,3})/);
  const n = nMatch ? +nMatch[1] : null;
  const released = money(/valor (?:liquido|liberado|creditado|a ser creditado|disponibilizado|que voce recebe)|liquido liberado|credito liberado|valor recebido|voce recebe|voce vai receber/);
  const financed = money(/valor (?:total )?(?:financiado|do emprestimo|do credito|solicitado|contratado|principal|bruto)|total financiado|montante financiado/);
  const pmt = money(/valor da (?:parcela|prestacao)|parcela(?:s)? (?:mensal|mensais|de)|prestacao mensal|valor mensal/);
  const total = money(/valor total (?:a pagar|das parcelas|devido)|total a pagar|montante total/);
  const iof = money(/\biof\b/);
  const insurance = money(/seguro/);
  const tariff = money(/tarifa|tac\b|taxa de cadastro|taxa de abertura/);
  const juros = pcts(/taxa (?:de )?juros|juros (?:remuneratorios|mensal|ao mes|a\.m)|taxa nominal|taxa efetiva|^taxa\b(?!.*\bcet\b)/);
  const cet = pcts(/\bcet\b|custo efetivo/);
  let firstDue = null;
  for (let k = 0; k < norm.length; k++) {
    if (/(1[ªao°]|primeir[oa]) (?:parcela|vencimento|prestacao)|vencimento da 1|data do primeiro vencimento|primeiro vencimento/.test(norm[k])) {
      firstDue = findDate(lines[k], today) || findDate(lines[k + 1] || '', today);
      if (firstDue) break;
    }
  }
  const t = normalize(original);
  const kind = /consignado|inss|margem consignavel/.test(t) ? 'consignado' : /financiamento|veiculo|imovel|alienacao/.test(t) ? 'financiamento' : /pix parcelado/.test(t) ? 'pix_parcelado' : 'emprestimo';
  const creditor = findApp(t) || findCard(original)?.bank || null;
  const pmtFinal = pmt || (total && n ? total / n : null);
  return {
    creditor,
    kind,
    released: released || null,
    financed: financed || null,
    n,
    pmt: pmtFinal,
    statedRate: juros.m ?? (juros.a != null ? Math.pow(1 + juros.a, 1 / 12) - 1 : null),
    statedAnnual: juros.a,
    cetMonthly: cet.m ?? (cet.a != null ? Math.pow(1 + cet.a, 1 / 12) - 1 : null),
    cetAnnual: cet.a,
    iof,
    insurance,
    tariff,
    firstDue,
  };
}

/**
 * Lê a lista de dívidas copiada do Serasa Limpa Nome (ou de um print via OCR).
 * Formato típico por bloco:
 *   "BANCO X S.A." / "Dívida de R$ 2.345,67" / "Pague R$ 480,00 à vista" / "80% de desconto"
 */
export function parseSerasaText(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const debts = [];
  let cur = null;
  const push = () => {
    if (cur && (cur.balance || cur.offer)) debts.push(cur);
    cur = null;
  };
  const money = (l) => {
    const m = l.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/);
    return m ? parseAmount(m[1]) : null;
  };
  for (const line of lines) {
    const n = normalize(line);
    const v = money(line);
    const isHeader = !v && /[a-z]/i.test(line) && !/\d{1,2}\/\d{1,2}/.test(line) && !/(desconto|oferta|pague|desde|venc|atualizad|original|parcel|ver |detalhes|negociar|acordo|limpa nome|serasa|contrato|origem|data)/.test(n) && line.length <= 60;
    if (isHeader) {
      if (cur && (cur.balance || cur.offer)) push();
      if (!cur) cur = { creditor: line.replace(/\s{2,}/g, ' '), balance: null, offer: null, offerInstallments: null, since: null };
      continue;
    }
    if (!cur) cur = { creditor: 'Credor não identificado', balance: null, offer: null, offerInstallments: null, since: null };
    if (v != null) {
      if (/(pague|a vista|por apenas|oferta|quitar|acordo|negocie)/.test(n) && !/(parcela|\dx)/.test(n)) cur.offer = v;
      else if (/(\d{1,2})\s*x|parcela/.test(n)) {
        const k = n.match(/(\d{1,2})\s*x|(\d{1,2})\s*parcelas/);
        cur.offerInstallments = { n: k ? +(k[1] || k[2]) : null, pmt: v };
      } else if (cur.balance == null || /(divida|valor atualizado|total|deve)/.test(n)) cur.balance = v;
    }
    const d = findDate(line);
    if (d && /(desde|vencid|data|origem)/.test(n)) cur.since = d;
  }
  push();
  return debts.map((d) => ({ ...d, balance: d.balance ?? d.offer, discount: d.balance && d.offer ? 1 - d.offer / d.balance : 0 }));
}
