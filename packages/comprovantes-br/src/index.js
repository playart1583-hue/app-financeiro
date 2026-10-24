// comprovantes-br: lê o texto de comprovantes, notificações e prints de bancos e carteiras brasileiras
// (Pix, Pix parcelado, cartão, boleto, transferência) e devolve valor, data, horário, forma de pagamento,
// parcelas, taxas, cartão e destinatário. Funções puras, sem dependências e sem acesso à rede.

/** "Ação" -> "acao": minúsculas e sem acentos, para comparar textos. */
export const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "1.234,56" | "1234.56" | "52,3" | "R$ 52" -> número */
export function parseAmount(raw) {
  if (raw == null) return NaN;
  let s = String(raw).replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  const hasComma = s.includes(',');
  if (hasComma) s = s.replace(/\./g, '').replace(',', '.');
  else {
    const parts = s.split('.');
    // "1.234" = mil e duzentos; "12.50" = doze e cinquenta
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) s = parts.join('');
  }
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : NaN;
}

export const MONEY_RE = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function methodFrom(t) {
  if (/pix\s*parcelad|parcelamento\s*(?:via|no|do)\s*pix/.test(t)) return 'pix_parcelado';
  if (/\bcredito\b|\bcred\b|cartao de credito/.test(t)) return 'credito';
  if (/\bdebito\b|\bdeb\b/.test(t)) return 'debito';
  if (/\bcartao\b/.test(t)) return 'credito';
  if (/\bdebito\b|\bdeb\b/.test(t)) return 'debito';
  // boleto (muitos trazem também um QR Pix): linha digitável/código de barras decidem
  if (/\bboleto\b|linha digitavel|codigo de barras/.test(t)) return 'boleto';
  if (/\bpix\b/.test(t)) return 'pix';
  if (/\bboleto\b/.test(t)) return 'boleto';
  if (/\bdinheiro\b|\bespecie\b/.test(t)) return 'dinheiro';
  if (/\bted\b|\bdoc\b|transferencia/.test(t)) return 'transferencia';
  return null;
}

function relativeDate(t, today) {
  const d = new Date(today);
  if (/\banteontem\b/.test(t)) d.setDate(d.getDate() - 2);
  else if (/\bontem\b/.test(t)) d.setDate(d.getDate() - 1);
  else if (/\bhoje\b/.test(t)) return toISO(d);
  else return null;
  return toISO(d);
}

/** Procura data em formatos brasileiros. Retorna 'YYYY-MM-DD' ou null. */
export function findDate(text, today = new Date()) {
  const t = normalize(text);
  let m = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/) || t.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);
  if (m) {
    const day = +m[1];
    const mon = +m[2];
    let year = m[3] ? +m[3] : today.getFullYear();
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) return `${year}-${pad(mon)}-${pad(day)}`;
  }
  // "14 de outubro de 2026", "23 out", "23/out", "23-out-2026"
  m = t.match(/\b(\d{1,2})\s*(?:de\s*|[/.-]\s*)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s*(?:de\s*|[/.-]\s*)?(\d{4})?/);
  if (m) {
    const mon = MONTHS.indexOf(m[2]) + 1;
    const year = m[3] ? +m[3] : today.getFullYear();
    return `${year}-${pad(mon)}-${pad(+m[1])}`;
  }
  return relativeDate(t, today);
}

export function findTime(text) {
  const t = normalize(text);
  const m = t.match(/\b([01]?\d|2[0-3])(?::|h)([0-5]\d)(?::[0-5]\d)?\b/);
  return m ? `${pad(+m[1])}:${m[2]}` : null;
}

