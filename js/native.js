// Recursos do app Android (Capacitor): menu Compartilhar e salvar o backup.
// No navegador e no app da Claude, `nativeBridge` é null e nada disso roda.
const cap = typeof window !== 'undefined' ? window.Capacitor : null;
export const isNativeApp = Boolean(cap?.isNativePlatform?.());
export const nativeBridge = isNativeApp ? cap.Plugins?.ShareBridge || null : null;

const base64ToFile = (f) => {
  const bin = atob(f.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], f.name || 'arquivo', { type: f.mimeType || '' });
};

/** Liga a ponte nativa. onShared({ text, files }) recebe o que veio do Compartilhar. */
export function startNative({ onShared }) {
  if (!nativeBridge) return;
  const shared = async () => {
    try {
      const r = await nativeBridge.getShared();
      const files = (r.files || []).map(base64ToFile);
      if (r.text || files.length) onShared({ text: r.text || '', files });
    } catch {
      /* nada compartilhado */
    }
  };
  nativeBridge.addListener('shared', shared);
  shared();
}
