// Copia os arquivos do app para www/ (pasta que o Capacitor empacota no APK).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const OUT = 'www';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const item of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'packages/comprovantes-br/src']) cpSync(item, `${OUT}/${item}`, { recursive: true });

// Em WebViews antigos (sem DOCUMENT_START_SCRIPT) o Capacitor injeta a ponte nativa como <script> inline;
// sem 'unsafe-inline' o app abriria sem os plugins. No navegador a CSP continua sem script inline.
const html = readFileSync(`${OUT}/index.html`, 'utf8');
const androidHtml = html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
if (androidHtml === html) throw new Error('CSP do index.html não tem "script-src \'self\'"; ajuste scripts/build-web.mjs');
writeFileSync(`${OUT}/index.html`, androidHtml);
console.log('www/ pronto');
