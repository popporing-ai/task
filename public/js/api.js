// HTML 이스케이프 유틸리티 (XSS 방지)
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// API 유틸리티
const API = {
  BASE: '/task/api',

  async request(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${this.BASE}${path}`, opts);

    if (res.status === 401) {
      window.location.href = '/task/login.html';
      return null;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '요청 실패');
    return data;
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body) { return this.request('PUT', path, body); },
  patch(path, body) { return this.request('PATCH', path, body); },
  del(path) { return this.request('DELETE', path); },
};
