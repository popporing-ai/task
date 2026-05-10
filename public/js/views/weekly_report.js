// 주간보고 (자동 활동 리포트) 뷰
// — 사용자별, 기간별 업무 활동을 자동 집계하여 한눈에 보여줌
const WeeklyReportView = {
  _periodFrom: null,   // 'YYYY-MM-DD'
  _periodTo:   null,
  _userId:     null,   // 조회 대상 (admin만 변경 가능)
  _data:       null,
  _isAdmin:    false,
  _activeSection: 'completed', // completed | in_progress | content | comments | issues

  // 진입
  render() {
    this._isAdmin = App.user.role === 'admin';
    if (!this._userId) this._userId = App.user.id;
    if (!this._periodFrom || !this._periodTo) {
      const ws = this._getWeekStart(new Date());
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      this._periodFrom = this._fmtDate(ws);
      this._periodTo   = this._fmtDate(we);
    }

    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = `
      <button class="btn btn-default" id="btn-wr-copy" title="텍스트로 복사">📋 텍스트 복사</button>
      <button class="btn btn-default" id="btn-wr-print" title="인쇄/PDF 저장">🖨 인쇄</button>
    `;
    document.getElementById('btn-wr-copy').addEventListener('click', () => this._copyAsText());
    document.getElementById('btn-wr-print').addEventListener('click', () => window.print());

    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="wr2-toolbar">
        <div class="wr2-period-presets" id="wr2-presets"></div>
        <div class="wr2-period-custom">
          <input type="date" id="wr2-from" value="${escHtml(this._periodFrom)}">
          <span style="color:var(--color-text-muted);font-size:12px;">~</span>
          <input type="date" id="wr2-to" value="${escHtml(this._periodTo)}">
          <button class="btn btn-primary" id="wr2-apply">적용</button>
        </div>
        ${this._isAdmin ? `
          <div class="wr2-user-select">
            <label style="font-size:12px;color:var(--color-text-muted);">담당자</label>
            <select id="wr2-user-select">
              ${App.users.map(u =>
                `<option value="${u.id}" ${u.id == this._userId ? 'selected' : ''}>${escHtml(u.name)}</option>`
              ).join('')}
            </select>
          </div>` : ''}
      </div>
      <div id="wr2-body">
        <div class="loading-state"><div class="loading-spinner"></div><span>불러오는 중...</span></div>
      </div>
    `;

    this._renderPresetButtons();
    this._bindToolbarEvents();
    this._loadData();
  },

  _renderPresetButtons() {
    const wrap = document.getElementById('wr2-presets');
    if (!wrap) return;
    const today = new Date();
    const ws = this._getWeekStart(today);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    const lws = new Date(ws); lws.setDate(lws.getDate() - 7);
    const lwe = new Date(lws); lwe.setDate(lwe.getDate() + 6);
    const monStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monEnd   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const lmStart  = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lmEnd    = new Date(today.getFullYear(), today.getMonth(), 0);
    const qStart   = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
    const qEnd     = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 + 3, 0);

    const presets = [
      { label: '이번 주', from: this._fmtDate(ws),    to: this._fmtDate(we) },
      { label: '지난 주', from: this._fmtDate(lws),   to: this._fmtDate(lwe) },
      { label: '이번 달', from: this._fmtDate(monStart), to: this._fmtDate(monEnd) },
      { label: '지난 달', from: this._fmtDate(lmStart),  to: this._fmtDate(lmEnd) },
      { label: '이번 분기', from: this._fmtDate(qStart), to: this._fmtDate(qEnd) },
    ];

    wrap.innerHTML = presets.map(p => {
      const isActive = (this._periodFrom === p.from && this._periodTo === p.to);
      return `<button class="wr2-preset-btn ${isActive ? 'active' : ''}"
                data-from="${p.from}" data-to="${p.to}">${p.label}</button>`;
    }).join('');

    wrap.querySelectorAll('.wr2-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._periodFrom = btn.dataset.from;
        this._periodTo   = btn.dataset.to;
        document.getElementById('wr2-from').value = this._periodFrom;
        document.getElementById('wr2-to').value   = this._periodTo;
        this._renderPresetButtons();
        this._bindToolbarEvents();
        this._loadData();
      });
    });
  },

  _bindToolbarEvents() {
    const apply = document.getElementById('wr2-apply');
    if (apply) {
      apply.onclick = () => {
        const f = document.getElementById('wr2-from').value;
        const t = document.getElementById('wr2-to').value;
        if (!f || !t) { App.toast('기간을 입력해주세요', 'error'); return; }
        if (f > t) { App.toast('시작일이 종료일보다 늦습니다', 'error'); return; }
        this._periodFrom = f;
        this._periodTo   = t;
        this._renderPresetButtons();
        this._bindToolbarEvents();
        this._loadData();
      };
    }
    const sel = document.getElementById('wr2-user-select');
    if (sel) {
      sel.onchange = () => {
        this._userId = parseInt(sel.value);
        this._loadData();
      };
    }
  },

  async _loadData() {
    const body = document.getElementById('wr2-body');
    if (!body) return;
    body.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';
    try {
      const url = `/weekly-reports/activity?user_id=${this._userId}&date_from=${this._periodFrom}&date_to=${this._periodTo}`;
      const res = await API.get(url);
      this._data = res.data;
      this._renderReport();
    } catch (e) {
      body.innerHTML = '<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">불러오기 실패</div></div>';
    }
  },

  _renderReport() {
    const body = document.getElementById('wr2-body');
    const d = this._data;
    if (!d) return;
    const s = d.summary;

    const periodLabel = this._formatPeriodLabel(d.period.from, d.period.to);

    body.innerHTML = `
      <div class="wr2-report">
        <!-- 헤더: 사용자 + 기간 -->
        <div class="wr2-report-header">
          <div class="wr2-user-block">
            <span class="avatar avatar-lg" style="background:${escHtml(d.user.avatar_bg||'#EEF1FD')};color:${escHtml(d.user.avatar_text||'#4F6EF7')};">${escHtml(d.user.name.charAt(0))}</span>
            <div>
              <div class="wr2-user-name">${escHtml(d.user.name)}</div>
              <div class="wr2-period">${escHtml(periodLabel)}</div>
            </div>
          </div>
          <div class="wr2-no-data-hint" style="${(s.tasks_completed + s.tasks_in_progress + s.content_published + s.comments_added) === 0 ? '' : 'display:none'}">
            이 기간에 기록된 활동이 없습니다.
          </div>
        </div>

        <!-- 요약 카드 -->
        <div class="wr2-summary-cards">
          ${this._summaryCard('완료',       s.tasks_completed, '건', '#5DD984')}
          ${this._summaryCard('진행 중',    s.tasks_in_progress, '건', '#7B9BFA')}
          ${this._summaryCard('미진행',     s.tasks_blocked,  '건', '#F07070')}
          ${this._summaryCard('콘텐츠 발행', s.content_published, '건', '#F5A94A')}
          ${this._summaryCard('댓글',       s.comments_added, '개', '#B08CF9')}
          ${this._summaryCard('획득 점수',  s.total_points,   'pt', '#4F6EF7')}
        </div>

        <!-- 상단 패널: 일별 활동 + 카테고리/타입 분포 -->
        <div class="wr2-charts-row">
          <div class="wr2-chart-card">
            <div class="wr2-chart-title">일별 완료 추이</div>
            ${this._renderDailyChart(d)}
          </div>
          <div class="wr2-chart-card">
            <div class="wr2-chart-title">분류별 완료</div>
            ${this._renderCategoryBars(d.by_category)}
          </div>
          <div class="wr2-chart-card">
            <div class="wr2-chart-title">업무 유형</div>
            ${this._renderWorkTypeBars(d.by_work_type)}
          </div>
        </div>

        <!-- 메인: 섹션 탭 + 상세 + 사이드 -->
        <div class="wr2-main-row">
          <div class="wr2-section-card">
            <div class="wr2-section-tabs">
              ${this._sectionTab('completed',  '완료',       d.completed_tasks.length)}
              ${this._sectionTab('in_progress', '진행/예정', d.in_progress_tasks.length)}
              ${this._sectionTab('content',    '콘텐츠',     d.content_items.length)}
              ${this._sectionTab('comments',   '댓글',       d.comments.length)}
              ${this._sectionTab('issues',     '이슈',       d.issues.length)}
            </div>
            <div class="wr2-section-body" id="wr2-section-body">
              ${this._renderSection(this._activeSection, d)}
            </div>
          </div>

          <aside class="wr2-side">
            <div class="wr2-side-card">
              <div class="wr2-side-title">다음 7일 예정 업무</div>
              ${this._renderUpcoming(d.upcoming_tasks)}
            </div>
            ${d.memo && (d.memo.this_week || d.memo.next_week || d.memo.issues) ? `
              <div class="wr2-side-card">
                <div class="wr2-side-title">기록된 메모</div>
                ${d.memo.this_week ? `<div class="wr2-memo-block"><div class="wr2-memo-label">이번 주 한 일</div><div class="wr2-memo-text">${escHtml(d.memo.this_week).replace(/\n/g,'<br>')}</div></div>` : ''}
                ${d.memo.next_week ? `<div class="wr2-memo-block"><div class="wr2-memo-label">다음 주 계획</div><div class="wr2-memo-text">${escHtml(d.memo.next_week).replace(/\n/g,'<br>')}</div></div>` : ''}
                ${d.memo.issues ? `<div class="wr2-memo-block"><div class="wr2-memo-label">이슈</div><div class="wr2-memo-text">${escHtml(d.memo.issues).replace(/\n/g,'<br>')}</div></div>` : ''}
              </div>
            ` : ''}
            ${this._userId === App.user.id ? `
              <div class="wr2-side-card">
                <div class="wr2-side-title">특이사항 메모 (선택)</div>
                <textarea id="wr2-memo-input" class="wr2-memo-textarea"
                  placeholder="자동 집계에 더하고 싶은 특이사항만 간단히 메모하세요.">${escHtml(d.memo?.issues || '')}</textarea>
                <button class="btn btn-default" id="wr2-memo-save" style="margin-top:8px;width:100%;">메모 저장</button>
              </div>` : ''}
          </aside>
        </div>
      </div>
    `;

    // 섹션 탭 이벤트
    body.querySelectorAll('.wr2-section-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._activeSection = tab.dataset.section;
        body.querySelectorAll('.wr2-section-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('wr2-section-body').innerHTML = this._renderSection(this._activeSection, d);
      });
    });

    // 메모 저장
    const memoSave = document.getElementById('wr2-memo-save');
    if (memoSave) {
      memoSave.addEventListener('click', () => this._saveMemo());
    }
  },

  // === 위젯 ===
  _summaryCard(label, value, unit, color) {
    return `
      <div class="wr2-sum-card">
        <div class="wr2-sum-label">${escHtml(label)}</div>
        <div class="wr2-sum-value" style="color:${color};">${value}<span class="wr2-sum-unit">${unit}</span></div>
      </div>`;
  },

  _sectionTab(key, label, count) {
    const active = this._activeSection === key ? 'active' : '';
    return `<button class="wr2-section-tab ${active}" data-section="${key}">
      ${escHtml(label)} <span class="wr2-tab-count">${count}</span>
    </button>`;
  },

  _renderSection(key, d) {
    if (key === 'completed')   return this._renderTaskList(d.completed_tasks, 'done', '완료된 업무가 없습니다');
    if (key === 'in_progress') return this._renderTaskList(d.in_progress_tasks, 'mixed', '진행 중인 업무가 없습니다');
    if (key === 'content')     return this._renderContentList(d.content_items);
    if (key === 'comments')    return this._renderCommentList(d.comments);
    if (key === 'issues')      return this._renderIssueList(d.issues);
    return '';
  },

  _renderTaskList(tasks, mode, emptyMsg) {
    if (!tasks.length) return `<div class="wr2-empty">${emptyMsg}</div>`;
    return `<table class="wr2-table">
      <thead><tr>
        <th>분류</th><th>업무</th>
        ${mode === 'mixed' ? '<th style="width:80px;">상태</th>' : ''}
        <th style="width:90px;">${mode === 'done' ? '완료일' : '마감일'}</th>
        <th style="width:60px;text-align:right;">점수</th>
      </tr></thead>
      <tbody>
        ${tasks.map(t => `
          <tr class="wr2-task-row" data-task-id="${t.id}">
            <td>${t.category_name ? `<span class="wr2-cat-chip" style="background:${escHtml(t.category_color || '#EEF1FD')}33;color:${escHtml(t.category_color || '#4F6EF7')};">${escHtml(t.category_name)}</span>` : '-'}</td>
            <td><span class="wr2-task-title">${escHtml(t.title)}</span>
              ${t.work_type && t.work_type !== 'regular' ? `<span class="wr2-wt-chip wr2-wt-${t.work_type}">${t.work_type === 'extra' ? '추가' : '프로젝트'}</span>` : ''}
            </td>
            ${mode === 'mixed' ? `<td>${App.statusBadge(t.status)}</td>` : ''}
            <td class="wr2-date-cell">${this._fmtShortDate(mode === 'done' ? t.updated_at : t.due_date)}</td>
            <td style="text-align:right;color:var(--color-text-muted);">${t.points || 0}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  },

  _renderContentList(items) {
    if (!items.length) return '<div class="wr2-empty">발행/예정된 콘텐츠가 없습니다</div>';
    const channelMap = { IG:'인스타', FB:'페북', LI:'링크드인', YT:'유튜브', BL:'블로그', EM:'이메일', HM:'홈페이지' };
    return `<table class="wr2-table">
      <thead><tr>
        <th style="width:80px;">채널</th>
        <th>콘텐츠</th>
        <th style="width:90px;">제품</th>
        <th style="width:90px;">발행일</th>
        <th style="width:60px;">상태</th>
      </tr></thead>
      <tbody>
        ${items.map(c => `
          <tr>
            <td><span class="wr2-channel-chip">${escHtml(channelMap[c.channel] || c.channel)}</span></td>
            <td>${c.publish_url ? `<a href="${escHtml(c.publish_url)}" target="_blank" class="wr2-link">${escHtml(c.title)}</a>` : escHtml(c.title)}</td>
            <td style="color:var(--color-text-muted);">${escHtml(c.product_name || '-')}</td>
            <td class="wr2-date-cell">${this._fmtShortDate(c.publish_date)}</td>
            <td>${c.status === 'done' ? '<span class="badge badge-done">발행</span>' : c.status === 'skipped' ? '<span class="badge badge-skip">미진행</span>' : '<span class="badge badge-plan">예정</span>'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  },

  _renderCommentList(items) {
    if (!items.length) return '<div class="wr2-empty">기간 내 작성한 댓글이 없습니다</div>';
    return items.map(c => `
      <div class="wr2-comment-item">
        <div class="wr2-comment-task">↳ ${escHtml(c.task_title)}</div>
        <div class="wr2-comment-text">${escHtml(c.content).replace(/\n/g,'<br>')}</div>
        <div class="wr2-comment-time">${this._fmtDateTime(c.created_at)}</div>
      </div>
    `).join('');
  },

  _renderIssueList(items) {
    if (!items.length) return '<div class="wr2-empty">기간 내 보고한 이슈가 없습니다</div>';
    const typeLabels = { delay:'지연', blocking:'블로킹', resource:'리소스', external:'외부 대기', technical:'기술', other:'기타' };
    return items.map(i => `
      <div class="wr2-issue-item wr2-issue-${i.status}">
        <div class="wr2-issue-head">
          <span class="wr2-issue-type-chip">${escHtml(typeLabels[i.issue_type] || i.issue_type)}</span>
          <span class="wr2-issue-task">${escHtml(i.task_title)}</span>
          <span class="wr2-issue-status badge ${i.status === 'resolved' ? 'badge-done' : 'badge-plan'}">${i.status === 'resolved' ? '해결' : i.status === 'in_progress' ? '진행' : '미해결'}</span>
        </div>
        <div class="wr2-issue-desc">${escHtml(i.description)}</div>
        <div class="wr2-issue-time">${this._fmtDateTime(i.created_at)}</div>
      </div>
    `).join('');
  },

  _renderUpcoming(items) {
    if (!items.length) return '<div class="wr2-side-empty">예정된 업무가 없습니다</div>';
    return items.map(t => `
      <div class="wr2-upcoming-item">
        <span class="wr2-upcoming-date">${this._fmtShortDate(t.due_date)}</span>
        <span class="wr2-upcoming-title">${escHtml(t.title)}</span>
        ${t.category_name ? `<span class="wr2-upcoming-cat" style="background:${escHtml(t.category_color || '#EEF1FD')}33;color:${escHtml(t.category_color || '#4F6EF7')};">${escHtml(t.category_name)}</span>` : ''}
      </div>
    `).join('');
  },

  _renderDailyChart(d) {
    // 기간 전체 일자 배열 생성 → 일별 완료 카운트 매핑
    const from = new Date(d.period.from);
    const to   = new Date(d.period.to);
    const days = [];
    const dt = new Date(from);
    while (dt <= to) {
      days.push(this._fmtDate(dt));
      dt.setDate(dt.getDate() + 1);
    }
    if (days.length > 60) {
      // 60일 초과 시 주 단위로 묶음
      return '<div class="wr2-empty">기간이 너무 길어 차트를 생략합니다</div>';
    }

    const map = {};
    (d.daily_activity || []).forEach(r => {
      const dateStr = (typeof r.date === 'string') ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
      map[dateStr] = r.count;
    });
    const counts = days.map(day => map[day] || 0);
    const max = Math.max(...counts, 1);

    if (counts.every(v => v === 0)) {
      return '<div class="wr2-empty">완료된 업무가 없습니다</div>';
    }

    const W = 380, H = 90, padL = 22, padB = 16;
    const innerW = W - padL - 4;
    const innerH = H - padB;
    const stepX = days.length > 1 ? innerW / (days.length - 1) : innerW;
    const points = counts.map((v, i) => ({
      x: padL + i * stepX,
      y: innerH - (v / max) * (innerH - 4) + 2,
      v, label: days[i],
    }));
    const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const dots = points.map(p => `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${p.v > 0 ? '#5DD984' : 'var(--color-bg-secondary)'}" stroke="var(--color-bg-primary)" stroke-width="1.5">
        <title>${p.label}: ${p.v}건</title>
      </circle>`).join('');
    const labelStep = Math.max(1, Math.floor(days.length / 7));
    const xLabels = points.filter((_, i) => i % labelStep === 0 || i === days.length - 1).map(p => {
      const dd = new Date(p.label);
      return `<text x="${p.x.toFixed(1)}" y="${H}" text-anchor="middle" font-size="8" fill="var(--color-text-muted)">${dd.getMonth()+1}/${dd.getDate()}</text>`;
    }).join('');
    const yLabels = `<text x="2" y="${(2).toFixed(1)}" font-size="9" fill="var(--color-text-muted)" dominant-baseline="hanging">${max}</text>
      <text x="2" y="${(innerH).toFixed(1)}" font-size="9" fill="var(--color-text-muted)">0</text>`;

    return `<svg viewBox="0 0 ${W} ${H + 4}" style="width:100%;overflow:visible;">
      ${yLabels}
      <polyline points="${polyline}" fill="none" stroke="#5DD984" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${xLabels}
    </svg>`;
  },

  _renderCategoryBars(items) {
    if (!items?.length) return '<div class="wr2-empty">완료된 업무가 없습니다</div>';
    const max = Math.max(...items.map(i => i.count), 1);
    return items.map(i => `
      <div class="wr2-bar-row">
        <span class="wr2-bar-label">${escHtml(i.name)}</span>
        <div class="wr2-bar-track">
          <div class="wr2-bar-fill" style="width:${(i.count/max*100).toFixed(0)}%;background:${escHtml(i.color || '#4F6EF7')};"></div>
        </div>
        <span class="wr2-bar-count">${i.count}</span>
      </div>
    `).join('');
  },

  _renderWorkTypeBars(items) {
    if (!items?.length) return '<div class="wr2-empty">완료된 업무가 없습니다</div>';
    const labelMap = { regular: '정규', extra: '추가', project: '프로젝트' };
    const colorMap = { regular: '#4F6EF7', extra: '#F5A623', project: '#9B59B6' };
    const total = items.reduce((s, i) => s + i.count, 0);
    return items.map(i => {
      const pct = total > 0 ? (i.count / total * 100) : 0;
      return `
        <div class="wr2-bar-row">
          <span class="wr2-bar-label">${escHtml(labelMap[i.work_type] || i.work_type)}</span>
          <div class="wr2-bar-track">
            <div class="wr2-bar-fill" style="width:${pct.toFixed(0)}%;background:${colorMap[i.work_type] || '#4F6EF7'};"></div>
          </div>
          <span class="wr2-bar-count">${i.count} <span style="color:var(--color-text-hint);">(${pct.toFixed(0)}%)</span></span>
        </div>
      `;
    }).join('');
  },

  // === 기능 ===
  async _saveMemo() {
    const memo = document.getElementById('wr2-memo-input')?.value || '';
    const ws = this._getWeekStart(new Date(this._periodFrom));
    try {
      await API.post('/weekly-reports', {
        week_start: this._fmtDate(ws),
        this_week: this._data?.memo?.this_week || '',
        next_week: this._data?.memo?.next_week || '',
        issues: memo,
      });
      App.toast('메모가 저장되었습니다', 'success');
    } catch {
      App.toast('저장에 실패했습니다', 'error');
    }
  },

  async _copyAsText() {
    const d = this._data;
    if (!d) return;
    const period = this._formatPeriodLabel(d.period.from, d.period.to);
    const lines = [];
    lines.push(`📊 ${d.user.name} 활동 리포트 — ${period}`);
    lines.push('');
    lines.push('【요약】');
    lines.push(`완료 ${d.summary.tasks_completed}건 / 진행 중 ${d.summary.tasks_in_progress}건 / 미진행 ${d.summary.tasks_blocked}건`);
    lines.push(`콘텐츠 발행 ${d.summary.content_published}건 / 댓글 ${d.summary.comments_added}개 / 점수 ${d.summary.total_points}pt`);
    lines.push('');

    if (d.completed_tasks.length) {
      lines.push('✅ 완료한 업무');
      d.completed_tasks.forEach(t => {
        const cat = t.category_name ? `[${t.category_name}] ` : '';
        lines.push(`  - ${cat}${t.title}${t.points ? ` (${t.points}pt)` : ''}`);
      });
      lines.push('');
    }

    if (d.in_progress_tasks.length) {
      lines.push('🔄 진행 중 / 예정');
      d.in_progress_tasks.forEach(t => {
        const cat = t.category_name ? `[${t.category_name}] ` : '';
        const due = t.due_date ? ` (마감 ${this._fmtShortDate(t.due_date)})` : '';
        lines.push(`  - ${cat}${t.title}${due}`);
      });
      lines.push('');
    }

    if (d.content_items.length) {
      lines.push('📢 콘텐츠');
      d.content_items.forEach(c => {
        lines.push(`  - [${c.channel}] ${c.title}${c.publish_date ? ` (${this._fmtShortDate(c.publish_date)})` : ''}`);
      });
      lines.push('');
    }

    if (d.issues.length) {
      lines.push('⚠ 이슈');
      d.issues.forEach(i => {
        lines.push(`  - ${i.task_title}: ${i.description}`);
      });
      lines.push('');
    }

    if (d.upcoming_tasks.length) {
      lines.push('📅 다음 7일 예정');
      d.upcoming_tasks.forEach(t => {
        lines.push(`  - ${this._fmtShortDate(t.due_date)} ${t.title}`);
      });
    }

    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      App.toast('리포트 텍스트가 클립보드에 복사되었습니다', 'success');
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); App.toast('복사되었습니다', 'success'); } catch { App.toast('복사 실패', 'error'); }
      ta.remove();
    }
  },

  // === 유틸 ===
  _getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  _fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  },

  _fmtShortDate(s) {
    if (!s) return '-';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '-';
    return `${d.getMonth() + 1}/${d.getDate()}`;
  },

  _fmtDateTime(s) {
    if (!s) return '';
    const d = new Date(s);
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },

  _formatPeriodLabel(from, to) {
    const f = new Date(from);
    const t = new Date(to);
    return `${f.getFullYear()}.${String(f.getMonth()+1).padStart(2,'0')}.${String(f.getDate()).padStart(2,'0')} ~ ${t.getFullYear()}.${String(t.getMonth()+1).padStart(2,'0')}.${String(t.getDate()).padStart(2,'0')}`;
  },
};
