export function escapeCsvCell(value: unknown, quoteAll: boolean = true): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
  const escaped = neutralized.replace(/"/g, '""');
  if (quoteAll || /[;"\n\r,]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

export function buildCsvContent(rows: Array<Array<unknown>>, delimiter: string = ';', quoteAll: boolean = true): string {
  const lines = rows.map((row) => row.map((cell) => escapeCsvCell(cell, quoteAll)).join(delimiter));
  return '\uFEFF' + lines.join('\r\n');
}

export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
