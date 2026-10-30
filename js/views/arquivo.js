// Importar arquivos de outros apps e bancos (CSV, TXT, OFX, Excel, JSON, PDF) e faturas de cartão (PDF, prints, CSV).
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS, defaultClassification } from '../categories.js';
import { detectSource, guessColumns, invoiceSum, parseCSV, parseJSONData, parseOFX, parseStatementText, tableToMovements, finishMovement } from '../importers.js';
import { cardLabel, parseNotifications, parseQuickEntry, toISO } from '../parser.js';
import { analyzeStatementImages, canStructureText, structureText } from '../receipt.js';
import { readDocx, readHtml, readOdt, readRtf } from '../documents.js';
import { addTransactions, deleteTransactions, findDuplicate, mergeBackup, replaceState } from '../store.js';
import { dateBR, esc, html, icon, money, openSheet, toast } from '../ui.js';
import { cardInfo, cardText, dueFor, findKnownLast4, knownLast4, rememberCard } from '../cards.js';
import { addMonthsISO } from '../analytics.js';
import { loadPdfjs, loadXlsx } from '../libs.js';

const ACCEPT = '.csv,.tsv,.txt,.ofx,.qfx,.xlsx,.xls,.ods,.json,.pdf,.docx,.odt,.rtf,.html,.htm,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,image/png,image/jpeg,image/webp';
const MAX_ROWS = 400;

/** Bancos brasileiros ainda exportam em Windows-1252: tenta UTF-8 e cai para ele se vier lixo. */
async function readText(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

async function readSpreadsheet(file) {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  // a aba com mais linhas costuma ser a de lançamentos
  const sheets = wb.SheetNames.map((n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }));
  const rows = sheets.sort((a, b) => b.length - a.length)[0] || [];
  const text = rows.map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? ''))).join(';')).join('\n');
  return parseCSV(text);
}

/** Texto de PDF reconstruído linha a linha (itens agrupados pela altura na página). */
async function readPdfText(file) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const lines = [];
    for (const it of content.items) {
      if (!it.str?.trim()) continue;
      const y = it.transform[5];
      let line = lines.find((l) => Math.abs(l.y - y) < 2.5);
      if (!line) lines.push((line = { y, items: [] }));
      line.items.push({ x: it.transform[4], s: it.str.trim() });
    }
    lines.sort((a, b) => b.y - a.y);
    for (const l of lines) out.push(l.items.sort((a, b) => a.x - b.x).map((i) => i.s).join('  '));
  }
  return out.join('\n');
}

/** Páginas de um PDF escaneado como imagens (até 8 páginas). */
async function readPdfImages(file, maxPages = 8) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    out.push(new File([blob], `pagina-${p}.jpg`, { type: 'image/jpeg' }));
  }
  return out;
}

const ext = (f) => (f.name.split('.').pop() || '').toLowerCase();

/** Lê os arquivos escolhidos e devolve um resultado para revisão. */
/**
 * Lê um ou vários arquivos. Prints viram páginas de um extrato/fatura; cada documento é lido à parte.
 * Com mais de um, os lançamentos são juntados numa lista só para conferir.
 */
async function readFiles(files, mode, onStatus) {
  const images = files.filter((f) => f.type.startsWith('image/'));
  const docs = files.filter((f) => !f.type.startsWith('image/'));
  const parts = [];
  const failed = [];
  if (images.length) {
    const r = await analyzeStatementImages(images, { invoice: mode === 'fatura', onStatus });
    parts.push({ label: `${images.length} print${images.length > 1 ? 's' : ''} · ${r.engine?.label || ''}`, ...r });
  }
  for (let k = 0; k < docs.length; k++) {
    const status = docs.length > 1 ? (m) => onStatus(`Arquivo ${k + 1} de ${docs.length}: ${m}`) : onStatus;
    try {
      parts.push(await readFile(docs[k], mode, status));
    } catch (e) {
      if (files.length === 1) throw e;
      failed.push(docs[k].name);
    }
  }
  if (!parts.length) throw new Error(`Não consegui ler ${failed.join(', ')}.`);
  if (parts.length === 1 && !failed.length) return parts[0];
  if (parts.some((p) => p.backup)) throw new Error('O backup do Meu Bolso precisa ser importado sozinho.');
  return {
    label: `${files.length} arquivos${failed.length ? ` · não li: ${failed.join(', ')}` : ''}`,
    movements: parts.flatMap((p) => p.movements),
    card: parts.find((p) => p.card)?.card || null,
    isInvoice: parts.some((p) => p.isInvoice),
    rawText: parts.map((p) => p.rawText || '').join('\n'),
    // vencimento/total só valem quando vieram de uma fatura só
    ...(parts.length === 1 ? { dueDate: parts[0].dueDate, total: parts[0].total } : {}),
  };
}

