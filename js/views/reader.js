// Folha genérica "enviar print ou colar texto", usada para compras, contratos e Serasa.
import { currentEngine } from '../receipt.js';
import { esc, html, icon, openSheet } from '../ui.js';

/**
 * opts: {
 *   title, intro?, dropTitle, dropText, textLabel, textPlaceholder,
 *   analyze(file, { signal, onStatus }) -> Promise<result>,
 *   parseText(text) -> result | { error },
 *   onResult(result, sheet) — recebe o resultado; pode fechar a folha ou desenhar algo em sheet.body
 *   footer?, onMount?(sheet) — conteúdo extra no fim da folha
 * }
 */
export function openReader(opts) {
  let ctl = null;
  const body = html`<div class="print">
    ${opts.intro ? html`<div class="status info">${icon('info')}<span>${opts.intro}</span></div>` : ''}
    <label class="drop" id="r-drop">
      <input type="file" id="r-file" accept="image/png,image/jpeg,image/webp,image/gif" class="sr-only">
      ${icon('camera', 'lg')}
      <b>${opts.dropTitle}</b>
      <span>${opts.dropText} Também dá para colar a imagem aqui.</span>
    </label>
    <p class="hint" id="r-engine"></p>
    <div id="r-status" class="status" hidden></div>
    <details class="more"><summary>Prefiro colar o texto</summary>
      <label class="field"><span>${opts.textLabel}</span><textarea id="r-text" rows="6" placeholder="${opts.textPlaceholder}"></textarea></label>
      <button type="button" class="btn primary" id="r-read">Ler texto</button>
    </details>
    ${opts.footer || ''}
    <div id="r-results"></div>
  </div>`;
  return openSheet({
    title: opts.title,
    body,
    onMount(sheet) {
      const $ = (s) => sheet.body.querySelector(s);
      currentEngine().then((e) => {
        if ($('#r-engine')) $('#r-engine').textContent = `Leitura com: ${e.label}${e.id === 'ocr' ? '. Para leituras mais precisas, abra o app dentro do Claude ou cadastre uma chave em Ajustes.' : ''}`;
      });
      const status = (content, kind = '') => {
        const s = $('#r-status');
        s.hidden = !content;
        s.className = `status ${kind}`;
        s.innerHTML = String(content);
      };
      sheet.status = status;
      const handle = async (file) => {
        if (!file || !file.type.startsWith('image/')) return status('Esse arquivo não é uma imagem. Envie um print em JPG ou PNG.', 'error');
        ctl?.abort();
        ctl = new AbortController();
        const url = URL.createObjectURL(file);
        status(html`<img class="thumb" src="${url}" alt="Print enviado"><span class="spinner" aria-hidden="true"></span><span id="r-msg">Analisando o print…</span><button type="button" class="btn ghost sm" id="r-cancel">Cancelar</button>`, 'busy');
        $('#r-cancel').onclick = () => {
          ctl.abort();
          status('');
        };
        try {
          const result = await opts.analyze(file, { signal: ctl.signal, onStatus: (m) => $('#r-msg') && ($('#r-msg').textContent = m) });
          if (ctl.signal.aborted) return;
          status('');
          opts.onResult(result, sheet);
        } catch (e) {
          if (e?.code === 'cancelled' || e?.name === 'AbortError') return;
          status(`${esc(e?.message || 'Não consegui ler esse print.')} Você pode colar o texto abaixo.`, 'error');
          $('details').open = true;
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      sheet.handleFile = handle;
      $('#r-file').addEventListener('change', (e) => handle(e.target.files[0]));
      const drop = $('#r-drop');
      drop.addEventListener('dragover', (e) => (e.preventDefault(), drop.classList.add('over')));
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('over');
        handle(e.dataTransfer.files[0]);
      });
      sheet.el.addEventListener('paste', (e) => {
        const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
        if (file) handle(file);
      });
      $('#r-read').addEventListener('click', () => {
        const text = $('#r-text').value.trim();
        if (!text) return status('Cole o texto primeiro.', 'error');
        const r = opts.parseText(text);
        if (r?.error) return status(esc(r.error), 'error');
        status('');
        opts.onResult(r, sheet);
      });
      opts.onMount?.(sheet);
      if (opts.initialFile) handle(opts.initialFile);
      if (opts.initialText) {
        $('#r-text').value = opts.initialText;
        $('details').open = true;
        $('#r-read').click();
      }
    },
  });
}
