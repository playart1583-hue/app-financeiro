// Texto e tabelas de documentos: DOCX (Word), ODT (LibreOffice/Google Docs), RTF e HTML.
// DOCX e ODT são arquivos ZIP com XML dentro; o ZIP é aberto aqui mesmo (DecompressionStream), sem bibliotecas.

/** Lê um ZIP e devolve { nome: Uint8Array } só dos arquivos pedidos. */
export async function unzip(buffer, wanted = () => true) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // fim do diretório central: assinatura 0x06054b50 nos últimos bytes
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Arquivo corrompido ou não é um documento DOCX/ODT.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out = {};
  for (let k = 0; k < count; k++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (method === 0) out[name] = data;
    else if (method === 8) out[name] = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  }
  return out;
}

const decodeEntities = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

/**
 * Converte XML de documento em { text, tables }.
 * Cada linha de tabela vira uma linha de texto com as células separadas por dois espaços
 * (o leitor de extrato entende "03/10  IFOOD  45,90"), e também uma lista de células.
 */
function xmlToContent(xml, t) {
  const tables = [];
  const cellText = (s) =>
    decodeEntities(
      s
        .replace(new RegExp(`<${t.tab}[^>]*/>`, 'g'), ' ')
        .replace(new RegExp(`<${t.br}[^>]*/>`, 'g'), ' ')
        .replace(/<[^>]+>/g, ''),
    )
      .replace(/\s+/g, ' ')
      .trim();
  // tabelas primeiro: troca cada uma por um marcador e guarda as linhas
  let body = xml.replace(new RegExp(`<${t.table}[\\s>][\\s\\S]*?</${t.table}>`, 'g'), (tbl) => {
    const rows = [...tbl.matchAll(new RegExp(`<${t.row}[\\s>][\\s\\S]*?</${t.row}>`, 'g'))].map((r) =>
      [...r[0].matchAll(new RegExp(`<${t.cell}[\\s>][\\s\\S]*?</${t.cell}>`, 'g'))].map((c) => cellText(c[0])),
    );
    tables.push(rows);
    return `\n${rows.map((r) => r.filter(Boolean).join('  ')).join('\n')}\n`;
  });
  body = body
    .replace(new RegExp(`</${t.para}>`, 'g'), '\n')
    .replace(new RegExp(`<${t.br}[^>]*/>`, 'g'), '\n')
    .replace(new RegExp(`<${t.tab}[^>]*/>`, 'g'), '  ')
    .replace(/<[^>]+>/g, '');
  const text = decodeEntities(body)
    .split('\n')
    .map((l) => l.replace(/[ \t]{3,}/g, '  ').trim())
    .filter(Boolean)
    .join('\n');
  return { text, tables };
}

const WORD = { table: 'w:tbl', row: 'w:tr', cell: 'w:tc', para: 'w:p', tab: 'w:tab', br: 'w:br' };
const ODF = { table: 'table:table', row: 'table:table-row', cell: 'table:table-cell', para: 'text:(?:p|h)', tab: 'text:tab', br: 'text:line-break' };

export async function readDocx(buffer) {
  const files = await unzip(buffer, (n) => n === 'word/document.xml');
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('Esse arquivo não parece um DOCX do Word.');
  return xmlToContent(new TextDecoder().decode(xml), WORD);
}

export async function readOdt(buffer) {
  const files = await unzip(buffer, (n) => n === 'content.xml');
  const xml = files['content.xml'];
  if (!xml) throw new Error('Esse arquivo não parece um documento ODT.');
  return xmlToContent(new TextDecoder().decode(xml), ODF);
}

/** HTML (extratos salvos do internet banking). */
export function readHtml(html) {
  const clean = String(html)
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(td|th)>\s*/gi, '</$1>\u0001');
  const HTML = { table: 'table', row: 'tr', cell: 't[dh]', para: '(?:p|div|li|h\\d)', tab: 'wbr', br: 'br' };
  const res = xmlToContent(clean.replace(/<br\s*>/gi, '<br/>'), HTML);
  return { text: res.text.replace(/\u0001/g, '  '), tables: res.tables.map((t) => t.map((r) => r.map((c) => c.replace(/\u0001/g, '').trim()))) };
}

/** RTF: tira os comandos e fica com o texto. */
export function readRtf(rtf) {
  let s = String(rtf)
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(h, 16)])))
    .replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode(n < 0 ? 65536 + +n : +n))
    .replace(/\\(par|line|row)\b ?/g, '\n')
    .replace(/\\(tab|cell)\b ?/g, '  ')
    .replace(/\{\\\*[^{}]*\}/g, '')
    .replace(/\{\\(fonttbl|colortbl|stylesheet|info)[\s\S]*?\}\s*\}/g, '')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '');
  s = s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
  return { text: s, tables: [] };
}