async function readFile(f, mode, onStatus) {
  const e = ext(f);
  onStatus(`Lendo ${f.name}…`);
  if (e === 'ofx' || e === 'qfx') {
    const o = parseOFX(await readText(f));
    return { label: `OFX${o.bank ? ` · banco ${o.bank}` : ''}`, movements: o.movements, card: o.account ? { bank: null, last4: o.account.replace(/\D/g, ''), brand: null } : null, isInvoice: o.isCard || mode === 'fatura' };
  }
  if (['xlsx', 'xls', 'ods'].includes(e)) return tableResult(await readSpreadsheet(f), mode, 'Planilha Excel');
  if (e === 'json') {
    const j = parseJSONData(await readText(f));
    if (j.backup) return { backup: j.backup, label: 'Backup do Meu Bolso' };
    return tableResult(j, mode, 'JSON');
  }
  if (e === 'pdf') {
    onStatus('Extraindo o texto do PDF…');
    const text = await readPdfText(f);
    // PDF escaneado (só imagem): sem texto, lê as páginas como prints
    if (text.replace(/\s/g, '').length < 40) {
      onStatus('O PDF é uma imagem escaneada. Lendo as páginas…');
      const pages = await readPdfImages(f);
      const r = await analyzeStatementImages(pages, { invoice: mode === 'fatura', onStatus });
      return { label: `PDF escaneado · ${pages.length} página${pages.length > 1 ? 's' : ''} · ${r.engine?.label || ''}`, ...r };
    }
    return textResult(text, mode, 'PDF');
  }
  if (e === 'doc') throw new Error('Arquivos .doc antigos não dão para ler. No Word ou Google Docs, salve como DOCX ou PDF e envie de novo.');
  if (['docx', 'odt', 'rtf', 'html', 'htm'].includes(e)) {
    onStatus(`Lendo o documento ${f.name}…`);
    const doc = e === 'docx' ? await readDocx(await f.arrayBuffer()) : e === 'odt' ? await readOdt(await f.arrayBuffer()) : e === 'rtf' ? readRtf(await readText(f)) : readHtml(await readText(f));
    return documentResult(doc, mode, e.toUpperCase());
  }
  const text = await readText(f);
  const t = parseCSV(text);
  if (t.headers.length >= 2 && t.rows.length) {
    const r = tableResult(t, mode, e === 'txt' ? 'TXT' : 'CSV');
    if (r.movements.length) return r;
  }
  return textResult(text, mode, e.toUpperCase() || 'Texto');
}

/** Documento com texto e tabelas: usa o que render mais lançamentos (a tabela maior ou o texto corrido). */
function documentResult(doc, mode, kind) {
  const fromText = textResult(doc.text, mode, kind);
  const biggest = doc.tables.filter((t) => t.length >= 3).sort((a, b) => b.length - a.length)[0];
  if (biggest) {
    const fromTable = tableResult({ headers: biggest[0], rows: biggest.slice(1) }, mode, kind);
    if (fromTable.movements.length > fromText.movements.length) return { ...fromTable, dueDate: fromText.dueDate, total: fromText.total, card: fromText.card, rawText: doc.text };
  }
  return fromText;
}

function tableResult(t, mode, kind) {
  const source = detectSource(t.headers);
  const map = guessColumns(t.headers, t.rows);
  const positiveIsExpense = source.positiveIsExpense || mode === 'fatura';
  return { label: `${kind} · ${source.label}`, table: { ...t, map, positiveIsExpense }, movements: tableToMovements(t.rows, map, { positiveIsExpense }), isInvoice: source.invoice || mode === 'fatura' };
}

