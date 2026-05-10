// 팀 활동 뷰 (구 주간보고)
// — 3개 탭: 팀 매트릭스 / 활동 피드 / 개인 상세
// — admin: 매트릭스 기본 진입, 행 클릭 → 개인 상세
// — user: 본인 개인 상세만 진입
// — 작성 입력 화면 일체 없음. 완전 자동 집계.
const WeeklyReportView = {
  // 상태
  _isAdmin: false,
  _activeTab: 'matrix',          // matrix | feed | personal
  _periodFrom: null,             // 'YYYY-MM-DD'
  _periodTo:   null,
  _periodPreset: 'week',         // week | month | quarter | custom
  _selectedUserId: null,         // 개인 상세 대상
  _matrixData: null,
  _feedData: null,
  _personalData: null,
  _aiSummary: null,
  _aiLoading: false,
  _feedFilter: 'all',            // 활동 피드 이벤트 타입 필터

  render() {
    this._isAdmin = App.user.role === 'admin';
    if (!this._selectedUserId) this._selectedUserId = App.user.id;
    if (!this._periodFrom || !this._periodTo) this._applyPreset('week');
    if (!this._isAdmin) this._activeTab = 'personal';

    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = `
      <button class="btn btn-default" id="ta-copy" title="텍스트로 복사">📋 복사</button>
      <button class="btn btn-default" id="ta-print" title="인쇄/PDF">🖨 인쇄</button>
    `;
    document.getElementById('ta-copy').addEventListener('click', () => this._copyAsText());
    document.getElementById('ta-print').addEventListener('click', () => window.print());

    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="ta-toolbar">
        <div class="ta-presets" id="ta-presets"></div>
        <div class="ta-period-custom">
          <input type="date" id="ta-from" value="${escHtml(this._periodFrom)}">
          <span style="color:var(--color-text-muted);font-size:12px;">~</span>
          <input type="date" id="ta-to" value="${escHtml(this._periodTo)}">
          <button class="btn btn-primary" id="ta-apply">적용</button>
        </div>
      </div>
      ${this._isAdmin ? `
        <div class="ta-tabs">
          <button class="ta-tab ${this._activeTab==='matrix'?'active':''}" data-tab="matrix">팀 매트릭스</button>
          <button class="ta-tab ${this._activeTab==='feed'?'active':''}" data-tab="feed">활동 피드</button>
          <button class="ta-tab ${this._activeTab==='personal'?'active':''}" data-tab="personal">개인 상세</button>
        </div>
      ` : ''}
      <div id="ta-body"><div class="loading-state"><div class="loading-spinner"></div></div></div>
    `;
    this._renderPresets();
    this._bindToolbar();
    if (this._isAdmin) {
      content.querySelectorAll('.ta-tab').forEach(t => {
        t.addEventListener('click', () => { this._activeTab = t.dataset.tab; this.render(); });
      });
    }
    this._loadActiveTab();
  },

  // ─── 기간 프리셋 ───
  _applyPreset(preset) {
    const today = new Date();
    let from, to;
    if (preset === 'last_week') {
      const ws = this._getWeekStart(today); ws.setDate(ws.getDate() - 7);
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      from = ws; to = we;
    } else if (preset === 'month') {
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      to   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (preset === 'last_month') {
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      to   = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (preset === 'quarter') {
      const q = Math.floor(today.getMonth() / 3) * 3;
      from = new Date(today.getFullYear(), q, 1);
      to   = new Date(today.getFullYear(), q + 3, 0);
    } else { // week
      from = this._getWeekStart(today);
      to   = new Date(from); to.setDate(to.getDate() + 6);
    }
    this._periodFrom = this._fmtDate(from);
    this._periodTo   = this._fmtDate(to);
    this._periodPreset = preset;
  },

  _renderPresets() {
    const wrap = document.getElementById('ta-presets');
    if (!wrap) return;
    const presets = [
      { key: 'week',       label: '이번 주' },
      { key: 'last_week',  label: '지난 주' },
      { key: 'month',      label: '이번 달' },
      { key: 'last_month', label: '지난 달' },
      { key: 'quarter',    label: '이번 분기' },
    ];
    wrap.innerHTML = presets.map(p => `
      <button class="ta-preset-btn ${this._periodPreset===p.key?'active':''}" data-preset="${p.key}">${p.label}</button>
    `).join('');
    wrap.querySelectorAll('.ta-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._applyPreset(btn.dataset.preset);
        document.getElementById('ta-from').value = this._periodFrom;
        document.getElementById('ta-to').value   = this._periodTo;
        this._renderPresets();
        this._loadActiveTab();
      });
    });
  },

  _bindToolbar() {
    document.getElementById('ta-apply').addEventListener('click', () => {
      const f = document.getElementById('ta-from').value;
      const t = document.getElementById('ta-to').value;
      if (!f || !t) { App.toast('기간을 입력해주세요', 'error'); return; }
      if (f > t) { App.toast('시작일이 종료일보다 늦습니다', 'error'); return; }
      this._periodFrom = f; this._periodTo = t; this._periodPreset = 'custom';
      this._renderPresets();
      this._loadActiveTab();
    });
  },

  _loadActiveTab() {
    if (this._activeTab === 'matrix') this._loadMatrix();
    else if (this._activeTab === 'feed') this._loadFeed();
    else this._loadPersonal();
  },

  // ───────── 1. 팀 매트릭스 ─────────
  async _loadMatrix() {
    const body = document.getElementById('ta-body');
    body.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';
    try {
      const url = `/team-activity/team-matrix?date_from=${this._periodFrom}&date_to=${this._periodTo}`;
      const res = await API.get(url);
      this._matrixData = res.data || [];
      this._renderMatrix();
    } catch (e) {
      body.innerHTML = '<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">불러오기 실패</div></div>';
    }
  },

  _renderMatrix() {
    const body = document.getElementById('ta-body');
    const users = this._matrixData || [];

    // 팀 합계 카드
    const totals = users.reduce((acc, u) => {
      acc.done += u.done_count;
      acc.in_progress += u.in_progress_count;
      acc.blocked += u.blocked_count;
      acc.overdue += u.overdue_count;
      acc.content += u.content_done;
      acc.points += u.total_points;
      return acc;
    }, { done: 0, in_progress: 0, blocked: 0, overdue: 0, content: 0, points: 0 });

    body.innerHTML = `
      <div class="ta-team-totals">
        ${this._totalCard('완료',       totals.done, '#5DD984')}
        ${this._totalCard('진행 중',    totals.in_progress, '#7B9BFA')}
        ${this._totalCard('미진행',     totals.blocked, '#F07070')}
        ${this._totalCard('지연',       totals.overdue, '#F5A94A')}
        ${this._totalCard('콘텐츠',     totals.content, '#B08CF9')}
        ${this._totalCard('총 점수',    totals.points, '#4F6EF7', 'pt')}
      </div>

      <div class="ta-matrix-card">
        <table class="ta-matrix-table">
          <thead>
            <tr>
              <th class="sticky-l">담당자</th>
              <th>완료</th>
              <th>진행</th>
              <th>미진행</th>
              <th>지연</th>
              <th>콘텐츠</th>
              <th>댓글</th>
              <th>점수</th>
              <th>일별 추이</th>
              <th>최근 활동</th>
            </tr>
          </thead>
          <tbody>
            ${users.length === 0 ? `<tr><td colspan="10" class="ta-empty">활성 사용자가 없습니다</td></tr>` : ''}
            ${users.map(u => `
              <tr class="ta-matrix-row" data-user-id="${u.id}">
                <td class="sticky-l">
                  <div class="ta-user-cell">
                    <span class="avatar avatar-sm" style="background:${escHtml(u.avatar_bg||'#EEF1FD')};color:${escHtml(u.avatar_text||'#4F6EF7')};">${escHtml(u.name.charAt(0))}</span>
                    <span class="ta-user-name">${escHtml(u.name)}</span>
                  </div>
                </td>
                <td class="ta-num" style="color:#5DD984;font-weight:600;">${u.done_count}</td>
                <td class="ta-num">${u.in_progress_count}</td>
                <td class="ta-num" style="color:${u.blocked_count > 0 ? '#F07070' : 'var(--color-text-muted)'};">${u.blocked_count}</td>
                <td class="ta-num" style="color:${u.overdue_count > 0 ? '#F5A94A' : 'var(--color-text-muted)'};">${u.overdue_count}</td>
                <td class="ta-num">${u.content_done}<span class="ta-num-sub">/${u.content_total}</span></td>
                <td class="ta-num" style="color:var(--color-text-muted);">${u.comment_count}</td>
                <td class="ta-num" style="font-weight:600;">${u.total_points}</td>
                <td>${this._sparkline(u.sparkline)}</td>
                <td class="ta-last-act">${u.last_activity_at ? this._timeAgo(u.last_activity_at) : '<span style="color:var(--color-text-hint);">-</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="ta-hint">행을 클릭하면 그 담당자의 상세 활동을 볼 수 있습니다.</div>
    `;

    body.querySelectorAll('.ta-matrix-row').forEach(row => {
      row.addEventListener('click', () => {
        this._selectedUserId = parseInt(row.dataset.userId);
        this._activeTab = 'personal';
        this.render();
      });
    });
  },

  _totalCard(label, value, color, unit) {
    return `<div class="ta-total-card">
      <div class="ta-total-label">${escHtml(label)}</div>
      <div class="ta-total-value" style="color:${color};">${value}${unit ? `<span class="ta-total-unit">${unit}</span>` : ''}</div>
    </div>`;
  },

  _sparkline(arr) {
    if (!arr || !arr.length) return '<span style="color:var(--color-text-hint);font-size:11px;">-</span>';
    const max = Math.max(...arr, 1);
    const W = 80, H = 22;
    const stepX = arr.length > 1 ? W / (arr.length - 1) : W;
    const points = arr.map((v, i) => {
      const x = i * stepX;
      const y = H - (v / max) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const total = arr.reduce((a, b) => a + b, 0);
    return `<svg viewBox="0 0 ${W} ${H}" style="width:${W}px;height:${H}px;display:block;" aria-label="일별 완료 ${total}건">
      <polyline points="${points}" fill="none" stroke="#5DD984" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${arr.map((v, i) => v > 0 ? `<circle cx="${(i*stepX).toFixed(1)}" cy="${(H - (v/max)*(H-4) - 2).toFixed(1)}" r="1.5" fill="#5DD984"/>` : '').join('')}
    </svg>`;
  },

  // ───────── 2. 활동 피드 ─────────
  async _loadFeed() {
    const body = document.getElementById('ta-body');
    body.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';
    try {
      const url = `/team-activity/activity-feed?date_from=${this._periodFrom}&date_to=${this._periodTo}&limit=300`;
      const res = await API.get(url);
      this._feedData = res.data || [];
      this._renderFeed();
    } catch (e) {
      body.innerHTML = '<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">불러오기 실패</div></div>';
    }
  },

  _renderFeed() {
    const body = document.getElementById('ta-body');
    const all = this._feedData || [];

    // 필터
    const filtered = this._feedFilter === 'all' ? all : all.filter(e => e.event_type === this._feedFilter);

    // 일자별 그룹
    const byDate = {};
    filtered.forEach(e => {
      const d = new Date(e.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      (byDate[key] = byDate[key] || []).push(e);
    });
    const dateKeys = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    const filterTypes = [
      { key: 'all',               label: '전체',     count: all.length },
      { key: 'task_completed',    label: '✅ 완료',   count: all.filter(e => e.event_type==='task_completed').length },
      { key: 'task_created',      label: '🆕 생성',   count: all.filter(e => e.event_type==='task_created').length },
      { key: 'content_published', label: '📢 발행',   count: all.filter(e => e.event_type==='content_published').length },
      { key: 'comment_added',     label: '💬 댓글',   count: all.filter(e => e.event_type==='comment_added').length },
      { key: 'issue_reported',    label: '⚠ 이슈',   count: all.filter(e => e.event_type==='issue_reported').length },
    ];

    body.innerHTML = `
      <div class="ta-feed-filters">
        ${filterTypes.map(f => `
          <button class="ta-feed-filter-btn ${this._feedFilter===f.key?'active':''}" data-filter="${f.key}">
            ${escHtml(f.label)} <span class="ta-feed-filter-count">${f.count}</span>
          </button>
        `).join('')}
      </div>
      <div class="ta-feed-card">
        ${dateKeys.length === 0 ? '<div class="ta-empty">기간 내 활동이 없습니다</div>' : dateKeys.map(date => `
          <div class="ta-feed-date-group">
            <div class="ta-feed-date-label">${this._fmtDateHeader(date)}</div>
            ${byDate[date].map(e => this._renderFeedEvent(e)).join('')}
          </div>
        `).join('')}
      </div>
    `;

    body.querySelectorAll('.ta-feed-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._feedFilter = btn.dataset.filter;
        this._renderFeed();
      });
    });
    body.querySelectorAll('.ta-feed-event').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.linkView;
        if (view) App.navigate(view);
      });
    });
  },

  _renderFeedEvent(e) {
    const iconMap = {
      task_completed:    { i: '✓', c: '#5DD984', t: '완료' },
      task_created:      { i: '+', c: '#7B9BFA', t: '생성' },
      content_published: { i: '📢', c: '#B08CF9', t: '발행' },
      content_created:   { i: '○', c: '#B08CF9', t: '예정' },
      comment_added:     { i: '💬', c: '#9A9BA3', t: '댓글' },
      issue_reported:    { i: '⚠', c: '#F07070', t: '이슈' },
    };
    const icon = iconMap[e.event_type] || iconMap.task_created;
    const time = new Date(e.created_at);
    const tStr = `${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;
    const channel = e.event_type.startsWith('content_') && e.extra_text ? `[${e.extra_text}] ` : '';
    return `
      <div class="ta-feed-event" data-link-view="${escHtml(e.link_view || '')}" data-link-id="${escHtml(e.link_id || '')}">
        <span class="ta-feed-time">${tStr}</span>
        <span class="ta-feed-icon" style="background:${icon.c}22;color:${icon.c};">${icon.i}</span>
        <span class="avatar avatar-sm" style="background:${escHtml(e.avatar_bg)};color:${escHtml(e.avatar_text)};">${escHtml((e.user_name||'?').charAt(0))}</span>
        <span class="ta-feed-user">${escHtml(e.user_name || '시스템')}</span>
        <span class="ta-feed-action" style="color:${icon.c};">${icon.t}</span>
        <span class="ta-feed-title">${channel}${escHtml(e.title || '')}</span>
        ${e.extra_text && !e.event_type.startsWith('content_') ? `<span class="ta-feed-extra">${escHtml(e.extra_text).slice(0, 100)}</span>` : ''}
      </div>
    `;
  },

  // ───────── 3. 개인 상세 ─────────
  async _loadPersonal() {
    const body = document.getElementById('ta-body');
    body.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';
    this._aiSummary = null;
    try {
      const url = `/weekly-reports/activity?user_id=${this._selectedUserId}&date_from=${this._periodFrom}&date_to=${this._periodTo}`;
      const res = await API.get(url);
      this._personalData = res.data;
      this._renderPersonal();
    } catch (e) {
      body.innerHTML = '<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">불러오기 실패</div></div>';
    }
  },

  _renderPersonal() {
    const body = document.getElementById('ta-body');
    const d = this._personalData;
    if (!d) return;
    const s = d.summary;
    const periodLabel = this._formatPeriodLabel(d.period.from, d.period.to);
    const userSelector = this._isAdmin ? `
      <select id="ta-user-select" class="ta-user-select-inline">
        ${App.users.map(u =>
          `<option value="${u.id}" ${u.id == this._selectedUserId ? 'selected' : ''}>${escHtml(u.name)}</option>`
        ).join('')}
      </select>
    ` : '';

    body.innerHTML = `
      <div class="ta-personal">
        <div class="ta-person-header">
          <div class="ta-user-block">
            <span class="avatar avatar-lg" style="background:${escHtml(d.user.avatar_bg||'#EEF1FD')};color:${escHtml(d.user.avatar_text||'#4F6EF7')};">${escHtml(d.user.name.charAt(0))}</span>
            <div>
              <div class="ta-user-name-lg">${escHtml(d.user.name)} ${userSelector}</div>
              <div class="ta-period-label">${escHtml(periodLabel)}</div>
            </div>
          </div>
          <button class="btn btn-primary" id="ta-ai-btn">
            <span id="ta-ai-icon">✨</span> <span id="ta-ai-text">AI 요약 생성</span>
          </button>
        </div>

        <div id="ta-ai-result"></div>

        <div class="ta-summary-cards">
          ${this._sumCard('완료',       s.tasks_completed, '건', '#5DD984')}
          ${this._sumCard('진행 중',    s.tasks_in_progress, '건', '#7B9BFA')}
          ${this._sumCard('미진행',     s.tasks_blocked,  '건', '#F07070')}
          ${this._sumCard('콘텐츠 발행', s.content_published, '건', '#F5A94A')}
          ${this._sumCard('댓글',       s.comments_added, '개', '#B08CF9')}
          ${this._sumCard('획득 점수',  s.total_points,   'pt', '#4F6EF7')}
        </div>

        <div class="ta-charts-row">
          <div class="ta-chart-card">
            <div class="ta-chart-title">일별 완료 추이</div>
            ${this._renderDailyChart(d)}
          </div>
          <div class="ta-chart-card">
            <div class="ta-chart-title">분류별 완료</div>
            ${this._renderBars(d.by_category)}
          </div>
          <div class="ta-chart-card">
            <div class="ta-chart-title">업무 유형</div>
            ${this._renderWorkTypeBars(d.by_work_type)}
          </div>
        </div>

        <div class="ta-section-grid">
          ${this._panel('✅ 완료한 업무', this._renderTaskList(d.completed_tasks, 'done', '완료된 업무가 없습니다'))}
          ${this._panel('🔄 진행 중 / 예정', this._renderTaskList(d.in_progress_tasks, 'mixed', '진행 중인 업무가 없습니다'))}
          ${this._panel('📢 콘텐츠', this._renderContentList(d.content_items))}
          ${this._panel('⚠ 이슈', this._renderIssueList(d.issues))}
          ${this._panel('💬 작성한 코멘트 <span class="ta-panel-hint">(task에 남긴 댓글이 자동으로 모입니다)</span>', this._renderCommentList(d.comments))}
          ${this._panel('📅 다음 7일 예정', this._renderUpcomingList(d.upcoming_tasks))}
        </div>
      </div>
    `;

    // user 셀렉트 변경
    const userSel = document.getElementById('ta-user-select');
    if (userSel) {
      userSel.addEventListener('change', () => {
        this._selectedUserId = parseInt(userSel.value);
        this._loadPersonal();
      });
    }

    // AI 요약 버튼
    document.getElementById('ta-ai-btn').addEventListener('click', () => this._requestAISummary());
  },

  _sumCard(label, value, unit, color) {
    return `<div class="ta-sum-card">
      <div class="ta-sum-label">${escHtml(label)}</div>
      <div class="ta-sum-value" style="color:${color};">${value}<span class="ta-sum-unit">${unit}</span></div>
    </div>`;
  },

  _panel(title, html) {
    return `<div class="ta-panel">
      <div class="ta-panel-title">${title}</div>
      <div class="ta-panel-body">${html}</div>
    </div>`;
  },

  _renderTaskList(tasks, mode, emptyMsg) {
    if (!tasks?.length) return `<div class="ta-empty">${emptyMsg}</div>`;
    return `<table class="ta-mini-table"><thead><tr>
      <th>분류</th><th>업무</th>
      ${mode==='mixed' ? '<th style="width:64px;">상태</th>' : ''}
      <th style="width:64px;">${mode==='done' ? '완료' : '마감'}</th>
      <th style="width:42px;text-align:right;">점수</th>
    </tr></thead><tbody>
      ${tasks.map(t => `<tr>
        <td>${t.category_name ? `<span class="ta-cat-chip" style="background:${escHtml(t.category_color||'#EEF1FD')}33;color:${escHtml(t.category_color||'#4F6EF7')};">${escHtml(t.category_name)}</span>` : '-'}</td>
        <td>${escHtml(t.title)}${t.work_type && t.work_type!=='regular' ? ` <span class="ta-wt-chip ta-wt-${t.work_type}">${t.work_type==='extra'?'추가':'프로젝트'}</span>` : ''}</td>
        ${mode==='mixed' ? `<td>${App.statusBadge(t.status)}</td>` : ''}
        <td class="ta-mini-date">${this._fmtShortDate(mode==='done' ? t.updated_at : t.due_date)}</td>
        <td style="text-align:right;color:var(--color-text-muted);">${t.points || 0}</td>
      </tr>`).join('')}
    </tbody></table>`;
  },

  _renderContentList(items) {
    if (!items?.length) return '<div class="ta-empty">콘텐츠가 없습니다</div>';
    const channelMap = { IG:'인스타', FB:'페북', LI:'링크드인', YT:'유튜브', BL:'블로그', EM:'이메일', HM:'홈페이지' };
    return items.map(c => `
      <div class="ta-content-item">
        <span class="ta-channel-chip">${escHtml(channelMap[c.channel] || c.channel)}</span>
        ${c.publish_url ? `<a href="${escHtml(c.publish_url)}" target="_blank" class="ta-link">${escHtml(c.title)}</a>` : `<span>${escHtml(c.title)}</span>`}
        <span class="ta-content-meta">${escHtml(c.product_name || '')} · ${this._fmtShortDate(c.publish_date)} · ${c.status==='done'?'발행':c.status==='skipped'?'미진행':'예정'}</span>
      </div>
    `).join('');
  },

  _renderIssueList(items) {
    if (!items?.length) return '<div class="ta-empty">보고된 이슈가 없습니다</div>';
    const typeLabels = { delay:'지연', blocking:'블로킹', resource:'리소스', external:'외부', technical:'기술', other:'기타' };
    return items.map(i => `
      <div class="ta-issue-item ta-issue-${i.status}">
        <div class="ta-issue-head">
          <span class="ta-issue-chip">${escHtml(typeLabels[i.issue_type] || i.issue_type)}</span>
          <span class="ta-issue-task">${escHtml(i.task_title)}</span>
          <span class="ta-issue-status ${i.status==='resolved' ? 'ta-resolved' : ''}">${i.status==='resolved'?'해결':i.status==='in_progress'?'진행':'미해결'}</span>
        </div>
        <div class="ta-issue-desc">${escHtml(i.description)}</div>
      </div>
    `).join('');
  },

  _renderCommentList(items) {
    if (!items?.length) return '<div class="ta-empty">작성한 코멘트가 없습니다</div>';
    return items.slice(0, 15).map(c => `
      <div class="ta-comment-item">
        <div class="ta-comment-task">↳ ${escHtml(c.task_title)}</div>
        <div class="ta-comment-text">${escHtml(c.content).replace(/\n/g,'<br>')}</div>
        <div class="ta-comment-time">${this._fmtDateTime(c.created_at)}</div>
      </div>
    `).join('');
  },

  _renderUpcomingList(items) {
    if (!items?.length) return '<div class="ta-empty">다음 주 예정 업무 없음</div>';
    return items.map(t => `
      <div class="ta-upcoming-item">
        <span class="ta-upcoming-date">${this._fmtShortDate(t.due_date)}</span>
        <span class="ta-upcoming-title">${escHtml(t.title)}</span>
        ${t.category_name ? `<span class="ta-cat-chip" style="background:${escHtml(t.category_color||'#EEF1FD')}33;color:${escHtml(t.category_color||'#4F6EF7')};">${escHtml(t.category_name)}</span>` : ''}
      </div>
    `).join('');
  },

  _renderDailyChart(d) {
    const from = new Date(d.period.from);
    const to   = new Date(d.period.to);
    const days = [];
    const dt = new Date(from);
    while (dt <= to) { days.push(this._fmtDate(dt)); dt.setDate(dt.getDate() + 1); }
    if (days.length > 60) return '<div class="ta-empty">기간이 너무 길어 차트 생략</div>';

    const map = {};
    (d.daily_activity || []).forEach(r => {
      const ds = (typeof r.date === 'string') ? r.date.slice(0,10) : new Date(r.date).toISOString().slice(0,10);
      map[ds] = r.count;
    });
    const counts = days.map(day => map[day] || 0);
    const max = Math.max(...counts, 1);
    if (counts.every(v => v === 0)) return '<div class="ta-empty">완료된 업무가 없습니다</div>';

    const W = 380, H = 90, padL = 22, padB = 16;
    const innerW = W - padL - 4, innerH = H - padB;
    const stepX = days.length > 1 ? innerW / (days.length - 1) : innerW;
    const points = counts.map((v, i) => ({
      x: padL + i * stepX,
      y: innerH - (v / max) * (innerH - 4) + 2,
      v, label: days[i],
    }));
    const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const dots = points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${p.v>0?'#5DD984':'var(--color-bg-secondary)'}" stroke="var(--color-bg-primary)" stroke-width="1.5"><title>${p.label}: ${p.v}건</title></circle>`).join('');
    const labelStep = Math.max(1, Math.floor(days.length / 7));
    const xLabels = points.filter((_, i) => i % labelStep === 0 || i === days.length - 1).map(p => {
      const dd = new Date(p.label);
      return `<text x="${p.x.toFixed(1)}" y="${H}" text-anchor="middle" font-size="8" fill="var(--color-text-muted)">${dd.getMonth()+1}/${dd.getDate()}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H+4}" style="width:100%;overflow:visible;">
      <text x="2" y="6" font-size="9" fill="var(--color-text-muted)" dominant-baseline="hanging">${max}</text>
      <text x="2" y="${innerH.toFixed(1)}" font-size="9" fill="var(--color-text-muted)">0</text>
      <polyline points="${polyline}" fill="none" stroke="#5DD984" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}${xLabels}
    </svg>`;
  },

  _renderBars(items) {
    if (!items?.length) return '<div class="ta-empty">완료된 업무가 없습니다</div>';
    const max = Math.max(...items.map(i => i.count), 1);
    return items.map(i => `
      <div class="ta-bar-row">
        <span class="ta-bar-label">${escHtml(i.name)}</span>
        <div class="ta-bar-track"><div class="ta-bar-fill" style="width:${(i.count/max*100).toFixed(0)}%;background:${escHtml(i.color || '#4F6EF7')};"></div></div>
        <span class="ta-bar-count">${i.count}</span>
      </div>
    `).join('');
  },

  _renderWorkTypeBars(items) {
    if (!items?.length) return '<div class="ta-empty">완료된 업무가 없습니다</div>';
    const labelMap = { regular: '정규', extra: '추가', project: '프로젝트' };
    const colorMap = { regular: '#4F6EF7', extra: '#F5A623', project: '#9B59B6' };
    const total = items.reduce((s, i) => s + i.count, 0);
    return items.map(i => {
      const pct = total > 0 ? (i.count / total * 100) : 0;
      return `<div class="ta-bar-row">
        <span class="ta-bar-label">${escHtml(labelMap[i.work_type] || i.work_type)}</span>
        <div class="ta-bar-track"><div class="ta-bar-fill" style="width:${pct.toFixed(0)}%;background:${colorMap[i.work_type] || '#4F6EF7'};"></div></div>
        <span class="ta-bar-count">${i.count} <span style="color:var(--color-text-hint);">(${pct.toFixed(0)}%)</span></span>
      </div>`;
    }).join('');
  },

  // ───────── AI 요약 ─────────
  async _requestAISummary() {
    if (this._aiLoading) return;
    const btn = document.getElementById('ta-ai-btn');
    const result = document.getElementById('ta-ai-result');
    if (!btn || !result) return;
    this._aiLoading = true;
    btn.disabled = true;
    document.getElementById('ta-ai-text').textContent = '생성 중...';
    document.getElementById('ta-ai-icon').textContent = '⏳';
    result.innerHTML = '<div class="ta-ai-loading"><div class="loading-spinner"></div><span>AI가 활동을 요약하고 있습니다...</span></div>';

    try {
      const res = await API.post('/team-activity/ai-summary', {
        user_id: this._selectedUserId,
        date_from: this._periodFrom,
        date_to: this._periodTo,
      });
      const summary = res.data?.summary || '';
      this._aiSummary = summary;
      result.innerHTML = `
        <div class="ta-ai-card">
          <div class="ta-ai-header">
            <span class="ta-ai-badge">✨ AI 요약</span>
            <span class="ta-ai-model">${escHtml(res.data?.model || '')}</span>
            <button class="ta-ai-copy-btn" id="ta-ai-copy-btn">복사</button>
          </div>
          <div class="ta-ai-text">${escHtml(summary).replace(/\n/g, '<br>')}</div>
        </div>
      `;
      document.getElementById('ta-ai-copy-btn').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(summary);
          App.toast('AI 요약이 복사되었습니다', 'success');
        } catch { App.toast('복사 실패', 'error'); }
      });
    } catch (e) {
      const msg = e.message || 'AI 요약 생성 실패';
      result.innerHTML = `<div class="ta-ai-error">⚠ ${escHtml(msg)}<br><span style="font-size:11px;color:var(--color-text-muted);">서버 환경변수 LLM_API_URL, LLM_MODEL 설정을 확인하세요.</span></div>`;
    } finally {
      this._aiLoading = false;
      btn.disabled = false;
      document.getElementById('ta-ai-text').textContent = 'AI 요약 생성';
      document.getElementById('ta-ai-icon').textContent = '✨';
    }
  },

  // ───────── 텍스트 복사 ─────────
  async _copyAsText() {
    if (this._activeTab === 'matrix' && this._matrixData) {
      const lines = [];
      lines.push(`📊 팀 매트릭스 — ${this._formatPeriodLabel(this._periodFrom, this._periodTo)}`);
      lines.push('');
      this._matrixData.forEach(u => {
        lines.push(`▸ ${u.name}: 완료 ${u.done_count} / 진행 ${u.in_progress_count} / 미진행 ${u.blocked_count} / 지연 ${u.overdue_count} / 콘텐츠 ${u.content_done} / ${u.total_points}pt`);
      });
      await this._copyText(lines.join('\n'));
      return;
    }
    if (this._activeTab === 'feed' && this._feedData) {
      const lines = [`📜 활동 피드 — ${this._formatPeriodLabel(this._periodFrom, this._periodTo)}`, ''];
      this._feedData.slice(0, 100).forEach(e => {
        const t = new Date(e.created_at);
        lines.push(`${t.getMonth()+1}/${t.getDate()} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')} ${e.user_name} — ${e.event_type}: ${e.title || ''}`);
      });
      await this._copyText(lines.join('\n'));
      return;
    }
    // personal
    const d = this._personalData;
    if (!d) return;
    const lines = [];
    lines.push(`📊 ${d.user.name} 활동 리포트 — ${this._formatPeriodLabel(d.period.from, d.period.to)}`);
    lines.push('');
    if (this._aiSummary) {
      lines.push('【AI 요약】');
      lines.push(this._aiSummary);
      lines.push('');
    }
    lines.push('【요약】');
    lines.push(`완료 ${d.summary.tasks_completed}건 / 진행 ${d.summary.tasks_in_progress}건 / 미진행 ${d.summary.tasks_blocked}건 / 콘텐츠 ${d.summary.content_published}건 / ${d.summary.total_points}pt`);
    lines.push('');
    if (d.completed_tasks.length) {
      lines.push('✅ 완료');
      d.completed_tasks.forEach(t => lines.push(`  - ${t.category_name?`[${t.category_name}] `:''}${t.title}${t.points?` (${t.points}pt)`:''}`));
      lines.push('');
    }
    if (d.in_progress_tasks.length) {
      lines.push('🔄 진행/예정');
      d.in_progress_tasks.forEach(t => lines.push(`  - ${t.category_name?`[${t.category_name}] `:''}${t.title}${t.due_date?` (마감 ${this._fmtShortDate(t.due_date)})`:''}`));
      lines.push('');
    }
    if (d.content_items.length) {
      lines.push('📢 콘텐츠');
      d.content_items.forEach(c => lines.push(`  - [${c.channel}] ${c.title}`));
      lines.push('');
    }
    if (d.issues.length) {
      lines.push('⚠ 이슈');
      d.issues.forEach(i => lines.push(`  - ${i.task_title}: ${i.description}`));
    }
    await this._copyText(lines.join('\n'));
  },

  async _copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      App.toast('클립보드에 복사되었습니다', 'success');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); App.toast('복사되었습니다', 'success'); } catch { App.toast('복사 실패', 'error'); }
      ta.remove();
    }
  },

  // ───────── 유틸 ─────────
  _getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0,0,0,0);
    return d;
  },
  _fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  _fmtShortDate(s) {
    if (!s) return '-';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '-';
    return `${d.getMonth()+1}/${d.getDate()}`;
  },
  _fmtDateTime(s) {
    if (!s) return '';
    const d = new Date(s);
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },
  _fmtDateHeader(dateStr) {
    const d = new Date(dateStr);
    const today = new Date(); today.setHours(0,0,0,0);
    const yest = new Date(today); yest.setDate(yest.getDate() - 1);
    if (this._fmtDate(d) === this._fmtDate(today)) return '오늘';
    if (this._fmtDate(d) === this._fmtDate(yest))  return '어제';
    const days = ['일','월','화','수','목','금','토'];
    return `${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
  },
  _formatPeriodLabel(from, to) {
    const f = new Date(from), t = new Date(to);
    return `${f.getFullYear()}.${String(f.getMonth()+1).padStart(2,'0')}.${String(f.getDate()).padStart(2,'0')} ~ ${t.getFullYear()}.${String(t.getMonth()+1).padStart(2,'0')}.${String(t.getDate()).padStart(2,'0')}`;
  },
  _timeAgo(s) {
    if (!s) return '';
    const diff = Math.floor((Date.now() - new Date(s).getTime()) / 1000);
    if (diff < 60) return `${diff}초 전`;
    if (diff < 3600) return `${Math.floor(diff/60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
    if (diff < 7*86400) return `${Math.floor(diff/86400)}일 전`;
    return new Date(s).toLocaleDateString('ko-KR');
  },
};
