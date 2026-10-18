import { monthlyToAnnual } from '../finance.js';
import { currentEngine } from '../receipt.js';
import { cloud, exportJSON, getApiKey, importJSON, loadDemo, resetAll, setApiKey, updateSettings } from '../store.js';
import { html, icon, pct, toast } from '../ui.js';

const SYNC = {
  local: 'Os dados ficam só neste aparelho. Faça backup de vez em quando.',
  conectando: 'Conectando à sua conta…',
  sincronizado: 'Sincronizado com sua conta Claude (pasta privada, só você vê).',
  erro: 'Não consegui sincronizar agora. Os dados continuam salvos neste aparelho.',
};

async function saveFile(name, text) {
  const downloads = await window.claude?.use?.('downloads');
  if (downloads) {
    await downloads.save({ filename: name, data: text });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default {
  id: 'ajustes',
  title: 'Ajustes',
  back: 'planejar',
  render({ state }) {
    const st = state.settings;
    const key = getApiKey();
    return html`<header class="page-head"><h1>Ajustes</h1></header>
      <section class="card"><form class="form" id="setf">
        <label class="field"><span>Seu nome</span><input name="name" value="${st.name}" autocomplete="given-name"></label>
        <fieldset class="field"><legend>Tema</legend><div class="seg three" role="radiogroup">${[['system', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, l]) => html`<label><input type="radio" name="theme" value="${k}" ${st.theme === k ? 'checked' : ''}><span>${l}</span></label>`)}</div></fieldset>
        <label class="check"><input type="checkbox" name="hideValues" ${st.hideValues ? 'checked' : ''}> <span>Ocultar valores ao abrir</span></label>
        <label class="field"><span>Rendimento do cofrinho (% ao mês)</span><input name="savingsRate" inputmode="decimal" value="${(st.savingsRate * 100).toFixed(2).replace('.', ',')}"></label>
        <p class="hint">Usado nas projeções e para dizer se parcelar compensa. ${pct(st.savingsRate, 2)} ao mês ≈ ${pct(monthlyToAnnual(st.savingsRate), 1)} ao ano (perto de 100% do CDI).</p>
      </form></section>

      <section class="card"><h2 class="card-title">${icon('camera')} Leitura de prints</h2>
        <p id="eng" class="hint">Verificando…</p>
        <form class="form" id="keyf">
          <label class="field"><span>Chave da API do Claude (opcional)</span><input name="key" type="password" autocomplete="off" placeholder="sk-ant-…" value="${key ? '••••••••' + key.slice(-4) : ''}"></label>
          <p class="hint">Só é necessária fora do app da Claude. A chave fica guardada apenas neste aparelho e é usada para enviar o print direto à API da Anthropic. Sem chave, a leitura é feita no próprio aparelho (OCR), com menos precisão.</p>
          <div class="btn-row"><button class="btn sm" type="submit">Salvar chave</button>${key ? html`<button class="btn ghost sm" type="button" id="key-del">Remover chave</button>` : ''}</div>
        </form>
      </section>

      <section class="card"><h2 class="card-title">${icon('shield')} Seus dados</h2>
        <p class="hint" id="sync">${SYNC[cloud.status]}</p>
        <div class="btn-row">
          <button type="button" class="btn sm" id="exp">${icon('upload')} Exportar backup</button>
          <label class="btn sm">Importar backup<input type="file" id="imp" accept="application/json,.json" class="sr-only"></label>
        </div>
        <div class="btn-row">
          ${st.demo ? '' : html`<button type="button" class="btn ghost sm" id="demo">Carregar dados de exemplo</button>`}
          <button type="button" class="btn danger ghost sm" id="reset">${icon('trash')} Apagar tudo</button>
        </div>
        <p id="reset-confirm" hidden class="status error">Isso apaga todos os lançamentos, dívidas e cofrinhos. <button type="button" class="btn danger sm" id="reset-yes">Apagar mesmo</button></p>
      </section>
      <p class="hint center">Meu Bolso · protótipo · os cálculos são estimativas e não substituem orientação financeira profissional.</p>`;
  },
  bind(root, { state }) {
    currentEngine().then((e) => {
      const el = root.querySelector('#eng');
      if (el) el.textContent = `Motor atual: ${e.label}.`;
    });
    root.querySelector('#setf').addEventListener('change', (e) => {
      const f = e.currentTarget;
      const rate = parseFloat(String(f.savingsRate.value).replace(',', '.')) / 100;
      updateSettings({ name: f.elements.name.value.trim(), theme: f.querySelector('[name=theme]:checked').value, hideValues: f.hideValues.checked, savingsRate: rate >= 0 && rate < 0.2 ? rate : state.settings.savingsRate });
      toast('Ajustes salvos');
    });
    root.querySelector('#keyf').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = e.target.key.value.trim();
      if (v.startsWith('••')) return;
      if (v && !v.startsWith('sk-ant-')) return toast('Essa não parece uma chave da Anthropic (começa com sk-ant-).');
      setApiKey(v);
      toast(v ? 'Chave salva neste aparelho' : 'Chave removida');
      updateSettings({});
    });
    root.querySelector('#key-del')?.addEventListener('click', () => {
      setApiKey('');
      updateSettings({});
      toast('Chave removida');
    });
    root.querySelector('#exp').addEventListener('click', async () => {
      try {
        await saveFile(`meu-bolso-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJSON());
      } catch {
        toast('O download foi cancelado.');
      }
    });
    root.querySelector('#imp').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        importJSON(await file.text());
        toast('Backup restaurado');
      } catch (err) {
        toast(err.message || 'Não consegui ler esse arquivo.');
      }
    });
    root.querySelector('#demo')?.addEventListener('click', () => {
      loadDemo();
      toast('Dados de exemplo carregados');
    });
    root.querySelector('#reset').addEventListener('click', () => (root.querySelector('#reset-confirm').hidden = false));
    root.querySelector('#reset-yes').addEventListener('click', () => {
      resetAll();
      toast('Tudo apagado. Comece registrando seu primeiro gasto.');
    });
  },
};
