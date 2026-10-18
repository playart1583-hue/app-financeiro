import { monthlyToAnnual } from '../finance.js';
import { normalize } from '../categories.js';
import { currentEngine } from '../receipt.js';
import { cloud, exportJSON, getApiKey, importJSON, loadDemo, resetAll, setApiKey, updateSettings } from '../store.js';
import { html, icon, pct, toast } from '../ui.js';
import { isNativeApp, nativeBridge } from '../native.js';
import { confirmIdentity, lockStatus } from '../lock.js';
import { alignCreditToDue, cardList, cycleText, removeCard, saveCard, undoAlign } from '../cards.js';

const SYNC = {
  local: 'Os dados ficam só neste aparelho. Faça backup de vez em quando.',
  conectando: 'Conectando à sua conta…',
  sincronizado: 'Sincronizado com sua conta Claude (pasta privada, só você vê).',
  erro: 'Não consegui sincronizar agora. Os dados continuam salvos neste aparelho.',
};

async function saveFile(name, text) {
  if (nativeBridge) return nativeBridge.shareFile({ name, text, mimeType: 'application/json' });
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
  render({ state }) {
    const st = state.settings;
    const key = getApiKey();
    return html`<header class="page-head"><h1>Ajustes</h1></header>
      <section class="card"><form class="form" id="setf">
        <label class="field"><span>Seu nome</span><input name="name" value="${st.name}" autocomplete="given-name"></label>
        <label class="field"><span>Seu nome completo, como aparece no Pix</span><input name="ownNames" value="${(st.ownNames || []).join(', ')}" autocomplete="name" placeholder="Ex.: Maria Aparecida Souza"></label>
        <p class="hint">Assim o app reconhece Pix e TED entre as suas contas (ex.: Santander → Mercado Pago) e não conta como gasto nem ganho. Se tiver mais de um, separe por vírgula.</p>
        <fieldset class="field"><legend>Tema</legend><div class="seg three" role="radiogroup">${[['system', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, l]) => html`<label><input type="radio" name="theme" value="${k}" ${st.theme === k ? 'checked' : ''}><span>${l}</span></label>`)}</div></fieldset>
        <label class="check"><input type="checkbox" name="hideValues" ${st.hideValues ? 'checked' : ''}> <span>Ocultar valores ao abrir</span></label>
        <label class="field"><span>Rendimento do cofrinho (% ao mês)</span><input name="savingsRate" inputmode="decimal" value="${(st.savingsRate * 100).toFixed(2).replace('.', ',')}"></label>
        <p class="hint">Usado nas projeções e para dizer se parcelar compensa. ${pct(st.savingsRate, 2)} ao mês ≈ ${pct(monthlyToAnnual(st.savingsRate), 1)} ao ano (perto de 100% do CDI).</p>
      </form></section>

      <section class="card" id="cartoes"><h2 class="card-title">${icon('card')} Meus cartões</h2>
        <p class="hint">Cadastre o final, o dia em que a fatura fecha e o dia em que vence. Compra feita antes do fechamento entra na fatura aberta; no dia do fechamento ou depois, a 1ª parcela vai para o vencimento seguinte. As outras parcelas seguem nos meses depois.</p>
        ${cardList().length
          ? html`<ul class="card-list">${cardList().map(
              (c) => html`<li><span class="tile-ic">${icon('card')}</span><span class="tile-main"><b>Cartão ${c.last4}</b><small>${c.bank || 'Banco não informado'} · ${cycleText(c) || 'sem fechamento e vencimento'}</small></span>
                <button type="button" class="icon-btn" data-card-edit="${c.last4}" aria-label="Editar cartão ${c.last4}">${icon('edit')}</button>
                <button type="button" class="icon-btn" data-card-del="${c.last4}" aria-label="Remover cartão ${c.last4}">${icon('trash')}</button></li>`,
            )}</ul>`
          : ''}
        <form class="form" id="cardf" autocomplete="off">
          <div class="card-fields">
            <label class="field"><span>Final</span><input name="last4" inputmode="numeric" maxlength="4" placeholder="8238" required></label>
            <label class="field"><span>Banco</span><input name="bank" placeholder="Ex.: Nubank"></label>
            <label class="field"><span>Fecha dia</span><input name="closeDay" type="number" min="1" max="31" inputmode="numeric" placeholder="3"></label>
            <label class="field"><span>Vence dia</span><input name="dueDay" type="number" min="1" max="31" inputmode="numeric" placeholder="10"></label>
          </div>
          <button type="submit" class="btn primary sm">${icon('plus')} Salvar cartão</button>
        </form>
      </section>

      <section class="card"><h2 class="card-title">${icon('camera')} Leitura de prints</h2>
        <p id="eng" class="hint">Verificando…</p>
        <label class="check"><input type="checkbox" id="auto-save" ${st.autoSavePrints !== false ? 'checked' : ''}> <span>Registrar sozinho depois de ler o print (sem tela de conferência; dá para desfazer)</span></label>
        <form class="form" id="keyf">
          <label class="field"><span>Chave da API do Claude (opcional)</span><input name="key" type="password" autocomplete="off" placeholder="sk-ant-…" value="${key ? '••••••••' + key.slice(-4) : ''}"></label>
          <p class="hint">Só é necessária fora do app da Claude. A chave fica guardada apenas neste aparelho e é usada para enviar o print direto à API da Anthropic. Sem chave, a leitura é feita no próprio aparelho (OCR), com menos precisão.</p>
          <div class="btn-row"><button class="btn sm" type="submit">Salvar chave</button>${key ? html`<button class="btn ghost sm" type="button" id="key-del">Remover chave</button>` : ''}</div>
        </form>
      </section>

      ${isNativeApp
        ? html`<section class="card"><h2 class="card-title">${icon('shield')} Bloqueio por digital</h2>
            <label class="check"><input type="checkbox" id="lock-on" ${st.lock ? 'checked' : ''}> <span>Pedir a digital (ou a senha do celular) para abrir o app</span></label>
            <p class="hint" id="lock-hint">Bloqueia ao abrir e quando você volta depois de 30 segundos fora. Na tela de apps recentes, seus valores ficam escondidos.</p>
          </section>`
        : ''}
      <section class="card"><h2 class="card-title">${icon('plus')} Como registrar</h2>
        <p class="hint">Os lançamentos entram só quando você manda: no botão <b>+</b> preencha à mão, leia o print de uma compra ou comprovante, importe um documento (PDF, DOCX, CSV, OFX, planilha, fatura) ou cole um texto. ${isNativeApp ? html`Também dá para tocar em <b>Compartilhar → Meu Bolso</b> num print ou arquivo.` : ''} O app não registra nada sozinho a partir das notificações do celular.</p>
      </section>

      <section class="card"><h2 class="card-title">${icon('shield')} Seus dados</h2>
        <p class="hint" id="sync">${SYNC[cloud.status]}</p>
        <div class="btn-row even">
          <button type="button" class="btn sm" id="exp">${icon('upload')} Exportar backup</button>
          <label class="btn sm">Importar backup<input type="file" id="imp" accept="application/json,.json" class="sr-only"></label>
        </div>
        <div class="btn-row even">
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
      const ownNames = f.elements.ownNames.value
        .split(',')
        .map((x) => normalize(x).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim())
        .filter((x) => x.split(' ').length >= 2);
      updateSettings({ ownNames, name: f.elements.name.value.trim(), theme: f.querySelector('[name=theme]:checked').value, hideValues: f.hideValues.checked, savingsRate: rate >= 0 && rate < 0.2 ? rate : state.settings.savingsRate });
      toast('Ajustes salvos');
    });
    root.querySelector('#lock-on')?.addEventListener('change', async (e) => {
      const want = e.target.checked;
      e.target.checked = !want; // só muda depois de confirmar
      if (want) {
        const { available } = await lockStatus();
        if (!available) return toast('Cadastre uma digital ou uma senha de tela nas configurações do celular e tente de novo.');
      }
      if (!(await confirmIdentity(want ? 'Ativar o bloqueio por digital' : 'Desativar o bloqueio'))) return toast('Não foi possível confirmar sua identidade.');
      updateSettings({ lock: want });
      toast(want ? 'Bloqueio por digital ativado' : 'Bloqueio desativado');
    });
    const cardf = root.querySelector('#cardf');
    cardf.last4.addEventListener('input', (e) => (e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4)));
    cardf.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!saveCard(cardf.last4.value, { bank: cardf.bank.value, dueDay: cardf.dueDay.value, closeDay: cardf.closeDay.value })) return toast('Informe os 4 últimos números do cartão.');
      const moved = alignCreditToDue();
      toast(moved.length ? `Cartão ${cardf.last4.value} salvo. ${moved.length} lançamento${moved.length > 1 ? 's' : ''} no crédito ${moved.length > 1 ? 'foram' : 'foi'} para o mês do vencimento.` : `Cartão ${cardf.last4.value} salvo`, moved.length ? { action: 'Desfazer', onAction: () => undoAlign(moved), timeout: 10000 } : {});
    });
    root.querySelectorAll('[data-card-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const c = cardList().find((x) => x.last4 === b.dataset.cardEdit);
        cardf.last4.value = c.last4;
        cardf.bank.value = c.bank || '';
        cardf.dueDay.value = c.dueDay || '';
        cardf.closeDay.value = c.closeDay || '';
        cardf.bank.focus();
      }),
    );
    root.querySelectorAll('[data-card-del]').forEach((b) =>
      b.addEventListener('click', () => {
        removeCard(b.dataset.cardDel);
        toast(`Cartão ${b.dataset.cardDel} removido`);
      }),
    );
    root.querySelector('#auto-save').addEventListener('change', (e) => {
      updateSettings({ autoSavePrints: e.target.checked });
      toast(e.target.checked ? 'Prints serão registrados sozinhos' : 'Vou mostrar para você conferir antes de salvar');
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
