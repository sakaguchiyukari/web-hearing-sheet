/**
 * 報告書の印刷用ページ（report.html）
 *   report.html?month=2026-11        … 印刷用画面
 *   report.html?month=2026-11&print=1 … 開いたら印刷ダイアログを表示（「PDFに保存」を選ぶとPDFになる）
 */
import { api } from './api.js';
import { html, currentMonth } from './utils.js';
import { buildReport, reportToCsvRows } from './report-model.js';
import { renderReport } from './report-render.js';
import { downloadCsv } from './csv.js';

const params = new URLSearchParams(location.search);
const ym = /^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month') : currentMonth();
const root = document.getElementById('report-root');

async function init() {
  let db;
  try {
    db = await api('GET', '/api/db');
  } catch (err) {
    root.innerHTML = String(html`<div class="alert alert--error">${err.message}</div>`);
    return;
  }
  const model = buildReport(db, ym);
  // PDF保存時の既定ファイル名になる
  document.title = `Webサイト管理状況報告書_${ym}`;
  document.getElementById('report-title').textContent = `${model.label}の報告書（A4）`;
  root.innerHTML = String(renderReport(model));

  document.getElementById('print-button').addEventListener('click', () => window.print());
  document.getElementById('csv-button').addEventListener('click', () => downloadCsv(`site-report_${ym}.csv`, reportToCsvRows(model)));

  if (params.get('print') === '1') setTimeout(() => window.print(), 400);
}

init();
