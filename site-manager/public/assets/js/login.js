/**
 * ログイン・初回セットアップ画面
 */
import { api } from './api.js';

const errorBox = document.getElementById('auth-error');
const loginForm = document.getElementById('login-form');
const setupForm = document.getElementById('setup-form');

const showError = (msg) => {
  errorBox.textContent = msg;
  errorBox.hidden = !msg;
};

async function init() {
  try {
    const status = await api('GET', '/api/status');
    if (status.authenticated) {
      location.href = '/';
      return;
    }
    (status.setupRequired ? setupForm : loginForm).hidden = false;
    (status.setupRequired ? setupForm : loginForm).querySelector('input').focus();
  } catch (err) {
    showError(err.message);
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  if (!loginForm.reportValidity()) return;
  try {
    await api('POST', '/api/login', { username: loginForm.username.value.trim(), password: loginForm.password.value });
    location.href = '/';
  } catch (err) {
    showError(err.message);
    loginForm.password.value = '';
    loginForm.password.focus();
  }
});

setupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  if (setupForm.password.value !== setupForm.password2.value) {
    showError('確認用パスワードが一致しません');
    return;
  }
  if (!setupForm.reportValidity()) return;
  try {
    await api('POST', '/api/setup', {
      username: setupForm.username.value.trim(),
      displayName: setupForm.displayName.value.trim(),
      password: setupForm.password.value
    });
    location.href = '/';
  } catch (err) {
    showError(err.message);
  }
});

init();
