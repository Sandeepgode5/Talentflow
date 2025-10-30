// src/lib/download.ts

/** Make a timestamped filename like "jobs-2025 10 29-231530" (no extension). */
export function stamp(prefix = "export") {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Convert an array of records to CSV. If headers omitted, use keys of the first row. */
export function toCSV(rows: Record<string, any>[], headers?: string[]) {
  if (!rows || rows.length === 0) return "";
  const cols = headers && headers.length ? headers : Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const row of rows) lines.push(cols.map((c) => esc((row as any)[c])).join(","));
  return lines.join("\n");
}

export function toJSON(obj: any) {
  return JSON.stringify(obj, null, 2);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(filename: string, text: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  downloadBlob(filename, blob);
}

/** Convenience: build CSV and download it. Accepts base name (adds .csv if missing). */
export function downloadCsv(
  filenameBase: string,
  rows: Record<string, any>[],
  headers?: string[]
) {
  const csv = toCSV(rows, headers);
  const name = filenameBase.endsWith(".csv") ? filenameBase : `${filenameBase}.csv`;
  downloadText(name, csv, "text/csv;charset=utf-8");
}
