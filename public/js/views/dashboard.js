// 대시보드 — 큐레이션 된 고정 레이아웃 (Linear/Toss 스타일)
// 데이터: /dashboard, /tasks, /calendar/upcoming, /team-activity/team-matrix
// 핵심: 기간 선택 → KPI → 내 할일·일정 → 분석 차트 → 팀 현황 → 액션 필요
const DashboardView = {
  _period: 'week',   // week | month | quarter | year | custom
  _dateFrom: '',
  _dateTo: '',
  _data: null,
  _allTasks: [],
  _upcomingEvents: [],
  _teamMatrix: [],
  _prevData: null,   // 전 기간 비교용

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = '';

    content.innerHTML = `
      <div class="dash-toolbar">
        <div class="dash-presets" id="dash-presets"></div>
        <div class="dash-custom-range">
          <input type="date" id="dash-from" value="${escHtml(this._dateFrom)}">
          <span class="dash-range-sep">~</span>
          <input type="date" id="dash-to" value="${escHtml(this._dateTo)}">
          <button class="btn btn-default" id="dash-apply">적용</button>
        </div>
      </div>
      <div id="dash-body">
        <div class="loading-state"><div class="loading-spinner"></div><span>대시보드 불러오는 중...</span></div>
      </div>
    `;

    if (!this._dateFrom || !this._dateTo) this._applyPreset(this._period);
    this._renderPresets();
    this._bindToolbar();

    await this._fetchAll();
    this._renderBody();
  },

  // ───────── 기간 프리셋 ─────────
  _applyPreset(preset) {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    let from, to;
    if (preset === 'week') {
      const ws = new Date(today); ws.setDate(today.getDate() - today.getDay()); // 일요일 시작
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      from = ws; to = we;
    } else if (preset === 'last_week') {
      const ws = new Date(today); ws.setDate(today.getDate() - today.getDay() - 7);
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      from = ws; to = we;
    } else if (preset === 'month') {
      from = new Date(y, m, 1); to = new Date(y, m + 1, 0);
    } else if (preset === 'quarter') {
      const q = Math.floor(m / 3) * 3;
      from = new Date(y, q, 1); to = new Date(y, q + 3, 0);
    } else if (preset === 'year') {
      from = new Date(y, 0, 1); to = new Date(y, 11, 31);
    } else {
      // custom: 그대로
      return;
    }
    this._dateFrom = this._fmtDate(from);
    this._dateTo = this._fmtDate(to);
    this._period = preset;
  },

  _renderPresets() {
    const wrap = document.getElementById('dash-presets');
    if (!wrap) return;
    const presets = [
      { key: 'week',       label: '이번 주' },
      { key: 'last_week',  label: '지난 주' },
      { key: 'month',      label: '이번 달' },
      { key: 'quarter',    label: '이번 분기' },
      { key: 'year',       label: '올해' },
    ];
    wrap.innerHTML = presets.map(p =>
      `<button class="dash-preset-btn ${this._period === p.key ? 'active' : ''}" data-preset="${p.key}">${p.label}</button>`
    ).join('');
    wrap.querySelectorAll('.dash-preset-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        this._applyPreset(btn.dataset.preset);
        this._renderPresets();
        document.getElementById('dash-from').value = this._dateFrom;
        document.getElementById('dash-to').value = this._dateTo;
        document.getElementById('dash-body').innerHTML =
          '<div class="loading-state"><div class="loading-spinner"></div><span>불러오는 중...</span></div>';
        await this._fetchAll();
        this._renderBody();
      });
    });
  },

  _bindToolbar() {
    document.getElementById('dash-apply')?.addEventListener('click', async () => {
      const f = document.getElementById('dash-from').value;
      const t = document.getElementById('dash-to').value;
      if (!f || !t) { App.toast('기간을 입력해주세요', 'error'); return; }
      if (f > t) { App.toast('시작일이 종료일보다 늦습니다', 'error'); return; }
      this._dateFrom = f; this._dateTo = t; this._period = 'custom';
      this._renderPresets();
      document.getElementById('dash-body').innerHTML =
        '<div class="loading-state"><div class="loading-spinner"></div><span>불러오는 중...</span></div>';
      await this._fetchAll();
      this._renderBody();
    });
  },

  // ───────── 데이터 수집 ─────────
  async _fetchAll() {
    const url = `/dashboard?date_from=${this._dateFrom}&date_to=${this._dateTo}`;
    const [main, allTasks, upcoming, teamMatrix, prev] = await Promise.allSettled([
      API.get(url),
      API.get('/tasks'),
      API.get('/calendar/upcoming'),
      App.user?.role === 'admin'
        ? API.get(`/team-activity/team-matrix?date_from=${this._dateFrom}&date_to=${this._dateTo}`)
        : Promise.resolve({ data: [] }),
      this._fetchPrevPeriod(),
    ]);
    this._data = main.status === 'fulfilled' ? main.value.data : null;
    this._allTasks = allTasks.status === 'fulfilled' ? (allTasks.value.data || []) : [];
    this._upcomingEvents = upcoming.status === 'fulfilled' ? (upcoming.value.data || []) : [];
    this._teamMatrix = teamMatrix.status === 'fulfilled' ? (teamMatrix.value.data || []) : [];
    this._prevData = prev.status === 'fulfilled' ? prev.value : null;
  },

  // 전 기간 데이터 (KPI 변화율 비교용)
  async _fetchPrevPeriod() {
    try {
      const from = new Date(this._dateFrom);
      const to = new Date(this._dateTo);
      const diffDays = Math.round((to - from) / 86400000) + 1;
      const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1);
      const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - diffDays + 1);
      const res = await API.get(`/dashboard?date_from=${this._fmtDate(prevFrom)}&date_to=${this._fmtDate(prevTo)}`);
      return res.data;
    } catch { return null; }
  },

  // ───────── 본문 렌더 ─────────
  _renderBody() {
    const body = document.getElementById('dash-body');
    if (!this._data) {
      body.innerHTML = '<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">대시보드 데이터를 불러올 수 없습니다</div></div>';
      return;
    }
    const periodLabel = this._formatPeriod();
    body.innerHTML = `
      <div class="dash-period-label">${escHtml(periodLabel)}</div>

      ${this._renderHero()}

      <div class="dash-row dash-row-2">
        ${this._renderMyTasksCard()}
        ${this._renderUpcomingCard()}
      </div>

      <div class="dash-row dash-row-2">
        ${this._renderStatusDonut()}
        ${this._renderCategoryDonut()}
      </div>

      ${App.user?.role === 'admin' ? this._renderTeamCard() : ''}

      ${this._renderActionRequired()}
    `;

    // 카드 클릭 → 해당 뷰 이동
    body.querySelectorAll('[data-goto]').forEach(el => {
      el.addEventListener('click', () => App.navigate(el.dataset.goto));
    });
  },

  // ───────── Hero KPI ─────────
  _renderHero() {
    const d = this._data;
    const prev = this._prevData;
    const done = parseInt(d.weekSummary?.done_count || 0);
    const pending = parseInt(d.weekSummary?.pending_count || 0);
    const total = done + pending;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    const prevDone = parseInt(prev?.weekSummary?.done_count || 0);
    const diff = done - prevDone;

    const contDone = parseInt(d.contentSummary?.done_count || 0);
    const contTotal = parseInt(d.contentSummary?.total || 0);

    const today = new Date(); today.setHours(0,0,0,0);
    const overdueCount = this._allTasks.filter(t =>
      t.due_date && new Date(t.due_date) < today && t.status !== 'done' && !t.archived
    ).length;
    const dueSoonCount = this._allTasks.filter(t => {
      if (!t.due_date || t.status === 'done' || t.archived) return false;
      const due = new Date(t.due_date);
      const days = Math.ceil((due - today) / 86400000);
      return days >= 0 && days <= 3;
    }).length;

    const trendArrow = (n) => n > 0 ? `<span class="dash-trend-up">▲ ${n}</span>`
                       : n < 0 ? `<span class="dash-trend-down">▼ ${Math.abs(n)}</span>`
                       : `<span class="dash-trend-flat">—</span>`;

    return `
      <div class="dash-hero">
        <div class="dash-hero-card" data-goto="tasks">
          <div class="dash-hero-label">완료한 업무</div>
          <div class="dash-hero-value">${done}<span class="dash-hero-unit">건</span></div>
          <div class="dash-hero-sub">완료율 ${completionRate}% · 전기 대비 ${trendArrow(diff)}</div>
        </div>
        <div class="dash-hero-card" data-goto="tasks">
          <div class="dash-hero-label">진행 중</div>
          <div class="dash-hero-value">${pending}<span class="dash-hero-unit">건</span></div>
          <div class="dash-hero-sub">기간 내 마감 예정 업무</div>
        </div>
        <div class="dash-hero-card ${dueSoonCount + overdueCount > 0 ? 'dash-hero-warn' : ''}" data-goto="tasks">
          <div class="dash-hero-label">주의 필요</div>
          <div class="dash-hero-value">${overdueCount + dueSoonCount}<span class="dash-hero-unit">건</span></div>
          <div class="dash-hero-sub">지연 ${overdueCount} · D-3 이내 ${dueSoonCount}</div>
        </div>
        <div class="dash-hero-card" data-goto="content">
          <div class="dash-hero-label">콘텐츠 발행</div>
          <div class="dash-hero-value">${contDone}<span class="dash-hero-unit">/${contTotal}</span></div>
          <div class="dash-hero-sub">${contTotal > 0 ? Math.round(contDone/contTotal*100) : 0}% 완료</div>
        </div>
      </div>
    `;
  },

  // ───────── 내 다음 업무 ─────────
  _renderMyTasksCard() {
    const userId = App.user?.id;
    const today = new Date(); today.setHours(0,0,0,0);
    const mine = this._allTasks
      .filter(t => t.assignee_id === userId && t.status !== 'done' && !t.archived)
      .sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date) - new Date(b.due_date);
      })
      .slice(0, 5);

    const body = mine.length === 0
      ? `<div class="dash-empty">진행 중인 내 업무가 없습니다</div>`
      : `<ul class="dash-list">${mine.map(t => {
          const due = t.due_date ? App.dday(t.due_date, t.status) : '';
          const cat = t.category_name ? categoryTag(t.category_name) : '';
          return `<li class="dash-list-item">
            <span class="dash-list-status ${t.status === 'blocked' ? 'is-blocked' : t.status === 'in_progress' ? 'is-progress' : 'is-todo'}"></span>
            <span class="dash-list-title">${escHtml(t.title)}</span>
            <span class="dash-list-meta">${cat}${due}</span>
          </li>`;
        }).join('')}</ul>`;

    return `
      <div class="dash-card">
        <div class="dash-card-header">
          <h3 class="dash-card-title">나의 다음 업무</h3>
          <button class="dash-card-action" data-goto="tasks">전체 보기 →</button>
        </div>
        ${body}
      </div>
    `;
  },

  // ───────── 다가오는 일정 ─────────
  _renderUpcomingCard() {
    const events = (this._upcomingEvents || []).slice(0, 5);
    const body = events.length === 0
      ? `<div class="dash-empty">다가오는 일정이 없습니다</div>`
      : `<ul class="dash-list">${events.map(e => {
          const date = e.start_date ? String(e.start_date).slice(5, 10) : '';
          const color = e.color || '#4F6EF7';
          return `<li class="dash-list-item">
            <span class="dash-list-dot" style="background:${escHtml(color)};"></span>
            <span class="dash-list-title">${escHtml(e.title)}</span>
            <span class="dash-list-meta">${escHtml(date)}</span>
          </li>`;
        }).join('')}</ul>`;

    return `
      <div class="dash-card">
        <div class="dash-card-header">
          <h3 class="dash-card-title">다가오는 일정</h3>
          <button class="dash-card-action" data-goto="calendar">캘린더 →</button>
        </div>
        ${body}
      </div>
    `;
  },

  // ───────── 상태 분포 도넛 ─────────
  _renderStatusDonut() {
    const tasks = this._allTasks.filter(t => !t.archived);
    const counts = { todo: 0, in_progress: 0, done: 0, blocked: 0 };
    tasks.forEach(t => { if (counts[t.status] != null) counts[t.status]++; });
    const entries = [
      { label: '진행 중', count: counts.in_progress, color: '#4F6EF7' },
      { label: '할 일',   count: counts.todo,        color: '#7B9BFA' },
      { label: '완료',    count: counts.done,        color: '#5DD984' },
      { label: '지연',  count: counts.blocked,     color: '#F07070' },
    ].filter(e => e.count > 0);

    const body = entries.length === 0
      ? `<div class="dash-empty">업무 데이터가 없습니다</div>`
      : this._renderDonut(entries);

    return `
      <div class="dash-card">
        <div class="dash-card-header">
          <h3 class="dash-card-title">업무 상태 분포</h3>
          <span class="dash-card-sub">전체 ${tasks.length}건</span>
        </div>
        ${body}
      </div>
    `;
  },

  // ───────── 카테고리별 도넛 ─────────
  _renderCategoryDonut() {
    const tasks = this._allTasks.filter(t => !t.archived);
    const map = {};
    tasks.forEach(t => {
      const n = t.category_name || '미분류';
      map[n] = (map[n] || 0) + 1;
    });
    const COLORS = ['#4F6EF7','#5DD984','#F5A94A','#7B9BFA','#B08CF9','#F07070','#6FC7E5','#F0A050'];
    const entries = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count], i) => ({ label, count, color: COLORS[i % COLORS.length] }))
      .slice(0, 8);

    const body = entries.length === 0
      ? `<div class="dash-empty">카테고리 데이터가 없습니다</div>`
      : this._renderDonut(entries);

    return `
      <div class="dash-card">
        <div class="dash-card-header">
          <h3 class="dash-card-title">카테고리별 업무</h3>
          <span class="dash-card-sub">상위 ${entries.length}개</span>
        </div>
        ${body}
      </div>
    `;
  },

  _renderDonut(entries) {
    const total = entries.reduce((s, e) => s + e.count, 0);
    const R = 15.9155;
    const circ = 2 * Math.PI * R;
    let offset = 0;
    const segments = entries.map(({ count, color }) => {
      const pct = (count / total) * circ;
      const seg = `<circle cx="18" cy="18" r="${R}" fill="none"
        stroke="${color}" stroke-width="3.6"
        stroke-dasharray="${pct.toFixed(2)} ${(circ - pct).toFixed(2)}"
        stroke-dashoffset="${(circ - offset).toFixed(2)}"
        transform="rotate(-90 18 18)"
        style="transition:stroke-dasharray 0.4s"/>`;
      offset += pct;
      return seg;
    }).join('');

    const legend = entries.map(({ label, count, color }) => `
      <div class="dash-legend-item">
        <span class="dash-legend-dot" style="background:${color};"></span>
        <span class="dash-legend-label">${escHtml(label)}</span>
        <span class="dash-legend-count">${count}</span>
        <span class="dash-legend-pct">${total > 0 ? Math.round(count/total*100) : 0}%</span>
      </div>
    `).join('');

    return `
      <div class="dash-donut-wrap">
        <div class="dash-donut">
          <svg viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="${R}" fill="none" stroke="var(--color-bg-secondary)" stroke-width="3.6"/>
            ${segments}
          </svg>
          <div class="dash-donut-center">
            <span class="dash-donut-total">${total}</span>
            <span class="dash-donut-unit">총 건</span>
          </div>
        </div>
        <div class="dash-legend">${legend}</div>
      </div>
    `;
  },

  // ───────── 팀 활동 카드 (admin only) ─────────
  _renderTeamCard() {
    const matrix = (this._teamMatrix || []).slice(0, 10);
    if (!matrix.length) {
      return `
        <div class="dash-card">
          <div class="dash-card-header">
            <h3 class="dash-card-title">팀 활동 (${this._formatPeriod()})</h3>
            <button class="dash-card-action" data-goto="weekly-report">팀 활동 →</button>
          </div>
          <div class="dash-empty">활동 데이터가 없습니다</div>
        </div>
      `;
    }

    const maxDone = Math.max(...matrix.map(m => m.done_count || 0), 1);
    const rows = matrix.map(m => `
      <div class="dash-team-row">
        <span class="dash-team-name">
          ${App.avatar({ name: m.name, avatar_bg: m.avatar_bg, avatar_text: m.avatar_text, avatar_url: m.avatar_url })}
          <span>${escHtml(m.name)}</span>
        </span>
        <div class="dash-team-bar-wrap">
          <div class="dash-team-bar" style="width:${(m.done_count || 0) / maxDone * 100}%;"></div>
        </div>
        <span class="dash-team-stats">
          <b>${m.done_count || 0}</b><span class="dash-team-stats-label">완료</span> ·
          ${m.in_progress_count || 0}<span class="dash-team-stats-label">진행</span> ·
          ${m.overdue_count || 0}<span class="dash-team-stats-label dash-team-stats-warn">지연</span>
        </span>
      </div>
    `).join('');

    return `
      <div class="dash-card">
        <div class="dash-card-header">
          <h3 class="dash-card-title">팀 활동 매트릭스</h3>
          <button class="dash-card-action" data-goto="weekly-report">상세 보기 →</button>
        </div>
        <div class="dash-team-matrix">${rows}</div>
      </div>
    `;
  },

  // ───────── 액션 필요 (기한 초과 + 지연) ─────────
  _renderActionRequired() {
    const today = new Date(); today.setHours(0,0,0,0);
    const overdue = this._allTasks
      .filter(t => t.due_date && new Date(t.due_date) < today && t.status !== 'done' && !t.archived)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 8);
    const blocked = this._allTasks
      .filter(t => t.status === 'blocked' && !t.archived)
      .slice(0, 8);

    const rowsHtml = (items, kind) => items.length === 0
      ? `<div class="dash-empty" style="padding:24px 0;">${kind === 'overdue' ? '기한 초과 업무가 없습니다' : '지연 업무가 없습니다'}</div>`
      : items.map(t => {
          const days = t.due_date
            ? Math.floor((today - new Date(t.due_date)) / 86400000)
            : null;
          const dlabel = kind === 'overdue' && days !== null
            ? `<span class="dash-action-overdue">D+${days}</span>`
            : `<span class="dash-action-blocked">지연</span>`;
          return `<div class="dash-action-row">
            ${dlabel}
            <span class="dash-action-title">${t.category_name ? `<span class="dash-action-cat">[${escHtml(t.category_name)}]</span> ` : ''}${escHtml(t.title)}</span>
            <span class="dash-action-meta">${escHtml(t.assignee_name || '미배정')}</span>
          </div>`;
        }).join('');

    return `
      <div class="dash-row dash-row-2">
        <div class="dash-card">
          <div class="dash-card-header">
            <h3 class="dash-card-title">⚠ 기한 초과 (D+1 이상)</h3>
            <span class="dash-card-sub">${overdue.length > 7 ? '8건+' : overdue.length + '건'}</span>
          </div>
          ${rowsHtml(overdue, 'overdue')}
        </div>
        <div class="dash-card">
          <div class="dash-card-header">
            <h3 class="dash-card-title">🚧 지연 업무</h3>
            <span class="dash-card-sub">${blocked.length > 7 ? '8건+' : blocked.length + '건'}</span>
          </div>
          ${rowsHtml(blocked, 'blocked')}
        </div>
      </div>
    `;
  },

  // ───────── 유틸 ─────────
  _fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  _formatPeriod() {
    const f = this._dateFrom, t = this._dateTo;
    if (!f || !t) return '';
    const fy = f.slice(0,4), tt = t.slice(0,4);
    if (this._period === 'year' && fy === tt) return `${fy}년`;
    if (this._period === 'month' && f.slice(0,7) === t.slice(0,7)) return `${fy}년 ${parseInt(f.slice(5,7))}월`;
    if (this._period === 'quarter') {
      const q = Math.floor(parseInt(f.slice(5,7))/3) + 1;
      return `${fy}년 ${q}분기`;
    }
    return `${f} ~ ${t}`;
  },
};