export function findInstallments(t) {
  // "3x de R$ 50,00", "10x 89,90", "2xR$24,49", "em 6 parcelas de 120,00", "Parcelamento 2", "Nº de parcelas: 12"
  // o número e o "x" ficam na mesma linha e o número não é parte de hora ou data ("12:48" + o X de fechar não é 48x);
  // a linha que fala de parcelamento vem primeiro. "parcela 2/10" é a parcela atual, não o total
  const NX = /(?<![\d:/.,])(\d{1,2})[ \t]*x(?![a-qs-z])[ \t]*(?:de[ \t]*)?(?:r\$[ \t]*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)?/;
  const NP = /(?<![\d:/.,])(?:em[ \t]*)?(\d{1,2})[ \t]*parcelas?(?:[ \t]*(?:mensais|iguais))?(?:[ \t]*de[ \t]*(?:r\$[ \t]*)?(\d[\d.,]*))?/;
  const NL = /parcel(?:amento|as)\b[^\d\n]{0,12}?(?<![\d:/.,])(\d{1,2})(?![\d.,/:])/;
  const lines = String(t).split('\n');
  const ok = (n) => n > 0 && n <= 72;
  for (const l of [...lines.filter((x) => /parcel/.test(x)), ...lines]) {
    let m = l.match(NX);
    if (m && ok(+m[1])) return { n: +m[1], pmt: m[2] ? parseAmount(m[2]) : null };
    m = l.match(NP);
    if (m && ok(+m[1])) return { n: +m[1], pmt: m[2] ? parseAmount(m[2]) : null };
    m = l.match(NL);
    if (m && ok(+m[1])) return { n: +m[1], pmt: null };
  }
  return null;
}

// Bloco de propaganda no fim do comprovante ("Quer mais benefícios? Vincule sua chave Pix e ganhe até R$ 5,00...")
// confunde valor, forma de pagamento e categoria: sai antes de ler
const AD_START = /quer mais beneficios|vincule sua chave|indique (?:e|um amigo)|convide (?:seus )?amigos|baixe o app|ganhe ate r?\$?/;
const AD_LINE = /^(use seu cpf|vincular chave|ver meu comprovante|compartilhar comprovante|conclu[ií]do)\b/;
export function stripAds(text) {
  const out = [];
  let ad = false;
  for (const line of String(text || '').split(/\r?\n/)) {
    const n = normalize(line).trim();
    if (AD_START.test(n)) ad = true;
    else if (ad && /^(conclu|fechar|voltar|ok)\b/.test(n)) ad = false;
    if (ad || AD_LINE.test(n)) continue;
    out.push(line);
  }
  return out.join('\n');
}

const BANKS = ['99pay', '99 pay', 'nubank', 'itau', 'bradesco', 'santander', 'banco do brasil', 'caixa', 'inter', 'c6', 'picpay', 'mercado pago', 'neon', 'next', 'banco original', 'btg', 'xp', 'sicoob', 'sicredi', 'pagbank', 'pagseguro', 'will bank', 'porto', 'ourocard'];
const BRANDS = ['visa', 'mastercard', 'master', 'elo', 'hipercard', 'amex', 'american express'];

