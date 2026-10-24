// Bloqueio por digital no app Android: tela verde por cima de tudo até a digital, o rosto ou a senha do celular.
import { getState } from './store.js';
import { html, icon } from './ui.js';

const cap = typeof window !== 'undefined' ? window.Capacitor : null;
export const appLock = cap?.isNativePlatform?.() ? cap.Plugins?.AppLock || null : null;

const RELOCK_AFTER_MS = 30_000;
let overlay = null;
let unlocking = false;

export const lockOn = () => Boolean(appLock && getState().settings.lock);

export async function lockStatus() {
  if (!appLock) return { available: false, biometric: false };
  try {
    return await appLock.status();
  } catch {
    return { available: false, biometric: false };
  }
}

/** Pede a digital (ou senha do celular). Resolve true/false; nunca lança. */
export async function confirmIdentity(title = 'Desbloquear Meu Bolso') {
  if (!appLock) return false;
  try {
    await appLock.authenticate({ title, subtitle: 'Use a digital, o rosto ou a senha do celular' });
    return true;
  } catch {
    return false;
  }
}

function cover() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'lock';
  overlay.innerHTML = String(html`<div class="lock-box">
    <span class="lock-ic">${icon('shield', 'lg')}</span>
    <p class="lock-title">Meu Bolso bloqueado</p>
    <p class="lock-msg" id="lock-msg">Use a digital para ver suas finanças.</p>
    <button type="button" class="btn" id="lock-btn">Desbloquear</button>
  </div>`);
  document.body.append(overlay);
  overlay.querySelector('#lock-btn').addEventListener('click', unlock);
}

function uncover() {
  overlay?.remove();
  overlay = null;
}

async function unlock() {
  if (unlocking) return;
  unlocking = true;
  const ok = await confirmIdentity();
  unlocking = false;
  if (ok) uncover();
  else if (overlay) overlay.querySelector('#lock-msg').textContent = 'Não foi possível confirmar. Toque em Desbloquear para tentar de novo.';
}

/** Bloqueia ao abrir e ao voltar depois de 30 s; esconde os dados enquanto o app está em segundo plano. */
export function setupLock() {
  if (!appLock) return;
  let hiddenAt = 0;
  let needsAuth = false;
  if (lockOn()) {
    cover();
    unlock();
  }
  document.addEventListener('visibilitychange', () => {
    if (!lockOn() || unlocking) return;
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      needsAuth = Boolean(overlay);
      cover(); // a tela de apps recentes mostra o bloqueio, não os valores
      return;
    }
    if (needsAuth || Date.now() - hiddenAt > RELOCK_AFTER_MS) unlock();
    else uncover();
  });
}
