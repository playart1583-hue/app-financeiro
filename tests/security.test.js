import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as libs from '../js/libs.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

function csp() {
  const m = read('index.html').match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(m, 'index.html precisa ter a meta Content-Security-Policy');
  return Object.fromEntries(m[1].split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
}

const jsFiles = (dir) =>
  readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? jsFiles(`${dir}${e.name}/`) : e.name.endsWith('.js') ? [`${dir}${e.name}`] : []));

// Compara versões "1.2.3" numericamente.
const atLeast = (v, min) => {
  const a = v.split('.').map(Number);
  const b = min.split('.').map(Number);
  for (let i = 0; i < b.length; i++) if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i];
  return true;
};

test('CSP: sem eval nem script inline, sem plugins e só os hosts das bibliotecas', () => {
  const p = csp();
  for (const d of ['script-src', 'connect-src']) {
    assert.ok(!p[d].includes("'unsafe-eval'"), `${d} não pode ter 'unsafe-eval'`);
    assert.ok(!p[d].includes("'unsafe-inline'"), `${d} não pode ter 'unsafe-inline'`);
    assert.ok(!p[d].includes('*') && !p[d].includes('https:'), `${d} não pode liberar qualquer host`);
  }
  assert.deepEqual(p['object-src'], ["'none'"]);
  assert.deepEqual(p['base-uri'], ["'none'"]);
  assert.deepEqual(p['img-src'], ["'self'", 'data:', 'blob:'], 'imagem externa seria um jeito de vazar dados');
});

test('toda biblioteca externa vem de js/libs.js e de um host liberado na CSP', () => {
  const p = csp();
  const urls = Object.entries(libs).filter(([k, v]) => typeof v === 'string' && /_(URL|WORKER)$/.test(k));
  assert.ok(urls.length >= 5);
  for (const [name, url] of urls) {
    const { origin, protocol } = new URL(url);
    assert.equal(protocol, 'https:', name);
    assert.ok(p['script-src'].includes(origin), `${origin} (${name}) precisa estar em script-src`);
  }
  for (const f of jsFiles('js/').filter((f) => f !== 'js/libs.js')) {
    const ext = read(f).match(/https:\/\/(?:cdn|cdnjs|unpkg)[^'"`\s]*/);
    assert.equal(ext, null, `${f} carrega ${ext} direto; use js/libs.js`);
  }
});

test('versões sem as falhas conhecidas e com hash de integridade', () => {
  const pdfjs = libs.PDFJS_URL.match(/pdfjs-dist@([\d.]+)/)[1];
  assert.ok(atLeast(pdfjs, '4.2.67'), `pdf.js ${pdfjs} tem a CVE-2024-4367`);
  assert.equal(libs.PDFJS_WORKER.match(/pdfjs-dist@([\d.]+)/)[1], pdfjs, 'worker e pdf.js precisam ser da mesma versão');
  const xlsx = libs.XLSX_URL.match(/xlsx-([\d.]+)/)[1];
  assert.ok(atLeast(xlsx, '0.20.2'), `SheetJS ${xlsx} tem a CVE-2023-30533 / CVE-2024-22363`);
  for (const sri of [libs.XLSX_SRI, libs.TESSERACT_SRI]) assert.match(sri, /^sha384-[A-Za-z0-9+/]{64}$/);
  assert.ok(read('sw.js').includes("'./js/libs.js'"), 'js/libs.js precisa estar no cache do service worker');
});
