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

    // JSON 파싱 — 게이트웨이(Nginx)나 LLM 서버 오류로 HTML 응답이 올 수 있음
    let data;
    try {
      data = await res.clone().json();
    } catch (parseErr) {
      const raw = await res.text().catch(() => '');
      const looksHtml = /^\s*<(?:!doctype|html|head|body)\b/i.test(raw);
      const hint = looksHtml
        ? '서버 또는 게이트웨이에서 비정상 응답(HTML)이 왔습니다. 요청이 너무 오래 걸리거나 LLM 서버가 응답하지 않는 상태일 수 있습니다.'
        : '서버 응답 형식이 올바르지 않습니다.';
      throw new Error(`${hint} (HTTP ${res.status})`);
    }
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
