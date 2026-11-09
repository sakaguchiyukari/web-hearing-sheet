/**
 * CSV出力
 * - UTF-8（BOM付き）で出力し、Excelで開いても日本語が文字化けしないようにする
 * - 改行は CRLF
 * - = + - @ で始まる文字列は先頭に ' を付け、数式として実行されないようにする（CSVインジェクション対策）
 */

const cell = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows) => `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;

/** ファイルとしてダウンロードさせる */
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const downloadCsv = (filename, rows) => downloadText(filename, toCsv(rows));
