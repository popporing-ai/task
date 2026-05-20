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
      '지연 업무 정리',
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
          <textarea id="cw-input" class="cw-input" rows="1" placeholder="업무에 대해 물어보세요…  (Shift+Enter 줄바꿈)" ${this._loading ? 'disabled' : ''}></textarea>
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
    // Enter: 전송, Shift+Enter: 줄바꿈
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
    // textarea 자동 리사이즈 (max 5줄)
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
    panel.querySelectorAll('.cw-sug').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this._loading) return;
        this._send(btn.dataset.text);
      });
    });

    // 액션 카드 — "열기" 버튼 → 해당 뷰로 이동
    panel.querySelectorAll('.cw-tool-link[data-link-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.linkView;
        const id   = btn.dataset.linkId;
        this._open = false;
        document.getElementById('cw-panel').style.display = 'none';
        if (App && App.navigate) App.navigate(view);
        if (id && App?._openNotifTarget) {
          App._openNotifTarget({ link_view: view, link_id: id });
        }
      });
    });
    // 보고서 다운로드 (마지막 tool_result의 markdown 사용)
    panel.querySelectorAll('.cw-tool-link[data-dl-report]').forEach(btn => {
      btn.addEventListener('click', () => {
        // 가장 최근 보고서 찾기
        const lastMsg = [...this._messages].reverse().find(m => m.tool_results?.some(tr => tr.result?.data?.report?.markdown));
        const trWithReport = lastMsg?.tool_results.find(tr => tr.result?.data?.report?.markdown);
        const report = trWithReport?.result?.data?.report;
        if (!report) return;
        const blob = new Blob([report.markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_${(report.user_name || 'user').replace(/\s+/g,'_')}_${report.date_from}_${report.date_to}.md`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      });
    });

    const body = document.getElementById('cw-body');
    if (body) body.scrollTop = body.scrollHeight;
  },

  _renderMessage(m) {
    const isUser = m.role === 'user';
    const toolHtml = !isUser && m.tool_results ? this._renderToolResults(m.tool_results) : '';
    return `<div class="cw-msg ${isUser ? 'cw-msg-user' : 'cw-msg-ai'}">
      ${!isUser ? `<span class="cw-msg-avatar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 4h18a1 1 0 011 1v12a1 1 0 01-1 1H8l-5 4V5a1 1 0 011-1z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
      </span>` : ''}
      <div class="cw-bubble">${this._renderMarkdown(m.content)}${toolHtml}</div>
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
        use_tools: true,
      });
      const reply = res.data?.reply || '응답을 생성하지 못했습니다.';
      const toolResults = res.data?.tool_results || [];
      this._messages.push({ role: 'assistant', content: reply, tool_results: toolResults });

      // 도구가 데이터 변경 작업을 했다면 글로벌 갱신 이벤트
      const mutated = toolResults.some(r => /^(create|update|delete)_/.test(r.name) && r.result?.ok);
      if (mutated && App.events?.emit) {
        App.events.emit('data-changed', { source: 'assistant' });
      }
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

  // 액션 결과 카드 렌더 (tool_results 배열)
  _renderToolResults(toolResults) {
    if (!toolResults || !toolResults.length) return '';
    const cards = toolResults.map(tr => {
      const r = tr.result || {};
      const ok = r.ok;
      const cls = ok ? 'cw-tool-card ok' : 'cw-tool-card err';
      const icon = ok ? '✓' : '⚠';
      const label = r.summary || (ok ? `${tr.name} 실행` : (r.error || '실패'));
      const data = r.data || {};
      const linkView = data.link_view;
      const linkId = data.link_id;
      const linkBtn = linkView
        ? `<button class="cw-tool-link" data-link-view="${escHtml(linkView)}" data-link-id="${escHtml(linkId || '')}">열기 →</button>`
        : '';
      // 보고서면 다운로드 버튼
      const reportBtn = data.report
        ? `<button class="cw-tool-link" data-dl-report="${escHtml(data.report.user_name || '')}_${escHtml(data.report.date_from)}_${escHtml(data.report.date_to)}">📥 다운로드</button>`
        : '';
      return `<div class="${cls}"><span class="cw-tool-icon">${icon}</span><span class="cw-tool-label">${escHtml(label)}</span>${linkBtn}${reportBtn}</div>`;
    }).join('');
    return `<div class="cw-tool-results">${cards}</div>`;
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
