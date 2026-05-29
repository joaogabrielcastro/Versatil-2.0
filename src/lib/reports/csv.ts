/** Gera download CSV no browser (relatórios do balcão). */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: string[][],
): void {
  const escape = (cell: string) => {
    if (/[",\n\r]/.test(cell)) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) => r.map(escape).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatMoneyCsv(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
