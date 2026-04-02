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

    // 전역 날짜 필터 바
    const dateFilterHtml = `
      <div class="dashboard-date-filter">
        <span style="font-size:12px;color:var(--color-text-muted);white-space:nowrap;">기간:</span>
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
    const spanClass = widget.size === 'quarter' ? 'span-1' : widget.size === 'half' ? 'span-2' : 'span-4';
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
        </div>
      `;
    }

    return `
      <div class="dashboard-widget ${spanClass} ${editClass}" data-widget-id="${widgetId}" data-idx="${idx}" ${draggable}>
        <div class="widget-header">
          ${this.editMode ? '<div class="widget-drag-handle" title="드래그하여 이동">⠿</div>' : ''}
          <span class="widget-title">${widget.title}</span>
          ${chartToggleHtml}
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

      default: return '';
    }
  },

  // 차트 타입 분기 렌더
  _renderWithChartType(widgetId, d) {
    const type = this.getChartType(widgetId);
    if (type === 'donut') return this._renderDonut(widgetId, d);
    if (type === 'list') return this._renderList(widgetId, d);
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
      const weekTasks = d.weekTasks || [];
      const all = [...weekTasks, ...(d.myTasks || [])];
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
    const weekTasks = d.weekTasks || [];
    const all = [...weekTasks, ...(d.myTasks || [])];
    const counts = { todo: 0, in_progress: 0, done: 0, blocked: 0 };
    all.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });
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
