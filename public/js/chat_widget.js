// 전역 LLM 채팅 위젯 (우측 하단 floating)
// — 마케팅 업무 현황 Q&A 전용
// — 시스템 프롬프트 가드레일로 외 답변 거부
// — 어느 화면에서나 사용 가능, 단축키 'C'로 토글
const ChatWidget = {
  _open: false,
  _messages: [],
  _loading: false,
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    const fab = document.createElement('button');
    fab.className = 'cw-fab';
    fab.id = 'cw-fab';
    fab.title = '업무 어시스턴트 (단축키: C)';
    fab.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 4h18a1 1 0 011 1v12a1 1 0 01-1 1H8l-5 4V5a1 1 0 011-1z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="8" cy="11" r="1" fill="currentColor"/>
        <circle cx="12" cy="11" r="1" fill="currentColor"/>
        <circle cx="16" cy="11" r="1" fill="currentColor"/>
      </svg>
    `;
    document.body.appendChild(fab);
    fab.addEventListener('click', () => this.toggle());

    const panel = document.createElement('div');
    panel.className = 'cw-panel';
    panel.id = 'cw-panel';
    panel.style.display = 'none';
    document.body.appendChild(panel);

    // 단축키 'C' (입력 필드 외에서)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'c' || e.key === 'C') {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        this.toggle();
      }
    });
  },

  toggle() {
    this._open = !this._open;
    const panel = document.getElementById('cw-panel');
    if (!panel) return;
    if (this._open) {
      panel.style.display = 'block';
      requestAnimationFrame(() => panel.classList.add('cw-panel-open'));
      if (this._messages.length === 0) {
        this._messages.push({
          role: 'assistant',
          content: '안녕하세요. 마케팅 업무 현황에 대해 무엇이든 물어보세요.\n\n예시:\n- "이번 주 마감인데 안 끝난 업무는?"\n- "지연된 PR 업무 누가 담당이야?"\n- "전시회 카테고리 진행 상황 정리해줘"\n- "오늘 완료된 거 알려줘"',
        });
      }
      this._render();
      setTimeout(() => document.getElementById('cw-input')?.focus(), 200);
    } else {
      panel.classList.remove('cw-panel-open');
      setTimeout(() => { if (!this._open) panel.style.display = 'none'; }, 200);
    }
  },

  _render() {
    const panel = document.getElementById('cw-panel');
    if (!panel) return;

    const suggestions = [
      '오늘 완료된 업무',
      '이번 주 마감 임박',
      '지연 업무 담당자별',
      '미진행 업무 정리',
    ];

    panel.innerHTML = `
      <div class="cw-card">
        <div class="cw-header">
          <div class="cw-header-l">
            <span class="cw-avatar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M3 4h18a1 1 0 011 1v12a1 1 0 01-1 1H8l-5 4V5a1 1 0 011-1z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
              </svg>
            </span>
            <div>
              <div class="cw-title">업무 어시스턴트</div>
              <div class="cw-sub">마케팅 업무 전용 · 단축키 C</div>
            </div>
          </div>
          <div class="cw-actions">
            <button class="cw-icon-btn" id="cw-clear" title="대화 초기화">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M5 7v6M11 7v6M4 4l1 10a1 1 0 001 1h4a1 1 0 001-1l1-10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
            </button>
            <button class="cw-icon-btn" id="cw-close" title="닫기">✕</button>
          </div>
        </div>
        <div class="cw-body" id="cw-body">
          ${this._messages.map(m => this._renderMessage(m)).join('')}
          ${this._loading ? `<div class="cw-msg cw-msg-ai">
            <span class="cw-msg-avatar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 4h18a1 1 0 011 1v12a1 1 0 01-1 1H8l-5 4V5a1 1 0 011-1z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
            </span>
            <div class="cw-bubble cw-typing"><span></span><span></span><span></span></div>
          </div>` : ''}
        </div>
        ${this._messages.length <= 1 ? `<div class="cw-suggestions">
          ${suggestions.map(s => `<button class="cw-sug" data-text="${escHtml(s)}">${escHtml(s)}</button>`).join('')}
        </div>` : ''}
        <div class="cw-input-row">
          <input type="text" id="cw-input" class="cw-input" placeholder="업무에 대해 물어보세요…" autocomplete="off" ${this._loading ? 'disabled' : ''}>
          <button class="cw-send" id="cw-send" ${this._loading ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 8l12-6-5 14-2-6-5-2z" fill="currentColor"/></svg>
          </button>
        </div>
      </div>
    `;

    document.getElementById('cw-close').addEventListener('click', () => this.toggle());
    document.getElementById('cw-clear').addEventListener('click', () => {
      this._messages = [];
      this._render();
      // 첫 메시지 다시
      setTimeout(() => {
        this._messages.push({
          role: 'assistant',
          content: '대화를 초기화했습니다. 무엇을 도와드릴까요?',
        });
        this._render();
      }, 50);
    });

    const input = document.getElementById('cw-input');
    const send  = document.getElementById('cw-send');
    const submit = () => {
      const text = input.value.trim();
      if (!text || this._loading) return;
      input.value = '';
      this._send(text);
    };
    send.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    panel.querySelectorAll('.cw-sug').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this._loading) return;
        this._send(btn.dataset.text);
      });
    });

    const body = document.getElementById('cw-body');
    if (body) body.scrollTop = body.scrollHeight;
  },

  _renderMessage(m) {
    const isUser = m.role === 'user';
    return `<div class="cw-msg ${isUser ? 'cw-msg-user' : 'cw-msg-ai'}">
      ${!isUser ? `<span class="cw-msg-avatar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 4h18a1 1 0 011 1v12a1 1 0 01-1 1H8l-5 4V5a1 1 0 011-1z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
      </span>` : ''}
      <div class="cw-bubble">${this._renderMarkdown(m.content)}</div>
    </div>`;
  },

  _renderMarkdown(text) {
    let safe = escHtml(text);
    if (/\|.+\|/.test(safe) && /\n\s*\|[\s:|-]+\|/.test(safe)) {
      const lines = safe.split('\n');
      let out = []; let inTable = false; let rows = []; let header = null;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*\|.+\|\s*$/.test(line)) {
          if (!inTable) {
            inTable = true;
            header = line.split('|').slice(1, -1).map(s => s.trim());
            if (i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1])) i++;
          } else {
            rows.push(line.split('|').slice(1, -1).map(s => s.trim()));
          }
        } else {
          if (inTable) {
            out.push(`<table class="cw-table"><thead><tr>${header.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
            inTable = false; header = null; rows = [];
          }
          out.push(line);
        }
      }
      if (inTable) out.push(`<table class="cw-table"><thead><tr>${header.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      safe = out.join('\n');
    }
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/^- (.+)$/gm, '<div class="cw-bullet">• $1</div>');
    safe = safe.replace(/\n/g, '<br>');
    safe = safe.replace(/<br>(<table)/g, '$1').replace(/(<\/table>)<br>/g, '$1');
    return safe;
  },

  async _send(text) {
    this._messages.push({ role: 'user', content: text });
    this._loading = true;
    this._render();
    try {
      const res = await API.post('/team-activity/chat', {
        messages: this._messages,
        context_type: 'tasks_overview',
      });
      const reply = res.data?.reply || '응답을 생성하지 못했습니다.';
      this._messages.push({ role: 'assistant', content: reply });
    } catch (e) {
      this._messages.push({
        role: 'assistant',
        content: `⚠ 응답 실패: ${e.message || '알 수 없는 오류'}\n\n서버 LLM 설정을 확인해주세요. (관리자에게 문의)`,
      });
    } finally {
      this._loading = false;
      this._render();
    }
  },
};

// 로그인 후 init
document.addEventListener('DOMContentLoaded', () => {
  // App.init() 다음 tick에 초기화 (인증 확인 후)
  setTimeout(() => {
    if (App && App.user) ChatWidget.init();
    else {
      // 로그인 안된 상태면 polling
      const t = setInterval(() => {
        if (App && App.user) { clearInterval(t); ChatWidget.init(); }
      }, 500);
    }
  }, 500);
});
