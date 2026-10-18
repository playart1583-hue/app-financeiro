// Leitura de prints: compra/pagamento (onde, quando, horário, cartão, parcelas, valor) e lista de dívidas do Serasa.
// Motores, na ordem: Claude dentro do app da Claude (Artifact) → Claude API com chave própria → OCR no aparelho.
import { parseLoanText, parseNotifications, parseReceiptText, parseSerasaText, toISO } from './parser.js';
import { parseStatementText } from './importers.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, CLASSIFICATIONS, categorize, defaultClassification } from './categories.js';
import { getApiKey } from './store.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
const MODEL = 'claude-opus-5-5';
const METHODS = ['pix', 'debito', 'credito', 'pix_parcelado', 'dinheiro', 'boleto', 'transferencia', 'nao_identificado'];

/** Reduz a imagem (lado maior 1600px) e converte para JPEG: menos dados, mesma legibilidade. */
export async function prepareImage(file, maxSide = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Não consegui abrir essa imagem. Tente um print em JPG ou PNG.'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b || file), 'image/jpeg', 0.88));
  } finally {
    URL.revokeObjectURL(url);
  }
}

const blobToBase64 = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

let samplePromise = null;
/** Claude dentro do app da Claude: { sample, images } ou null fora dele. */
function getSampleInfo() {
  if (!samplePromise) {
    samplePromise = (async () => {
      const c = typeof window !== 'undefined' ? window.claude : null;
      if (!c?.use) return null;
      const sample = await c.use('sample');
      if (!sample) return null;
      const limits = await sample.limits().catch(() => null);
      return { sample, images: Boolean(limits?.images) };
    })();
  }
  return samplePromise;
}
const getSample = async () => {
  const info = await getSampleInfo();
  return info?.images ? info.sample : null;
};

/** Qual motor vai ler o print agora. */
export async function currentEngine() {
  if (await getSample()) return { id: 'claude', label: 'Claude (sua conta)' };
  if (getApiKey()) return { id: 'api', label: 'Claude API (sua chave)' };
  return { id: 'ocr', label: 'Leitura no aparelho (OCR)' };
}

// ---------- Compra / pagamento ----------

const purchaseGuide = () => `- "tipo": "gasto" ou "ganho" (ganho = dinheiro que entrou, ex.: Pix recebido)
- "valor": valor total da compra em reais (número). Se for parcelado com juros e o print mostrar o valor à vista, use o valor à vista aqui
- "estabelecimento": nome da loja, pessoa ou empresa (como aparece no print), ou null
- "descricao": descrição curta e legível em português (ex.: "Padaria Doce Pão"), ou null
- "data": data da compra no formato AAAA-MM-DD, ou null. "Hoje"/"ontem" são relativos à data de hoje
- "hora": horário HH:MM, ou null
- "forma_pagamento": um de ${METHODS.join(', ')}
- "cartao_final": 4 últimos dígitos do cartão, ou null
- "cartao_bandeira": Visa, Mastercard, Elo etc., ou null
- "banco": banco ou carteira (Nubank, Itaú, Inter...), ou null
- "parcelas": número de parcelas (1 se à vista)
- "valor_parcela": valor de cada parcela (número) ou null
- "valor_a_vista": preço à vista quando o print mostra (útil para calcular juros), ou null
- "local": cidade ou endereço, ou null
- "categoria": um id de ${[...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => c.id).join(', ')}
- "classificacao": ${Object.keys(CLASSIFICATIONS).join(', ')} (essencial = necessidade básica, superfluo = desejo)
- "confianca": de 0 a 1, o quanto você tem certeza da leitura
- "observacao": algo importante que a pessoa deveria conferir (ex.: juros, taxa, valor ilegível), ou null
`;

const purchasePrompt = (today) => `Você está lendo o print de uma compra, pagamento ou recebimento (notificação do banco, comprovante Pix, nota fiscal, recibo, tela de fatura ou SMS). Hoje é ${today}.
Extraia os dados e devolva SOMENTE um objeto JSON com estes campos:
${purchaseGuide()}Exemplo: {"tipo":"gasto","valor":152.3,"estabelecimento":"PADARIA DOCE PAO","descricao":"Padaria Doce Pão","data":"2026-10-17","hora":"14:32","forma_pagamento":"credito","cartao_final":"4321","cartao_bandeira":"Mastercard","banco":"Nubank","parcelas":3,"valor_parcela":50.77,"valor_a_vista":null,"local":null,"categoria":"restaurantes","classificacao":"superfluo","confianca":0.9,"observacao":null}`;

