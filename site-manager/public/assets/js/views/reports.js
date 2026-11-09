/**
 * 月次報告書
 * 月を選び、報告日・報告者・今後の予定・特記事項を入力して、印刷/PDF/CSVで出力する。
 */
import { api } from '../api.js';
import { state, staffOptions } from '../state.js';
import { html, raw, currentMonth, shiftMonth, monthLabel, todayStr } from '../utils.js';
import { pageHeader, toast } from '../ui.js';
import { renderFields, readFields, detectSecrets } from '../form.js';
import { notifyChanged } from '../editors.js';
import { buildReport, reportToCsvRows } from '../report-model.js';
import { renderReport } from '../report-render.js';
import { downloadCsv } from '../csv.js';

const view = { month: currentMonth() };

const noteFields = () => [
  { name: 'reportDate', label: '報告日', type: 'date', required: true },
  { name: 'author', label: '報告者', type: 'text', maxlength: 100, list: staffOptions(), placeholder: '例）山田' },
  { name: 'plans', label: '今後の対応予定（記入）', type: 'textarea', rows: 4, maxlength: 5000, placeholder: '例）12月中にサービスサイトAのプラグインを整理予定' },
  { name: 'special', label: '特記事項', type: 'textarea', rows: 4, maxlength: 5000, placeholder: '上司に特に伝えたいこと（なければ空欄）' }
];

export function renderReports(root, { query }) {
  if (/^\d{4}-\d{2}$/.test(query.month || '')) view.month = query.month;
  const ym = view.month;
  const model = buildReport(state.db, ym);
  const note = state.db.reportNotes[ym] || {};
  const values = { reportDate: note.reportDate || todayStr(), author: note.author || state.me?.displayName || '', plans: note.plans || '', special: note.special || '' };
  const isFuture = ym > currentMonth();

  root.innerHTML = String(html`
    ${pageHeader('月次報告書', '上司への報告書を月ごとに作成します。内容は記録から自動集計され、「今後の対応予定」と「特記事項」だけ手入力します。')}

    <section class="card js-fade">
      <div class="card__header">
        <div class="month-switch" role="group" aria-label="対象月の切り替え">
          <button type="button" class="btn btn--outline btn--sm" data-month="${shiftMonth(ym, -1)}">← 前月</button>
          <label class="visually-hidden" for="report-month">対象月</label>
          <input class="input input--sm" type="month" id="report-month" value="${ym}" max="${currentMonth()}">
          <button type="button" class="btn btn--outline btn--sm" data-month="${shiftMonth(ym, 1)}"${isFuture || ym === currentMonth() ? raw(' disabled') : ''}>翌月 →</button>
        </div>
        <div class="report-actions">
          <a class="btn btn--primary" href="report.html?month=${ym}&amp;print=1" target="_blank" rel="noopener">PDFで保存</a>
          <a class="btn btn--outline" href="report.html?month=${ym}" target="_blank" rel="noopener">印刷用画面を開く</a>
          <button type="button" class="btn btn--outline" id="report-csv">CSV出力</button>
        </div>
      </div>
      <p class="card__lead">「PDFで保存」を押すと印刷画面が開きます。送信先（プリンター）で「PDFに保存」を選ぶと、A4のPDFファイルになります（Chrome / Edge 推奨）。</p>

      <form class="report-note-form" id="note-form" novalidate>
        ${renderFields(noteFields(), values)}
        <div class="tab-actions">
          <button type="submit" class="btn btn--primary">${monthLabel(ym)}の記入内容を保存</button>
        </div>
      </form>
    </section>

    <section class="js-fade" aria-label="報告書プレビュー">
      <h2 class="card__title">プレビュー（${model.label}）</h2>
      <div class="report-preview">${renderReport({ ...model, ...values })}</div>
    </section>`);

  root.querySelector('#report-month').addEventListener('change', (e) => {
    if (/^\d{4}-\d{2}$/.test(e.target.value)) {
      view.month = e.target.value;
      location.hash = `#/reports?month=${view.month}`;
    }
  });
  root.querySelectorAll('[data-month]').forEach((b) => b.addEventListener('click', () => {
    location.hash = `#/reports?month=${b.dataset.month}`;
  }));
  root.querySelector('#report-csv').addEventListener('click', () => {
    downloadCsv(`site-report_${ym}.csv`, reportToCsvRows({ ...model, ...values }));
  });

  const form = root.querySelector('#note-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = readFields(form, noteFields());
    const secrets = detectSecrets(data, noteFields());
    if (secrets.length) {
      toast('パスワード等の秘密情報らしき記述があります。削除してから保存してください。', 'error');
      return;
    }
    try {
      await api('PUT', `/api/report-notes/${ym}`, data);
      toast(`${monthLabel(ym)}の記入内容を保存しました`);
      await notifyChanged();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