/** Encontra informações do cartão: "final 1234", "**** 1234", bandeira, banco. */
export function findCard(text) {
  const t = normalize(text);
  // "final 8238", "terminado em 8238", "**** 8238", "•••• 8238", "Cartão 8238", "Cartão: 8238", "Visa 8238"
  // número solto de 4 dígitos que não seja parte de valor, data, hora ou de um número maior
  const N = '(?<![\\d.,/:])(\\d{4})(?![\\d.,/:])';
  const m =
    // "final 8238", "terminado/terminando em 8238", "com final 8238"
    t.match(new RegExp(`(?:final|terminad[oa] em|terminando em|termina em|com final)\\s*:?\\s*${N}`)) ||
    // número completo com o meio escondido (ou embaralhado na leitura): "5502 **** **** 8238", "5502 **** *ik* 8238" -> o último grupo
    // (o meio precisa ter cara de máscara: algum símbolo, ou "xxxx"; assim "1234 de 2026" não conta)
    t.match(/(?<!\d)\d{4}[ -]+(?:(?:(?=\S*[^a-z0-9\s])\S{3,4}|x{4})[ -]+){1,2}(\d{4})(?![\d.,/:])/) ||
    // número mascarado: "**** 8238", "•••• 8238", "···· 8238", "xxxx xxxx xxxx 8238", "...8238"
    t.match(new RegExp(`(?:[*•·.x#]\\s?){2,}\\s*(\\d{4})(?![\\d.,/:])`)) ||
    // "Cartão 8238", "Cartão: 8238", "Cartão de crédito Mastercard 8238", "cartão virtual - 8238"
    t.match(new RegExp(`\\bcart[aã]o\\b[^\\d\\n]{0,30}?${N}`)) ||
    // "Visa 8238", "Mastercard • 8238", "Elo - 8238"
    t.match(new RegExp(`\\b(?:visa|mastercard|master|elo|hipercard|amex)\\b[^\\d\\n]{0,6}${N}`)) ||
    // "Crédito •8238", "crédito à vista 8238"
    t.match(new RegExp(`\\b(?:credito|debito)\\b[^\\d\\n]{0,12}${N}`));
  const brand = BRANDS.find((b) => new RegExp(`\\b${b}\\b`).test(t));
  const bank = BANKS.find((b) => new RegExp(`\\b${b}\\b`).test(t));
  if (!m && !brand && !bank) return null;
  return {
    last4: m ? m[1] : null,
    brand: brand ? (brand === 'master' ? 'Mastercard' : brand[0].toUpperCase() + brand.slice(1)) : null,
    bank: bank ? bank.replace(/\b\w/g, (c) => c.toUpperCase()) : null,
  };
}

export function cardLabel(card) {
  if (!card) return '';
  return [card.bank, card.brand, card.last4 ? `final ${card.last4}` : null].filter(Boolean).join(' · ');
}

const STORES = [
  ['amazon', 'Amazon'], ['mercado livre', 'Mercado Livre'], ['mercadolivre', 'Mercado Livre'], ['shopee', 'Shopee'], ['shein', 'Shein'], ['aliexpress', 'AliExpress'], ['temu', 'Temu'],
  ['magazine luiza', 'Magazine Luiza'], ['magalu', 'Magalu'], ['americanas', 'Americanas'], ['casas bahia', 'Casas Bahia'], ['kabum', 'KaBuM!'], ['netshoes', 'Netshoes'], ['centauro', 'Centauro'],
  ['carrefour', 'Carrefour'], ['assai', 'Assaí'], ['atacadao', 'Atacadão'], ['ifood', 'iFood'], ['rappi', 'Rappi'], ['drogasil', 'Drogasil'], ['pague menos', 'Pague Menos'],
];

/**
 * "JC SERVICOS E APOIO ADMINISTRATIVOS LTDA" -> "JC Servicos e Apoio Administrativos"; "A&M 2BUSINESS LTDA" -> "A&M 2Business".
 * Siglas (sem vogal ou com &) ficam em maiúsculas; LTDA, ME, S.A. saem.
 */
export function nameCase(s) {
  return String(s || '')
    .replace(/\b(ltda|me|eireli|s\.?\s?a\.?|epp)\b\.?/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, k) => {
      if (/&/.test(w) || (/^[A-Z]{2,4}$/.test(w) && !/[AEIOU]/.test(w))) return w.toUpperCase();
      const low = w.toLowerCase();
      if (k > 0 && ['de', 'da', 'do', 'dos', 'das', 'e'].includes(low)) return low;
      return low.replace(/\p{L}/u, (c) => c.toUpperCase());
    })
    .join(' ');
}

const MERCHANT_LABEL = /^(?:estabelecimento|loja|local|comercio|favorecido|recebedor|destinatario|para|nome|beneficiario|empresa)(?:\s*[:\-]\s*(.+))?$/i;