const nullable = (type) => ({ type: [type, 'null'] });
const PURCHASE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo', 'valor', 'estabelecimento', 'descricao', 'data', 'hora', 'forma_pagamento', 'cartao_final', 'cartao_bandeira', 'banco', 'parcelas', 'valor_parcela', 'valor_a_vista', 'local', 'categoria', 'classificacao', 'confianca', 'observacao'],
  properties: {
    tipo: { type: 'string', enum: ['gasto', 'ganho'] },
    valor: nullable('number'),
    estabelecimento: nullable('string'),
    descricao: nullable('string'),
    data: nullable('string'),
    hora: nullable('string'),
    forma_pagamento: { type: 'string', enum: METHODS },
    cartao_final: nullable('string'),
    cartao_bandeira: nullable('string'),
    banco: nullable('string'),
    parcelas: { type: 'integer' },
    valor_parcela: nullable('number'),
    valor_a_vista: nullable('number'),
    local: nullable('string'),
    categoria: { type: 'string', enum: [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => c.id) },
    classificacao: { type: 'string', enum: Object.keys(CLASSIFICATIONS) },
    confianca: { type: 'number' },
    observacao: nullable('string'),
  },
};

/** Converte a resposta do Claude no formato interno usado pelo formulário. */
export function normalizeClaudePurchase(j) {
  const type = j.tipo === 'ganho' ? 'income' : 'expense';
  const n = Math.max(1, Math.round(+j.parcelas || 1));
  const cash = +j.valor_a_vista || null;
  let amount = +j.valor || null;
  if (n > 1 && cash) amount = cash;
  if (n > 1 && !amount && j.valor_parcela) amount = j.valor_parcela * n;
  const validCats = (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => c.id);
  const category = validCats.includes(j.categoria) ? j.categoria : categorize(`${j.estabelecimento || ''} ${j.descricao || ''}`, type) || (type === 'income' ? 'outros-ganhos' : 'outros');
  return {
    type,
    amount,
    merchant: j.estabelecimento || null,
    description: j.descricao || j.estabelecimento || null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(j.data || '') ? j.data : null,
    time: /^\d{1,2}:\d{2}$/.test(j.hora || '') ? j.hora.padStart(5, '0') : null,
    method: METHODS.includes(j.forma_pagamento) && j.forma_pagamento !== 'nao_identificado' ? j.forma_pagamento : null,
    card: j.cartao_final || j.cartao_bandeira || j.banco ? { last4: j.cartao_final || null, brand: j.cartao_bandeira || null, bank: j.banco || null } : null,
    installments: n,
    installmentValue: +j.valor_parcela || null,
    cashPrice: cash,
    location: j.local || null,
    category,
    classification: type === 'expense' ? (CLASSIFICATIONS[j.classificacao] ? j.classificacao : defaultClassification(category)) : null,
    confidence: typeof j.confianca === 'number' ? j.confianca : null,
    note: j.observacao || null,
  };
}

const NO_CLAUDE = ['not_granted', 'sampling_disabled', 'images_unavailable', 'capability_disabled', 'capability_removed', 'not_declared'];

/**
 * Lê uma imagem com o melhor motor disponível.
 * Retorna { json } quando o Claude leu, ou { text } quando foi OCR (o chamador interpreta o texto).
 */
async function readImage(file, { prompt, schema, maxSide = 1600, signal, onStatus = () => {} }) {
  const blob = await prepareImage(file, maxSide);
  const engine = await currentEngine();
  onStatus(`Lendo com ${engine.label}…`);
  if (engine.id === 'claude') {
    try {
      const sample = await getSample();
      return { json: await sample.json(prompt, { images: [blob], signal, cache: false }), engine };
    } catch (e) {
      if (e?.code === 'cancelled') throw e;
      if (!NO_CLAUDE.includes(e?.code)) throw new Error(sampleErrorText(e));
      // sem permissão para usar o Claude: tenta os outros motores
    }
  }
  if (getApiKey()) return { json: await callClaudeApi(blob, prompt, schema, signal), engine: { id: 'api', label: 'Claude API (sua chave)' } };
  onStatus('Lendo o texto da imagem no aparelho… (a primeira vez demora um pouco)');
  return { text: await ocr(blob, onStatus), engine: { id: 'ocr', label: 'Leitura no aparelho (OCR)' } };
}

