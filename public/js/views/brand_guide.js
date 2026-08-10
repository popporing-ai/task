// 브랜드 메시지 가이드 뷰
const BrandGuideView = {
  currentGuide: null,
  history: [],
  viewingVersion: null, // 과거 버전 열람 중일 때

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    const isAdmin = App.user?.role === 'admin';

    if (isAdmin) {
      actions.innerHTML = '<button class="btn btn-primary" id="btn-publish-guide">+ 새 버전 발행</button>';
      document.getElementById('btn-publish-guide').addEventListener('click', () => this.openPublishForm());
    } else {
      actions.innerHTML = '';
    }

    content.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <span>브랜드 가이드 불러오는 중...</span>
      </div>
    `;

    await this.loadData();
    this.viewingVersion = null;
    this.renderGuide(content);
  },

  async loadData() {
    try {
      const [currentRes, historyRes] = await Promise.all([
        API.get('/brand-guide'),
        API.get('/brand-guide/history'),
      ]);
      this.currentGuide = currentRes.data;
      this.history = historyRes.data || [];
    } catch {
      this.currentGuide = null;
      this.history = [];
    }
  },

  renderGuide(content) {
    const guide = this.viewingVersion || this.currentGuide;
    const isAdmin = App.user?.role === 'admin';
    const isViewingPast = this.viewingVersion && this.currentGuide && this.viewingVersion.id !== this.currentGuide.id;

    if (!guide) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon-svg">
            <svg width="48" height="48" viewBox="0 0 16 16" fill="none"><path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1"/><path d="M5 8h6M5 11h4" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
          </div>
          <div class="empty-state-title">브랜드 메시지 가이드가 없습니다</div>
          <div class="empty-state-desc">관리자가 첫 버전을 발행해주세요</div>
          ${isAdmin ? '<div class="empty-state-action"><button class="btn btn-primary" id="empty-publish-guide">+ 새 버전 발행</button></div>' : ''}
        </div>
      `;
      content.querySelector('#empty-publish-guide')?.addEventListener('click', () => this.openPublishForm());
      return;
    }

    const effectiveDate = guide.effective_date ? new Date(guide.effective_date).toLocaleDateString('ko-KR') : '-';

    // 버전 히스토리 셀렉트 옵션
    const historyOptions = this.history.map(h => {
      const d = h.effective_date ? new Date(h.effective_date).toLocaleDateString('ko-KR') : '';
      const label = `v${escHtml(h.version)}${d ? ' (' + d + ')' : ''}${h.is_current ? ' - 현재' : ''}`;
      return `<option value="${h.id}" ${h.id === guide.id ? 'selected' : ''}>${label}</option>`;
    }).join('');

    content.innerHTML = `
      <div class="brand-guide-wrap">
        <!-- 헤더 -->
        <div class="brand-guide-header">
          <div class="brand-guide-header-left">
            <span class="brand-guide-version-badge">v${escHtml(guide.version)}</span>
            ${isViewingPast ? '<span class="brand-guide-past-badge">과거 버전</span>' : '<span class="brand-guide-current-badge">현재 버전</span>'}
            <span class="brand-guide-date">${effectiveDate} 시행</span>
          </div>
          <div class="brand-guide-header-right">
            <select class="brand-guide-history-select" id="guide-version-select">
              ${historyOptions}
            </select>
          </div>
        </div>

        ${guide.title ? `<h2 class="brand-guide-title">${escHtml(guide.title)}</h2>` : ''}
        ${guide.change_note ? `<p class="brand-guide-change-note">${escHtml(guide.change_note)}</p>` : ''}

        <!-- 메시지 요약 -->
        <div class="brand-guide-sections">
          ${guide.slogan ? `
          <div class="brand-guide-section">
            <div class="brand-guide-section-label">슬로건</div>
            <div class="brand-guide-section-body brand-guide-slogan">${escHtml(guide.slogan)}</div>
          </div>
          ` : ''}

          ${guide.message_direction ? `
          <div class="brand-guide-section">
            <div class="brand-guide-section-label">메시지 방향</div>
            <div class="brand-guide-section-body">${this._renderMultiline(guide.message_direction)}</div>
          </div>
          ` : ''}

          ${guide.comms_rules ? `
          <div class="brand-guide-section">
            <div class="brand-guide-section-label">대외 커뮤니케이션 규칙</div>
            <div class="brand-guide-section-body">${this._renderMultiline(guide.comms_rules)}</div>
          </div>
          ` : ''}
        </div>

        <!-- AI 지침 원문 (접기/펼치기) -->
        ${guide.ai_instructions ? `
        <div class="brand-guide-collapsible" id="ai-instructions-panel">
          <button class="brand-guide-collapsible-toggle" id="ai-instructions-toggle">
            <svg class="brand-guide-toggle-arrow" width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            AI 지침 원문
            <button class="btn brand-guide-copy-btn" id="ai-instructions-copy" title="클립보드에 복사">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" stroke-width="1.3"/></svg>
              복사
            </button>
          </button>
          <div class="brand-guide-collapsible-body" id="ai-instructions-body" style="display:none;">
            <pre class="brand-guide-ai-text">${escHtml(guide.ai_instructions)}</pre>
          </div>
        </div>
        ` : ''}
      </div>
    `;

    // 버전 셀렉트 이벤트
    document.getElementById('guide-version-select')?.addEventListener('change', async (e) => {
      const selectedId = e.target.value;
      if (!selectedId) return;
      try {
        const res = await API.get(`/brand-guide/${selectedId}`);
        this.viewingVersion = res.data;
        this.renderGuide(document.getElementById('content'));
      } catch {
        App.toast('버전 정보를 불러올 수 없습니다.', 'error');
      }
    });

    // 접기/펼치기 토글
    document.getElementById('ai-instructions-toggle')?.addEventListener('click', (e) => {
      // 복사 버튼 클릭은 무시
      if (e.target.closest('#ai-instructions-copy')) return;
      const body = document.getElementById('ai-instructions-body');
      const panel = document.getElementById('ai-instructions-panel');
      if (!body) return;
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      panel.classList.toggle('open', !isOpen);
    });

    // 클립보드 복사
    document.getElementById('ai-instructions-copy')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = guide.ai_instructions || '';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text)
          .then(() => App.toast('AI 지침이 클립보드에 복사되었습니다.', 'success'))
          .catch(() => this._fallbackCopy(text));
      } else {
        this._fallbackCopy(text);
      }
    });
  },

  // 줄바꿈이 있는 텍스트를 단락으로 렌더링
  _renderMultiline(text) {
    if (!text) return '';
    return text.split('\n').map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      return `<p>${escHtml(trimmed)}</p>`;
    }).join('');
  },

  // 폴백 복사
  _fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      App.toast('AI 지침이 클립보드에 복사되었습니다.', 'success');
    } catch {
      App.toast('복사에 실패했습니다.', 'error');
    }
    document.body.removeChild(ta);
  },

  // 새 버전 발행 폼 (슬라이드 패널)
  openPublishForm() {
    const guide = this.currentGuide;
    // 현재 버전 기반으로 다음 버전 번호 제안
    let suggestedVersion = '1.0.0';
    if (guide && guide.version) {
      const parts = guide.version.split('.').map(Number);
      if (parts.length === 3) {
        parts[2] += 1;
        suggestedVersion = parts.join('.');
      }
    }

    const today = new Date().toISOString().slice(0, 10);

    const formHtml = `
      <div class="form-group">
        <label>버전 번호 <span class="required">*</span></label>
        <input type="text" id="guide-version" value="${escHtml(suggestedVersion)}" placeholder="예: 1.1.0">
      </div>
      <div class="form-group">
        <label>시행일</label>
        <input type="date" id="guide-effective-date" value="${today}">
      </div>
      <div class="form-group">
        <label>제목</label>
        <input type="text" id="guide-title" placeholder="이번 버전의 제목" value="${guide ? escHtml(guide.title || '') : ''}">
      </div>
      <div class="form-group">
        <label>변경 요약</label>
        <input type="text" id="guide-change-note" placeholder="이번 변경 사항 한 줄 요약">
      </div>
      <div class="form-group">
        <label>슬로건</label>
        <textarea id="guide-slogan" rows="2" placeholder="브랜드 슬로건">${guide ? escHtml(guide.slogan || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label>메시지 방향</label>
        <textarea id="guide-message-direction" rows="6" placeholder="핵심 메시지 방향 (줄바꿈으로 구분)">${guide ? escHtml(guide.message_direction || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label>대외 커뮤니케이션 규칙</label>
        <textarea id="guide-comms-rules" rows="6" placeholder="톤, 금기어, 표현 규칙 등">${guide ? escHtml(guide.comms_rules || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label>AI 지침 원문</label>
        <textarea id="guide-ai-instructions" rows="10" placeholder="AI 시스템 프롬프트에 주입할 전체 지침">${guide ? escHtml(guide.ai_instructions || '') : ''}</textarea>
      </div>
    `;

    App.openPanel('브랜드 가이드 발행', formHtml, async () => {
      const version = document.getElementById('guide-version').value.trim();
      if (!version) {
        App.toast('버전 번호를 입력해주세요.', 'error');
        return false;
      }

      try {
        await API.post('/brand-guide', {
          version,
          effective_date: document.getElementById('guide-effective-date').value || null,
          title: document.getElementById('guide-title').value.trim() || null,
          slogan: document.getElementById('guide-slogan').value.trim() || null,
          message_direction: document.getElementById('guide-message-direction').value.trim() || null,
          comms_rules: document.getElementById('guide-comms-rules').value.trim() || null,
          ai_instructions: document.getElementById('guide-ai-instructions').value.trim() || null,
          change_note: document.getElementById('guide-change-note').value.trim() || null,
        });
        App.toast('새 브랜드 가이드 버전이 발행되었습니다.', 'success');
        await this.loadData();
        this.viewingVersion = null;
        this.renderGuide(document.getElementById('content'));
      } catch (e) {
        App.toast(e.message || '발행에 실패했습니다.', 'error');
        return false;
      }
    });
  },
};