/**
 * Lê o texto de um comprovante, notificação de compra ou extrato.
 * Retorna campos com o que foi possível identificar (null quando não encontrado).
 */
export function parseReceipt(text, { today = new Date(), categorize = null } = {}) {
  const cat = categorize || (() => null);
  const original = stripAds(text);
  const lines = original.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const t = normalize(original);

  // valor: prioriza linhas com "total"/"valor"; senão o primeiro R$; senão o maior número com centavos
  let amount = NaN;
  const KEY = /total|valor|compra|pagamento|pago|transferido/;
  let priority = null;
  for (let k = 0; k < lines.length && !priority; k++) {
    const n = normalize(lines[k]);
    if (!KEY.test(n) || /a vista|parcela|\dx/.test(n)) continue;
    if (/\d+[.,]\d{2}/.test(lines[k])) priority = lines[k];
    else if (lines[k + 1] && /^\s*(r\$)?\s*[\d.,]+\s*$/i.test(lines[k + 1])) priority = lines[k + 1];
  }
  const grab = (s) => {
    const m = s.match(/r\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i) || s.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
    return m ? parseAmount(m[1]) : NaN;
  };
  if (priority) amount = grab(priority);
  if (!(amount > 0)) amount = grab(original);

  const inst = findInstallments(t);
  let installments = 1;
  let installmentValue = null;
  if (inst && inst.n > 1) {
    installments = inst.n;
    installmentValue = inst.pmt;
  }
  if (/\ba vista\b/.test(t) && !inst) installments = 1;

  // destinatário / loja. Nome mascarado ("A&M ********* ****") não serve
  const masked = (s) => /\*{2,}|•{2,}/.test(s || '');
  // nome que quebrou em duas linhas ("JC SERVICOS E APOIO" / "ADMINISTRATIVOS LTDA")
  const caps = (s) => /^[A-ZÀ-Ü0-9&.,'\- ]{3,}$/.test(s || '') && /[A-ZÀ-Ü]{3}/.test(s);
  const withNext = (k, name) => (caps(name) && caps(lines[k + 1]) && !/\d{3}/.test(lines[k + 1]) ? `${name} ${lines[k + 1]}` : name);
  let merchant = null;
  // "Transferido para A&M 2BUSINESS LTDA", "Transferir para BANCO CSF", "Pago para Fulano", "Pix para Maria"
  for (let k = 0; k < lines.length && !merchant; k++) {
    const m = lines[k].match(/^(?:transferido|transferida|transferir|transfer[eê]ncia|enviado|enviada|pago|paga|pagamento|pix)\s+(?:para|a)\s*:?\s+(\S.{2,60})$/i);
    if (m && !masked(m[1])) merchant = withNext(k, m[1]);
  }
  // Mercado Pago, Nubank: o nome vem na linha de cima de "Pix enviado" / "Transferência enviada"
  for (let k = 1; k < lines.length && !merchant; k++) {
    if (!/^(pix|transferencia|ted|doc) (enviad|realizad|feit|recebid)/.test(normalize(lines[k]))) continue;
    const name = lines[k - 1];
    if (/^[\p{L}][\p{L}.' &-]{2,60}$/u.test(name) && name.trim().split(/\s+/).length >= 2 && !masked(name) && !/comprovante|\bpix\b|transfer|pagamento|aprovad|conclu|detalhes/.test(normalize(name))) merchant = name;
  }
  // "Para JC SERVICOS E APOIO" (comprovante sem dois-pontos): nome em maiúsculas logo depois de "Para"
  for (let k = 0; k < lines.length && !merchant; k++) {
    const m = lines[k].match(/^[Pp]ara\s+([A-ZÀ-Ü0-9&][A-ZÀ-Ü0-9&.,'\- ]{2,60})$/);
    if (m && !masked(m[1]) && (m[1].trim().split(/\s+/).length >= 2 || m[1].trim().length >= 5)) merchant = withNext(k, m[1]);
  }
  for (let k = 0; k < lines.length && !merchant; k++) {
    const m = normalize(lines[k]).match(MERCHANT_LABEL);
    if (!m) continue;
    const v = (m[1] ? lines[k].slice(lines[k].length - m[1].length) : lines[k + 1]) || null;
    if (v && !masked(v)) merchant = v;
  }
  let counterpartLabel = null;
  if (!merchant) {
    merchant = notificationCounterpart(original);
    // "Pix para Maria" / "Pix de João" deixa o extrato mais claro do que só o nome
    if (merchant && /\b(pix|transferencia|transferiu)\b/.test(t)) {
      const what = /\bpix\b/.test(t) ? 'Pix' : 'Transferência';
      counterpartLabel = flowDirection(t) === 'income' ? `${what} de ${merchant}` : `${what} para ${merchant}`;
    }
  }
  // lojas conhecidas que aparecem no print (Amazon, Mercado Livre, Shopee...)
  if (!merchant) merchant = STORES.find(([k]) => new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(t))?.[1] || null;
  if (!merchant) {
    // notificação: "Compra aprovada ... em PADARIA DOCE PAO" / "no(a) LOJA X" (não vale "terminando em 2223")
    for (const m of original.matchAll(/\b(?:em|no|na|no\(a\))\s+([A-Z0-9][A-Z0-9 &*.'\-]{2,40})(?=\s+(?:para|com|em|no|na|dia|às|as|valor|r\$)\b|[.,\n]|$)/g)) {
      const before = normalize(original.slice(Math.max(0, m.index - 14), m.index));
      if (/^\d[\d\s]*$/.test(m[1].trim()) || /termin\w*\s*$|final\s*$/.test(before)) continue;
      merchant = m[1].trim();
      break;
    }
  }
  // linha só com o nome da loja em maiúsculas ("PADARIA DOCE PAO", "MAGAZINE CENTRO")
  if (!merchant) {
    merchant =
      lines.find(
        (l) => caps(l) && !/r\$|\d{3}|\d{1,2}\/\d{1,2}/i.test(l) && !/^(valor|data|total|cartao|credito|debito|pix|comprovante|pagamento|compra|aprovad|transferencia|boleto|vencimento|beneficiario|cpf|cnpj|status|conclu)/.test(normalize(l)),
      ) || null;
  }
  if (merchant) merchant = merchant.replace(/\s{2,}/g, ' ').replace(/[*]+/g, ' ').trim();

  const cityMatch = original.match(/(?:cidade|local)\s*[:\-]\s*([^\n]+)/i);
  // carteiras digitais (Mercado Pago, 99Pay, PicPay) sem forma explícita: saiu do saldo, tratamos como Pix
  // Pix/transferência em parcelas ("Transferência concluída ... Parcelamento 4 x R$ 75,34"): Pix parcelado, mesmo
  // que o print também fale de Pix em outro lugar (anúncio de chave Pix etc.)
  const pixInParts = inst && inst.n > 1 && /\b(pix|transferencia|transferid[oa]|transferir)\b/.test(t) && /parcelament|parcelad|transferencia (concluida|realizada|enviada|efetuada)|transferid[oa] para|pix (enviado|realizado|efetuado)/.test(t);
  const method = (pixInParts ? 'pix_parcelado' : methodFrom(t)) || (inst && inst.n > 1 ? 'credito' : null) || (/mercado pago|99pay|99 pay|picpay|\b99\b/.test(t) ? 'pix' : null);
  const card = findCard(original);
  // vencimento (boleto, conta, fatura): fica à parte; a data do gasto é outra que apareça, ou hoje
  const dueLine = lines.find((l) => /\b(vencimento|vence em|vence dia|pagar ate|pague ate|data limite)\b/.test(normalize(l)));
  const dueIdx = dueLine ? lines.indexOf(dueLine) : -1;
  const dueDate = dueLine ? findDate(dueLine, today) || findDate(lines[dueIdx + 1] || '', today) : null;
  const date = findDate(dueDate ? lines.filter((l, k) => k !== dueIdx && !(k === dueIdx + 1 && !findDate(dueLine, today))).join('\n') : original, today);
  // horário da linha que tem a data (o primeiro do print costuma ser o relógio do celular)
  const time = findTime(lines.filter((l) => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(l) || findDate(l, today)).join('\n')) || findTime(original);
  const income = flowDirection(t) === 'income';
  const app = findApp(t);
  if (!merchant && app === '99' && /corrida|viagem/.test(t)) merchant = 'Corrida 99';
  const desc = merchant || lines[0] || '';
  let category = cat(desc, income ? 'income' : 'expense') || cat(original.replace(/sem juros/gi, ''), income ? 'income' : 'expense');
  // Pix comum com o destinatário lido: "Pix para Jose Silva" / "Pix de Maria" (lojas conhecidas ficam só com o nome)
  if (merchant && !counterpartLabel && method !== 'pix_parcelado' && /\bpix\b/.test(t) && !STORES.some(([, label]) => label === merchant)) {
    counterpartLabel = `Pix ${income ? 'de' : 'para'} ${nameCase(merchant)}`;
  }
  // Pix parcelado: "Pix parcelado para Fulano"; sem outra pista, é um crédito que você paga em parcelas
  if (method === 'pix_parcelado' && !income) {
    const who = merchant ? nameCase(merchant) : '';
    counterpartLabel = who ? `Pix parcelado para ${who}` : `Pix parcelado${app ? ` ${app === '99' ? '99Pay' : app}` : ''}`;
    // categoria só pelo destinatário (o resto do print costuma ser anúncio: "Use seu CPF ou telefone"...)
    category = (merchant && cat(merchant, 'expense')) || null;
  }

  let cashPrice = null;
  const cash = original.match(/(?:a vista|à vista|valor original|valor do produto|preco a vista)\D{0,15}(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i);
  if (cash) cashPrice = parseAmount(cash[1]);
  // convenção do app: no parcelado com juros, "valor" é o preço à vista e a parcela vai à parte
  if (cashPrice && installments > 1) amount = cashPrice;
  else if (installments > 1 && installmentValue && Math.abs(amount - installmentValue) < 0.01) amount = installmentValue * installments;

  // taxa, tarifa, juros ou multa cobrados na operação ("Taxa de transação R$ 1,49"): o que vale é o total pago
  // (valor da conta + taxas); a parte de taxa fica guardada à parte para a tela Juros e taxas
  let fee = 0;
  let feeKind = null;
  if (!income) {
    for (let k = 0; k < lines.length; k++) {
      const n = normalize(lines[k]);
      if (!/\b(taxas?|tarifas?|juros|multa|mora|encargos?|iof)\b/.test(n) || /desconto|sem juros|isent|gratis|zero|%|a\.?m\.?\b|ao mes|ao ano/.test(n)) continue;
      let v = grab(lines[k]);
      if (!(v > 0) && lines[k + 1] && /^\s*(r\$)?\s*[\d.,]+\s*$/i.test(lines[k + 1])) v = grab(lines[k + 1]);
      if (!(v > 0)) continue;
      fee += v;
      feeKind = feeKind === 'juros' || /juros|multa|mora|encargo/.test(n) ? 'juros' : 'taxa';
    }
    fee = Math.round(fee * 100) / 100;
    // total pago escrito no print ("Valor pago R$ 48,97", "Total pago", "Valor cobrado")
    const paidLine = lines.find((l) => /\b(valor pago|total pago|valor total pago|valor cobrado|total cobrado|total a pagar)\b/.test(normalize(l)));
    const paid = paidLine ? grab(paidLine) : NaN;
    if (installments > 1) {
      // parcelado: a taxa é o juro do parcelamento; o valor continua sendo o preço sem a taxa
      const total = paid > amount ? paid : fee > 0 ? amount + fee : NaN;
      if (!installmentValue && total > amount) installmentValue = Math.round((total / installments) * 100) / 100;
      fee = 0;
    } else if (fee > 0 && paid > 0 && Math.abs(paid - (amount + fee)) < 0.011) {
      amount = paid;
    } else if (fee > 0) {
      const baseLine = lines.find((l) => /\bvalor (da conta|do boleto|do documento|da fatura|original|principal|nominal|do pagamento|da transferencia|enviado)\b/.test(normalize(l)));
      const base = baseLine ? grab(baseLine) : NaN;
      const all = [...original.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)].map((x) => parseAmount(x[1]));
      if (base > 0 && all.some((v) => Math.abs(v - (base + fee)) < 0.011)) amount = base + fee;
      else if (base > 0 && Math.abs(amount - base) < 0.011) amount = base + fee;
      else if (!(base > 0) && all.some((v) => Math.abs(v - (amount + fee)) < 0.011)) amount += fee;
      if (!(amount > fee)) fee = 0;
      amount = Math.round(amount * 100) / 100;
    }
  }

  return {
    type: income ? 'income' : 'expense',
    amount: amount > 0 ? amount : null,
    merchant,
    description: counterpartLabel || merchant || null,
    date,
    dueDate,
    time,
    method,
    card,
    installments,
    installmentValue,
    cashPrice,
    fee: fee > 0 ? fee : null,
    feeKind: fee > 0 ? feeKind : null,
    location: cityMatch ? cityMatch[1].trim() : null,
    category: category || null,
    app,
  };
}

const APPS = [
  ['mercado pago', 'Mercado Pago'],
  ['mercadopago', 'Mercado Pago'],
  ['99pay', '99Pay'],
  ['99 pay', '99Pay'],
  ['99food', '99Food'],
  ['99 food', '99Food'],
  ['nubank', 'Nubank'],
  ['picpay', 'PicPay'],
  ['inter', 'Inter'],
  ['itau', 'Itaú'],
  ['bradesco', 'Bradesco'],
  ['santander', 'Santander'],
  ['caixa', 'Caixa'],
  ['banco do brasil', 'Banco do Brasil'],
  ['c6', 'C6 Bank'],
];
/** App/banco de onde veio a notificação (para preencher "cartão / conta"). */
export function findApp(normalizedText) {
  const hit = APPS.find(([k]) => new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`).test(normalizedText));
  if (hit) return hit[1];
  if (/(^|\s)99(\s|$)|corrida|motorista parceiro/.test(normalizedText) && /corrida|viagem|99/.test(normalizedText)) return '99';
  return null;
}

/** "Você enviou um Pix de R$ 50,00 para Maria Souza" -> "Maria Souza"; "Você recebeu R$ 20 de João" -> "João". */
const APP_PREFIX = /^(?:mercado pago|99pay|99 pay|99|nubank|banco inter|inter|picpay|ita[uú]|bradesco|santander|caixa|c6 bank|c6|pagbank|neon|btg|banco do brasil)\s+/i;

function notificationCounterpart(text) {
  // "Maria Souza te enviou R$ 20" / "Ana enviou um Pix de R$ 40 para você"
  const sender = text.match(/((?:[A-ZÀ-Ú][\wÀ-ú]*\s+){0,4}[A-ZÀ-Ú][\wÀ-ú]*)\s+(?:te\s+(?:enviou|enviaram|mandou|transferiu|pagou)|(?:enviou|transferiu|mandou)\b[^.!\n]{0,40}?\s(?:para|pra)\s+voc[eê])/);
  if (sender) {
    let v = sender[1].trim();
    while (APP_PREFIX.test(`${v} `)) v = `${v} `.replace(APP_PREFIX, '').trim();
    v = v.replace(/^(?:pix|transfer[eê]ncia)\s+(?:recebid[oa]|enviad[oa])\s*/i, '').trim();
    if (v && !/^(voc[eê]|pix)$/i.test(v)) return v;
  }
  const m =
    text.match(/recebid[oa] por\s+([A-ZÀ-Ú][\wÀ-ú&*.' -]{1,40}?)(?=\s*(?:[.,!\n]|$|[Rr]\$| via | com | no valor| às | as | - ))/) ||
    text.match(/(?:enviou|enviad[oa]|transferiu|transfer[eê]ncia|realizad[oa]|pagou|pagamento(?: de [^\n]*?)?)\b[^\n]*?\b(?:para|a|em)\s+([A-ZÀ-Ú0-9][\wÀ-ú&*.' -]{1,40}?)(?=\s*(?:[.,!\n]|$| via | com | no valor| às | as | em \d| - ))/i) ||
    text.match(/(?:recebeu|recebid[oa])\b[^\n]*?\bde\s+([A-ZÀ-Ú0-9][\wÀ-ú&*.' -]{1,40}?)(?=\s*(?:[.,!\n]|$| via | com | às | as | - ))/i) ||
    text.match(/((?:[A-ZÀ-Ú][\wÀ-ú]*\s+){0,4}[A-ZÀ-Ú][\wÀ-ú]*)\s+(?:j[aá]\s+)?recebeu\s+(?:o\s+|a\s+)?(?:seu|sua)\b/);
  if (!m) return null;
  let v = m[1].trim();
  while (APP_PREFIX.test(`${v} `)) v = `${v} `.replace(APP_PREFIX, '').trim();
  v = v.replace(/^(?:pix|transfer[eê]ncia)\s+(?:recebid[oa]|enviad[oa])\s*/i, '').trim();
  return !v || /^(r\$|\d|voc[eê]\b)/i.test(v) ? null : v;
}

// Entrada x saída nas notificações. Frases de saída que contêm "recebeu" (quem recebeu foi o outro) vêm antes,
// e quando há frases dos dois lados vale a que aparece primeiro (o título da notificação).
const OUT_FLOW = /\b(voce (?:enviou|transferiu|pagou|fez um pix|fez uma transferencia)|pix enviado|pix realizado|pix feito|transferencia (?:enviada|realizada|feita|efetuada|concluida)|pagamento (?:realizado|aprovado|efetuado|enviado|feito|concluido)|compra (?:aprovada|realizada|no)|(?:ja )?recebeu (?:o |a )?(?:seu|sua)|recebid[oa] por|enviad[oa] (?:para|com sucesso)|seu pix (?:para|de r)|sua transferencia|debito|debitad[oa]|saque|saiu da sua conta|corrida|viagem)/;
const IN_FLOW = /\b(te (?:enviou|enviaram|mandou|transferiu|pagou)|(?:enviou|transferiu|mandou|pagou)\b[^.!\n]{0,40}? (?:para|pra) (?:voce|sua conta)|voce recebeu|recebeu (?:um|uma|r\$|\d)|pix recebido|transferencia recebida|dinheiro recebido|pagamento recebido|recebimento|recebid[oa](?! por)|credito em conta|creditad[oa]|deposito|caiu na sua conta|entrou na sua conta|chegou (?:um|uma|dinheiro|r\$|o pix|seu pix)|estorno|estornad[oa]|reembolso|devolucao|devolvid[oa]|cashback|rendeu|rendimento)/;

/** 'income' | 'expense' pelo texto (já normalizado) de uma notificação ou comprovante. */
export function flowDirection(t) {
  const o = t.match(OUT_FLOW);
  const i = t.match(IN_FLOW);
  if (o && i) return o.index <= i.index ? 'expense' : 'income';
  return i ? 'income' : 'expense';
}