/**
 * Analisa um print de compra. Retorna { data, engine }.
 * onStatus(texto) recebe o andamento para mostrar na tela.
 */
export async function analyzePurchase(file, opts = {}) {
  const r = await readImage(file, { ...opts, prompt: purchasePrompt(toISO(new Date())), schema: PURCHASE_SCHEMA });
  return { data: r.json ? normalizeClaudePurchase(r.json) : { ...parseReceiptText(r.text), rawText: r.text }, engine: r.engine };
}

// ---------- Várias notificações (Mercado Pago, 99, bancos) ----------

const notificationsPrompt = (today) => `Este print mostra uma ou mais notificações ou movimentações financeiras (central de notificações do celular, extrato/atividade do Mercado Pago, 99Pay, 99, banco ou carteira digital). Hoje é ${today}.
Liste CADA movimentação de dinheiro (Pix enviado ou recebido, pagamento, compra, transferência, corrida da 99, recarga) e devolva SOMENTE {"movimentos": [...]}. Ignore propagandas, ofertas e avisos sem valor.
Cada item tem estes campos ("banco" é o app de origem: Mercado Pago, 99Pay, Nubank…):
${purchaseGuide()}`;

const NOTIFICATIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['movimentos'],
  properties: { movimentos: { type: 'array', items: PURCHASE_SCHEMA } },
};

export async function analyzeNotifications(file, opts = {}) {
  const r = await readImage(file, { ...opts, maxSide: 2000, prompt: notificationsPrompt(toISO(new Date())), schema: NOTIFICATIONS_SCHEMA });
  const items = r.json ? (r.json.movimentos || []).map(normalizeClaudePurchase).filter((x) => x.amount > 0) : parseNotifications(r.text);
  return { items, engine: r.engine };
}

// ---------- Contrato de empréstimo ----------

const loanPrompt = `Este é um print de um contrato, proposta ou simulação de empréstimo/financiamento (CCB, consignado, empréstimo pessoal, financiamento, Pix parcelado). Extraia as condições e devolva SOMENTE um JSON com:
- "credor": banco ou financeira, ou null
- "tipo": um de emprestimo, consignado, financiamento, pix_parcelado, outro
- "valor_liberado": quanto cai na conta da pessoa (valor líquido), ou null
- "valor_financiado": valor total financiado/contratado (inclui IOF, tarifas, seguro), ou null
- "parcelas": número de parcelas, ou null
- "valor_parcela": valor de cada parcela, ou null
- "taxa_mensal": taxa de juros ao mês em PERCENTUAL (4,5% = 4.5), ou null
- "taxa_anual": taxa de juros ao ano em percentual, ou null
- "cet_mensal": custo efetivo total ao mês em percentual, ou null
- "cet_anual": CET ao ano em percentual, ou null
- "iof": valor do IOF em reais, ou null
- "tarifas": soma de tarifas (cadastro, abertura etc.), ou null
- "seguro": valor do seguro, ou null
- "primeiro_vencimento": data da 1ª parcela AAAA-MM-DD, ou null
- "observacao": cláusula ou custo que merece atenção (seguro embutido, carência, multa), ou null
- "confianca": de 0 a 1
Exemplo: {"credor":"Banco Inter","tipo":"emprestimo","valor_liberado":5000,"valor_financiado":5420.5,"parcelas":24,"valor_parcela":372.15,"taxa_mensal":4.5,"taxa_anual":69.59,"cet_mensal":5.32,"cet_anual":86.24,"iof":120.5,"tarifas":300,"seguro":null,"primeiro_vencimento":"2026-11-20","observacao":null,"confianca":0.9}`;

const LOAN_KINDS = ['emprestimo', 'consignado', 'financiamento', 'pix_parcelado', 'outro'];
const LOAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['credor', 'tipo', 'valor_liberado', 'valor_financiado', 'parcelas', 'valor_parcela', 'taxa_mensal', 'taxa_anual', 'cet_mensal', 'cet_anual', 'iof', 'tarifas', 'seguro', 'primeiro_vencimento', 'observacao', 'confianca'],
  properties: {
    credor: nullable('string'),
    tipo: { type: 'string', enum: LOAN_KINDS },
    valor_liberado: nullable('number'),
    valor_financiado: nullable('number'),
    parcelas: nullable('integer'),
    valor_parcela: nullable('number'),
    taxa_mensal: nullable('number'),
    taxa_anual: nullable('number'),
    cet_mensal: nullable('number'),
    cet_anual: nullable('number'),
    iof: nullable('number'),
    tarifas: nullable('number'),
    seguro: nullable('number'),
    primeiro_vencimento: nullable('string'),
    observacao: nullable('string'),
    confianca: { type: 'number' },
  },
};

