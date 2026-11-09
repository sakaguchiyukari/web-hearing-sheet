/**
 * サーバーAPI呼び出し
 */

/** JSON API を呼び出す。失敗時は日本語メッセージ付きの Error を投げる */
export async function api(method, path, body) {
  const headers = { 'X-WSM-Request': '1' };
  const init = { method, headers, credentials: 'same-origin' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new Error('サーバーに接続できません。システムが起動しているか確認してください。');
  }

  if (res.status === 401 && !path.startsWith('/api/login') && !path.startsWith('/api/password')) {
    location.href = '/login.html';
    throw new Error('ログインが必要です');
  }

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || `エラーが発生しました（${res.status}）`);
  return data;
}
