// Bibliotecas externas baixadas de CDN só quando são usadas (OCR, PDF, planilhas, API do Claude).
// Tudo que vem de fora passa por aqui: versões fixas, hash de integridade (SRI) quando o arquivo é um
// <script> comum, e hosts que precisam estar liberados na Content-Security-Policy do index.html
// (tests/security.test.js confere isso).

// SheetJS saiu do npm/cdnjs na 0.18.5 (com falhas conhecidas); as versões corrigidas ficam na CDN oficial.
export const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
export const XLSX_SRI = 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT';
// pdf.js 4.2.67+ corrige a CVE-2024-4367 (PDF com fonte maliciosa executava JavaScript); a 6.x nem usa eval.
// Build "legacy" para funcionar também em WebViews Android e Safaris mais antigos.
export const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/legacy/build/pdf.min.mjs';
export const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/legacy/build/pdf.worker.min.mjs';
export const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
export const TESSERACT_SRI = 'sha384-2BQ3U3OdKOb0Uczxqr41I9UvZkzr4V9Hv8uSzMMZAlmhsFClvdZX5wi5fDCzG+tM';
// Módulos ES (import dinâmico) não aceitam SRI; ficam protegidos pela versão fixa e pela CSP.
export const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';

const scripts = {};
/** Carrega um <script> clássico com verificação de integridade e devolve a variável global que ele cria. */
export function loadScript(url, global, integrity, errorMessage) {
  if (window[global]) return Promise.resolve(window[global]);
  scripts[url] =
    scripts[url] ||
    new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url;
      s.integrity = integrity;
      s.crossOrigin = 'anonymous';
      s.onload = () => res(window[global]);
      s.onerror = () => {
        delete scripts[url];
        s.remove();
        rej(new Error(errorMessage));
      };
      document.head.append(s);
    });
  return scripts[url];
}

export const loadXlsx = () =>
  loadScript(XLSX_URL, 'XLSX', XLSX_SRI, 'Não deu para carregar o leitor desse tipo de arquivo. Verifique a internet ou exporte em CSV.');

export const loadTesseract = () =>
  loadScript(TESSERACT_URL, 'Tesseract', TESSERACT_SRI, 'Não deu para carregar o leitor de imagem. Cole o texto do comprovante ou configure a chave do Claude em Ajustes.');

let pdfjsLoad = null;
export function loadPdfjs() {
  pdfjsLoad =
    pdfjsLoad ||
    import(PDFJS_URL).then(
      (pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        return pdfjs;
      },
      () => {
        pdfjsLoad = null;
        throw new Error('Não deu para carregar o leitor de PDF. Verifique a internet ou exporte em CSV.');
      },
    );
  return pdfjsLoad;
}

export const loadAnthropic = () => import(SDK_URL).then((m) => m.default);