const pctToMonthly = (m, a) => (m != null ? m / 100 : a != null ? Math.pow(1 + a / 100, 1 / 12) - 1 : null);

export function normalizeClaudeLoan(j) {
  const num = (v) => (v != null && +v > 0 ? +v : null);
  return {
    creditor: j.credor || null,
    kind: LOAN_KINDS.includes(j.tipo) ? j.tipo : 'emprestimo',
    released: num(j.valor_liberado),
    financed: num(j.valor_financiado),
    n: num(j.parcelas) ? Math.round(j.parcelas) : null,
    pmt: num(j.valor_parcela),
    statedRate: pctToMonthly(num(j.taxa_mensal), num(j.taxa_anual)),
    statedAnnual: num(j.taxa_anual) ? j.taxa_anual / 100 : null,
    cetMonthly: pctToMonthly(num(j.cet_mensal), num(j.cet_anual)),
    cetAnnual: num(j.cet_anual) ? j.cet_anual / 100 : null,
    iof: num(j.iof),
    tariff: num(j.tarifas),
    insurance: num(j.seguro),
    firstDue: /^\d{4}-\d{2}-\d{2}$/.test(j.primeiro_vencimento || '') ? j.primeiro_vencimento : null,
    note: j.observacao || null,
    confidence: typeof j.confianca === 'number' ? j.confianca : null,
  };
}

export async function analyzeLoanContract(file, opts = {}) {
  const r = await readImage(file, { ...opts, maxSide: 2000, prompt: loanPrompt, schema: LOAN_SCHEMA });
  return { data: r.json ? normalizeClaudeLoan(r.json) : { ...parseLoanText(r.text), rawText: r.text }, engine: r.engine };
}

// ---------- Extratos e faturas (PDF, texto, prints de várias páginas) ----------

const STATEMENT_TYPES = ['gasto', 'ganho', 'pagamento', 'estorno', 'encargo'];
const statementGuide = `Devolva SOMENTE um JSON com:
- "banco": banco/emissor ou app de origem, ou null
- "cartao_final": 4 últimos dígitos do cartão, ou null
- "vencimento": vencimento da fatura AAAA-MM-DD, ou null (se for extrato de conta, null)
- "total": total da fatura, ou null
- "movimentos": lista, um item por lançamento, com:
  - "data": AAAA-MM-DD (em fatura sem ano, use o ano coerente com o vencimento)
  - "descricao": como aparece, sem o trecho da parcela
  - "valor": valor positivo em reais
  - "tipo": gasto, ganho, pagamento (pagamento da própria fatura), estorno (crédito/devolução) ou encargo (juros, IOF, multa, anuidade)
  - "parcela_atual" e "parcelas_total": para compras parceladas ("3/10" = 3 e 10), senão null
  - "categoria": um id de ${[...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => c.id).join(', ')}
Ignore linhas de saldo, totais, limites e propaganda.`;

const STATEMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['banco', 'cartao_final', 'vencimento', 'total', 'movimentos'],
  properties: {
    banco: nullable('string'),
    cartao_final: nullable('string'),
    vencimento: nullable('string'),
    total: nullable('number'),
    movimentos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'descricao', 'valor', 'tipo', 'parcela_atual', 'parcelas_total', 'categoria'],
        properties: {
          data: { type: 'string' },
          descricao: { type: 'string' },
          valor: { type: 'number' },
          tipo: { type: 'string', enum: STATEMENT_TYPES },
          parcela_atual: nullable('integer'),
          parcelas_total: nullable('integer'),
          categoria: { type: 'string', enum: [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => c.id) },
        },
      },
    },
  },
};

