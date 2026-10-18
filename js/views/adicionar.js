// Menu do botão +: todas as formas de colocar dados no app.
import { html, icon, openSheet } from '../ui.js';
import { openFileImport, openTextImport } from './arquivo.js';
import { openLoanContract } from './emprestimo.js';
import { openPrintSheet, openTxForm } from './form.js';

const OPTIONS = [
  ['expense', 'minus', 'Gasto', 'Preencher à mão: valor, categoria, parcelas, cartão'],
  ['income', 'plus', 'Ganho', 'Salário, freela, Pix recebido'],
  ['print', 'camera', 'Ler print', 'Compra, comprovante Pix ou nota fiscal'],
  ['file', 'upload', 'Documento ou fatura', 'PDF, DOCX, TXT, CSV, OFX, Excel ou prints de várias páginas'],
  ['text', 'copy', 'Colar texto', 'Extrato, fatura ou anotações'],
  ['loan', 'calc', 'Contrato de empréstimo', 'Ver o custo e o impacto antes de contratar'],
];

export function openAddMenu() {
  openSheet({
    title: 'Adicionar',
    body: html`<div class="add-menu">${OPTIONS.map(
      ([id, ic, title, text]) => html`<button type="button" class="tile" data-add="${id}"><span class="tile-ic">${icon(ic)}</span><span class="tile-main"><b>${title}</b><small>${text}</small></span>${icon('chevR', 'muted')}</button>`,
    )}</div>`,
    onMount(sheet) {
      sheet.body.addEventListener('click', (e) => {
        const id = e.target.closest('[data-add]')?.dataset.add;
        if (!id) return;
        sheet.close();
        if (id === 'expense') openTxForm({ prefill: { type: 'expense' } });
        if (id === 'income') openTxForm({ prefill: { type: 'income', category: 'salario', method: 'transferencia' } });
        if (id === 'print') openPrintSheet();
        if (id === 'file') openFileImport();
        if (id === 'text') openTextImport();
        if (id === 'loan') openLoanContract();
      });
    },
  });
}
