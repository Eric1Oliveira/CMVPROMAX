/**
 * CMV Pro — Import/Export CSV
 * ---------------------------
 * Exporta e importa CSV compatível com Excel brasileiro (; como separador,
 * BOM UTF-8 para acentuação correta).
 */

const SEP = ';';

/** Escapa um valor de célula segundo a RFC 4180. */
function cell(v) {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/**
 * Gera e baixa um CSV.
 * @param {string} filename ex.: 'ingredientes.csv'
 * @param {string[]} headers rótulos das colunas
 * @param {Array<Array>} rows linhas (arrays na ordem dos headers)
 */
export function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(cell).join(SEP), ...rows.map((r) => r.map(cell).join(SEP))];
  // BOM (﻿) faz o Excel reconhecer UTF-8 e exibir acentos corretamente
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Faz o parse de um texto CSV (auto-detecta ';' ou ',').
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCsv(text) {
  // Remove BOM se presente
  text = text.replace(/^﻿/, '');
  const firstLine = text.slice(0, text.indexOf('\n') + 1 || text.length);
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // aspas escapadas
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // Última linha sem quebra final
  row.push(field);
  if (row.some((c) => c !== '')) rows.push(row);

  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return { headers, rows };
}

/** Abre o seletor de arquivo e devolve o conteúdo de um .csv como texto. */
export function pickCsvFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('Nenhum arquivo selecionado.'));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.readAsText(file, 'utf-8');
    };
    input.click();
  });
}
