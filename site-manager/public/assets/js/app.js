/**
 * アプリ本体：ログイン確認・ルーティング・レイアウト
 * 画面は URL の #/〇〇 で切り替える（例：#/sites/xxxx）
 */
import { api } from './api.js';
import { state, loadDb } from './state.js';
import { html, todayStr, formatDate } from './utils.js';
import { toast } from './ui.js';
import { openRecordEditor } from './editors.js';
import { renderDashboard } from './views/dashboard.js';
import { renderSiteList, renderSiteDetail } from './views/sites.js';
import { renderInspections, openInspectionEditor } from './views/inspections.js';
import { renderWorklogs } from './views/worklogs.js';

/* =========================================================
   メニュー定義（ここに追加すれば左メニューに表示される）
   ========================================================= */
const ICONS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  sites: 'M4 4h16v4H4V4zm0 6h16v4H4v-4zm0 6h16v4H4v-4z',
  inspections: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z',
  worklogs: 'M13 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm1 9.4V7h-2v6.4l4.6 2.7 1-1.7-3.6-2z'
};

const NAV = [
  { key: 'dashboard', label: 'ダッシュボード', href: '#/dashboard' },
  { key: 'sites', label: 'サイト管理台帳', href: '#/sites' },
  { key: 'inspections', label: '日常点検', href: '#/inspections' },
  { key: 'worklogs', label: '作業履歴・トラブル', href: '#/worklogs' }
];

/* =========================================================
   ルーティング
   ========================================================= */
const ROUTES = [
  { re: /^\/dashboard$/, nav: 'dashboard', view: renderDashboard },
  { re: /^\/sites$/, nav: 'sites', view: renderSiteList },
  { re: /^\/sites\/([a-z0-9-]+)$/i, nav: 'sites', view: renderSiteDetail },
  { re: /^\/inspections$/, nav: 'inspections', view: renderInspections },
  { re: /^\/worklogs$/, nav: 'worklogs', view: renderWorklogs }
];

const main = document.getElementById('main');
let lastPath = '';

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/dashboard';
  const [path, qs = ''] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs)) };
}

function render() {
  const { path, query } = parseHash();
  const route = ROUTES.find((r) => r.re.test(path));
  if (!route) {
    location.hash = '#/dashboard';
    return;
  }
  const params = path.match(route.re).slice(1);
  const samePage = path === lastPath;
  const scrollY = window.scrollY;

  main.onclick = null; // 前の画面のイベントを解除
  route.view(main, { params, query });
  setActiveNav(route.nav);
  observeFadeIn(main);

  // 同じ画面の再描画（データ更新時）はスクロール位置を保つ
  if (samePage) window.scrollTo(0, scrollY);
  else {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
  lastPath = path;
  closeSidebar();
}

/* =========================================================
   レイアウト（メニュー・スマホ用開閉）
   ========================================================= */
function renderNav() {
  document.getElementById('nav').innerHTML = String(html`${NAV.map((n) => html`
    <li class="nav__item">
      <a class="nav__link" href="${n.href}" data-nav="${n.key}">
        <svg class="nav__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n.key]}"></path></svg>
        <span class="nav__label">${n.label}</span>
      </a>
    </li>`)}`);
}

function setActiveNav(key) {
  document.querySelectorAll('.nav__link').forEach((a) => {
    const active = a.dataset.nav === key;
    a.classList.toggle('nav__link--active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
const menuButton = document.getElementById('menu-button');

function openSidebar() {
  sidebar.classList.add('sidebar--open');
  overlay.hidden = false;
  menuButton.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  sidebar.classList.remove('sidebar--open');
  overlay.hidden = true;
  menuButton.setAttribute('aria-expanded', 'false');
}

/* =========================================================
   フェードイン（IntersectionObserver）
   ========================================================= */
const fadeObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        fadeObserver.unobserve(e.target);
      }
    });
  }, { rootMargin: '0px 0px -40px 0px', threshold: 0.05 })
  : null;

function observeFadeIn(root) {
  root.querySelectorAll('.js-fade:not(.is-visible)').forEach((el) => {
    if (fadeObserver) fadeObserver.observe(el);
    else el.classList.add('is-visible');
  });
}

/* =========================================================
   起動
   ========================================================= */
async function start() {
  try {
    const status = await api('GET', '/api/status');
    if (!status.authenticated) {
      location.href = '/login.html';
      return;
    }
    const { user } = await api('GET', '/api/me');
    state.me = user;
    await loadDb();
  } catch (err) {
    main.innerHTML = String(html`<div class="alert alert--error">${err.message}</div>`);
    return;
  }

  document.getElementById('current-user').textContent = `${state.me.displayName} さん`;
  document.getElementById('org-name').textContent = state.db.settings.orgName || '';
  document.getElementById('today-label').textContent = `本日 ${formatDate(todayStr())}`;
  renderNav();

  // イベント
  window.addEventListener('hashchange', render);
  window.addEventListener('wsm:data-changed', () => {
    document.getElementById('org-name').textContent = state.db.settings.orgName || '';
    render();
  });
  menuButton.addEventListener('click', () => (sidebar.classList.contains('sidebar--open') ? closeSidebar() : openSidebar()));
  overlay.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

  document.getElementById('logout-button').addEventListener('click', async () => {
    await api('POST', '/api/logout').catch(() => {});
    location.href = '/login.html';
  });

  // 上部のクイック登録ボタン
  document.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => {
    const siteMatch = parseHash().path.match(/^\/sites\/([a-z0-9-]+)$/i);
    const presets = siteMatch ? { siteId: siteMatch[1] } : {};
    if (b.dataset.quick === 'inspection') openInspectionEditor(null, presets);
    else openRecordEditor('worklogs', null, presets);
  }));

  render();
}

window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || 'エラーが発生しました', 'error'));
start();
