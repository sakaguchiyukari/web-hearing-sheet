/**
 * フォーム生成・読み取り
 * 項目定義（配列）からフォームのHTMLを作り、送信時に値を取り出す。
 *
 * 項目定義の例:
 *   { name: 'name', label: 'サイト名', type: 'text', required: true, maxlength: 100, placeholder: '例）コーポレートサイト' }
 *   type: text | url | email | date | number | select | textarea | checkboxes | heading
 *   options: [{ value, label }] または { value: label } 形式
 *   full: true で2列レイアウトでも1行を占有
 *   list: 入力候補（datalist）
 */
import { html, raw } from './utils.js';

let uid = 0;
const nextId = () => `f${++uid}`;

const toOptions = (options) => (Array.isArray(options)
  ? options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  : Object.entries(options || {}).map(([value, label]) => ({ value, label })));

function control(f, value, id) {
  const common = {
    required: f.required ? raw(' required') : '',
    placeholder: f.placeholder ? html` placeholder="${f.placeholder}"` : '',
    describedby: f.help ? html` aria-describedby="${id}-help"` : ''
  };

  switch (f.type) {
    case 'textarea':
      return html`<textarea class="input input--textarea" id="${id}" name="${f.name}" rows="${f.rows || 3}"
        ${f.maxlength ? html`maxlength="${f.maxlength}"` : ''}${common.required}${common.placeholder}${common.describedby}>${value ?? ''}</textarea>`;

    case 'select':
      return html`<select class="input input--select" id="${id}" name="${f.name}"${common.required}${common.describedby}>
        ${f.emptyLabel !== undefined ? html`<option value="">${f.emptyLabel}</option>` : ''}
        ${toOptions(f.options).map((o) => html`<option value="${o.value}"${String(value ?? '') === String(o.value) ? raw(' selected') : ''}>${o.label}</option>`)}
      </select>`;

    case 'checkboxes': {
      const selected = new Set(value || []);
      const opts = toOptions(f.options);
      if (!opts.length) return html`<p class="field__empty">選択肢がありません</p>`;
      return html`<div class="check-group" id="${id}" role="group"${common.describedby}>
        ${opts.map((o) => html`
          <label class="check">
            <input class="check__input" type="checkbox" name="${f.name}" value="${o.value}"${selected.has(o.value) ? raw(' checked') : ''}>
            <span class="check__label">${o.label}</span>
          </label>`)}
      </div>`;
    }

    default: {
      const type = ['text', 'url', 'email', 'date', 'number', 'tel', 'month'].includes(f.type) ? f.type : 'text';
      const listId = f.list?.length ? `${id}-list` : '';
      return html`<input class="input" type="${type}" id="${id}" name="${f.name}" value="${value ?? ''}"
        ${f.maxlength ? html`maxlength="${f.maxlength}"` : ''}
        ${f.pattern ? html`pattern="${f.pattern}"` : ''}
        ${f.min !== undefined ? html`min="${f.min}"` : ''}
        ${f.max !== undefined ? html`max="${f.max}"` : ''}
        ${f.step !== undefined ? html`step="${f.step}"` : ''}
        ${f.inputmode ? html`inputmode="${f.inputmode}"` : ''}
        ${listId ? html`list="${listId}"` : ''}
        autocomplete="off"${common.required}${common.placeholder}${common.describedby}>
        ${listId ? html`<datalist id="${listId}">${f.list.map((v) => html`<option value="${v}"></option>`)}</datalist>` : ''}`;
    }
  }
}

/** 項目定義からフォーム部分のHTMLを生成 */
export function renderFields(fields, values = {}) {
  return html`<div class="form-grid">
    ${fields.map((f) => {
      if (f.type === 'heading') {
        return html`<div class="form-grid__heading">
          <h3 class="form-section-title">${f.label}</h3>
          ${f.help ? html`<p class="form-section-help">${f.help}</p>` : ''}
        </div>`;
      }
      const id = nextId();
      const isGroup = f.type === 'checkboxes';
      return html`
        <div class="field ${f.full || f.type === 'textarea' || isGroup ? 'field--full' : ''}">
          ${isGroup
            ? html`<span class="field__label">${f.label}${f.required ? html`<span class="field__required">必須</span>` : ''}</span>`
            : html`<label class="field__label" for="${id}">${f.label}${f.required ? html`<span class="field__required">必須</span>` : ''}</label>`}
          ${control(f, values[f.name] ?? f.default, id)}
          ${f.help ? html`<p class="field__help" id="${id}-help">${f.help}</p>` : ''}
        </div>`;
    })}
  </div>`;
}

/** フォームから値を取り出す */
export function readFields(form, fields) {
  const out = {};
  fields.forEach((f) => {
    if (f.type === 'heading') return;
    if (f.type === 'checkboxes') {
      out[f.name] = [...form.querySelectorAll(`input[name="${CSS.escape(f.name)}"]:checked`)].map((i) => i.value);
      return;
    }
    const el = form.elements.namedItem(f.name);
    if (!el) return;
    const v = el.value.trim();
    out[f.name] = f.type === 'number' ? (v === '' ? null : Number(v)) : v;
  });
  return out;
}

/* =========================================================
   秘密情報の入力チェック
   パスワード・APIキー等を保存しない方針のため、それらしき記述があれば警告する
   ========================================================= */
const SECRET_PATTERN = /(password|passwd|passcode|パスワード|pass|pwd?|api[\s_-]?key|apiキー|secret|シークレット|token|トークン|認証情報|ftp(?:ユーザー|user)?)\s*[:：=＝]\s*\S/i;

/** 秘密情報らしき値を含む項目のラベル一覧を返す */
export function detectSecrets(values, fields) {
  return fields
    .filter((f) => typeof values[f.name] === 'string' && SECRET_PATTERN.test(values[f.name]))
    .map((f) => f.label);
}
