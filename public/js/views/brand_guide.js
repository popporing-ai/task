// 브랜드 메시지 가이드 뷰
// 저장 규칙: 각 필드는 '## 제목' 줄로 구역을 나눈다.
//  - 메시지 방향, 대외 커뮤니케이션 규칙: 구역 아래 각 줄이 항목(불릿)
//  - 표기 사전(notation): 구역 아래 첫 줄이 헤더, 이후 각 줄이 '|'로 나뉜 행
//  - AI 지침 원문: 구역 아래 본문을 원문 그대로(복사용)
const BrandGuideView = {
  currentGuide: null,
  history: [],
  viewingVersion: null,
  _copyTexts: [], // 복사 버튼 payload (인덱스로 참조, HTML 이스케이프 회피)

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

  // -- 파서 ---
  // '## 제목' 기준으로 구역 분리. 반환: [{ title, body }]
  _splitSections(text) {
    if (!text) return [];
    const out = [];
    let cur = null;
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\s+$/, '');
      const m = line.match(/^##\s+(.*)$/);
      if (m) {
        cur = { title: m[1].trim(), lines: [] };
        out.push(cur);
      } else if (cur) {
        cur.lines.push(line);
      }
    }
    return out.map(s => ({ title: s.title, body: s.lines.join('\n').trim(), lines: s.lines.map(l => l.trim()).filter(Boolean) }));
  },

  // 표 파서: 구역별 { title, header:[], rows:[[]] }. 첫 줄이 헤더, '|'로 나눔.
  _parseTables(text) {
    return this._splitSections(text).map(sec => {
      const rowLines = sec.lines;
      if (!rowLines.length) return { title: sec.title, header: [], rows: [] };
      const header = rowLines[0].split('|').map(c => c.trim());
      const rows = rowLines.slice(1).map(l => {
        const cells = l.split('|').map(c => c.trim());
        while (cells.length < header.length) cells.push('');
        return cells.slice(0, header.length);
      });
      return { title: sec.title, header, rows };
    });
  },

  // 복사 버튼 등록 -> 인덱스 반환
  _copyBtn(text, label) {
    const idx = this._copyTexts.push(text) - 1;
    return `<button class="bg-copy" data-copy-idx="${idx}" title="복사">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" stroke-width="1.3"/></svg>
      ${label || '복사'}
    </button>`;
  },

  renderGuide(content) {
    const guide = this.viewingVersion || this.currentGuide;
    const isAdmin = App.user?.role === 'admin';
    const isViewingPast = this.viewingVersion && this.currentGuide && this.viewingVersion.id !== this.currentGuide.id;
    this._copyTexts = [];
    this._editable = isAdmin && !isViewingPast; // 현재 버전만 인라인 편집

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
    const historyOptions = this.history.map(h => {
      const d = h.effective_date ? new Date(h.effective_date).toLocaleDateString('ko-KR') : '';
      const label = `v${escHtml(h.version)}${d ? ' (' + d + ')' : ''}${h.is_current ? ' - 현재' : ''}`;
      return `<option value="${h.id}" ${h.id === guide.id ? 'selected' : ''}>${label}</option>`;
    }).join('');

    content.innerHTML = `
      <div class="brand-guide-wrap">
        <div class="brand-guide-header">
          <div class="brand-guide-header-left">
            <span class="brand-guide-version-badge">v${escHtml(guide.version)}</span>
            ${isViewingPast ? '<span class="brand-guide-past-badge">과거 버전</span>' : '<span class="brand-guide-current-badge">현재 버전</span>'}
            <span class="brand-guide-date">${effectiveDate} 시행</span>
          </div>
          <div class="brand-guide-header-right">
            <select class="brand-guide-history-select" id="guide-version-select">${historyOptions}</select>
          </div>
        </div>

        ${guide.title ? `<h2 class="brand-guide-title">${escHtml(guide.title)}</h2>` : ''}
        ${guide.change_note ? `<p class="brand-guide-change-note">${escHtml(guide.change_note)}</p>` : ''}

        ${this._sloganHtml(guide.slogan)}
        ${this._groupsSectionHtml('메시지 방향', guide.message_direction, 'message_direction')}
        ${this._groupsSectionHtml('대외 커뮤니케이션 규칙', guide.comms_rules, 'comms_rules')}
        ${this._notationHtml(guide.notation, 'notation')}
        ${this._aiHtml(guide.ai_instructions, 'ai_instructions')}
      </div>
    `;

    this._bindEvents(guide);
  },

  // 카드 액션 묶음: 복사 + (편집 가능 시) 수정, 삭제
  _cardActions(field, idx, copyText, copyLabel) {
    let h = this._copyBtn(copyText, copyLabel);
    if (this._editable) {
      h += `<button class="bg-mini" data-edit-sec data-field="${field}" data-idx="${idx}" title="수정">수정</button>`;
      h += `<button class="bg-mini bg-mini-danger" data-del-sec data-field="${field}" data-idx="${idx}" title="삭제">삭제</button>`;
    }
    return `<div class="bg-card-actions">${h}</div>`;
  },

  _addBtn(field, label) {
    return this._editable ? `<button class="btn btn-default bg-add-btn" data-add-field="${field}">+ ${escHtml(label)}</button>` : '';
  },

  _sloganHtml(slogan) {
    if (!slogan && !this._editable) return '';
    return `
      <div class="bg-section">
        <div class="bg-section-head"><span class="bg-section-label">슬로건</span></div>
        <div class="bg-slogan-card">
          <span class="bg-slogan-text">${escHtml(slogan || '')}</span>
          <div class="bg-card-actions">
            ${slogan ? this._copyBtn(slogan) : ''}
            ${this._editable ? '<button class="bg-mini" data-edit-slogan title="수정">수정</button>' : ''}
          </div>
        </div>
      </div>
    `;
  },

  _groupsSectionHtml(label, text, field) {
    const secs = this._splitSections(text);
    if (!secs.length && !this._editable) return '';
    const cards = secs.map((s, idx) => {
      const copyText = `${s.title}\n` + s.lines.map(l => `- ${l}`).join('\n');
      const bullets = s.lines.map(l => `<li>${escHtml(l)}</li>`).join('');
      return `
        <div class="bg-group">
          <div class="bg-group-head">
            <span class="bg-group-title">${escHtml(s.title)}</span>
            ${this._cardActions(field, idx, copyText)}
          </div>
          <ul class="bg-bullets">${bullets}</ul>
        </div>
      `;
    }).join('');
    return `
      <div class="bg-section">
        <div class="bg-section-head">
          <span class="bg-section-label">${escHtml(label)}</span>
          <div class="bg-section-actions">${this._addBtn(field, '구역 추가')}</div>
        </div>
        <div class="bg-group-grid">${cards}</div>
      </div>
    `;
  },

  _notationHtml(text, field) {
    const tables = this._parseTables(text);
    if (!tables.length && !this._editable) return '';
    const cards = tables.map((t, idx) => {
      const copyText = `${t.title}\n${t.header.join('\t')}\n` + t.rows.map(r => r.join('\t')).join('\n');
      const thead = `<tr>${t.header.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr>`;
      const tbody = t.rows.map(r => `<tr>${r.map((c, i) => `<td class="${i === 0 ? 'bg-td-key' : ''}">${escHtml(c)}</td>`).join('')}</tr>`).join('');
      return `
        <div class="bg-group">
          <div class="bg-group-head">
            <span class="bg-group-title">${escHtml(t.title)}</span>
            ${this._cardActions(field, idx, copyText)}
          </div>
          <div class="bg-table-scroll">
            <table class="bg-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>
          </div>
        </div>
      `;
    }).join('');
    return `
      <div class="bg-section">
        <div class="bg-section-head">
          <span class="bg-section-label">표기 사전</span>
          <span class="bg-section-hint">맞는 표기와 자주 틀리는 표기를 구역별 표로 정리했습니다</span>
          <div class="bg-section-actions">${this._addBtn(field, '표 추가')}</div>
        </div>
        <div class="bg-group-grid">${cards}</div>
      </div>
    `;
  },

  _aiHtml(text, field) {
    const blocks = this._splitSections(text);
    if (!blocks.length && !this._editable) return '';
    const fullText = blocks.map(b => `## ${b.title}\n${b.body}`).join('\n\n');
    const blockHtml = blocks.map((b, idx) => `
      <div class="bg-ai-block">
        <div class="bg-group-head">
          <span class="bg-group-title">${escHtml(b.title)}</span>
          ${this._cardActions(field, idx, b.body, '이 구역 복사')}
        </div>
        <pre class="bg-ai-text">${escHtml(b.body)}</pre>
      </div>
    `).join('');
    return `
      <div class="bg-section">
        <div class="bg-section-head">
          <span class="bg-section-label">AI 지침 원문</span>
          <span class="bg-section-hint">클로드코드 등 AI 작업 첫머리에 붙여 쓰는 용도입니다</span>
          <div class="bg-section-actions">
            ${blocks.length ? this._copyBtn(fullText, '전체 복사') : ''}
            ${this._addBtn(field, '구역 추가')}
            ${blocks.length ? `<button class="btn btn-default bg-ai-toggle" id="bg-ai-toggle">${this._editable ? '구역 접기' : '구역 펼치기'}</button>` : ''}
          </div>
        </div>
        <div class="bg-ai-blocks" id="bg-ai-blocks" style="display:${this._editable ? 'block' : 'none'};">${blockHtml}</div>
      </div>
    `;
  },

  // -- 구역 raw 조작 (## 블록 단위) ---
  _rawSections(text) {
    const out = [];
    let cur = null;
    for (const line of (text || '').split('\n')) {
      if (/^##\s+/.test(line)) { cur = [line]; out.push(cur); }
      else if (cur) cur.push(line);
    }
    return out.map(a => a.join('\n').replace(/\s+$/, ''));
  },

  _joinSections(arr) {
    return arr.map(s => s.trim()).filter(Boolean).join('\n\n');
  },

  _ensureHeading(t) {
    const s = (t || '').trim();
    if (!s) return '';
    return /^##\s+/.test(s.split('\n')[0]) ? s : ('## 제목\n' + s);
  },

  async _saveField(field, value) {
    try {
      await API.put(`/brand-guide/${this.currentGuide.id}`, { [field]: value });
      App.toast('수정되었습니다.', 'success');
      await this.loadData();
      this.viewingVersion = null;
      this.renderGuide(document.getElementById('content'));
    } catch (e) {
      App.toast(e.message || '수정에 실패했습니다.', 'error');
    }
  },

  _sectionEditHint(field) {
    if (field === 'notation') {
      return '첫 줄은 <b>## 표 제목</b>, 둘째 줄은 헤더, 이후 각 줄을 <b>|</b> 로 칸을 나눕니다. 예: <code>콘텐츠 | 컨텐츠 | 비고</code>';
    }
    if (field === 'ai_instructions') {
      return '첫 줄은 <b>## 구역 제목</b>, 이후는 원문 그대로 씁니다.';
    }
    return '첫 줄은 <b>## 구역 제목</b>, 이후 한 줄에 항목 하나씩 씁니다.';
  },

  _openSectionEditor(title, field, initial, onValue) {
    const html = `
      <p class="bg-form-hint">${this._sectionEditHint(field)}</p>
      <div class="form-group">
        <textarea id="bg-sec-ta" rows="16" style="font-family:inherit;">${escHtml(initial)}</textarea>
      </div>
    `;
    App.openPanel(title, html, async () => {
      const v = this._ensureHeading(document.getElementById('bg-sec-ta').value);
      if (!v) { App.toast('내용을 입력해주세요.', 'error'); return false; }
      await onValue(v);
    });
  },

  _editSection(field, idx) {
    const raw = this._rawSections(this.currentGuide[field]);
    this._openSectionEditor('구역 수정', field, raw[idx] || '', async (v) => {
      raw[idx] = v;
      await this._saveField(field, this._joinSections(raw));
    });
  },

  _addSection(field) {
    const template = field === 'notation'
      ? '## 새 표 제목\n맞는 표기 | 틀린 표기 | 비고\n예시 | 예시 | '
      : field === 'ai_instructions'
        ? '## 새 구역 제목\n내용을 입력하세요.'
        : '## 새 구역 제목\n첫 항목';
    this._openSectionEditor('구역 추가', field, template, async (v) => {
      const raw = this._rawSections(this.currentGuide[field]);
      raw.push(v);
      await this._saveField(field, this._joinSections(raw));
    });
  },

  async _deleteSection(field, idx) {
    const raw = this._rawSections(this.currentGuide[field]);
    const title = (raw[idx] || '').split('\n')[0].replace(/^##\s+/, '');
    const ok = await App.confirm(`"${title}" 구역을 삭제하시겠습니까?`);
    if (!ok) return;
    raw.splice(idx, 1);
    await this._saveField(field, this._joinSections(raw));
  },

  _editSlogan() {
    const html = `
      <div class="form-group">
        <label>슬로건</label>
        <input type="text" id="bg-slogan-inp" value="${escHtml(this.currentGuide.slogan || '')}" placeholder="제조·국방 피지컬 AI 기업, 버넥트">
      </div>
    `;
    App.openPanel('슬로건 수정', html, async () => {
      await this._saveField('slogan', document.getElementById('bg-slogan-inp').value.trim());
    });
  },

  _bindEvents(guide) {
    // 버전 셀렉트
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

    // 복사 버튼 (위임)
    document.querySelectorAll('.bg-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.copyIdx);
        this._copyText(this._copyTexts[idx] || '');
      });
    });

    // AI 구역 펼치기
    document.getElementById('bg-ai-toggle')?.addEventListener('click', () => {
      const box = document.getElementById('bg-ai-blocks');
      const btn = document.getElementById('bg-ai-toggle');
      const open = box.style.display !== 'none';
      box.style.display = open ? 'none' : 'block';
      btn.textContent = open ? '구역 펼치기' : '구역 접기';
    });

    if (!this._editable) return;

    // 구역 수정, 삭제, 추가, 슬로건 수정
    document.querySelectorAll('[data-edit-sec]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this._editSection(btn.dataset.field, parseInt(btn.dataset.idx)); });
    });
    document.querySelectorAll('[data-del-sec]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this._deleteSection(btn.dataset.field, parseInt(btn.dataset.idx)); });
    });
    document.querySelectorAll('[data-add-field]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this._addSection(btn.dataset.addField); });
    });
    document.querySelector('[data-edit-slogan]')?.addEventListener('click', (e) => { e.stopPropagation(); this._editSlogan(); });
  },

  _copyText(text) {
    if (!text) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(() => App.toast('복사되었습니다.', 'success'))
        .catch(() => this._fallbackCopy(text));
    } else {
      this._fallbackCopy(text);
    }
  },

  _fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); App.toast('복사되었습니다.', 'success'); }
    catch { App.toast('복사에 실패했습니다.', 'error'); }
    document.body.removeChild(ta);
  },

  // 새 버전 발행 폼
  openPublishForm() {
    const guide = this.currentGuide;
    let suggestedVersion = '1.0.0';
    if (guide && guide.version) {
      const parts = guide.version.split('.').map(Number);
      if (parts.length === 3) { parts[2] += 1; suggestedVersion = parts.join('.'); }
    }
    const today = new Date().toISOString().slice(0, 10);
    const g = guide || {};

    const formHtml = `
      <p class="bg-form-hint">
        각 칸은 <b>## 제목</b> 줄로 구역을 나눕니다. 메시지 방향과 규칙은 구역 아래 한 줄에 한 항목,
        표기 사전은 구역 아래 <b>첫 줄이 헤더</b>이고 이후 각 줄을 <b>|</b> 로 칸을 나눕니다. 예: <code>콘텐츠 | 컨텐츠 | 비고</code>
      </p>
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
        <input type="text" id="guide-title" value="${escHtml(g.title || '')}" placeholder="이번 버전의 제목">
      </div>
      <div class="form-group">
        <label>변경 요약</label>
        <input type="text" id="guide-change-note" placeholder="이번 변경 사항 한 줄 요약">
      </div>
      <div class="form-group">
        <label>슬로건</label>
        <textarea id="guide-slogan" rows="2" placeholder="제조·국방 피지컬 AI 기업, 버넥트">${escHtml(g.slogan || '')}</textarea>
      </div>
      <div class="form-group">
        <label>메시지 방향 (## 구역, 아래 줄마다 항목)</label>
        <textarea id="guide-message-direction" rows="8">${escHtml(g.message_direction || '')}</textarea>
      </div>
      <div class="form-group">
        <label>대외 커뮤니케이션 규칙 (## 구역, 아래 줄마다 항목)</label>
        <textarea id="guide-comms-rules" rows="8">${escHtml(g.comms_rules || '')}</textarea>
      </div>
      <div class="form-group">
        <label>표기 사전 (## 표제목, 첫 줄 헤더, 이후 | 로 칸 구분)</label>
        <textarea id="guide-notation" rows="10">${escHtml(g.notation || '')}</textarea>
      </div>
      <div class="form-group">
        <label>AI 지침 원문 (## 구역, 아래는 원문 그대로)</label>
        <textarea id="guide-ai-instructions" rows="12">${escHtml(g.ai_instructions || '')}</textarea>
      </div>
    `;

    App.openPanel('브랜드 가이드 발행', formHtml, async () => {
      const version = document.getElementById('guide-version').value.trim();
      if (!version) { App.toast('버전 번호를 입력해주세요.', 'error'); return false; }
      try {
        await API.post('/brand-guide', {
          version,
          effective_date: document.getElementById('guide-effective-date').value || null,
          title: document.getElementById('guide-title').value.trim() || null,
          change_note: document.getElementById('guide-change-note').value.trim() || null,
          slogan: document.getElementById('guide-slogan').value.trim() || null,
          message_direction: document.getElementById('guide-message-direction').value.trim() || null,
          comms_rules: document.getElementById('guide-comms-rules').value.trim() || null,
          notation: document.getElementById('guide-notation').value.trim() || null,
          ai_instructions: document.getElementById('guide-ai-instructions').value.trim() || null,
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
