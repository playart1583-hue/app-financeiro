// Perfis: você administra as contas de outras pessoas (namorada, pai...) sem misturar com as suas.
// Cada perfil tem os próprios lançamentos, cartões, dívidas, cofrinhos e orçamentos.
import { keyOf, monthSummary } from '../analytics.js';
import { MAIN_PROFILE, activeProfile, addProfile, getProfiles, profileData, removeProfile, renameProfile, switchProfile } from '../store.js';
import { html, icon, money, openSheet, toast } from '../ui.js';

const initial = (label) => (String(label || '?').trim()[0] || '?').toUpperCase();

/** Bolinha com a inicial e a cor do perfil (aparece no topo de todas as telas). */
export const profileAvatar = (p, cls = '') => html`<span class="avatar c${p.color || 0} ${cls}" aria-hidden="true">${initial(p.label)}</span>`;

/** Botão do perfil aberto, para trocar de perfil de qualquer tela. */
export function profileChip(onBrand = false) {
  const p = activeProfile();
  return html`<button type="button" class="profile-chip ${onBrand ? 'on-brand' : ''}" data-profiles aria-label="Perfil: ${p.label}. Trocar de perfil">${profileAvatar(p)}<span class="profile-name">${p.label}</span>${icon('chevR', 'chev')}</button>`;
}

export function openProfiles() {
  const key = keyOf(new Date());
  const rows = () =>
    getProfiles().map((p) => {
      const sum = monthSummary(profileData(p.id), key);
      return html`<li class="profile-row ${p.active ? 'on' : ''}">
        <button type="button" class="profile-pick" data-pick="${p.id}">${profileAvatar(p, 'lg')}<span class="tile-main"><b>${p.label}${p.active ? html` <span class="pill ok">aberto</span>` : ''}</b><small>Este mês: ${money(sum.income, { force: true })} entrou · ${money(sum.expense, { force: true })} saiu</small></span></button>
        <button type="button" class="icon-btn" data-rename="${p.id}" aria-label="Renomear ${p.label}">${icon('edit')}</button>
        ${p.id !== MAIN_PROFILE && !p.active ? html`<button type="button" class="icon-btn" data-remove="${p.id}" aria-label="Remover ${p.label}">${icon('trash')}</button>` : ''}
      </li>`;
    });
  openSheet({
    title: 'Perfis',
    body: html`<div class="profiles">
      <p class="hint">Cada perfil tem as próprias contas: lançamentos, cartões, dívidas, cofrinhos e orçamentos. Toque em um perfil para abrir.</p>
      <ul class="profile-list" id="pf-list">${rows()}</ul>
      <form class="form" id="pf-new" autocomplete="off">
        <label class="field"><span>Novo perfil</span><div class="qe-row"><input name="name" maxlength="30" placeholder="Ex.: Namorada, Pai, Casa"><button type="submit" class="btn primary sm">${icon('plus')} Criar</button></div></label>
      </form>
    </div>`,
    onMount(sheet) {
      const list = sheet.body.querySelector('#pf-list');
      const redraw = () => (list.innerHTML = String(html`${rows()}`));
      sheet.body.querySelector('#pf-new').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = addProfile(e.target.name.value);
        if (!id) return toast('Escreva o nome do perfil.');
        e.target.reset();
        redraw();
        toast('Perfil criado. Toque nele para abrir.');
      });
      list.addEventListener('click', (e) => {
        const pick = e.target.closest('[data-pick]')?.dataset.pick;
        const ren = e.target.closest('[data-rename]')?.dataset.rename;
        const rem = e.target.closest('[data-remove]');
        if (pick) {
          sheet.close();
          if (switchProfile(pick)) toast(`Perfil de ${activeProfile().label} aberto`);
          return;
        }
        if (ren) {
          const p = getProfiles().find((x) => x.id === ren);
          const name = prompt('Nome do perfil', p.label);
          if (name) renameProfile(ren, name), redraw();
          return;
        }
        if (rem) {
          // toque duplo para apagar: os dados desse perfil somem do aparelho
          if (!rem.dataset.armed) {
            rem.dataset.armed = '1';
            rem.classList.add('danger');
            return toast('Toque de novo na lixeira para apagar o perfil e todos os dados dele.');
          }
          removeProfile(rem.dataset.remove);
          redraw();
          toast('Perfil removido');
        }
      });
    },
  });
}
