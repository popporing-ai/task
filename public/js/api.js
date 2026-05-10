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
    if (!res.ok) throw new Error(data.error || data.message || '요청 실패');

    // ─── 자동 이벤트 발행: 변경 메서드일 때 path 기반으로 entity-changed 이벤트 emit ───
    // 같은 브라우저 내 다른 뷰가 즉시 자동 갱신할 수 있게 함
    if (method !== 'GET' && typeof AppEvents !== 'undefined') {
      const entityMap = [
        { match: /^\/tasks(\/|$|\?)/,        entity: 'tasks' },
        { match: /^\/subtasks/,              entity: 'tasks' },
        { match: /^\/comments/,              entity: 'tasks' },
        { match: /^\/checklists/,            entity: 'tasks' },
        { match: /^\/attachments/,           entity: 'tasks' },
        { match: /^\/issues/,                entity: 'tasks' },
        { match: /^\/content(\/|$|\?)/,      entity: 'content' },
        { match: /^\/timeline/,              entity: 'timeline' },
        { match: /^\/calendar/,              entity: 'calendar' },
        { match: /^\/rrr/,                   entity: 'rrr' },
        { match: /^\/users/,                 entity: 'users' },
        { match: /^\/categories/,            entity: 'categories' },
        { match: /^\/products/,              entity: 'products' },
      ];
      const matched = entityMap.find(m => m.match.test(path));
      if (matched) {
        AppEvents.emit('data-changed', { entity: matched.entity, method, path });
        AppEvents.emit(`${matched.entity}-changed`, { method, path });
      }
    }

    return data;
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body) { return this.request('PUT', path, body); },
  patch(path, body) { return this.request('PATCH', path, body); },
  del(path) { return this.request('DELETE', path); },

  // 멀티파트 파일 업로드 (FormData)
  async upload(path, formData) {
    const res = await fetch(`${this.BASE}${path}`, {
      method: 'POST',
      body: formData,
      // Content-Type 헤더 생략 → 브라우저가 multipart/form-data + boundary 자동 설정
    });
    if (res.status === 401) {
      window.location.href = '/task/login.html';
      return null;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '업로드 실패');
    return data;
  },
};