/** Texto colado: planilha copiada, extrato, fatura, notificações ou anotações livres. */
function parseAnyText(text, mode) {
  const t = parseCSV(text);
  if (t.headers.length >= 2 && t.rows.length) {
    const r = tableResult(t, mode, 'Texto colado');
    if (r.movements.length) return r;
  }
  return textResult(text, mode, 'Texto colado');
}

function textResult(text, mode, kind) {
  const st = parseStatementText(text, { invoice: mode === 'fatura' ? true : null });
  let movements = st.movements;
  if (!movements.length) {
    // texto de notificações (Mercado Pago, 99, bancos)
    const notes = parseNotifications(text).map((n) => finishMovement({ date: n.date || toISO(new Date()), time: n.time || '', description: n.description || n.merchant || 'Movimentação', signed: n.type === 'income' ? n.amount : -n.amount, type: n.type }));
    // anotações livres, uma por linha: "almoço 32,90 débito", "+ freela 300", "tênis 3x 120 crédito"
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      // precisa de número e de palavra: "99" sozinho é nome de app, não gasto
      .filter((l) => /\d/.test(l) && /[a-zà-ú]{2,}/i.test(l))
      .map((l) => ({ line: l, q: parseQuickEntry(l) }))
      .filter(({ q }) => q.amount > 0)
      .map(({ line, q }) => {
        const n = q.installments > 1 ? q.installments : 1;
        const m = finishMovement({ date: q.date, description: q.description || line, signed: q.type === 'income' ? q.amount / n : -q.amount / n, type: q.type });
        return { ...m, category: q.category, method: q.method, installment: n > 1 ? { i: 1, n } : null };
      });
    // notificações têm várias linhas por movimento; anotações, uma linha cada: fica a leitura que achar mais lançamentos
    movements = lines.length > notes.length ? lines : notes.length ? notes : lines;
  }
  return { label: `${kind}${st.isInvoice ? ' · fatura' : ''}`, ...st, movements, rawText: text };
}

// ---------- Folha ----------

