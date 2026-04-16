// 대시보드 뷰 — 위젯 기반 커스터마이징 지원
const DashboardView = {
  WIDGETS: [
    { id: 'week-summary',      title: '이번 주 요약',       size: 'quarter' },
    { id: 'content-summary',   title: '콘텐츠 발행',        size: 'quarter' },
    { id: 'active-categories', title: '진행 분류',          size: 'quarter' },
    { id: 'blocked-count',     title: '미진행 업무',        size: 'quarter' },
    { id: 'week-tasks',        title: '이번 주 업무',       size: 'half' },
    { id: 'channel-stats',     title: '채널별 발행 현황',   size: 'half' },
    { id: 'my-tasks',          title: '나의 이번 주 업무',  size: 'half' },
    { id: 'status-chart',      title: '업무 상태 분포',     size: 'half' },
    { id: 'category-chart',    title: '분류별 업무 현황',   size: 'half' },
    { id: 'assignee-chart',    title: '담당자별 업무',      size: 'half' },
    { id: 'burndown-chart',    title: '번다운 차트',        size: 'half' },
    { id: 'workload',          title: '담당자별 업무 부하', size: 'half' },
    { id: 'completion-rate',   title: '완료율 추이',        size: 'half' },
    { id: 'overdue-tasks',     title: '마감 초과 업무',     size: 'half' },
    { id: 'issue-monitor',     title: '활성 이슈 현황',     size: 'half' },
    { id: 'team-kpi',          title: '팀 KPI',             size: 'half' },
    { id: 'upcoming-events',   title: '다가오는 일정',      size: 'half' },
    { id: 'delay-monitor',     title: '팀 지연 모니터',     size: 'half' },
    { id: 'work-distribution', title: '업무 분포',          size: 'half' },
  ],

  // 차트 타입을 지원하는 위젯 목록
  CHART_WIDGETS: ['status-chart', 'category-chart', 'assignee-chart', 'channel-stats'],

  STORAGE_KEY: 'dashboard_layout',
  editMode: false,
  dragSrcIdx: null,
  _data: null,
  // 전역 날짜 필터
  _dateFrom: '',
  _dateTo: '',

  loadLayout() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const ids = JSON.parse(saved);
        const valid = ids.filter(id => this.WIDGETS.find(w => w.id === id));
        return valid;
      }
    } catch (e) {}
    return ['week-summary', 'content-summary', 'active-categories', 'blocked-count', 'week-tasks', 'channel-stats', 'my-tasks'];
  },

  saveLayout(ids) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(ids));
  },

  // 위젯별 차트 타입 (localStorage)
  getChartType(widgetId) {
    return localStorage.getItem(`dashboard_chart_type_${widgetId}`) || 'bar';
  },
  setChartType(widgetId, type) {
    localStorage.setItem(`dashboard_chart_type_${widgetId}`, type);
  },

  // 위젯별 크기 (localStorage): 'quarter' | 'half' | 'full'
  getWidgetSize(widgetId) {
    return localStorage.getItem(`dashboard_widget_size_${widgetId}`) || null;
  },
  setWidgetSize(widgetId, size) {
    localStorage.setItem(`dashboard_widget_size_${widgetId}`, size);
  },

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = '<button class="btn btn-default" id="btn-edit-dashboard">대시보드 편집</button>';
    document.getElementById('btn-edit-dashboard').addEventListener('click', () => this.toggleEditMode());

    content.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>대시보드 불러오는 중...</span></div>';

    try {
      await this._fetchData();
      this.editMode = false;
      this.renderGrid();
    } catch (e) {
      content.innerHTML = '<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">대시보드를 불러올 수 없습니다</div></div>';
    }
  },

  async _fetchData() {
    let url = '/dashboard';
    if (this._dateFrom && this._dateTo) {
      url += `?date_from=${encodeURIComponent(this._dateFrom)}&date_to=${encodeURIComponent(this._dateTo)}`;
    }
    const res = await API.get(url);
    this._data = res.data;

    // 모든 업무 로드 (workload, overdue 등 전체 데이터 필요 위젯용)
    try {
      const allTasksRes = await API.get('/tasks');
      this._data._allTasks = allTasksRes.data || [];
    } catch {
      this._data._allTasks = [];
    }

    // 이슈 및 팀 KPI 데이터 (위젯용)
    try {
      const [issuesRes, kpiRes] = await Promise.all([
        API.get('/issues').catch(() => ({ data: [] })),
        API.get('/performance/team').catch(() => ({ data: { summary: {} } })),
      ]);
      this._data._issues = issuesRes.data || [];
      this._data._teamKpi = (kpiRes.data?.summary) || {};
    } catch {
      this._data._issues = [];
      this._data._teamKpi = {};
    }

    // 다가오는 일정 (캘린더 위젯용)
    try {
      const upcomingRes = await API.get('/calendar/upcoming');
      this._data._upcomingEvents = upcomingRes.data || [];
    } catch {
      this._data._upcomingEvents = [];
    }

    // 업무 분포 (관리자 전용 엔드포인트 — 실패 시 _allTasks에서 클라이언트 집계)
    try {
      if (App.user?.role === 'admin') {
        const distRes = await API.get(`/evaluations/work-distribution?year=${new Date().getFullYear()}`);
        this._data._workDistribution = distRes.data || [];
      } else {
        // 비관리자: _allTasks에서 클라이언트 집계
        this._data._workDistribution = this._aggregateWorkDistribution(this._data._allTasks || []);
      }
    } catch {
      this._data._workDistribution = this._aggregateWorkDistribution(this._data._allTasks || []);
    }
  },

  // _allTasks로부터 담당자별 업무 유형 분포 집계 (폴백)
  _aggregateWorkDistribution(tasks) {
    const byUser = {};
    for (const t of tasks) {
      if (!t.assignee_id) continue;
      if (!byUser[t.assignee_id]) {
        byUser[t.assignee_id] = {
          user_id: t.assignee_id,
          name: t.assignee_name || '-',
          regular: 0, extra: 0, project: 0,
        };
      }
      const wt = t.work_type || 'regular';
      byUser[t.assignee_id][wt] = (byUser[t.assignee_id][wt] || 0) + 1;
    }
    return Object.values(byUser);
  },

  toggleEditMode() {
    this.editMode = !this.editMode;
    const btn = document.getElementById('btn-edit-dashboard');
    if (btn) {
      btn.textContent = this.editMode ? '편집 완료' : '대시보드 편집';
      btn.className = this.editMode ? 'btn btn-primary' : 'btn btn-default';
    }
    this.renderGrid();
  },

  renderGrid() {
    const content = document.getElementById('content');
    const layout = this.loadLayout();
    const d = this._data;

    const widgetsHtml = layout.map((id, idx) => this.renderWidgetShell(id, idx, d)).join('');

    // 빠른 기간 버튼 계산
    const _now = new Date();
    const _y = _now.getFullYear();
    const _m = _now.getMonth();
    const _qStart = Math.floor(_m / 3) * 3;
    const _pad = n => String(n).padStart(2, '0');
    const _periodBtns = [
      { label: '오늘',     from: `${_y}-${_pad(_m+1)}-${_pad(_now.getDate())}`,  to: `${_y}-${_pad(_m+1)}-${_pad(_now.getDate())}` },
      { label: '이번 주',  from: (() => { const d = new Date(_now); d.setDate(_now.getDate() - _now.getDay()); return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`; })(),
                           to:   (() => { const d = new Date(_now); d.setDate(_now.getDate() + (6 - _now.getDay())); return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`; })() },
      { label: '이번 달',  from: `${_y}-${_pad(_m+1)}-01`, to: `${_y}-${_pad(_m+1)}-${_pad(new Date(_y, _m+1, 0).getDate())}` },
      { label: '이번 분기',from: `${_y}-${_pad(_qStart+1)}-01`, to: `${_y}-${_pad(_qStart+3)}-${_pad(new Date(_y, _qStart+3, 0).getDate())}` },
      { label: '올해',     from: `${_y}-01-01`, to: `${_y}-12-31` },
    ];

    // 전역 날짜 필터 바
    const dateFilterHtml = `
      <div class="dashboard-date-filter">
        <span style="font-size:12px;color:var(--color-text-muted);white-space:nowrap;">기간:</span>
        ${_periodBtns.map(p => `<button class="filter-btn dash-period-btn" data-from="${p.from}" data-to="${p.to}" style="font-size:11px;padding:3px 8px;">${p.label}</button>`).join('')}
        <input type="date" id="dash-date-from" value="${escHtml(this._dateFrom)}"
          style="background:var(--color-bg-secondary);color:var(--color-text-primary);border:1px solid var(--color-border);border-radius:6px;padding:4px 8px;font-size:12px;outline:none;">
        <span style="font-size:12px;color:var(--color-text-muted);">~</span>
        <input type="date" id="dash-date-to" value="${escHtml(this._dateTo)}"
          style="background:var(--color-bg-secondary);color:var(--color-text-primary);border:1px solid var(--color-border);border-radius:6px;padding:4px 8px;font-size:12px;outline:none;">
        <button class="btn btn-primary" id="btn-dash-apply" style="padding:4px 12px;font-size:12px;">적용</button>
        ${(this._dateFrom || this._dateTo) ? `<button class="btn btn-default" id="btn-dash-reset" style="padding:4px 10px;font-size:12px;">초기화</button>` : ''}
      </div>
    `;

    let addBtnHtml = '';
    if (this.editMode) {
      const hidden = this.WIDGETS.filter(w => !layout.includes(w.id));
      addBtnHtml = `
        <div style="margin-top:16px;position:relative;" id="widget-add-wrap">
          <button class="btn btn-primary" id="btn-add-widget">+ 위젯 추가</button>
          <div id="widget-add-dropdown" style="display:none;position:absolute;bottom:calc(100% + 8px);left:0;z-index:80;background:var(--color-bg-primary);border-radius:10px;padding:8px;min-width:220px;box-shadow:var(--shadow-lg);border:0.5px solid var(--color-border);">
            ${hidden.length > 0
              ? hidden.map(w => `<div class="widget-add-item" data-add-widget="${w.id}" style="padding:8px 12px;font-size:13px;cursor:pointer;border-radius:6px;color:var(--color-text-primary);">${w.title}</div>`).join('')
              : '<div style="padding:8px 12px;font-size:13px;color:var(--color-text-muted);">추가할 위젯이 없습니다</div>'}
          </div>
        </div>
      `;
    }

    content.innerHTML = dateFilterHtml + `<div class="dashboard-grid" id="dashboard-grid">${widgetsHtml}</div>${addBtnHtml}`;
    this.bindEvents(layout);
  },

  renderWidgetShell(widgetId, idx, d) {
    const widget = this.WIDGETS.find(w => w.id === widgetId);
    if (!widget) return '';

    // 저장된 크기 우선, 없으면 기본값
    const savedSize = this.getWidgetSize(widgetId);
    const effectiveSize = savedSize || widget.size;
    const spanClass = effectiveSize === 'quarter' ? 'span-1' : effectiveSize === 'half' ? 'span-2' : 'span-4';
    const editClass = this.editMode ? 'edit-mode' : '';
    const draggable = this.editMode ? 'draggable="true"' : '';

    // 차트 타입 토글 (차트 위젯이고 편집 모드 아닐 때)
    const isChartWidget = this.CHART_WIDGETS.includes(widgetId);
    let chartToggleHtml = '';
    if (isChartWidget && !this.editMode) {
      const currentType = this.getChartType(widgetId);
      chartToggleHtml = `
        <div class="chart-type-toggle" data-widget="${widgetId}">
          <button class="chart-type-btn ${currentType === 'bar' ? 'active' : ''}" data-type="bar" title="막대 차트">바</button>
          <button class="chart-type-btn ${currentType === 'donut' ? 'active' : ''}" data-type="donut" title="도넛 차트">도넛</button>
          <button class="chart-type-btn ${currentType === 'list' ? 'active' : ''}" data-type="list" title="목록">리스트</button>
          <button class="chart-type-btn ${currentType === 'line' ? 'active' : ''}" data-type="line" title="라인 차트">라인</button>
        </div>
      `;
    }

    // 크기 토글 버튼 (편집 모드)
    let sizeBtnHtml = '';
    if (this.editMode) {
      const sizeLabel = effectiveSize === 'quarter' ? '1x' : effectiveSize === 'half' ? '2x' : '4x';
      sizeBtnHtml = `<button class="chart-type-btn" data-size-widget="${widgetId}" title="크기 변경" style="font-size:10px;padding:2px 6px;">${sizeLabel}</button>`;
    }

    // 새로고침 버튼 (비편집 모드)
    const refreshBtnHtml = !this.editMode ? `
      <button class="widget-refresh-btn" data-refresh-widget="${widgetId}" title="새로고침" style="background:none;border:none;cursor:pointer;color:var(--color-text-muted);padding:2px 4px;border-radius:4px;display:flex;align-items:center;">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2L14 3v4h-4l1.7-1.7A3.5 3.5 0 1 0 11.5 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>` : '';

    return `
      <div class="dashboard-widget ${spanClass} ${editClass}" data-widget-id="${widgetId}" data-idx="${idx}" ${draggable}>
        <div class="widget-header">
          ${this.editMode ? '<div class="widget-drag-handle" title="드래그하여 이동">⠿</div>' : ''}
          <span class="widget-title">${widget.title}</span>
          ${chartToggleHtml}
          ${sizeBtnHtml}
          ${refreshBtnHtml}
          ${this.editMode ? `<button class="widget-remove-btn" data-remove-widget="${widgetId}" title="제거">✕</button>` : ''}
        </div>
        <div class="widget-body">${this.renderWidgetContent(widgetId, d)}</div>
      </div>
    `;
  },

  renderWidgetContent(widgetId, d) {
    if (!d) return '<div style="padding:20px;text-align:center;color:var(--color-text-muted)">데이터 없음</div>';
    const week = d.weekSummary || {};
    const cont = d.contentSummary || {};
    const pct = cont.total > 0 ? Math.round((cont.done_count / cont.total) * 100) : 0;

    switch (widgetId) {
      case 'week-summary':
        return `<div class="metric-value">${week.total || 0}</div><div class="metric-sub">완료 ${week.done_count || 0} · 예정 ${week.pending_count || 0}</div>`;

      case 'content-summary':
        return `<div class="metric-value">${cont.done_count || 0} / ${cont.total || 0}</div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <div class="metric-sub">${pct}% 완료</div>`;

      case 'active-categories':
        return `<div class="metric-value">${d.activeCategoryCount || 0}개</div>`;

      case 'blocked-count':
        return `<div class="metric-value" style="color:var(--color-warn-text)">${d.blockedCount || 0}</div>`;

      case 'week-tasks':
        return this._renderTaskTable(d.weekTasks || [], '이번 주 업무가 없습니다', '업무 현황에서 추가해보세요');

      case 'my-tasks':
        return this._renderMyTasks(d.myTasks || []);

      case 'channel-stats':
        return this._renderWithChartType('channel-stats', d);

      case 'status-chart':
        return this._renderWithChartType('status-chart', d);

      case 'category-chart':
        return this._renderWithChartType('category-chart', d);

      case 'assignee-chart':
        return this._renderWithChartType('assignee-chart', d);

      case 'burndown-chart':
        return this._renderBurndown(d);

      case 'workload':
        return this._renderWorkload(d);

      case 'completion-rate':
        return this._renderCompletionRate(d);

      case 'overdue-tasks':
        return this._renderOverdueTasks(d);

      case 'issue-monitor':
        return this._renderIssueMonitor(d);

      case 'team-kpi':
        return this._renderTeamKpi(d);

      case 'upcoming-events':
        return this._renderUpcomingEvents(d);

      case 'delay-monitor':
        return this._renderDelayMonitor(d);

      case 'work-distribution':
        return this._renderWorkDistribution(d);

      default: return '';
    }
  },

  // 팀 지연 모니터 위젯 — 상위 5개 지연 업무 (_allTasks에서 계산)
  _renderDelayMonitor(d) {
    const today = new Date().toISOString().slice(0, 10);
    const allTasks = d._allTasks || [];
    const overdue = allTasks
      .filter(t => t.due_date && t.due_date.slice(0, 10) < today && t.status !== 'done')
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 5);
    if (overdue.length === 0) {
      return '<div style="text-align:center;padding:16px;color:var(--color-text-muted);font-size:12px;">현재 지연된 업무가 없습니다</div>';
    }
    return overdue.map(t => {
      const due = t.due_date ? new Date(t.due_date) : null;
      const days = due ? Math.floor((Date.now() - due.getTime()) / 86400000) : 0;
      const severityColor = days >= 7 ? 'var(--color-warn-text)' : days >= 3 ? '#F5A623' : 'var(--color-primary)';
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:0.5px solid var(--color-border);">
          <span style="display:inline-block;min-width:42px;padding:2px 6px;border-radius:4px;background:${severityColor}22;color:${severityColor};font-size:10px;font-weight:600;text-align:center;">D+${days}</span>
          <span style="flex:1;font-size:12px;color:var(--color-text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(t.title)}</span>
          <span style="font-size:11px;color:var(--color-text-muted);white-space:nowrap;">${escHtml(t.assignee_name || '-')}</span>
        </div>
      `;
    }).join('');
  },

  // 업무 분포 위젯 — 담당자별 업무 유형 요약
  _renderWorkDistribution(d) {
    const users = d._workDistribution || [];
    if (users.length === 0) {
      return '<div style="text-align:center;padding:16px;color:var(--color-text-muted);font-size:12px;">데이터 없음</div>';
    }
    const topUsers = users
      .map(u => ({ ...u, total: (u.regular || 0) + (u.extra || 0) + (u.project || 0) }))
      .filter(u => u.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    if (topUsers.length === 0) {
      return '<div style="text-align:center;padding:16px;color:var(--color-text-muted);font-size:12px;">업무 할당 없음</div>';
    }

    return topUsers.map(u => {
      const total = u.total;
      const pctReg = Math.round((u.regular || 0) / total * 100);
      const pctExt = Math.round((u.extra || 0) / total * 100);
      const pctProj = 100 - pctReg - pctExt;
      return `
        <div style="padding:6px 0;border-bottom:0.5px solid var(--color-border);">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="flex:1;font-size:12px;color:var(--color-text-primary);">${escHtml(u.name)}</span>
            <span style="font-size:11px;color:var(--color-text-muted);">${total}건</span>
          </div>
          <div style="display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--color-bg-secondary);">
            <div style="width:${pctReg}%;background:#4F6EF7;" title="정규 ${u.regular || 0}"></div>
            <div style="width:${pctExt}%;background:#F5A623;" title="추가 ${u.extra || 0}"></div>
            <div style="width:${pctProj}%;background:#9B59B6;" title="프로젝트 ${u.project || 0}"></div>
          </div>
        </div>
      `;
    }).join('') + `
      <div style="display:flex;gap:10px;margin-top:8px;font-size:10px;color:var(--color-text-muted);">
        <span><span style="display:inline-block;width:8px;height:8px;background:#4F6EF7;border-radius:2px;vertical-align:middle;"></span> 정규</span>
        <span><span style="display:inline-block;width:8px;height:8px;background:#F5A623;border-radius:2px;vertical-align:middle;"></span> 추가</span>
        <span><span style="display:inline-block;width:8px;height:8px;background:#9B59B6;border-radius:2px;vertical-align:middle;"></span> 프로젝트</span>
      </div>
    `;
  },

  // 활성 이슈 현황 위젯
  _renderIssueMonitor(d) {
    const issues = d._issues || [];
    const typeLabels = { delay: '지연', blocking: '블로킹', resource: '리소스 부족', external: '외부 대기', technical: '기술 이슈', other: '기타' };
    const typeCounts = {};
    issues.forEach(i => {
      if (i.status !== 'resolved') {
        typeCounts[i.issue_type] = (typeCounts[i.issue_type] || 0) + 1;
      }
    });
    const activeCount = Object.values(typeCounts).reduce((a, b) => a + b, 0);

    if (activeCount === 0) {
      return '<div style="text-align:center;padding:16px;color:var(--color-text-muted);font-size:12px;">활성 이슈가 없습니다</div>';
    }

    const countBadges = Object.entries(typeCounts).map(([type, count]) =>
      `<span class="issue-type-badge issue-type-${type}" style="font-size:11px;">${typeLabels[type] || type}: ${count}</span>`
    ).join(' ');

    const recentIssues = issues.filter(i => i.status !== 'resolved').slice(0, 5);
    const listHtml = recentIssues.map(i => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--color-border);">
        <span class="issue-type-badge issue-type-${i.issue_type}" style="font-size:10px;flex-shrink:0;">${typeLabels[i.issue_type] || i.issue_type}</span>
        <span style="flex:1;font-size:12px;color:var(--color-text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(i.task_title || i.description || '-')}</span>
      </div>
    `).join('');

    return `
      <div style="margin-bottom:10px;font-size:18px;font-weight:600;color:var(--color-warn-text);">${activeCount}건</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">${countBadges}</div>
      ${listHtml}
    `;
  },

  // 팀 KPI 위젯
  _renderTeamKpi(d) {
    const kpi = d._teamKpi || {};
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:4px;">완료율</div>
          <div style="font-size:18px;font-weight:600;color:var(--color-primary);">${kpi.completion_rate != null ? Number(kpi.completion_rate).toFixed(0) : 0}%</div>
          <div class="progress-bar" style="margin-top:4px;"><div class="progress-fill" style="width:${kpi.completion_rate || 0}%"></div></div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:4px;">총 완료</div>
          <div style="font-size:18px;font-weight:600;color:var(--color-done-text);">${kpi.total_done || 0}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:4px;">진행 중</div>
          <div style="font-size:18px;font-weight:600;">${kpi.in_progress || 0}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:4px;">지연</div>
          <div style="font-size:18px;font-weight:600;color:var(--color-warn-text);">${kpi.overdue || 0}</div>
        </div>
      </div>
    `;
  },

  // 다가오는 일정 위젯
  _renderUpcomingEvents(d) {
    const events = d._upcomingEvents || [];
    if (events.length === 0) {
      return '<div style="text-align:center;padding:16px;color:var(--color-text-muted);font-size:12px;">다가오는 일정이 없습니다</div>';
    }
    const typeColors = {
      general: '#4F6EF7', meeting: '#7B9BFA', deadline: '#F07070',
      campaign: '#5DD984', event: '#F5A623', holiday: '#9A9BA3',
    };
    const typeLabels = {
      general: '일반', meeting: '회의', deadline: '마감',
      campaign: '캠페인', event: '행사', holiday: '휴일',
    };
    return events.slice(0, 8).map(ev => {
      const color = ev.color || typeColors[ev.event_type] || '#4F6EF7';
      const dateStr = ev.start_date?.slice(0, 10) || '';
      const d = new Date(dateStr);
      const dayLabel = `${d.getMonth()+1}/${d.getDate()}`;
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:0.5px solid var(--color-border);">
          <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>
          <span style="font-size:12px;color:var(--color-text-muted);width:40px;flex-shrink:0;">${dayLabel}</span>
          <span style="flex:1;font-size:13px;color:var(--color-text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(ev.title)}</span>
          <span class="badge" style="background:${color}22;color:${color};font-size:10px;">${typeLabels[ev.event_type] || ev.event_type}</span>
        </div>
      `;
    }).join('');
  },

  // 번다운 차트 (완료 추이 vs 계획)
  _renderBurndown(d) {
    // 전체 업무 사용하여 번다운 계산
    const tasks = d._allTasks || d.weekTasks || [];
    const total = tasks.filter(t => t.status !== 'done').length + tasks.filter(t => t.status === 'done').length;
    if (total === 0) return '<div class="empty-state" style="padding:20px"><div class="empty-state-title">데이터가 없습니다</div></div>';

    // 완료된 업무를 완료일(updated_at) 또는 마감일 기준으로 날짜별 그룹핑
    const doneTasks = tasks.filter(t => t.status === 'done');
    const dateMap = {};
    doneTasks.forEach(t => {
      const dateStr = (t.updated_at || t.due_date || t.created_at || '').slice(0, 10);
      if (dateStr) dateMap[dateStr] = (dateMap[dateStr] || 0) + 1;
    });

    // 최근 14일 생성 (더 넓은 범위)
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      days.push(dt.toISOString().slice(0, 10));
    }

    // 시작일 이전 완료 카운트 계산
    let priorDone = 0;
    doneTasks.forEach(t => {
      const dateStr = (t.updated_at || t.due_date || t.created_at || '').slice(0, 10);
      if (dateStr && dateStr < days[0]) priorDone++;
    });

    // 번다운: 남은 업무 수 (전체 - 누적 완료)
    let remaining = total - priorDone;
    const actualPoints = [];
    const idealPoints = [];
    days.forEach((day, i) => {
      const completedToday = dateMap[day] || 0;
      remaining = Math.max(0, remaining - completedToday);
      actualPoints.push({ x: i, y: remaining, label: day.slice(5) });
      idealPoints.push({ x: i, y: Math.round((total - priorDone) * (13 - i) / 13) });
    });

    const numPts = actualPoints.length;
    const W = 300, H = 90, padL = 28, padB = 18;
    const innerW = W - padL - 4;
    const innerH = H - padB;
    const maxY = Math.max(total, 1);
    const scaleX = i => padL + (innerW / Math.max(numPts - 1, 1)) * i;
    const scaleY = v => (innerH - (v / maxY) * (innerH - 4)) + 2;

    const actualPolyline = actualPoints.map(p => `${scaleX(p.x).toFixed(1)},${scaleY(p.y).toFixed(1)}`).join(' ');
    const idealPolyline = idealPoints.map(p => `${scaleX(p.x).toFixed(1)},${scaleY(p.y).toFixed(1)}`).join(' ');

    // x 라벨: 매 2일마다 표시하여 겹침 방지
    const xLabels = actualPoints.filter((p, i) => i % 2 === 0 || i === numPts - 1).map((p) =>
      `<text x="${scaleX(p.x).toFixed(1)}" y="${H}" text-anchor="middle" font-size="7" fill="var(--color-text-muted)">${p.label}</text>`
    ).join('');
    const yLabel = `<text x="2" y="${scaleY(maxY).toFixed(1)}" font-size="8" fill="var(--color-text-muted)">${maxY}</text>
      <text x="2" y="${scaleY(0).toFixed(1)}" font-size="8" fill="var(--color-text-muted)">0</text>`;

    return `
      <svg viewBox="0 0 ${W} ${H + 4}" style="width:100%;overflow:visible;">
        ${yLabel}
        <polyline points="${idealPolyline}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" stroke-dasharray="4,3" stroke-linecap="round"/>
        <polyline points="${actualPolyline}" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${actualPoints.map(p => `<circle cx="${scaleX(p.x).toFixed(1)}" cy="${scaleY(p.y).toFixed(1)}" r="3" fill="var(--color-primary)" stroke="var(--color-bg-primary)" stroke-width="1.5"/>`).join('')}
        ${xLabels}
      </svg>
      <div style="display:flex;gap:12px;margin-top:4px;font-size:11px;">
        <span style="display:flex;align-items:center;gap:4px;color:var(--color-text-muted)"><span style="display:inline-block;width:14px;height:2px;background:var(--color-primary);border-radius:1px;"></span>실제</span>
        <span style="display:flex;align-items:center;gap:4px;color:var(--color-text-muted)"><span style="display:inline-block;width:14px;height:2px;background:rgba(255,255,255,0.25);border-radius:1px;"></span>계획</span>
      </div>`;
  },

  // 담당자별 업무 부하 (수평 막대) — 전체 업무 사용
  _renderWorkload(d) {
    const tasks = d._allTasks || d.weekTasks || [];
    if (!tasks.length) return '<div class="empty-state" style="padding:20px"><div class="empty-state-title">데이터가 없습니다</div></div>';

    const userMap = {};
    tasks.forEach(t => {
      const name = t.assignee_name || '미배정';
      if (!userMap[name]) userMap[name] = { total: 0, done: 0, in_progress: 0, todo: 0, blocked: 0 };
      userMap[name].total++;
      if (t.status === 'done') userMap[name].done++;
      else if (t.status === 'in_progress') userMap[name].in_progress++;
      else if (t.status === 'blocked') userMap[name].blocked++;
      else userMap[name].todo++;
    });

    const entries = Object.entries(userMap).sort((a, b) => b[1].total - a[1].total);
    const max = Math.max(...entries.map(([, v]) => v.total), 1);

    return entries.map(([name, counts]) => `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="font-size:12px;font-weight:500;">${escHtml(name)}</span>
          <span style="font-size:11px;color:var(--color-text-muted);">${counts.total}건</span>
        </div>
        <div style="height:10px;border-radius:5px;overflow:hidden;background:rgba(255,255,255,0.06);display:flex;">
          ${counts.done > 0 ? `<div style="flex:${counts.done};background:var(--color-done-text);min-width:2px;" title="완료 ${counts.done}"></div>` : ''}
          ${counts.in_progress > 0 ? `<div style="flex:${counts.in_progress};background:var(--color-primary);min-width:2px;" title="진행중 ${counts.in_progress}"></div>` : ''}
          ${counts.todo > 0 ? `<div style="flex:${counts.todo};background:var(--color-plan-text);min-width:2px;" title="할일 ${counts.todo}"></div>` : ''}
          ${counts.blocked > 0 ? `<div style="flex:${counts.blocked};background:var(--color-warn-text);min-width:2px;" title="미진행 ${counts.blocked}"></div>` : ''}
          ${(max - counts.total) > 0 ? `<div style="flex:${max - counts.total};"></div>` : ''}
        </div>
      </div>
    `).join('');
  },

  // 완료율 추이 (일별) — 전체 업무의 일별 완료 건수 트렌드
  _renderCompletionRate(d) {
    const tasks = d._allTasks || d.weekTasks || [];
    if (!tasks.length) return '<div class="empty-state" style="padding:20px"><div class="empty-state-title">데이터가 없습니다</div></div>';

    // 최근 14일 일별 완료 건수 트렌드
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      days.push(dt.toISOString().slice(0, 10));
    }

    // 완료 업무의 updated_at 또는 due_date 기준 날짜별 완료 건수
    const doneTasks = tasks.filter(t => t.status === 'done');
    const doneByDay = {};
    doneTasks.forEach(t => {
      const dateStr = (t.updated_at || t.due_date || t.created_at || '').slice(0, 10);
      if (dateStr) doneByDay[dateStr] = (doneByDay[dateStr] || 0) + 1;
    });

    const points = days.map((day, i) => {
      const count = doneByDay[day] || 0;
      return { x: i, y: count, label: day.slice(5), count };
    });
    const maxCount = Math.max(...points.map(p => p.y), 1);

    const numPts = points.length;
    const W = 300, H = 80, padL = 28, padB = 18;
    const innerW = W - padL - 4;
    const innerH = H - padB;
    const scaleX = i => padL + (innerW / Math.max(numPts - 1, 1)) * i;
    const scaleY = v => (innerH - (v / maxCount) * (innerH - 4)) + 2;

    const polyline = points.map(p => `${scaleX(p.x).toFixed(1)},${scaleY(p.y).toFixed(1)}`).join(' ');
    const dots = points.map(p => `
      <circle cx="${scaleX(p.x).toFixed(1)}" cy="${scaleY(p.y).toFixed(1)}" r="3" fill="${p.count > 0 ? 'var(--color-done-text)' : 'var(--color-bg-secondary)'}" stroke="var(--color-bg-primary)" stroke-width="1.5">
        <title>${p.label}: ${p.y}건 완료</title>
      </circle>`).join('');
    const xLabels = points.filter((p, i) => i % 2 === 0 || i === numPts - 1).map((p) =>
      `<text x="${scaleX(p.x).toFixed(1)}" y="${H}" text-anchor="middle" font-size="7" fill="var(--color-text-muted)">${p.label}</text>`
    ).join('');
    const yLabels = [0, Math.round(maxCount / 2), maxCount].map(v =>
      `<text x="2" y="${scaleY(v).toFixed(1)}" font-size="8" fill="var(--color-text-muted)">${v}</text>`
    ).join('');

    const totalDone = points.reduce((s, p) => s + p.y, 0);

    return `
      <svg viewBox="0 0 ${W} ${H + 4}" style="width:100%;overflow:visible;">
        ${yLabels}
        <polyline points="${polyline}" fill="none" stroke="var(--color-done-text)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
        ${xLabels}
      </svg>
      <div style="font-size:11px;color:var(--color-text-muted);margin-top:4px;">최근 14일 완료: <strong style="color:var(--color-done-text)">${totalDone}건</strong></div>`;
  },

  // 마감 초과 업무 목록 — 전체 업무에서 마감 초과 검색, 클릭 시 업무 뷰로 이동
  _renderOverdueTasks(d) {
    const today = new Date().toISOString().slice(0, 10);
    const allTasks = d._allTasks || d.weekTasks || [];
    const tasks = allTasks.filter(t =>
      t.due_date && t.due_date.slice(0, 10) < today && t.status !== 'done'
    ).sort((a, b) => a.due_date.localeCompare(b.due_date));

    if (!tasks.length) return `
      <div class="empty-state" style="padding:20px">
        <span class="empty-state-icon" style="color:var(--color-done-text)">✓</span>
        <div class="empty-state-title">마감 초과 업무 없음</div>
      </div>`;

    return `<div style="display:flex;flex-direction:column;gap:6px;">` +
      tasks.slice(0, 10).map(t => {
        const due = t.due_date.slice(0, 10);
        const diff = Math.ceil((new Date(today) - new Date(due)) / (1000 * 60 * 60 * 24));
        return `
          <div class="overdue-task-item" data-task-id="${t.id}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--color-bg-secondary);border-radius:6px;border-left:3px solid var(--color-warn-text);cursor:pointer;transition:background 0.12s;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(t.title)}</div>
              <div style="font-size:11px;color:var(--color-text-muted);margin-top:1px;">${t.assignee_name ? escHtml(t.assignee_name) + ' · ' : ''}${due}</div>
            </div>
            <span style="font-size:11px;font-weight:600;color:var(--color-warn-text);white-space:nowrap;">D+${diff}</span>
          </div>`;
      }).join('') +
      (tasks.length > 10 ? `<div style="text-align:center;font-size:11px;color:var(--color-text-muted);padding:4px;">외 ${tasks.length - 10}건 더...</div>` : '') +
      `</div>`;
  },

  // 차트 타입 분기 렌더
  _renderWithChartType(widgetId, d) {
    const type = this.getChartType(widgetId);
    if (type === 'donut') return this._renderDonut(widgetId, d);
    if (type === 'list') return this._renderList(widgetId, d);
    if (type === 'line') return this._renderLine(widgetId, d);
    return this._renderBar(widgetId, d);
  },

  // 위젯별 데이터 추출 → [{label, count, color}]
  _getChartData(widgetId, d) {
    const COLORS = ['#4F6EF7','#5DD984','#F07070','#9A9BA3','#F0A050','#C07EF7','#50C8F0','#F7C84F'];
    if (widgetId === 'channel-stats') {
      const stats = d.channelStats || [];
      return stats.map((s, i) => ({ label: s.channel, count: parseInt(s.count), color: COLORS[i % COLORS.length] }));
    }
    if (widgetId === 'status-chart') {
      const all = d.weekTasks || [];
      const counts = { todo: 0, in_progress: 0, done: 0, blocked: 0 };
      all.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });
      return [
        { label: '할 일',   count: counts.todo,        color: 'var(--color-plan-text)' },
        { label: '진행 중', count: counts.in_progress,  color: 'var(--color-primary)' },
        { label: '완료',    count: counts.done,         color: 'var(--color-done-text)' },
        { label: '미진행',  count: counts.blocked,      color: 'var(--color-warn-text)' },
      ].filter(e => e.count > 0);
    }
    if (widgetId === 'category-chart') {
      const tasks = d.weekTasks || [];
      const catMap = {};
      tasks.forEach(t => { const n = t.category_name || '미분류'; catMap[n] = (catMap[n] || 0) + 1; });
      return Object.entries(catMap).sort((a, b) => b[1] - a[1])
        .map(([label, count], i) => ({ label, count, color: COLORS[i % COLORS.length] }));
    }
    if (widgetId === 'assignee-chart') {
      const tasks = d.weekTasks || [];
      const userMap = {};
      tasks.forEach(t => { const n = t.assignee_name || '미배정'; userMap[n] = (userMap[n] || 0) + 1; });
      return Object.entries(userMap).sort((a, b) => b[1] - a[1])
        .map(([label, count], i) => ({ label, count, color: COLORS[i % COLORS.length] }));
    }
    return [];
  },

  // 막대 차트 (기존 스타일 유지)
  _renderBar(widgetId, d) {
    const entries = this._getChartData(widgetId, d);
    if (!entries.length) return '<div class="empty-state" style="padding:20px"><div class="empty-state-title">데이터가 없습니다</div></div>';
    const max = Math.max(...entries.map(e => e.count), 1);
    // status-chart는 기존 분할 바 스타일 사용
    if (widgetId === 'status-chart') return this._renderStatusChartBar(d);
    return entries.map(({ label, count, color }) => `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="width:72px;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(label)}</span>
        <div style="flex:1;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden">
          <div style="height:100%;background:${color};width:${Math.round(count/max*100)}%;border-radius:4px;transition:width 0.3s"></div>
        </div>
        <span style="font-size:12px;font-weight:600;min-width:24px;text-align:right;">${count}</span>
      </div>`).join('');
  },

  // 도넛 차트 (SVG)
  _renderDonut(widgetId, d) {
    const entries = this._getChartData(widgetId, d);
    if (!entries.length) return '<div class="empty-state" style="padding:20px"><div class="empty-state-title">데이터가 없습니다</div></div>';
    const total = entries.reduce((s, e) => s + e.count, 0);
    const R = 15.9155; // circumference ≈ 100
    const circ = 2 * Math.PI * R; // ≈ 100

    let offset = 0;
    const segments = entries.map(({ label, count, color }) => {
      const pct = (count / total) * circ;
      const seg = `<circle cx="18" cy="18" r="${R}" fill="none"
        stroke="${color}" stroke-width="3.5"
        stroke-dasharray="${pct.toFixed(2)} ${(circ - pct).toFixed(2)}"
        stroke-dashoffset="${(circ - offset).toFixed(2)}"
        transform="rotate(-90 18 18)"
        style="transition:stroke-dasharray 0.4s"/>`;
      offset += pct;
      return seg;
    }).join('');

    const legendHtml = entries.map(({ label, count, color }) => `
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:3px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>
        <span style="color:var(--color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;">${escHtml(label)}</span>
        <span style="font-weight:600;margin-left:auto;">${count}</span>
      </div>`).join('');

    return `
      <div style="display:flex;align-items:center;gap:16px;">
        <div class="donut-chart" style="position:relative;flex-shrink:0;">
          <svg viewBox="0 0 36 36" class="donut-svg" style="width:90px;height:90px;">
            <circle cx="18" cy="18" r="${R}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3.5"/>
            ${segments}
          </svg>
          <div class="donut-center" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;">
            <span style="font-size:16px;font-weight:700;">${total}</span>
            <span style="font-size:10px;color:var(--color-text-muted);">총 건</span>
          </div>
        </div>
        <div style="flex:1;overflow:hidden;">${legendHtml}</div>
      </div>`;
  },

  // 리스트 차트
  _renderList(widgetId, d) {
    const entries = this._getChartData(widgetId, d);
    if (!entries.length) return '<div class="empty-state" style="padding:20px"><div class="empty-state-title">데이터가 없습니다</div></div>';
    const total = entries.reduce((s, e) => s + e.count, 0);
    return `<ol style="list-style:none;padding:0;margin:0;">` +
      entries.map(({ label, count, color }, i) => `
        <li style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--color-border);">
          <span style="font-size:11px;color:var(--color-text-hint);min-width:16px;">${i + 1}</span>
          <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>
          <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(label)}</span>
          <span style="font-size:12px;font-weight:600;">${count}</span>
          <span style="font-size:11px;color:var(--color-text-muted);">${total > 0 ? Math.round(count/total*100) : 0}%</span>
        </li>`).join('') +
      `</ol>`;
  },

  // 라인 차트 (SVG polyline)
  _renderLine(widgetId, d) {
    const entries = this._getChartData(widgetId, d);
    if (!entries.length) return '<div class="empty-state" style="padding:20px"><div class="empty-state-title">데이터가 없습니다</div></div>';
    const max = Math.max(...entries.map(e => e.count), 1);
    const W = 240, H = 80, pad = 20;
    const innerW = W - pad * 2;
    const innerH = H - pad;
    const step = entries.length > 1 ? innerW / (entries.length - 1) : innerW;
    const points = entries.map((e, i) => {
      const x = pad + (entries.length > 1 ? i * step : innerW / 2);
      const y = pad / 2 + innerH - (e.count / max) * innerH;
      return { x, y, label: e.label, count: e.count, color: e.color };
    });
    const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');
    const dotsHtml = points.map(p => `
      <circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${p.color}" stroke="var(--color-bg-primary)" stroke-width="1.5">
        <title>${escHtml(p.label)}: ${p.count}</title>
      </circle>`).join('');
    const labelsHtml = points.map(p => `
      <text x="${p.x}" y="${H}" text-anchor="middle" font-size="9" fill="var(--color-text-muted)">${escHtml(p.label.slice(0, 5))}</text>`).join('');
    return `
      <svg viewBox="0 0 ${W} ${H + 4}" style="width:100%;overflow:visible;">
        <polyline points="${polylinePoints}" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${dotsHtml}
        ${labelsHtml}
      </svg>`;
  },

  _renderTaskTable(tasks, emptyTitle, emptyDesc) {
    if (!tasks.length) return `<div class="empty-state" style="padding:20px"><span class="empty-state-icon">📋</span><div class="empty-state-title">${emptyTitle}</div><div class="empty-state-desc">${emptyDesc}</div></div>`;
    return `<table class="data-table"><thead><tr><th>업무명</th><th>담당자</th><th>상태</th></tr></thead><tbody>
      ${tasks.map(t => `<tr><td>${t.category_name ? categoryTag(t.category_name) + ' ' : ''}${escHtml(t.title)}</td>
        <td>${t.assignee_name ? App.avatar({name:t.assignee_name,avatar_bg:t.avatar_bg,avatar_text:t.avatar_text}) + ' ' + escHtml(t.assignee_name) : '-'}</td>
        <td>${App.statusBadge(t.status)}</td></tr>`).join('')}</tbody></table>`;
  },

  _renderMyTasks(tasks) {
    if (!tasks.length) return '<div class="empty-state" style="padding:20px"><span class="empty-state-icon">👤</span><div class="empty-state-title">나의 이번 주 업무가 없습니다</div></div>';
    return `<table class="data-table"><thead><tr><th>업무명</th><th>마감일</th><th>상태</th></tr></thead><tbody>
      ${tasks.map(t => `<tr><td>${escHtml(t.title)}</td><td>${t.due_date ? t.due_date.slice(0,10) : '-'}</td><td>${App.statusBadge(t.status)}</td></tr>`).join('')}</tbody></table>`;
  },

  // 기존 status-chart 막대 스타일 (분할 바)
  _renderStatusChartBar(d) {
    const tasks = d.weekTasks || [];
    const counts = { todo: 0, in_progress: 0, done: 0, blocked: 0 };
    tasks.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return '<div class="empty-state" style="padding:20px"><div class="empty-state-title">업무 데이터가 없습니다</div></div>';

    const bars = [
      { label: '할 일', count: counts.todo, color: 'var(--color-plan-text)' },
      { label: '진행 중', count: counts.in_progress, color: 'var(--color-primary)' },
      { label: '완료', count: counts.done, color: 'var(--color-done-text)' },
      { label: '미진행', count: counts.blocked, color: 'var(--color-warn-text)' },
    ];

    return `
      <div style="display:flex;gap:4px;height:24px;border-radius:6px;overflow:hidden;margin-bottom:12px;">
        ${bars.filter(b => b.count > 0).map(b => `<div style="flex:${b.count};background:${b.color};min-width:4px;" title="${b.label}: ${b.count}건"></div>`).join('')}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;">
        ${bars.map(b => `<div style="display:flex;align-items:center;gap:6px;font-size:12px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${b.color};"></span>
          <span style="color:var(--color-text-muted)">${b.label}</span>
          <span style="font-weight:600;">${b.count}</span>
        </div>`).join('')}
      </div>`;
  },

  bindEvents(layout) {
    const content = document.getElementById('content');
    const grid = document.getElementById('dashboard-grid');

    // 마감 초과 업무 클릭 → 업무 현황으로 이동
    content.querySelectorAll('.overdue-task-item').forEach(item => {
      item.addEventListener('click', () => {
        App.navigate('tasks');
      });
    });

    // 빠른 기간 버튼
    content.querySelectorAll('.dash-period-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        this._dateFrom = btn.dataset.from;
        this._dateTo = btn.dataset.to;
        document.getElementById('dash-date-from').value = this._dateFrom;
        document.getElementById('dash-date-to').value = this._dateTo;
        try {
          await this._fetchData();
          this.renderGrid();
        } catch {
          App.toast('데이터를 불러올 수 없습니다.', 'error');
        }
      });
    });

    // 위젯 새로고침 버튼
    if (grid) {
      grid.querySelectorAll('[data-refresh-widget]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const widgetId = btn.dataset.refreshWidget;
          btn.style.opacity = '0.4';
          try {
            await this._fetchData();
            const widgetEl = grid.querySelector(`[data-widget-id="${widgetId}"]`);
            if (widgetEl) {
              widgetEl.querySelector('.widget-body').innerHTML = this.renderWidgetContent(widgetId, this._data);
            }
          } catch {
            App.toast('새로고침 실패', 'error');
          }
          btn.style.opacity = '';
        });
      });

      // 위젯 크기 토글 버튼 (편집 모드)
      grid.querySelectorAll('[data-size-widget]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const widgetId = btn.dataset.sizeWidget;
          const current = this.getWidgetSize(widgetId) || (this.WIDGETS.find(w => w.id === widgetId)?.size || 'half');
          const cycle = { quarter: 'half', half: 'full', full: 'quarter' };
          const next = cycle[current] || 'half';
          this.setWidgetSize(widgetId, next);
          this.renderGrid();
        });
      });
    }

    // 날짜 필터 이벤트
    const applyBtn = document.getElementById('btn-dash-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', async () => {
        this._dateFrom = document.getElementById('dash-date-from').value;
        this._dateTo   = document.getElementById('dash-date-to').value;
        applyBtn.textContent = '불러오는 중...';
        applyBtn.disabled = true;
        try {
          await this._fetchData();
          this.renderGrid();
        } catch {
          App.toast('데이터를 불러올 수 없습니다.', 'error');
          applyBtn.textContent = '적용';
          applyBtn.disabled = false;
        }
      });
    }
    const resetBtn = document.getElementById('btn-dash-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        this._dateFrom = '';
        this._dateTo = '';
        try {
          await this._fetchData();
          this.renderGrid();
        } catch {
          App.toast('데이터를 불러올 수 없습니다.', 'error');
        }
      });
    }

    // 차트 타입 토글 버튼
    if (grid) {
      grid.querySelectorAll('.chart-type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const toggle = btn.closest('.chart-type-toggle');
          const widgetId = toggle?.dataset.widget;
          const type = btn.dataset.type;
          if (!widgetId || !type) return;
          this.setChartType(widgetId, type);
          // 해당 위젯 body만 업데이트
          const widgetEl = grid.querySelector(`[data-widget-id="${widgetId}"]`);
          if (widgetEl) {
            widgetEl.querySelector('.widget-body').innerHTML = this.renderWidgetContent(widgetId, this._data);
            widgetEl.querySelectorAll('.chart-type-btn').forEach(b => {
              b.classList.toggle('active', b.dataset.type === type);
            });
          }
        });
      });
    }

    if (!grid) return;

    if (this.editMode) {
      // 드래그 앤 드롭
      const widgets = grid.querySelectorAll('.dashboard-widget');
      widgets.forEach(widget => {
        widget.addEventListener('dragstart', (e) => {
          this.dragSrcIdx = parseInt(widget.dataset.idx);
          e.dataTransfer.setData('text/plain', widget.dataset.idx);
          e.dataTransfer.effectAllowed = 'move';
          setTimeout(() => widget.classList.add('dragging'), 0);
        });
        widget.addEventListener('dragend', () => {
          widget.classList.remove('dragging');
          grid.querySelectorAll('.dashboard-widget').forEach(w => w.classList.remove('drag-over'));
        });
        widget.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          grid.querySelectorAll('.dashboard-widget').forEach(w => w.classList.remove('drag-over'));
          if (parseInt(widget.dataset.idx) !== this.dragSrcIdx) {
            widget.classList.add('drag-over');
          }
        });
        widget.addEventListener('drop', (e) => {
          e.preventDefault();
          const srcIdx = this.dragSrcIdx;
          const tgtIdx = parseInt(widget.dataset.idx);
          if (srcIdx !== null && srcIdx !== tgtIdx) {
            const ids = [...layout];
            const [moved] = ids.splice(srcIdx, 1);
            ids.splice(tgtIdx, 0, moved);
            this.saveLayout(ids);
            this.renderGrid();
          }
        });
      });

      // 위젯 제거
      grid.querySelectorAll('[data-remove-widget]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.removeWidget;
          const ids = layout.filter(wid => wid !== id);
          this.saveLayout(ids);
          this.renderGrid();
        });
      });

      // 위젯 추가 드롭다운
      const addBtn = document.getElementById('btn-add-widget');
      const dropdown = document.getElementById('widget-add-dropdown');
      if (addBtn && dropdown) {
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });
        dropdown.querySelectorAll('[data-add-widget]').forEach(item => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            const widgetId = item.dataset.addWidget;
            const ids = [...layout, widgetId];
            this.saveLayout(ids);
            dropdown.style.display = 'none';
            this.renderGrid();
          });
        });
      }
    }
  },
};
