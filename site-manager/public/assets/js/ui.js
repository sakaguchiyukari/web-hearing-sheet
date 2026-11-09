/**
 * UI部品（モーダル・確認ダイアログ・通知・バッジ・テーブル）
 */
import { html, raw } from './utils.js';
import { STATUS_LEVELS, RESULTS, RESULT_TONE } from './labels.js';

/* =========================================================
   バッジ・ステータス表示
   ========================================================= */

/** 汎用バッジ  tone: green | yellow | red | grey | blue | muted */
export const badge = (tone, text) => html`<span class="badge badge--${tone}">${text}</span>`;

/** サイト状態バッジ（色＋文字で表示し、色だけに頼らない） */
export const statusBadge = (level) => html`<span class="status status--${level}"><span class="status__dot" aria-hidden="true"></span>${STATUS_LEVELS[level]}</span>`;

export const statusDot = (level) => html`<span class="status-dot status-dot--${level}" title="${STATUS_LEVELS[level]}" aria-label="${STATUS_LEVELS[level]}"></span>`;

export const resultBadge = (result) => badge(RESULT_TONE[result] || 'grey', RESULTS[result] || result);

/** 空状態 */
export const emptyState = (text, action = '') => html`
  <div class="empty">
    <p class="empty__text">${text}</p>
    ${action}
  </div>`;

/* =========================================================
   テーブル（スマホではカード表示に切り替わる）
   columns: [{ label, render(row) => html, className, hideSm }]  hideSm: スマホでは非表示
   ========================================================= */
export function table(columns, rows, { empty = 'データがありません', className = '' } = {}) {
  if (!rows.length) return emptyState(empty);
  return html`
    <div class="table-wrap">
      <table class="table ${className}">
        <thead>
          <tr>${columns.map((c) => html`<th scope="col" class="${c.className || ''}${c.hideSm ? ' col-hide-sm' : ''}">${c.label}</th>`)}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => html`
            <tr>${columns.map((c) => html`<td class="${c.className || ''}${c.hideSm ? ' col-hide-sm' : ''}" data-label="${c.label}"><div class="cell">${c.render(row)}</div></td>`)}</tr>`)}
        </tbody>
      </table>
    </div>`;
}

/* =========================================================
   トースト通知
   ========================================================= */
export function toast(message, tone = 'success') {
  let box = document.querySelector('.toast-area');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toast-area';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.textContent = message;
  box.append(el);
  setTimeout(() => el.classList.add('is-leaving'), 3200);
  setTimeout(() => el.remove(), 3600);
}

/* =========================================================
   モーダル（<dialog> を使用）
   ========================================================= */
function createDialog(extraClass = '') {
  const dialog = document.createElement('dialog');
  dialog.className = `modal ${extraClass}`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  return dialog;
}

/**
 * フォーム付きモーダルを開く
 * @param {object} opt
 * @param {string} opt.title
 * @param {SafeHtml} opt.body フォーム内部のHTML
 * @param {(form: HTMLFormElement) => Promise<boolean|void>} opt.onSubmit falseを返すと閉じない
 * @param {(form: HTMLFormElement) => void} [opt.onOpen]
 */
export function openFormModal({ title, body, submitLabel = '保存する', onSubmit, onOpen, wide = false, readOnly = false }) {
  const dialog = createDialog(wide ? 'modal--wide' : '');
  dialog.innerHTML = String(html`
    <form class="modal__form" novalidate>
      <header class="modal__header">
        <h2 class="modal__title">${title}</h2>
        <button type="button" class="modal__close" data-close aria-label="閉じる">×</button>
      </header>
      <div class="modal__body">
        <div class="alert alert--error modal__error" role="alert" hidden></div>
        ${body}
      </div>
      <footer class="modal__footer">
        <button type="button" class="btn btn--ghost" data-close>${readOnly ? '閉じる' : 'キャンセル'}</button>
        ${readOnly ? '' : html`<button type="submit" class="btn btn--primary">${submitLabel}</button>`}
      </footer>
    </form>`);

  const form = dialog.querySelector('form');
  const errorBox = dialog.querySelector('.modal__error');
  dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    // HTML標準の入力チェック
    if (!form.checkValidity()) {
      const first = form.querySelector(':invalid');
      errorBox.textContent = `入力内容を確認してください：${first?.closest('.field')?.querySelector('.field__label')?.textContent?.replace('必須', '').trim() || ''}`;
      errorBox.hidden = false;
      form.reportValidity();
      return;
    }
    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    try {
      const result = await onSubmit(form);
      if (result !== false) dialog.close();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
      errorBox.scrollIntoView({ block: 'nearest' });
    } finally {
      submitBtn.disabled = false;
    }
  });

  dialog.showModal();
  if (onOpen) onOpen(form);
  const firstInput = form.querySelector('.modal__body input:not([type="hidden"]), .modal__body select, .modal__body textarea');
  if (firstInput && !readOnly) firstInput.focus();
  return dialog;
}

/** 閲覧専用モーダル */
export const openViewModal = (title, body, wide = true) => openFormModal({ title, body, readOnly: true, wide, onSubmit: async () => true });

/** 確認ダイアログ（Promise<boolean>） */
export function confirmDialog(message, { okLabel = 'OK', danger = false, detail = '' } = {}) {
  return new Promise((resolve) => {
    const dialog = createDialog('modal--small');
    dialog.innerHTML = String(html`
      <div class="modal__form">
        <div class="modal__body">
          <p class="confirm__message">${message}</p>
          ${detail ? html`<p class="confirm__detail">${detail}</p>` : ''}
        </div>
        <footer class="modal__footer">
          <button type="button" class="btn btn--ghost" data-answer="no">キャンセル</button>
          <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-answer="yes">${okLabel}</button>
        </footer>
      </div>`);
    let answer = false;
    dialog.querySelectorAll('[data-answer]').forEach((b) => b.addEventListener('click', () => {
      answer = b.dataset.answer === 'yes';
      dialog.close();
    }));
    dialog.addEventListener('close', () => resolve(answer));
    dialog.showModal();
    dialog.querySelector('[data-answer="no"]').focus();
  });
}

/* =========================================================
   ページ見出し
   ========================================================= */
export const pageHeader = (title, lead = '', actions = '') => html`
  <header class="page-header js-fade">
    <div class="page-header__text">
      <h1 class="page-header__title">${title}</h1>
      ${lead ? html`<p class="page-header__lead">${lead}</p>` : ''}
    </div>
    ${actions ? html`<div class="page-header__actions">${actions}</div>` : ''}
  </header>`;

/** 長文をそのまま表示（改行は CSS の pre-wrap で保持） */
export const multiline = (text) => (text ? html`<span class="pre-wrap">${text}</span>` : raw('<span class="text-muted">—</span>'));