export function openFileImport({ mode = 'extrato', files = null } = {}) {
  const body = html`<div class="print" id="imp">
    <div class="seg" role="radiogroup" aria-label="O que você vai importar">
      <label><input type="radio" name="imp-mode" value="extrato" ${mode === 'extrato' ? 'checked' : ''}><span>Extrato ou outro app</span></label>
      <label><input type="radio" name="imp-mode" value="fatura" ${mode === 'fatura' ? 'checked' : ''}><span>Fatura do cartão</span></label>
    </div>
    <label class="drop" id="f-drop">
      <input type="file" id="f-files" multiple accept="${ACCEPT}" class="sr-only">
      ${icon('upload', 'lg')}
      <b>Escolher arquivos</b>
      <span id="f-hint">${mode === 'fatura' ? 'PDF ou DOCX da fatura, prints das páginas, CSV ou OFX do cartão. Pode escolher vários de uma vez.' : 'CSV, TXT, OFX, Excel, JSON, PDF, DOCX ou HTML de extrato. Prints também funcionam. Pode escolher vários de uma vez.'}</span>
    </label>
    <div id="f-status" class="status" hidden></div>
    <details class="more"><summary>Onde exportar nos apps</summary>
      <ul class="bullets">
        <li><b>Nubank:</b> na fatura, "Exportar fatura" (CSV) ou o PDF enviado por e-mail; na conta, "Pedir extrato" (CSV/OFX/PDF).</li>
        <li><b>Mercado Pago:</b> Seu dinheiro → Extrato → Baixar (CSV, Excel ou PDF).</li>
        <li><b>Inter, Itaú, Bradesco, Santander, Caixa, BB:</b> extrato em OFX (melhor) ou CSV/PDF; fatura em PDF.</li>
        <li><b>Mobills, Organizze, planilhas:</b> exportar em CSV ou Excel.</li>
      </ul>
    </details>
    <details class="more"><summary>Colar texto do extrato ou da fatura</summary>
      <label class="field"><span>Texto</span><textarea id="f-text" rows="6" placeholder="03/10 IFOOD *RESTAURANTE 45,90&#10;05/10 AMAZON PARCELA 3/10 129,90"></textarea></label>
      <button type="button" class="btn primary" id="f-read">Ler texto</button>
    </details>
    <div id="f-review"></div>
  </div>`;
  openSheet({
    title: 'Importar arquivo ou fatura',
    body,
    onMount(sheet) {
      const $ = (s) => sheet.body.querySelector(s);
      const modeNow = () => sheet.body.querySelector('[name=imp-mode]:checked').value;
      let ctl = null;
      const status = (content, kind = '') => {
        $('#f-status').hidden = !content;
        $('#f-status').className = `status ${kind}`;
        $('#f-status').innerHTML = String(content);
      };
      const run = async (fn) => {
        ctl?.abort();
        ctl = new AbortController();
        $('#f-review').innerHTML = '';
        status(html`<span class="spinner" aria-hidden="true"></span><span id="f-msg">Lendo…</span>`, 'busy');
        try {
          const r = await fn((m) => $('#f-msg') && ($('#f-msg').textContent = m));
          status('');
          if (r.backup) return renderBackup(r.backup, sheet);
          if (!r.movements.length && r.rawText && (await canStructureText())) {
            status(html`<span class="spinner" aria-hidden="true"></span><span>Não reconheci o formato. Pedindo ao Claude para organizar…</span>`, 'busy');
            Object.assign(r, await structureText(r.rawText, { invoice: modeNow() === 'fatura' }), { label: `${r.label} · organizado pelo Claude` });
            status('');
          }
          if (!r.movements.length) return status('Não encontrei lançamentos nesse arquivo. Tente exportar em CSV ou OFX, ou envie prints.', 'error');
          renderReview(r, sheet, modeNow());
        } catch (e) {
          if (e?.code === 'cancelled' || e?.name === 'AbortError') return;
          status(esc(e?.message || 'Não consegui ler esse arquivo.'), 'error');
        }
      };
      const handle = (list) => {
        const files = [...(list || [])];
        if (!files.length) return;
        run((onStatus) => readFiles(files, modeNow(), onStatus));
      };
      $('#f-files').addEventListener('change', (e) => handle(e.target.files));
      const drop = $('#f-drop');
      drop.addEventListener('dragover', (e) => (e.preventDefault(), drop.classList.add('over')));
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('over');
        handle(e.dataTransfer.files);
      });
      sheet.el.addEventListener('paste', (e) => {
        const files = [...(e.clipboardData?.files || [])];
        if (files.length) handle(files);
      });
      sheet.body.querySelectorAll('[name=imp-mode]').forEach((r) =>
        r.addEventListener('change', () => {
          $('#f-hint').textContent = modeNow() === 'fatura' ? 'PDF ou DOCX da fatura, prints das páginas, CSV ou OFX do cartão. Pode escolher vários de uma vez.' : 'CSV, TXT, OFX, Excel, JSON, PDF, DOCX ou HTML de extrato. Prints também funcionam. Pode escolher vários de uma vez.';
        }),
      );
      $('#f-read').addEventListener('click', () => {
        const text = $('#f-text').value.trim();
        if (!text) return status('Cole o texto primeiro.', 'error');
        run(async () => parseAnyText(text, modeNow()));
      });
      if (files) handle(files);
    },
  });
}

