// 팀 활동 뷰 (구 주간보고)
// — 3개 탭: 팀 매트릭스 / 활동 피드 / 개인 상세
// — 실시간 반영: data-changed 이벤트 + 30초 폴링 + visibilitychange
// — AI 정리 도우미 (대화형 채팅)
const WeeklyReportView = {
  // 상태
  _isAdmin: false,
  _activeTab: 'matrix',
  _periodFrom: null,
  _periodTo:   null,
  _periodPreset: 'week',
  _selectedUserId: null,
  _matrixData: null,
  _feedData: null,
  _personalData: null,
  _aiLoading: false,
  _feedFilter: 'all',
  // 채팅
  _chatOpen: false,
  _chatMessages: [],
  _chatLoading: false,
  // 갱신 인프라
  _isActive: false,
  _pollTimer: null,
  _eventUnsub: null,
  _visHandler: null,
  _initialized: false,

  render() {
    this._isAdmin = App.user.role === 'admin';
    if (!this._selectedUserId) this._selectedUserId = App.user.id;
    if (!this._periodFrom || !this._periodTo) this._applyPreset('week');
    if (!this._isAdmin) this._activeTab = 'personal';

    this._setupAutoRefresh();

    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = `
      <button class="btn btn-default ta-mini-btn" id="ta-copy" title="텍스트로 복사">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="4" y="4" width="9" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M11 4V3a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1h1" stroke="currentColor" stroke-width="1.4"/></svg>
        복사
      </button>
      <button class="btn btn-default ta-mini-btn" id="ta-download" title="보고서 .md 다운로드">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v9m0 0l-3-3m3 3l3-3M3 14h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        보고서
      </button>
      <button class="btn btn-default ta-mini-btn" id="ta-print" title="인쇄/PDF">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 6V2h10v4M3 11H2v-3a2 2 0 012-2h8a2 2 0 012 2v3h-1M5 9h6v5H5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
        인쇄
      </button>
    `;
    document.getElementById('ta-copy').addEventListener('click', () => this._copyAsText());
    document.getElementById('ta-download').addEventListener('click', () => this._downloadReport());
    document.getElementById('ta-print').addEventListener('click', () => window.print());

    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="ta-toolbar">
        <div class="ta-presets" id="ta-presets"></div>
        <div class="ta-period-custom">
          <input type="date" id="ta-from" value="${escHtml(this._periodFrom)}">
          <span class="ta-period-sep">~</span>
          <input type="date" id="ta-to" value="${escHtml(this._periodTo)}">
          <button class="btn btn-primary ta-mini-btn" id="ta-apply">적용</button>
        </div>
        <div class="ta-live-indicator" title="자동 갱신 중">
          <span class="ta-live-dot"></span> 실시간
        </div>
      </div>
      ${this._isAdmin ? `
        <div class="ta-tabs">
          <button class="ta-tab ${this._activeTab==='matrix'?'active':''}" data-tab="matrix">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/></svg>
            팀 매트릭스
          </button>
          <button class="ta-tab ${this._activeTab==='feed'?'active':''}" data-tab="feed">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3h10M3 8h10M3 13h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
            활동 피드
          </button>
          <button class="ta-tab ${this._activeTab==='personal'?'active':''}" data-tab="personal">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
            개인 상세
          </button>
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

  // ─── 자동 갱신 인프라 ───
  _setupAutoRefresh() {
    this._isActive = true;
    if (this._initialized) return;
    this._initialized = true;

    // 1. 데이터 변경 이벤트 → 즉시 갱신 (디바운스 800ms)
    let debTimer = null;
    this._eventUnsub = App.events.on('data-changed', (ev) => {
      if (!this._isActive || App.currentView !== 'weekly-report') return;
      // 팀 활동에 영향 주는 entity만 처리
      const relevant = ['tasks', 'content', 'rrr'];
      if (!relevant.includes(ev.entity)) return;
      clearTimeout(debTimer);
      debTimer = setTimeout(() => this._silentRefresh(), 800);
    });

    // 2. 30초 폴링 (다른 사용자가 수정한 경우 반영)
    this._pollTimer = setInterval(() => {
      if (this._isActive && App.currentView === 'weekly-report' && document.visibilityState === 'visible') {
        this._silentRefresh();
      }
    }, 30000);

    // 3. 탭 visible 복귀 시 즉시 갱신
    this._visHandler = () => {
      if (document.visibilityState === 'visible' && this._isActive && App.currentView === 'weekly-report') {
        this._silentRefresh();
      }
    };
    document.addEventListener('visibilitychange', this._visHandler);

    // 4. 다른 뷰로 이동 시 _isActive=false
    App.events.on('view-changed', (view) => {
      this._isActive = (view === 'weekly-report');
    });
  },

  // 백그라운드 무음 갱신 (로딩 스피너 없이 활성 탭만 갱신)
  async _silentRefresh() {
    try {
      if (this._activeTab === 'matrix' && document.querySelector('.ta-matrix-table')) {
        const url = `/team-activity/team-matrix?date_from=${this._periodFrom}&date_to=${this._periodTo}`;
        const res = await API.get(url);
        this._matrixData = res.data || [];
        this._renderMatrix();
      } else if (this._activeTab === 'feed' && document.querySelector('.ta-feed-card')) {
        const url = `/team-activity/activity-feed?date_from=${this._periodFrom}&date_to=${this._periodTo}&limit=300`;
        const res = await API.get(url);
        this._feedData = res.data || [];
        this._renderFeed();
      } else if (this._activeTab === 'personal' && document.querySelector('.ta-personal')) {
        const url = `/weekly-reports/activity?user_id=${this._selectedUserId}&date_from=${this._periodFrom}&date_to=${this._periodTo}`;
        const res = await API.get(url);
        this._personalData = res.data;
        this._renderPersonal();
      }
    } catch {}
  },

  // ─── 기간 프리셋 ───
  _applyPreset(preset) {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    let from, to;
    if (preset === 'last_week') {
      const ws = this._getWeekStart(today); ws.setDate(ws.getDate() - 7);
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      from = ws; to = we;
    } else if (preset === 'month') {
      from = new Date(y, m, 1);
      to   = new Date(y, m + 1, 0);
    } else if (preset === 'last_month') {
      from = new Date(y, m - 1, 1);
      to   = new Date(y, m, 0);
    } else if (preset === 'quarter') {
      const q = Math.floor(m / 3) * 3;
      from = new Date(y, q, 1);
      to   = new Date(y, q + 3, 0);
    } else if (preset === 'h1') {
      // 상반기 (현재 H2이면 올해 H1, 현재 H1이면 작년 H2가 아닌 올해 H1 유지)
      from = new Date(y, 0, 1);  to = new Date(y, 5, 30);
    } else if (preset === 'h2') {
      from = new Date(y, 6, 1);  to = new Date(y, 11, 31);
    } else if (preset === 'current_half') {
      // 현재 반기 자동 판단
      if (m < 6) { from = new Date(y, 0, 1);  to = new Date(y, 5, 30); }
      else       { from = new Date(y, 6, 1);  to = new Date(y, 11, 31); }
    } else if (preset === 'year') {
      from = new Date(y, 0, 1); to = new Date(y, 11, 31);
    } else if (preset === 'last_year') {
      from = new Date(y - 1, 0, 1); to = new Date(y - 1, 11, 31);
    } else {
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
      { key: 'week',         label: '이번 주' },
      { key: 'last_week',    label: '지난 주' },
      { key: 'month',        label: '이번 달' },
      { key: 'last_month',   label: '지난 달' },
      { key: 'quarter',      label: '이번 분기' },
      { key: 'current_half', label: '이번 반기' },
      { key: 'year',         label: '올해' },
      { key: 'last_year',    label: '작년' },
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
      body.innerHTML = `<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">불러오기 실패</div><div class="empty-state-desc">${escHtml(e.message || '알 수 없는 오류')}</div></div>`;
    }
  },

  _renderMatrix() {
    const body = document.getElementById('ta-body');
    const users = this._matrixData || [];
    const totals = users.reduce((acc, u) => {
      acc.done += u.done_count; acc.in_progress += u.in_progress_count;
      acc.blocked += u.blocked_count; acc.overdue += u.overdue_count;
      acc.content += u.content_done; acc.points += u.total_points;
      return acc;
    }, { done: 0, in_progress: 0, blocked: 0, overdue: 0, content: 0, points: 0 });

    body.innerHTML = `
      <div class="ta-team-totals">
        ${this._totalCard('완료',    totals.done, '#5DD984')}
        ${this._totalCard('진행 중', totals.in_progress, '#7B9BFA')}
        ${this._totalCard('미진행',  totals.blocked, '#F07070')}
        ${this._totalCard('지연',    totals.overdue, '#F5A94A')}
        ${this._totalCard('콘텐츠',  totals.content, '#B08CF9')}
      </div>
      <div class="ta-matrix-card">
        <table class="ta-matrix-table">
          <thead>
            <tr>
              <th class="sticky-l">담당자</th>
              <th>완료</th><th>진행 중</th><th>미진행</th><th>지연</th>
              <th>콘텐츠</th><th>댓글</th>
              <th>일별 추이</th><th>최근 활동</th>
            </tr>
          </thead>
          <tbody>
            ${users.length === 0 ? `<tr><td colspan="9" class="ta-empty">활성 사용자가 없습니다</td></tr>` : ''}
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
    return `<svg viewBox="0 0 ${W} ${H}" style="width:${W}px;height:${H}px;display:block;">
      <polyline points="${points}" fill="none" stroke="#5DD984" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${arr.map((v, i) => v > 0 ? `<circle cx="${(i*stepX).toFixed(1)}" cy="${(H - (v/max)*(H-4) - 2).toFixed(1)}" r="1.5" fill="#5DD984"/>` : '').join('')}
      <title>일별 완료 ${total}건</title>
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
      body.innerHTML = `<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">불러오기 실패</div><div class="empty-state-desc">${escHtml(e.message || '')}</div></div>`;
    }
  },

  _renderFeed() {
    const body = document.getElementById('ta-body');
    const all = this._feedData || [];
    const filtered = this._feedFilter === 'all' ? all : all.filter(e => e.event_type === this._feedFilter);
    const byDate = {};
    filtered.forEach(e => {
      const d = new Date(e.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      (byDate[key] = byDate[key] || []).push(e);
    });
    const dateKeys = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    const filterTypes = [
      { key: 'all',               label: '전체' },
      { key: 'task_completed',    label: '완료' },
      { key: 'task_created',      label: '생성' },
      { key: 'content_published', label: '발행' },
      { key: 'comment_added',     label: '댓글' },
      { key: 'issue_reported',    label: '이슈' },
    ];

    body.innerHTML = `
      <div class="ta-feed-filters">
        ${filterTypes.map(f => {
          const cnt = f.key === 'all' ? all.length : all.filter(e => e.event_type === f.key).length;
          return `<button class="ta-feed-filter-btn ${this._feedFilter===f.key?'active':''}" data-filter="${f.key}">
            ${escHtml(f.label)} <span class="ta-feed-filter-count">${cnt}</span>
          </button>`;
        }).join('')}
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
      content_published: { i: '◉', c: '#B08CF9', t: '발행' },
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
    this._chatOpen = false;
    this._chatMessages = [];
    try {
      const url = `/weekly-reports/activity?user_id=${this._selectedUserId}&date_from=${this._periodFrom}&date_to=${this._periodTo}`;
      const res = await API.get(url);
      this._personalData = res.data;
      this._renderPersonal();
    } catch (e) {
      body.innerHTML = `<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">불러오기 실패</div><div class="empty-state-desc">${escHtml(e.message || '')}</div></div>`;
    }
  },

  _renderPersonal() {
    const body = document.getElementById('ta-body');
    const d = this._personalData;
    if (!d) return;
    const s = d.summary;
    const periodLabel = this._formatPeriodLabel(d.period.from, d.period.to);
    // admin 사용자는 셀렉트에서 제외 (팀원 위주 조회)
    const selectableUsers = App.users.filter(u => u.role !== 'admin' || u.id === this._selectedUserId);
    const userSelector = this._isAdmin ? `
      <select id="ta-user-select" class="ta-user-select-inline">
        ${selectableUsers.map(u => `<option value="${u.id}" ${u.id == this._selectedUserId ? 'selected' : ''}>${escHtml(u.name)}</option>`).join('')}
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
          <button class="btn btn-primary ta-ai-toggle" id="ta-chat-toggle">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 3h12v8H6l-3 3v-3H2V3z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5 6h6M5 8.5h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            AI 정리 도우미
          </button>
        </div>

        <div id="ta-chat-panel" style="display:none;"></div>

        <div class="ta-summary-cards">
          ${this._sumCard('완료',       s.tasks_completed, '건', '#5DD984')}
          ${this._sumCard('진행 중',    s.tasks_in_progress, '건', '#7B9BFA')}
          ${this._sumCard('미진행',     s.tasks_blocked,  '건', '#F07070')}
          ${this._sumCard('콘텐츠 발행', s.content_published, '건', '#F5A94A')}
          ${this._sumCard('댓글',       s.comments_added, '개', '#B08CF9')}
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

    const userSel = document.getElementById('ta-user-select');
    if (userSel) {
      userSel.addEventListener('change', () => {
        this._selectedUserId = parseInt(userSel.value);
        this._loadPersonal();
      });
    }
    document.getElementById('ta-chat-toggle').addEventListener('click', () => this._toggleChat());
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
    </tr></thead><tbody>
      ${tasks.map(t => `<tr>
        <td>${t.category_name ? `<span class="ta-cat-chip" style="background:${escHtml(t.category_color||'#EEF1FD')}33;color:${escHtml(t.category_color||'#4F6EF7')};">${escHtml(t.category_name)}</span>` : '-'}</td>
        <td>${escHtml(t.title)}${t.work_type && t.work_type!=='regular' ? ` <span class="ta-wt-chip ta-wt-${t.work_type}">${t.work_type==='extra'?'추가':'프로젝트'}</span>` : ''}</td>
        ${mode==='mixed' ? `<td>${App.statusBadge(t.status)}</td>` : ''}
        <td class="ta-mini-date">${this._fmtShortDate(mode==='done' ? t.updated_at : t.due_date)}</td>
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

  // ───────── AI 정리 도우미 (대화형) ─────────
  _toggleChat() {
    this._chatOpen = !this._chatOpen;
    const panel = document.getElementById('ta-chat-panel');
    if (!panel) return;
    if (this._chatOpen) {
      panel.style.display = 'block';
      if (this._chatMessages.length === 0) {
        const userName = this._personalData?.user?.name || '구성원';
        this._chatMessages.push({
          role: 'assistant',
          content: `${userName}님의 ${this._formatPeriodLabel(this._periodFrom, this._periodTo)} 활동을 어떻게 정리해드릴까요?\n\n예시: "이번 주 핵심 성과만 5줄로", "콘텐츠만 표로 정리", "다음 주 액션 아이템 뽑아줘", "지연된 업무 원인 추정해줘"`,
        });
      }
      this._renderChatPanel();
      setTimeout(() => document.getElementById('ta-chat-input')?.focus(), 100);
    } else {
      panel.style.display = 'none';
    }
  },

  _renderChatPanel() {
    const panel = document.getElementById('ta-chat-panel');
    if (!panel) return;

    const suggestions = [
      '이번 주 핵심 성과 5줄 요약',
      '콘텐츠만 표로 정리',
      '다음 주 액션 아이템 추출',
      '지연된 업무 짚어줘',
    ];

    panel.innerHTML = `
      <div class="ta-chat-card">
        <div class="ta-chat-header">
          <div class="ta-chat-header-l">
            <span class="ta-chat-avatar">✨</span>
            <div>
              <div class="ta-chat-title">AI 정리 도우미</div>
              <div class="ta-chat-sub">대화로 원하는 형태로 정리</div>
            </div>
          </div>
          <button class="ta-chat-close" id="ta-chat-close" title="닫기">✕</button>
        </div>
        <div class="ta-chat-body" id="ta-chat-body">
          ${this._chatMessages.map(m => this._renderChatMessage(m)).join('')}
          ${this._chatLoading ? `<div class="ta-chat-msg ta-chat-msg-ai">
            <div class="ta-chat-bubble ta-chat-typing"><span></span><span></span><span></span></div>
          </div>` : ''}
        </div>
        <div class="ta-chat-suggestions">
          ${suggestions.map(s => `<button class="ta-chat-sug" data-text="${escHtml(s)}">${escHtml(s)}</button>`).join('')}
        </div>
        <div class="ta-chat-input-row">
          <input type="text" id="ta-chat-input" class="ta-chat-input" placeholder="원하는 정리 방식을 자유롭게 입력하세요…" autocomplete="off" ${this._chatLoading ? 'disabled' : ''}>
          <button class="ta-chat-send" id="ta-chat-send" ${this._chatLoading ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 8l12-6-5 14-2-6-5-2z" fill="currentColor"/></svg>
          </button>
        </div>
      </div>
    `;

    document.getElementById('ta-chat-close').addEventListener('click', () => this._toggleChat());
    const input = document.getElementById('ta-chat-input');
    const send  = document.getElementById('ta-chat-send');
    const submit = () => {
      const text = input.value.trim();
      if (!text || this._chatLoading) return;
      input.value = '';
      this._sendChat(text);
    };
    send.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    panel.querySelectorAll('.ta-chat-sug').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this._chatLoading) return;
        this._sendChat(btn.dataset.text);
      });
    });

    // 스크롤 맨 아래로
    const body = document.getElementById('ta-chat-body');
    if (body) body.scrollTop = body.scrollHeight;
  },

  _renderChatMessage(m) {
    const isUser = m.role === 'user';
    return `<div class="ta-chat-msg ${isUser ? 'ta-chat-msg-user' : 'ta-chat-msg-ai'}">
      ${!isUser ? '<span class="ta-chat-msg-avatar">✨</span>' : ''}
      <div class="ta-chat-bubble">${this._renderMarkdown(m.content)}</div>
    </div>`;
  },

  // 매우 간단한 markdown (escape + bold + 줄바꿈 + 표)
  _renderMarkdown(text) {
    let safe = escHtml(text);
    // 표 (간단한 마크다운 파이프 표 변환)
    if (/\|.+\|/.test(safe) && /\n\s*\|[\s:|-]+\|/.test(safe)) {
      const lines = safe.split('\n');
      let out = []; let inTable = false; let tableRows = []; let header = null;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*\|.+\|\s*$/.test(line)) {
          if (!inTable) {
            inTable = true;
            header = line.split('|').slice(1, -1).map(s => s.trim());
            // skip separator line
            if (i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1])) i++;
          } else {
            tableRows.push(line.split('|').slice(1, -1).map(s => s.trim()));
          }
        } else {
          if (inTable) {
            out.push(this._buildTable(header, tableRows));
            inTable = false; header = null; tableRows = [];
          }
          out.push(line);
        }
      }
      if (inTable) out.push(this._buildTable(header, tableRows));
      safe = out.join('\n');
    }
    // bold **text**
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // bullets
    safe = safe.replace(/^- (.+)$/gm, '<div class="ta-chat-bullet">• $1</div>');
    // newlines
    safe = safe.replace(/\n/g, '<br>');
    // br before/after table 정리
    safe = safe.replace(/<br>(<table)/g, '$1').replace(/(<\/table>)<br>/g, '$1');
    return safe;
  },

  _buildTable(header, rows) {
    if (!header) return '';
    return `<table class="ta-chat-table"><thead><tr>${header.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  },

  async _sendChat(text) {
    this._chatMessages.push({ role: 'user', content: text });
    this._chatLoading = true;
    this._renderChatPanel();
    try {
      const res = await API.post('/team-activity/chat', {
        messages: this._chatMessages,
        context_type: 'personal_activity',
        user_id: this._selectedUserId,
        date_from: this._periodFrom,
        date_to: this._periodTo,
      });
      const reply = res.data?.reply || '응답을 생성하지 못했습니다.';
      this._chatMessages.push({ role: 'assistant', content: reply });
    } catch (e) {
      this._chatMessages.push({
        role: 'assistant',
        content: `⚠ 응답 실패: ${e.message || '알 수 없는 오류'}\n\n서버 LLM 설정을 확인해주세요.`,
      });
    } finally {
      this._chatLoading = false;
      this._renderChatPanel();
    }
  },

  // ───────── 텍스트 복사 ─────────
  async _copyAsText() {
    if (this._activeTab === 'matrix' && this._matrixData) {
      const lines = [`📊 팀 매트릭스 — ${this._formatPeriodLabel(this._periodFrom, this._periodTo)}`, ''];
      this._matrixData.forEach(u => {
        lines.push(`▸ ${u.name}: 완료 ${u.done_count} / 진행 중 ${u.in_progress_count} / 미진행 ${u.blocked_count} / 지연 ${u.overdue_count} / 콘텐츠 ${u.content_done}`);
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
    // 개인 상세 — 카테고리/유형별로 그룹된 마크다운 보고서 그대로 복사
    const md = this._buildMarkdownReport();
    if (md) await this._copyText(md);
  },

  // ───────── 보고서 마크다운 빌드 + 다운로드 ─────────
  // 카테고리/업무 유형으로 그룹화된 보고용 마크다운 (반기/연간 성과 보고에 바로 활용)
  _buildMarkdownReport() {
    const period = this._formatPeriodLabel(this._periodFrom, this._periodTo);
    const today = new Date().toISOString().slice(0, 10);

    if (this._activeTab === 'matrix' && this._matrixData) {
      const lines = [`# 팀 활동 매트릭스`, `**기간**: ${period}  ·  **생성일**: ${today}`, ''];
      lines.push(`| 담당자 | 완료 | 진행중 | 미진행 | 지연 | 콘텐츠 발행 | 댓글 |`);
      lines.push(`|---|---:|---:|---:|---:|---:|---:|`);
      this._matrixData.forEach(u => {
        lines.push(`| ${u.name} | ${u.done_count} | ${u.in_progress_count} | ${u.blocked_count} | ${u.overdue_count} | ${u.content_done}/${u.content_total} | ${u.comment_count} |`);
      });
      return lines.join('\n');
    }

    if (this._activeTab === 'feed' && this._feedData) {
      const lines = [`# 팀 활동 피드`, `**기간**: ${period}  ·  **생성일**: ${today}`, ''];
      const eventLabels = { task_created:'업무 생성', task_updated:'업무 수정', task_completed:'업무 완료', comment_added:'댓글', content_created:'콘텐츠 등록', content_updated:'콘텐츠 수정', timeline_created:'타임라인 추가' };
      this._feedData.slice(0, 200).forEach(e => {
        const t = new Date(e.created_at);
        const d = `${t.getMonth()+1}/${t.getDate()} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
        lines.push(`- **${d}** · ${e.user_name} · ${eventLabels[e.event_type] || e.event_type} — ${e.title || ''}`);
      });
      return lines.join('\n');
    }

    const d = this._personalData;
    if (!d) return '';

    const lines = [];
    lines.push(`# ${d.user.name} 활동 리포트`);
    lines.push(`**기간**: ${period}  ·  **생성일**: ${today}`);
    lines.push('');

    // AI 정리 (있으면 맨 앞에 — 보고서 요약에 바로 활용)
    const lastAi = [...(this._chatMessages || [])].reverse().find(m => m.role === 'assistant' && m.content && !m.content.startsWith('⚠'));
    if (lastAi && (this._chatMessages || []).length > 1) {
      lines.push('## ✨ AI 요약');
      lines.push(lastAi.content);
      lines.push('');
    }

    // 요약 수치
    lines.push('## 📊 한눈에 보기');
    lines.push(`- 완료 **${d.summary.tasks_completed}건** / 진행 중 **${d.summary.tasks_in_progress}건** / 미진행 **${d.summary.tasks_blocked}건**`);
    lines.push(`- 콘텐츠 발행 **${d.summary.content_published}건** (예정 ${d.summary.content_planned || 0}건)`);
    lines.push(`- 작성한 코멘트 **${d.summary.comments_added}개**`);
    lines.push('');

    // 카테고리별 집계
    if (d.by_category?.length) {
      lines.push('## 🗂️ 카테고리별 완료');
      lines.push(`| 분류 | 완료 건수 |`);
      lines.push(`|---|---:|`);
      d.by_category.forEach(c => lines.push(`| ${c.name} | ${c.count} |`));
      lines.push('');
    }

    // 업무 유형별 집계
    if (d.by_work_type?.length) {
      const wtLabels = { regular:'정규 (R&R)', extra:'추가 업무', project:'프로젝트' };
      lines.push('## 🧭 업무 유형별 완료');
      lines.push(`| 유형 | 완료 건수 |`);
      lines.push(`|---|---:|`);
      d.by_work_type.forEach(w => lines.push(`| ${wtLabels[w.work_type] || w.work_type} | ${w.count} |`));
      lines.push('');
    }

    // 완료 업무 — 카테고리별 그룹화
    if (d.completed_tasks?.length) {
      lines.push('## ✅ 완료한 업무');
      const grouped = {};
      d.completed_tasks.forEach(t => {
        const k = t.category_name || '미분류';
        (grouped[k] = grouped[k] || []).push(t);
      });
      Object.keys(grouped).sort().forEach(cat => {
        lines.push(`### ${cat}`);
        grouped[cat].forEach(t => {
          const wt = t.work_type && t.work_type !== 'regular' ? ` _(${t.work_type === 'extra' ? '추가' : '프로젝트'})_` : '';
          lines.push(`- ${t.title}${wt}`);
        });
        lines.push('');
      });
    }

    // 진행 중 / 예정
    if (d.in_progress_tasks?.length) {
      lines.push('## 🔄 진행 중 / 예정 / 미진행');
      d.in_progress_tasks.forEach(t => {
        const statusLabel = t.status === 'in_progress' ? '진행' : t.status === 'blocked' ? '미진행' : '예정';
        const due = t.due_date ? ` · 마감 ${this._fmtShortDate(t.due_date)}` : '';
        lines.push(`- [${statusLabel}] ${t.category_name ? `[${t.category_name}] ` : ''}${t.title}${due}`);
      });
      lines.push('');
    }

    // 콘텐츠
    if (d.content_items?.length) {
      lines.push('## 📢 콘텐츠');
      const channelMap = { IG:'인스타', FB:'페북', LI:'링크드인', YT:'유튜브', BL:'블로그', EM:'이메일', HM:'홈페이지' };
      d.content_items.forEach(c => {
        const status = c.status === 'done' ? '발행' : c.status === 'skipped' ? '미진행' : '예정';
        const url = c.publish_url ? ` (${c.publish_url})` : '';
        lines.push(`- [${channelMap[c.channel] || c.channel}] ${c.title} — ${status} · ${this._fmtShortDate(c.publish_date)}${url}`);
      });
      lines.push('');
    }

    // 다음 기간 예정
    if (d.upcoming_tasks?.length) {
      lines.push('## 📅 다음 7일 예정');
      d.upcoming_tasks.forEach(t => {
        lines.push(`- ${this._fmtShortDate(t.due_date)} · ${t.category_name ? `[${t.category_name}] ` : ''}${t.title}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  },

  async _downloadReport() {
    const md = this._buildMarkdownReport();
    if (!md) { App.toast('내보낼 데이터가 없습니다', 'error'); return; }
    const who = this._activeTab === 'personal' && this._personalData
      ? this._personalData.user.name.replace(/\s+/g, '_')
      : this._activeTab;
    const filename = `report_${who}_${this._periodFrom}_${this._periodTo}.md`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    App.toast(`${filename} 다운로드`, 'success');
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
  _fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; },
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