export function normalizeStatement(j) {
  const ids = (type) => (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => c.id);
  const movements = (j?.movimentos || [])
    .filter((m) => m && /^\d{4}-\d{2}-\d{2}$/.test(m.data) && Math.abs(+m.valor) > 0)
    .map((m) => {
      const type = ['ganho', 'estorno', 'pagamento'].includes(m.tipo) ? 'income' : 'expense';
      const kind = { gasto: 'compra', ganho: 'compra', pagamento: 'pagamento', estorno: 'estorno', encargo: 'encargo' }[m.tipo] || 'compra';
      const n = +m.parcelas_total;
      const i = +m.parcela_atual;
      const category = kind === 'encargo' ? 'impostos' : kind === 'estorno' ? 'reembolso' : ids(type).includes(m.categoria) ? m.categoria : categorize(m.descricao, type) || (type === 'income' ? 'outros-ganhos' : 'outros');
      return { date: m.data, time: '', description: String(m.descricao || '').trim(), amount: Math.abs(+m.valor), type, kind, installment: n > 1 && i >= 1 && i <= n ? { i, n } : null, category };
    });
  return {
    movements,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(j?.vencimento || '') ? j.vencimento : null,
    total: +j?.total || null,
    card: j?.banco || j?.cartao_final ? { bank: j.banco || null, last4: j.cartao_final || null, brand: null } : null,
    isInvoice: Boolean(j?.vencimento),
  };
}

/** O Claude está disponível para organizar texto? (sem imagem) */
export async function canStructureText() {
  return Boolean((await getSampleInfo())?.sample || getApiKey());
}

/** Pede ao Claude para organizar o texto de um extrato ou fatura em lançamentos. */
export async function structureText(text, { invoice = false, signal } = {}) {
  const today = toISO(new Date());
  const body = String(text).slice(0, 60000);
  const prompt = `Abaixo está o texto de ${invoice ? 'uma fatura de cartão de crédito' : 'um extrato bancário ou exportação de outro app de finanças'} (pode ter vindo de um PDF, com colunas desalinhadas). Hoje é ${today}.\n${statementGuide}\n\n--- TEXTO ---\n${body}`;
  const info = await getSampleInfo();
  if (info?.sample) {
    try {
      return normalizeStatement(await info.sample.json(prompt, { signal, cache: false }));
    } catch (e) {
      if (e?.code === 'cancelled') throw e;
      if (!NO_CLAUDE.includes(e?.code)) throw new Error(sampleErrorText(e));
    }
  }
  if (getApiKey()) return normalizeStatement(await callClaudeApi(null, prompt, STATEMENT_SCHEMA, signal));
  throw new Error('Para organizar esse texto com o Claude, abra o app dentro da Claude ou cadastre uma chave em Ajustes.');
}

/** Prints de fatura/extrato (uma ou várias páginas). */
export async function analyzeStatementImages(files, { invoice = false, signal, onStatus = () => {} } = {}) {
  const today = toISO(new Date());
  const all = { movements: [], dueDate: null, total: null, card: null, isInvoice: invoice };
  let engine = null;
  for (let k = 0; k < files.length; k++) {
    onStatus(`Lendo página ${k + 1} de ${files.length}…`);
    const prompt = `Este print é ${files.length > 1 ? `a página ${k + 1} de ${files.length} de ` : ''}${invoice ? 'uma fatura de cartão de crédito' : 'um extrato ou lista de movimentações'}. Hoje é ${today}.\n${statementGuide}`;
    const r = await readImage(files[k], { maxSide: 2200, prompt, schema: STATEMENT_SCHEMA, signal, onStatus });
    engine = r.engine;
    const part = r.json ? normalizeStatement(r.json) : parseStatementText(r.text, { invoice: invoice || null });
    all.movements.push(...part.movements);
    all.dueDate = all.dueDate || part.dueDate;
    all.total = all.total || part.total;
    all.card = all.card || part.card;
    all.isInvoice = all.isInvoice || part.isInvoice;
  }
  return { ...all, engine };
}

// ---------- Serasa ----------

const serasaPrompt = `Este é um print do Serasa Limpa Nome (ou de outro site de negociação de dívidas) mostrando dívidas no CPF da pessoa.
Liste cada dívida e devolva SOMENTE um JSON {"dividas": [...]}, cada item com:
- "credor": nome da empresa
- "valor_divida": valor atual da dívida (número)
- "oferta_a_vista": valor para quitar à vista na oferta, ou null
- "oferta_parcelas": número de parcelas da melhor oferta parcelada, ou null
- "oferta_valor_parcela": valor de cada parcela da oferta, ou null
- "desde": data de origem ou vencimento (AAAA-MM-DD), ou null
Exemplo: {"dividas":[{"credor":"Banco Santander","valor_divida":3245.1,"oferta_a_vista":649.02,"oferta_parcelas":12,"oferta_valor_parcela":98,"desde":"2023-07-18"}]}`;