/** Colar texto: interpreta qualquer texto e mostra os lançamentos para conferir antes de inserir. */
export function openTextImport({ text = '' } = {}) {
  openSheet({
    title: 'Colar texto',
    body: html`<div class="print">
      <p class="hint">Cole linhas do extrato, o texto da fatura, uma conversa ou anotações como <b>"almoço 32,90 débito"</b> (uma por linha). O app separa cada lançamento para você conferir.</p>
      <label class="field"><span>Texto</span><textarea id="t-text" rows="8" placeholder="Você enviou um Pix de R$ 50,00 para Maria Souza&#10;03/10 IFOOD *RESTAURANTE 45,90&#10;uber 18 ontem&#10;+ freela 300">${text}</textarea></label>
      <div class="btn-row">
        <button type="button" class="btn" id="t-paste">${icon('copy')} Colar</button>
        <button type="button" class="btn primary grow" id="t-read">Interpretar</button>
      </div>
      <label class="check"><input type="checkbox" id="t-invoice"> <span>É texto de fatura de cartão (gastos aparecem como valores positivos)</span></label>
      <div id="f-status" class="status" hidden></div>
      <div id="f-review"></div>
    </div>`,
    onMount(sheet) {
      const $ = (q) => sheet.body.querySelector(q);
      const status = (content, kind = '') => {
        $('#f-status').hidden = !content;
        $('#f-status').className = `status ${kind}`;
        $('#f-status').innerHTML = String(content);
      };
      const read = async () => {
        const value = $('#t-text').value.trim();
        if (!value) return status('Cole o texto primeiro.', 'error');
        const mode = $('#t-invoice').checked ? 'fatura' : 'extrato';
        $('#f-review').innerHTML = '';
        try {
          let r = parseAnyText(value, mode);
          if (!r.movements.length && (await canStructureText())) {
            status(html`<span class="spinner" aria-hidden="true"></span><span>Pedindo ao Claude para organizar o texto…</span>`, 'busy');
            r = { ...r, ...(await structureText(value, { invoice: mode === 'fatura' })), label: 'Texto colado · organizado pelo Claude' };
          }
          status('');
          if (!r.movements.length) return status('Não encontrei valores nesse texto. Confira se há algo como "R$ 52,30" ou "almoço 32,90".', 'error');
          renderReview(r, sheet, mode);
        } catch (e) {
          status(esc(e?.message || 'Não consegui interpretar esse texto.'), 'error');
        }
      };
      $('#t-read').addEventListener('click', read);
      $('#t-paste').addEventListener('click', async () => {
        try {
          const clip = await navigator.clipboard.readText();
          if (clip) {
            $('#t-text').value = clip;
            return read();
          }
        } catch {
          /* o sistema não deixou ler a área de transferência */
        }
        $('#t-text').focus();
        toast('Toque e segure no campo de texto e escolha "Colar".');
      });
      if (text) read();
    },
  });
}

function renderBackup(backup, sheet) {
  const box = sheet.body.querySelector('#f-review');
  box.innerHTML = String(html`<div class="card"><p><b>Backup do Meu Bolso</b> com ${backup.transactions.length} lançamentos, ${backup.loans?.length || 0} dívidas e ${backup.goals?.length || 0} cofrinhos.</p>
    <div class="btn-row"><button type="button" class="btn primary" data-merge>Juntar com meus dados</button><button type="button" class="btn danger ghost" data-replace>Substituir tudo</button></div></div>`);
  box.querySelector('[data-merge]').onclick = () => {
    const n = mergeBackup(backup);
    sheet.close();
    toast(`${n} lançamentos novos adicionados`);
  };
  box.querySelector('[data-replace]').onclick = () => {
    replaceState(backup);
    sheet.close();
    toast('Backup restaurado');
  };
}

/** Lista de conferência dentro de outra folha (ex.: vários prints de compras). */
export function reviewMovements(r, sheet, mode = 'extrato') {
  if (!sheet.body.querySelector('#f-review')) sheet.body.querySelector('#r-results').innerHTML = '<div id="f-review"></div>';
  renderReview(r, sheet, mode);
}

