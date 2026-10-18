// Importar arquivos de outros apps e bancos (CSV, TXT, OFX, Excel, JSON, PDF) e faturas de cartão (PDF, prints, CSV).
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS, defaultClassification } from '../categories.js';
import { detectSource, guessColumns, invoiceSum, parseCSV, parseJSONData, parseOFX, parseStatementText, tableToMovements, finishMovement } from '../importers.js';
import { cardLabel, parseNotifications } from '../parser.js';
import { analyzeStatementImages, canStructureText, structureText } from '../receipt.js';
import { addTransactions, deleteTransactions, findDuplicate, mergeBackup, replaceState } from '../store.js';
import { dateBR, esc, html, icon, money, openSheet, toast } from '../ui.js';

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const ACCEPT = '.csv,.tsv,.txt,.ofx,.qfx,.xlsx,.xls,.ods,.json,.pdf,image/png,image/jpeg,image/webp';
const MAX_ROWS = 400;

const scripts = {};
function loadScript(url, global) {
  if (window[global]) return Promise.resolve(window[global]);
  scripts[url] =
    scripts[url] ||
    new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => res(window[global]);
      s.onerror = () => {
        delete scripts[url];
        rej(new Error('Não deu para carregar o leitor desse tipo de arquivo. Verifique a internet ou exporte em CSV.'));
      };
      document.head.append(s);
    });
  return scripts[url];
}

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
  const XLSX = await loadScript(XLSX_URL, 'XLSX');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  // a aba com mais linhas costuma ser a de lançamentos
  const sheets = wb.SheetNames.map((n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }));
  const rows = sheets.sort((a, b) => b.length - a.length)[0] || [];
  const text = rows.map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? ''))).join(';')).join('\n');
  return parseCSV(text);
}

/** Texto de PDF reconstruído linha a linha (itens agrupados pela altura na página). */
async function readPdfText(file) {
  const pdfjs = await loadScript(PDFJS_URL, 'pdfjsLib');
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
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

const ext = (f) => (f.name.split('.').pop() || '').toLowerCase();

/** Lê os arquivos escolhidos e devolve um resultado para revisão. */
async function readFiles(files, mode, onStatus) {
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (images.length) {
    const r = await analyzeStatementImages(images, { invoice: mode === 'fatura', onStatus });
    return { label: `${images.length} print${images.length > 1 ? 's' : ''} · ${r.engine?.label || ''}`, ...r };
  }
  const f = files[0];
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
    return textResult(await readPdfText(f), mode, 'PDF');
  }
  const text = await readText(f);
  const t = parseCSV(text);
  if (t.headers.length >= 2 && t.rows.length) {
    const r = tableResult(t, mode, e === 'txt' ? 'TXT' : 'CSV');
    if (r.movements.length) return r;
  }
  return textResult(text, mode, e.toUpperCase() || 'Texto');
}

function tableResult(t, mode, kind) {
  const source = detectSource(t.headers);
  const map = guessColumns(t.headers, t.rows);
  const positiveIsExpense = source.positiveIsExpense || mode === 'fatura';
  return { label: `${kind} · ${source.label}`, table: { ...t, map, positiveIsExpense }, movements: tableToMovements(t.rows, map, { positiveIsExpense }), isInvoice: source.invoice || mode === 'fatura' };
}

function textResult(text, mode, kind) {
  const st = parseStatementText(text, { invoice: mode === 'fatura' ? true : null });
  let movements = st.movements;
  if (!movements.length) {
    // texto de notificações (Mercado Pago, 99, bancos)
    movements = parseNotifications(text).map((n) => finishMovement({ date: n.date || new Date().toISOString().slice(0, 10), time: n.time || '', description: n.description || n.merchant || 'Movimentação', signed: n.type === 'income' ? n.amount : -n.amount, type: n.type }));
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
      <b>Escolher arquivo</b>
      <span id="f-hint">${mode === 'fatura' ? 'PDF da fatura, prints das páginas, CSV ou OFX do cartão.' : 'CSV, TXT, OFX, Excel, JSON ou PDF de extrato. Prints também funcionam.'}</span>
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
          $('#f-hint').textContent = modeNow() === 'fatura' ? 'PDF da fatura, prints das páginas, CSV ou OFX do cartão.' : 'CSV, TXT, OFX, Excel, JSON ou PDF de extrato. Prints também funcionam.';
        }),
      );
      $('#f-read').addEventListener('click', () => {
        const text = $('#f-text').value.trim();
        if (!text) return status('Cole o texto primeiro.', 'error');
        run(async () => {
          const t = parseCSV(text);
          if (t.headers.length >= 2 && t.rows.length) {
            const r = tableResult(t, modeNow(), 'Texto');
            if (r.movements.length) return r;
          }
          return textResult(text, modeNow(), 'Texto');
        });
      });
      if (files) handle(files);
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

function renderReview(r, sheet, mode) {
  const box = sheet.body.querySelector('#f-review');
  const isInvoice = r.isInvoice || mode === 'fatura';
  const cats = (type, sel) => (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => html`<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.icon} ${c.name}</option>`);
  const defaultCard = r.card ? cardLabel(r.card) : '';
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
        ${isInvoice && r.total ? html`<p class="pill ${Math.abs(sum - r.total) < 1 ? 'ok' : 'warn'}">${Math.abs(sum - r.total) < 1 ? 'A soma confere com o total da fatura' : `Soma dos itens ${money(sum, { force: true })}: diferença de ${money(Math.abs(r.total - sum), { force: true })} para o total (pode haver saldo anterior ou itens fora da lista)`}</p>` : ''}
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
        <label class="field"><span>Cartão / conta</span><input name="o-card" value="${defaultCard}" placeholder="Ex.: Nubank · final 4321"></label>
        <label class="field"><span>Forma de pagamento</span><select name="o-method">${Object.entries(PAYMENT_METHODS).map(([k, l]) => html`<option value="${k}" ${k === (isInvoice ? 'credito' : 'pix') ? 'selected' : ''}>${l}</option>`)}</select></label>
      </div>
      ${hasInst ? html`<label class="check"><input type="checkbox" name="o-future" checked> <span>Criar as parcelas futuras das compras parceladas (entram nas projeções)</span></label>` : ''}
      <p class="hint" id="rv-sum"></p>
      <div class="rv-list">${shown.map(
        (m, i) => html`<div class="rv-row ${skip[i] ? 'off' : ''}">
          <input type="checkbox" name="use" value="${i}" ${skip[i] ? '' : 'checked'} aria-label="Importar ${m.description}">
          <div class="rv-main">
            <input name="d-${i}" value="${m.description}" aria-label="Descrição">
            <div class="rv-meta"><span>${dateBR(m.date)}</span>
              ${m.installment ? html`<span class="pill">parcela ${m.installment.i}/${m.installment.n}</span>` : ''}
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
    updateSum();
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const card = f.querySelector('[name=o-card]').value.trim();
      const method = f.querySelector('[name=o-method]').value;
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
          method,
          card: m.card || card,
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

