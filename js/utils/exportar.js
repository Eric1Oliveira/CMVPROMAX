/**
 * CMV Pro — Exportação de relatórios
 * ----------------------------------
 * Excel (.xls via tabela HTML — abre no Excel/LibreOffice sem bibliotecas)
 * e PDF/impressão (window.print com a folha de estilos de impressão; o
 * usuário escolhe a impressora ou "Salvar como PDF").
 */

import { esc } from './format.js';

/**
 * Baixa um relatório como .xls (HTML table — reconhecido pelo Excel BR).
 * @param {string} filename ex.: 'vendas.xls'
 * @param {string} titulo   cabeçalho da planilha
 * @param {string[]} colunas rótulos
 * @param {Array<Array>} linhas valores já formatados (strings/números)
 */
export function downloadExcel(filename, titulo, colunas, linhas) {
  const html = `
    <html xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8">
      <!--[if gte mso 9]><xml>
        <x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
          <x:Name>${esc(titulo).slice(0, 30)}</x:Name>
          <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
        </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
      </xml><![endif]-->
    </head>
    <body>
      <table border="1">
        <tr><th colspan="${colunas.length}" style="background:#2563EB;color:#fff;font-size:14px">${esc(titulo)}</th></tr>
        <tr>${colunas.map((c) => `<th style="background:#EFF4FE">${esc(c)}</th>`).join('')}</tr>
        ${linhas.map((r) => `<tr>${r.map((v) => `<td>${esc(String(v ?? ''))}</td>`).join('')}</tr>`).join('')}
      </table>
    </body></html>`;

  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Imprime / gera PDF do conteúdo atual da página.
 * O CSS de impressão (css/pages.css) esconde o shell e imprime só o
 * conteúdo; no diálogo, o usuário escolhe "Salvar como PDF".
 */
export function imprimir() {
  window.print();
}