const SERASA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dividas'],
  properties: {
    dividas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['credor', 'valor_divida', 'oferta_a_vista', 'oferta_parcelas', 'oferta_valor_parcela', 'desde'],
        properties: {
          credor: { type: 'string' },
          valor_divida: { type: 'number' },
          oferta_a_vista: nullable('number'),
          oferta_parcelas: nullable('integer'),
          oferta_valor_parcela: nullable('number'),
          desde: nullable('string'),
        },
      },
    },
  },
};

const normalizeSerasa = (j) =>
  (j?.dividas || [])
    .filter((d) => d && +d.valor_divida > 0)
    .map((d) => ({
      creditor: String(d.credor || 'Credor'),
      balance: +d.valor_divida,
      offer: +d.oferta_a_vista || null,
      offerInstallments: d.oferta_parcelas && d.oferta_valor_parcela ? { n: +d.oferta_parcelas, pmt: +d.oferta_valor_parcela } : null,
      since: /^\d{4}-\d{2}-\d{2}$/.test(d.desde || '') ? d.desde : '',
    }));

export async function analyzeSerasa(file, opts = {}) {
  const r = await readImage(file, { ...opts, maxSide: 2000, prompt: serasaPrompt, schema: SERASA_SCHEMA });
  return { debts: r.json ? normalizeSerasa(r.json) : parseSerasaText(r.text), engine: r.engine, rawText: r.text };
}

// ---------- Motores ----------

function sampleErrorText(e) {
  switch (e?.code) {
    case 'rate_limited':
      return 'Muitas leituras seguidas. Espere um pouco e tente de novo.';
    case 'image_rejected':
      return 'A imagem não foi aceita. Use um print em JPG ou PNG com menos de 20 MB.';
    case 'refused':
      return 'O Claude não leu essa imagem. Tente recortar só a parte da compra.';
    case 'invalid_json':
    case 'empty_completion':
      return 'Não consegui entender o print. Tente de novo ou preencha manualmente.';
    case 'session_expired':
      return 'Sua sessão expirou. Entre de novo na sua conta Claude.';
    default:
      return 'A leitura falhou por um problema de conexão. Tente de novo.';
  }
}

/** Chama a API com uma imagem (blob) ou só texto (blob null). */
async function callClaudeApi(blob, prompt, schema, signal) {
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true });
  const data = blob ? await blobToBase64(blob) : null;
  let res;
  try {
    res = await client.beta.messages.create(
      {
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
        messages: [
          {
            role: 'user',
            content: [...(data ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }] : []), { type: 'text', text: prompt }],
          },
        ],
      },
      { signal },
    );
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('A chave da API não foi aceita. Confira em Ajustes.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error('Sua chave não tem permissão para esse modelo.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Limite de uso da API atingido. Tente em alguns minutos.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Sem conexão com a API do Claude. Verifique a internet.');
    if (e instanceof Anthropic.APIError) throw new Error(`A API do Claude recusou o pedido (${e.status ?? 'erro'}).`);
    throw e;
  }
  if (res.stop_reason === 'refusal') throw new Error('O Claude não leu essa imagem. Tente recortar só a parte da compra.');
  const text = res.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('A resposta veio vazia. Tente de novo.');
  return JSON.parse(text);
}

let tesseractLoad = null;
async function ocr(blob, onStatus) {
  if (!tesseractLoad) {
    tesseractLoad = new Promise((res, rej) => {
      if (window.Tesseract) return res(window.Tesseract);
      const s = document.createElement('script');
      s.src = TESSERACT_URL;
      s.onload = () => res(window.Tesseract);
      s.onerror = () => {
        tesseractLoad = null;
        rej(new Error('Não deu para carregar o leitor de imagem. Cole o texto do comprovante ou configure a chave do Claude em Ajustes.'));
      };
      document.head.append(s);
    });
  }
  const T = await tesseractLoad;
  try {
    const worker = await T.createWorker('por', 1, {
      logger: (m) => m.status === 'recognizing text' && onStatus(`Lendo o texto… ${Math.round(m.progress * 100)}%`),
    });
    const { data } = await worker.recognize(blob);
    await worker.terminate();
    return data.text || '';
  } catch {
    throw new Error('A leitura no aparelho não funcionou aqui. Cole o texto do comprovante ou configure a chave do Claude em Ajustes.');
  }
}
