/** Client-only helpers for CSV / JSON downloads */

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(
  filename: string,
  text: string,
  mime: string,
): void {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

export function rowsToCsv(headers: string[], rows: string[][]): string {
  const esc = (cell: string) => {
    const s = String(cell);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join(
    "\n",
  );
}
