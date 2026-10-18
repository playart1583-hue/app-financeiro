// Leitura de prints: compra/pagamento (onde, quando, horário, cartão, parcelas, valor) e lista de dívidas do Serasa.
// Motores, na ordem: Claude dentro do app da Claude (Artifact) → Claude API com chave própria → OCR no aparelho.
import { parseReceiptText, parseSerasaText, toISO } from './parser.js';
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
async function getSample() {
  if (!samplePromise) {
    samplePromise = (async () => {
      const c = typeof window !== 'undefined' ? window.claude : null;
      if (!c?.use) return null;
      const sample = await c.use('sample');
      if (!sample) return null;
      const limits = await sample.limits().catch(() => null);
      return limits?.images ? sample : null;
    })();
  }
  return samplePromise;
}

/** Qual motor vai ler o print agora. */
export async function currentEngine() {
  if (await getSample()) return { id: 'claude', label: 'Claude (sua conta)' };
  if (getApiKey()) return { id: 'api', label: 'Claude API (sua chave)' };
  return { id: 'ocr', label: 'Leitura no aparelho (OCR)' };
}

// ---------- Compra / pagamento ----------

const purchasePrompt = (today) => `Você está lendo o print de uma compra, pagamento ou recebimento (notificação do banco, comprovante Pix, nota fiscal, recibo, tela de fatura ou SMS). Hoje é ${today}.
Extraia os dados e devolva SOMENTE um objeto JSON com estes campos:
- "tipo": "gasto" ou "ganho" (ganho = dinheiro que entrou, ex.: Pix recebido)
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
Exemplo: {"tipo":"gasto","valor":152.3,"estabelecimento":"PADARIA DOCE PAO","descricao":"Padaria Doce Pão","data":"2026-10-17","hora":"14:32","forma_pagamento":"credito","cartao_final":"4321","cartao_bandeira":"Mastercard","banco":"Nubank","parcelas":3,"valor_parcela":50.77,"valor_a_vista":null,"local":null,"categoria":"restaurantes","classificacao":"superfluo","confianca":0.9,"observacao":null}`;

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

/**
 * Analisa um print de compra. Retorna { data, engine }.
 * onStatus(texto) recebe o andamento para mostrar na tela.
 */
export async function analyzePurchase(file, { onStatus = () => {}, signal } = {}) {
  const today = toISO(new Date());
  const blob = await prepareImage(file);
  const engine = await currentEngine();
  onStatus(`Lendo com ${engine.label}…`);
  if (engine.id === 'claude') {
    try {
      const sample = await getSample();
      const j = await sample.json(purchasePrompt(today), { images: [blob], signal, cache: false });
      return { data: normalizeClaudePurchase(j), engine };
    } catch (e) {
      if (e?.code === 'cancelled') throw e;
      if (!['not_granted', 'sampling_disabled', 'images_unavailable', 'capability_disabled', 'capability_removed', 'not_declared'].includes(e?.code)) throw new Error(sampleErrorText(e));
      // sem permissão para usar o Claude: tenta os outros motores
    }
  }
  if (engine.id === 'api' || (engine.id === 'claude' && getApiKey())) {
    const j = await callClaudeApi(blob, purchasePrompt(today), PURCHASE_SCHEMA, signal);
    return { data: normalizeClaudePurchase(j), engine: { id: 'api', label: 'Claude API (sua chave)' } };
  }
  onStatus('Lendo o texto da imagem no aparelho… (a primeira vez demora um pouco)');
  const text = await ocr(blob, onStatus);
  return { data: { ...parseReceiptText(text), rawText: text }, engine: { id: 'ocr', label: 'Leitura no aparelho (OCR)' } };
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

export async function analyzeSerasa(file, { onStatus = () => {}, signal } = {}) {
  const blob = await prepareImage(file, 2000);
  const engine = await currentEngine();
  onStatus(`Lendo com ${engine.label}…`);
  if (engine.id === 'claude') {
    try {
      const sample = await getSample();
      return { debts: normalizeSerasa(await sample.json(serasaPrompt, { images: [blob], signal, cache: false })), engine };
    } catch (e) {
      if (e?.code === 'cancelled') throw e;
      if (!['not_granted', 'sampling_disabled', 'images_unavailable', 'capability_disabled', 'capability_removed', 'not_declared'].includes(e?.code)) throw new Error(sampleErrorText(e));
    }
  }
  if (getApiKey()) return { debts: normalizeSerasa(await callClaudeApi(blob, serasaPrompt, SERASA_SCHEMA, signal)), engine: { id: 'api', label: 'Claude API (sua chave)' } };
  const text = await ocr(blob, onStatus);
  return { debts: parseSerasaText(text), engine: { id: 'ocr', label: 'Leitura no aparelho (OCR)' }, rawText: text };
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

async function callClaudeApi(blob, prompt, schema, signal) {
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true });
  const data = await blobToBase64(blob);
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
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
              { type: 'text', text: prompt },
            ],
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
