/** Forma de pagamento identificada no texto. */
export type PaymentMethod = 'pix' | 'pix_parcelado' | 'credito' | 'debito' | 'boleto' | 'dinheiro' | 'transferencia';

export interface CardInfo {
  /** Últimos 4 dígitos ("8238"), quando aparecem. */
  last4: string | null;
  /** Bandeira: "Visa", "Mastercard", "Elo"... */
  brand: string | null;
  /** Banco ou carteira: "Nubank", "Bradesco", "99pay"... */
  bank: string | null;
}

export interface Receipt {
  /** "expense" (saiu dinheiro) ou "income" (entrou). */
  type: 'expense' | 'income';
  /**
   * Valor em reais. No parcelado, é o valor da compra sem juros (preço à vista); a parcela vem em
   * `installmentValue`. À vista com taxa, é o total pago (valor + taxa), e a taxa vem em `fee`.
   */
  amount: number | null;
  /** Loja ou destinatário como aparece no texto. */
  merchant: string | null;
  /** Descrição pronta: "Pix para Maria Souza", "Pix parcelado para A&M 2Business", "Amazon". */
  description: string | null;
  /** Data da operação, AAAA-MM-DD. */
  date: string | null;
  /** Vencimento (boleto, conta), AAAA-MM-DD. */
  dueDate: string | null;
  /** Horário HH:MM (o da linha da data, não o relógio da barra de status). */
  time: string | null;
  method: PaymentMethod | null;
  card: CardInfo | null;
  /** Número de parcelas (1 = à vista). */
  installments: number;
  /** Valor de cada parcela, quando o texto mostra (ou quando sai de "valor pago ÷ parcelas"). */
  installmentValue: number | null;
  /** Preço à vista / valor original, quando aparece. */
  cashPrice: number | null;
  /** Taxa, tarifa, juros ou multa incluídos em `amount` (só à vista). */
  fee: number | null;
  /** "taxa" (taxa, tarifa, IOF) ou "juros" (juros, multa, mora, encargos). */
  feeKind: 'taxa' | 'juros' | null;
  location: string | null;
  /** Categoria devolvida pela função `categorize` das opções, ou null. */
  category: string | null;
  /** App ou banco de onde veio o texto: "Mercado Pago", "99Pay", "Nubank"... */
  app: string | null;
}

export interface ParseReceiptOptions {
  /** Data de referência para "hoje", "ontem" e datas sem ano. Padrão: agora. */
  today?: Date;
  /** Sua função de categorias: recebe um texto e o tipo, devolve um id de categoria ou null. */
  categorize?: (text: string, type: 'expense' | 'income') => string | null;
}

/** Lê o texto de um comprovante, notificação ou print (OCR ou colado). */
export function parseReceipt(text: string, options?: ParseReceiptOptions): Receipt;

/** "1.234,56" | "1234.56" | "52,3" | "R$ 52" -> número (NaN se não houver número). */
export function parseAmount(raw: string | number | null | undefined): number;
/** Datas brasileiras ("17/10/2026", "14 de outubro de 2026", "23/out", "hoje", "ontem") -> AAAA-MM-DD ou null. */
export function findDate(text: string, today?: Date): string | null;
/** Primeiro horário do texto -> HH:MM ou null. */
export function findTime(text: string): string | null;
/** Parcelas em texto normalizado: "3x de R$ 50,00", "2xR$24,49", "em 6 parcelas", "Parcelamento 2". */
export function findInstallments(normalizedText: string): { n: number; pmt: number | null } | null;
/** Forma de pagamento citada num texto normalizado. */
export function methodFrom(normalizedText: string): PaymentMethod | null;
/** Final, bandeira e banco do cartão ("final 8238", "**** 8238", "Visa terminando em 2223"). */
export function findCard(text: string): CardInfo | null;
/** "Nubank · Visa · final 8238". */
export function cardLabel(card: CardInfo | null): string;
/** App ou banco citado num texto normalizado. */
export function findApp(normalizedText: string): string | null;
/** "income" ou "expense" pelas frases do texto normalizado ("Pix recebido", "você enviou"...). */
export function flowDirection(normalizedText: string): 'income' | 'expense';
/** Tira o bloco de propaganda do fim do comprovante ("Vincule sua chave Pix e ganhe..."). */
export function stripAds(text: string): string;
/** "A&M 2BUSINESS LTDA" -> "A&M 2Business": capitalização de nomes, siglas em maiúsculas, sem LTDA. */
export function nameCase(name: string): string;
/** Minúsculas e sem acentos. */
export function normalize(text: string): string;
/** Date -> AAAA-MM-DD no fuso local. */
export function toISO(date: Date): string;
export function pad(n: number): string;
/** Valor em reais dentro de um texto ("R$ 1.234,56", "52,30"). */
export const MONEY_RE: RegExp;
