// Copia os arquivos do app para www/ (pasta que o Capacitor empacota no APK).
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const OUT = 'www';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const item of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'packages/comprovantes-br/src']) cpSync(item, `${OUT}/${item}`, { recursive: true });
console.log('www/ pronto');
