/**
 * ToDo（対応リスト）
 * 点検で「要確認・対応中」になった項目や、診断の指摘、手動で追加した作業を管理する。
 */
import { api } from '../api.js';
import { state, siteName } from '../state.js';
import { html, todayStr, formatDate, daysBetween, daysLeftText } from '../utils.js';
import * as L from '../labels.js';
import { isOpenTodo } from '../status.js';
import { pageHeader, badge, toast } from '../ui.js';
import { openRecordEditor, notifyChanged, siteLink } from '../editors.js';
import { mountCrudList, siteFilterOptions, mapOptions, setCrudFilter } from '../crud.js';

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2 };
const priorityTone = { urgent: 'red', high: 'yellow', normal: 'muted' };
const statusTone = { open: 'grey', progress: 'yellow', hold: 'muted', done: 'green' };

/** 期限の表示（超過は赤、7日以内は黄） */
export function dueBadge(t) {
  if (!t.dueDate) return html`<span class="text-muted">期限なし</span>`;
  if (t.status === 'done') return html`<span class="text-muted">${formatDate(t.dueDate)}</span>`;
  const d = daysBetween(todayStr(), t.dueDate);
  return html`${badge(d < 0 ? 'red' : d <= 7 ? 'yellow' : 'muted', formatDate(t.dueDate))}<span class="cell-sub">${daysLeftText(d)}</span>`;
}

/** 並び順：未完了が先 → 優先度 → 期限が近い順 */
export const todoSort = (a, b) => (a.status === 'done') - (b.status === 'done')
  || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
  || b.createdAt.localeCompare(a.createdAt);

/** 完了／未完了の切り替え */
export async function toggleTodo(id) {
  const t = state.db.todos.find((x) => x.id === id);
  if (!t) return;
  const done = t.status !== 'done';
  try {
    await api('PUT', `/api/c/todos/${id}`, { ...t, status: done ? 'done' : 'open', completedDate: done ? todayStr() : '' });
    toast(done ? 'ToDoを完了にしました' : 'ToDoを未完了に戻しました');
    await notifyChanged();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** 完了チェックボタン */
export const todoCheck = (t) => html`<button type="button" class="todo-check ${t.status === 'done' ? 'todo-check--done' : ''}" data-toggle-todo="${t.id}"
  aria-pressed="${t.status === 'done'}" aria-label="${t.status === 'done' ? '未完了に戻す' : '完了にする'}：${t.title}"></button>`;

export function renderTodos(root, { query }) {
  if (query.site) setCrudFilter('todos', { siteId: query.site });
  const today = todayStr();
  const open = state.db.todos.filter(isOpenTodo);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  const urgent = open.filter((t) => t.priority === 'urgent');

  root.innerHTML = String(html`
    ${pageHeader('ToDo（対応リスト）', '対応が必要なことを一覧で管理します。点検で「要確認・対応中」にした項目や、診断の指摘は自動で登録できます。左の丸を押すと完了になります。',
      html`<button type="button" class="btn btn--primary" id="add-todo">＋ ToDoを追加</button>`)}

    <section class="stat-grid" aria-label="ToDoの件数">
      <div class="stat-card js-fade"><p class="stat-card__label">未完了</p><p class="stat-card__value">${open.length}</p></div>
      <div class="stat-card ${overdue.length ? 'stat-card--red' : 'stat-card--green'} js-fade"><p class="stat-card__label">期限超過</p><p class="stat-card__value">${overdue.length}</p></div>
      <div class="stat-card ${urgent.length ? 'stat-card--red' : 'stat-card--green'} js-fade"><p class="stat-card__label">至急</p><p class="stat-card__value">${urgent.length}</p></div>
      <div class="stat-card js-fade"><p class="stat-card__label">完了済み</p><p class="stat-card__value">${state.db.todos.length - open.length}</p></div>
    </section>

    <section class="card js-fade" id="todo-list"></section>`);

  root.querySelector('#add-todo').addEventListener('click', () => openRecordEditor('todos'));

  mountCrudList(root.querySelector('#todo-list'), {
    key: 'todos',
    collection: 'todos',
    initial: { status: 'unresolved' },
    searchPlaceholder: 'やること・詳細・担当者で検索',
    filters: [
      { name: 'status', label: '状況', options: () => [{ value: 'unresolved', label: '未完了すべて' }, { value: 'overdue', label: '期限超過' }, ...mapOptions(L.TODO_STATUS)] },
      { name: 'siteId', label: 'サイト', options: () => [{ value: 'none', label: '全サイト共通' }, ...siteFilterOptions()] },
      { name: 'category', label: '分類', options: () => mapOptions(L.CHECK_CATEGORIES) },
      { name: 'priority', label: '優先度', options: () => mapOptions(L.PRIORITY) }
    ],
    match: (t, f) => (!f.status || (f.status === 'unresolved' ? isOpenTodo(t) : f.status === 'overdue' ? isOpenTodo(t) && t.dueDate && t.dueDate < today : t.status === f.status))
      && (!f.siteId || (f.siteId === 'none' ? !t.siteId : t.siteId === f.siteId))
      && (!f.category || t.category === f.category)
      && (!f.priority || t.priority === f.priority),
    searchText: (t) => [t.title, t.detail, t.notes, t.assignee, t.source, t.siteId ? siteName(t.siteId) : ''],
    sort: todoSort,
    label: (t) => t.title,
    columns: [
      { label: '完了', className: 'col-status', render: todoCheck },
      { label: 'やること', className: 'col-wide', render: (t) => html`<span class="${t.status === 'done' ? 'todo-title todo-title--done' : 'todo-title'}">${t.title}</span>
        ${t.detail ? html`<span class="cell-sub pre-wrap">${t.detail}</span>` : ''}${t.source ? html`<span class="cell-sub">登録元：${t.source}</span>` : ''}` },
      { label: 'サイト', render: (t) => (t.siteId ? siteLink(t.siteId) : html`<span class="text-muted">全サイト共通</span>`) },
      { label: '分類', hideSm: true, render: (t) => L.CHECK_CATEGORIES[t.category] },
      { label: '優先度', render: (t) => badge(priorityTone[t.priority], L.PRIORITY[t.priority]) },
      { label: '期限', render: dueBadge },
      { label: '担当者', hideSm: true, render: (t) => t.assignee || '—' },
      { label: '状況', render: (t) => html`${badge(statusTone[t.status], L.TODO_STATUS[t.status])}${t.completedDate ? html`<span class="cell-sub">${formatDate(t.completedDate)}</span>` : ''}` }
    ],
    empty: '該当するToDoはありません'
  });

  root.onclick = (e) => {
    const b = e.target.closest('[data-toggle-todo]');
    if (b) toggleTodo(b.dataset.toggleTodo);
  };
}
