// Recursos do app Android (Capacitor): notificações de bancos/carteiras lidas pelo sistema e menu Compartilhar.
// No navegador e no app da Claude, `nativeReader` é null e nada disso roda.
const cap = typeof window !== 'undefined' ? window.Capacitor : null;
export const isNativeApp = Boolean(cap?.isNativePlatform?.());
export const nativeReader = isNativeApp ? cap.Plugins?.NotificationReader || null : null;

const pad = (n) => String(n).padStart(2, '0');

/** Notificação capturada -> texto que os leitores do app já entendem (com data e hora de quando chegou). */
export function notificationToText(item) {
  const d = new Date(item.time || Date.now());
  const when = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return [item.app, item.title, item.text, when].filter(Boolean).join('\n');
}

const base64ToFile = (f) => {
  const bin = atob(f.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], f.name || 'arquivo', { type: f.mimeType || '' });
};

/**
 * Liga a ponte nativa. onText(texto) recebe notificações; onShared({ text, files }) recebe o que veio do Compartilhar.
 */
export function startNative({ onText, onShared }) {
  if (!nativeReader) return;
  const drain = async () => {
    try {
      const { items = [] } = await nativeReader.getPending();
      // várias notificações num bloco só: o leitor separa e registra (ou pede revisão se houver repetidas)
      if (items.length) onText(items.map(notificationToText).join('\n\n'));
    } catch {
      /* sem permissão ainda */
    }
  };
  const shared = async () => {
    try {
      const r = await nativeReader.getShared();
      const files = (r.files || []).map(base64ToFile);
      if (r.text || files.length) onShared({ text: r.text || '', files });
    } catch {
      /* nada compartilhado */
    }
  };
  nativeReader.addListener('notification', ({ item }) => onText(notificationToText(item)));
  nativeReader.addListener('shared', shared);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && drain());
  drain();
  shared();
}

export async function notificationAccess() {
  if (!nativeReader) return null;
  try {
    return (await nativeReader.isEnabled()).enabled;
  } catch {
    return false;
  }
}