function renderReview(r, sheet, mode) {
  const box = sheet.body.querySelector('#f-review');
  const isInvoice = r.isInvoice || mode === 'fatura';
  const cats = (type, sel) => (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => html`<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.icon} ${c.name}</option>`);
  const defaultCard = r.card ? cardLabel(r.card) : '';
  // final do cartão: o da fatura/arquivo, ou o que todos os prints mostram
  const rowFinals = [...new Set(r.movements.map((m) => m.last4).filter(Boolean))];
  const defLast4 = r.card?.last4 || (rowFinals.length === 1 ? rowFinals[0] : '') || findKnownLast4(r.rawText);
  const defBank = (r.card && [r.card.bank, r.card.brand].filter(Boolean).join(' · ')) || cardInfo(defLast4)?.bank || '';
  // tem cartão no arquivo/prints: compras no crédito vão para o mês em que a fatura vence
  const hasCard = Boolean(defLast4 || rowFinals.length || r.movements.some((m) => m.card));
  const lastDate = () => r.movements.map((m) => m.date).sort().pop();
  const state = { movements: r.movements, table: r.table };

  const draw = () => {
    const ms = state.movements;
    const dup = ms.map((m) => Boolean(findDuplicate({ ...m, card: '' })));
    const skip = ms.map((m, i) => dup[i] || m.kind === 'pagamento' || m.kind === 'transferencia');
    const hasInst = ms.some((m) => m.installment);
    const sum = isInvoice ? invoiceSum(ms) : null;
    const shown = ms.slice(0, MAX_ROWS);
    const t = state.table;
    const colSelect = (name, label, value, optional = true) =>
      html`<label class="field"><span>${label}</span><select name="${name}">${optional ? html`<option value="-1">—</option>` : ''}${t.headers.map((h, i) => html`<option value="${i}" ${i === value ? 'selected' : ''}>${h || `Coluna ${i + 1}`}</option>`)}</select></label>`;
    box.innerHTML = String(html`<form id="rv" class="form">
      <div class="extracted"><p class="extracted-title">${icon('spark')} ${r.label}</p>
        ${isInvoice && (r.dueDate || r.total) ? html`<p class="hint">Fatura${defaultCard ? ` · ${defaultCard}` : ''}${r.dueDate ? ` · vence ${dateBR(r.dueDate)}` : ''}${r.total ? ` · total ${money(r.total, { force: true })}` : ''}</p>` : ''}
        ${isInvoice && r.total ? html`<p class="pill ${Math.abs(sum - r.total) < 0.05 ? 'ok' : 'warn'}">${Math.abs(sum - r.total) < 0.05 ? 'A soma confere com o total da fatura' : `Soma dos itens ${money(sum, { force: true })}: diferença de ${money(Math.abs(r.total - sum), { force: true })} para o total (pode haver saldo anterior ou itens fora da lista)`}</p>` : ''}
      </div>
      ${t
        ? html`<details class="more"><summary>Ajustar colunas</summary>
            <div class="row2">${colSelect('c-date', 'Data', t.map.date, false)}${colSelect('c-desc', 'Descrição', t.map.description, false)}</div>
            <div class="row2">${colSelect('c-amount', 'Valor', t.map.amount)}${colSelect('c-cat', 'Categoria', t.map.category)}</div>
            <div class="row2">${colSelect('c-debit', 'Débito / saída', t.map.debit)}${colSelect('c-credit', 'Crédito / entrada', t.map.credit)}</div>
            <label class="check"><input type="checkbox" name="c-pos" ${t.positiveIsExpense ? 'checked' : ''}> <span>Gastos aparecem como valores positivos (comum em faturas)</span></label>
          </details>`
        : ''}
      <div class="row2">
        <label class="field"><span>Final do cartão</span><input name="o-last4" inputmode="numeric" maxlength="4" list="o-last4-list" autocomplete="off" value="${defLast4}" placeholder="Ex.: 8238"></label>
        <label class="field"><span>Banco / conta</span><input name="o-bank" value="${defBank}" placeholder="Ex.: Nubank"></label>
      </div>
      <datalist id="o-last4-list">${knownLast4().map((c) => html`<option value="${c}">${cardInfo(c)?.bank || ''}</option>`)}</datalist>
      <div class="row2">
        <label class="field"><span>Forma de pagamento</span><select name="o-method">${Object.entries(PAYMENT_METHODS).map(([k, l]) => html`<option value="${k}" ${k === (isInvoice || hasInst || hasCard ? 'credito' : 'pix') ? 'selected' : ''}>${l}</option>`)}</select></label>
        ${isInvoice ? html`<label class="field"><span>Vencimento da fatura</span><input name="o-due" type="date" value="${r.dueDate || dueFor(lastDate(), cardInfo(defLast4))}"></label>` : ''}
      </div>
      ${(hasInst || hasCard) && !isInvoice
        ? html`<div class="row2">
            <label class="field"><span>Fatura fecha dia</span><input name="o-closeday" type="number" min="1" max="31" inputmode="numeric" value="${cardInfo(defLast4)?.closeDay || ''}" placeholder="Ex.: 3"></label>
            <label class="field"><span>Vence dia</span><input name="o-dueday" type="number" min="1" max="31" inputmode="numeric" value="${cardInfo(defLast4)?.dueDay || ''}" placeholder="Ex.: 10"></label>
          </div>`
        : ''}
      ${hasCard || isInvoice ? html`<p class="hint">Compras no crédito entram no mês em que a fatura vence${isInvoice ? '' : ' (cartão já fechado → vencimento seguinte)'}.</p>` : ''}
      ${hasInst ? html`<label class="check"><input type="checkbox" name="o-future" checked> <span>Lançar as próximas parcelas nos meses seguintes${isInvoice ? ', no dia do vencimento' : ', conforme o fechamento e o vencimento do cartão'} (entram nas projeções)</span></label>` : ''}
      <p class="hint" id="rv-sum"></p>
      <div class="rv-list">${shown.map(
        (m, i) => html`<div class="rv-row ${skip[i] ? 'off' : ''}">
          <input type="checkbox" name="use" value="${i}" ${skip[i] ? '' : 'checked'} aria-label="Importar ${m.description}">
          <div class="rv-main">
            <input name="d-${i}" value="${m.description}" aria-label="Descrição">
            <div class="rv-meta"><span>${dateBR(m.date)}</span>
              ${m.installment ? html`<span class="pill">parcela ${m.installment.i}/${m.installment.n}</span>` : ''}
              ${m.last4 && m.last4 !== defLast4 ? html`<span class="pill">cartão ${m.last4}</span>` : ''}
              ${dup[i] ? html`<span class="pill warn">já registrado</span>` : ''}
              ${m.kind === 'pagamento' ? html`<span class="pill">pagamento da fatura</span>` : ''}
              ${m.kind === 'estorno' ? html`<span class="pill ok">estorno</span>` : ''}
              ${m.kind === 'encargo' ? html`<span class="pill bad">juros/taxa</span>` : ''}
              ${m.kind === 'transferencia' ? html`<span class="pill">transferência</span>` : ''}
            </div>
            <select name="k-${i}" aria-label="Categoria">${cats(m.type, m.category)}</select>
          </div>
          <b class="rv-val ${m.type}">${m.type === 'income' ? '+' : '−'} ${money(m.amount, { force: true })}</b>
        </div>`,
      )}</div>
      ${ms.length > MAX_ROWS ? html`<p class="hint">Mostrando ${MAX_ROWS} de ${ms.length}. Todos os marcados serão importados; os demais entram com a categoria sugerida.</p>` : ''}
      <button class="btn primary" type="submit" id="rv-go">Importar</button>
    </form>`);
    const f = box.querySelector('#rv');
    const updateSum = () => {
      const sel = [...f.querySelectorAll('[name=use]:checked')].map((c) => ms[+c.value]);
      const extra = ms.slice(MAX_ROWS).filter((m, k) => !skip[MAX_ROWS + k]);
      const all = [...sel, ...extra];
      const out = all.filter((m) => m.type === 'expense').reduce((s, m) => s + m.amount, 0);
      const inn = all.filter((m) => m.type === 'income').reduce((s, m) => s + m.amount, 0);
      f.querySelector('#rv-sum').textContent = `${all.length} de ${ms.length} selecionados · gastos ${money(out, { force: true })} · entradas ${money(inn, { force: true })}${dup.some(Boolean) ? ` · ${dup.filter(Boolean).length} já estavam no app` : ''}`;
      f.querySelector('#rv-go').textContent = `Importar ${all.length} lançamento${all.length === 1 ? '' : 's'}`;
      f.querySelector('#rv-go').disabled = !all.length;
    };
    f.addEventListener('change', (e) => {
      if (e.target.name?.startsWith('c-')) {
        const v = (n) => +f.querySelector(`[name=${n}]`).value;
        t.map = { ...t.map, date: v('c-date'), description: v('c-desc'), description2: -1, amount: v('c-amount'), category: v('c-cat'), debit: v('c-debit'), credit: v('c-credit') };
        t.positiveIsExpense = f.querySelector('[name=c-pos]').checked;
        state.movements = tableToMovements(t.rows, t.map, { positiveIsExpense: t.positiveIsExpense });
        return draw();
      }
      if (e.target.name === 'use') e.target.closest('.rv-row').classList.toggle('off', !e.target.checked);
      updateSum();
    });
    // final conhecido: completa banco e vencimento cadastrados
    f.querySelector('[name=o-last4]').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
      const info = cardInfo(e.target.value);
      if (!info) return;
      if (info.bank && !f.elements['o-bank'].value) f.elements['o-bank'].value = info.bank;
      if (info.dueDay && f.elements['o-dueday'] && !f.elements['o-dueday'].value) f.elements['o-dueday'].value = info.dueDay;
      if (info.closeDay && f.elements['o-closeday'] && !f.elements['o-closeday'].value) f.elements['o-closeday'].value = info.closeDay;
      if (info.dueDay && f.elements['o-due'] && !f.elements['o-due'].value) f.elements['o-due'].value = dueFor(lastDate(), info);
    });
    updateSum();
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const last4 = f.elements['o-last4'].value.trim();
      const bank = f.elements['o-bank'].value.trim();
      const card = cardText(last4, bank);
      const method = f.querySelector('[name=o-method]').value;
      const invoiceDue = f.elements['o-due']?.value || '';
      const dueDay = +f.elements['o-dueday']?.value || 0;
      const closeDay = +f.elements['o-closeday']?.value || 0;
      rememberCard(last4, { bank, due: invoiceDue, dueDay, closeDay });
      // mês em que cada compra no crédito vence: o vencimento da fatura importada, ou o da fatura em que a
      // compra cai pelo fechamento do cartão (já fechou → vencimento seguinte). Parcela k: k-1 meses depois.
      const firstDueOf = (m) => {
        if (m.type !== 'expense' || m.kind === 'pagamento' || m.kind === 'transferencia') return '';
        if (isInvoice && invoiceDue) return invoiceDue;
        if ((m.method || method) !== 'credito' && !m.installment) return '';
        // compra de outro cartão cadastrado usa o ciclo dele; senão, o fechamento/vencimento escritos acima
        const info = m.last4 && m.last4 !== last4 && cardInfo(m.last4)?.dueDay ? cardInfo(m.last4) : { dueDay: dueDay || cardInfo(last4)?.dueDay, closeDay: closeDay || cardInfo(last4)?.closeDay };
        const first = dueFor(m.date, info);
        return first && m.installment ? addMonthsISO(first, m.installment.i - 1) : first;
      };
      const picked = [...f.querySelectorAll('[name=use]:checked')].map((c) => +c.value);
      const rest = ms.map((_, k) => k).filter((k) => k >= MAX_ROWS && !skip[k]);
      const drafts = [...picked, ...rest].map((i) => {
        const m = ms[i];
        const category = i < MAX_ROWS ? f.querySelector(`[name=k-${i}]`).value : m.category;
        return {
          type: m.type,
          amount: m.amount,
          description: (i < MAX_ROWS ? f.querySelector(`[name=d-${i}]`).value.trim() : '') || m.description,
          category,
          classification: m.type === 'expense' ? defaultClassification(category) : null,
          date: m.date,
          time: m.time,
          method: m.method || method,
          // o cartão escrito acima vale para as linhas do mesmo final (ou sem final)
          card: m.last4 && m.last4 !== last4 ? (cardInfo(m.last4)?.bank ? cardText(m.last4, cardInfo(m.last4).bank) : m.card || cardText(m.last4, '')) : card || m.card,
          last4: m.last4 || last4,
          firstDue: firstDueOf(m),
          merchant: m.description,
          installment: m.installment,
          fitid: m.fitid,
          source: isInvoice ? 'fatura' : 'importacao',
        };
      });
      const ids = addTransactions(drafts, { futureInstallments: Boolean(f.querySelector('[name=o-future]')?.checked) });
      sheet.close();
      toast(`${drafts.length} lançamento${drafts.length === 1 ? '' : 's'} importado${drafts.length === 1 ? '' : 's'}${ids.length > drafts.length ? ` (+${ids.length - drafts.length} parcelas futuras)` : ''}`, {
        action: 'Desfazer',
        onAction: () => deleteTransactions(ids),
        timeout: 8000,
      });
    });
  };
  draw();
  box.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

