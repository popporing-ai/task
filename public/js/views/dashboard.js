// 대시보드 뷰 — 위젯 기반 커스터마이징 지원
const DashboardView = {
  // 사용 가능한 위젯 정의
  WIDGETS: [
    { id: 'week-tasks',        title: '이번 주 업무',       size: 'half' },
    { id: 'week-summary',      title: '이번 주 요약',       size: 'quarter' },
    { id: 'content-summary',   title: '콘텐츠 발행',        size: 'quarter' },
    { id: 'active-categories', title: '진행 분류',          size: 'quarter' },
    { id: 'blocked-count',     title: '미진행 업무',        size: 'quarter' },
    { id: 'channel-stats',     title: '채널별 발행 현황',   size: 'half' },
    { id: 'my-tasks',          title: '나의 이번 주 업무',  size: 'half' },
  ],

  STORAGE_KEY: 'dashboard_layout',

  // 편집 모드 상태
  editMode: false,
  // 드래그 상태
  dragSrcId: null,

  // 저장된 레이아웃 로드 (없으면 기본 순서)
  loadLayout() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const ids = JSON.parse(saved);
        // 저장된 id 중 유효한 것만, 새로 추가된 위젯은 끝에 추가
        const validIds = ids.filter(id => this.WIDGETS.find(w => w.id === id));
        const allIds = this.WIDGETS.map(w => w.id);
        const missing = allIds.filter(id => !validIds.includes(id));
        return [...validIds, ...missing];
      }
    } catch (e) {}
    return this.WIDGETS.map(w => w.id);
  },

  saveLayout(ids) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(ids));
  },

  // 현재 렌더된 위젯 순서를 DOM에서 읽어 반환
  getCurrentLayoutIds() {
    const grid = document.getElementById('dashboard-grid');
    if (!grid) return [];
    return Array.from(grid.querySelectorAll('.dashboard-widget')).map(el => el.dataset.widgetId);
  },

  async render() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <span>대시보드 불러오는 중...</span>
      </div>
    `;

    // 편집 모드 버튼을 topbar-actions에 추가
    this.renderTopbarActions();

    try {
      const res = await API.get('/dashboard');
      this._data = res.data;
      this.editMode = false;
      this.renderGrid();
    } catch (e) {
      content.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">⚠</span>
          <div class="empty-state-title">대시보드를 불러올 수 없습니다</div>
          <div class="empty-state-desc">잠시 후 다시 시도해주세요</div>
        </div>
      `;
    }
  },

  renderTopbarActions() {
    const actions = document.getElementById('topbar-actions');
    if (!actions) return;
    actions.innerHTML = `
      <button class="btn btn-default" id="btn-edit-dashboard" style="font-size:13px;">대시보드 편집</button>
    `;
    document.getElementById('btn-edit-dashboard').addEventListener('click', () => {
      this.toggleEditMode();
    });
  },

  toggleEditMode() {
    this.editMode = !this.editMode;
    const btn = document.getElementById('btn-edit-dashboard');
    if (btn) btn.textContent = this.editMode ? '편집 완료' : '대시보드 편집';
    this.renderGrid();
  },

  renderGrid() {
    const content = document.getElementById('content');
    const layout = this.loadLayout();
    const d = this._data;

    let addWidgetBtn = '';
    if (this.editMode) {
      // 현재 그리드에 없는 위젯 목록
      const hiddenWidgets = this.WIDGETS.filter(w => !layout.includes(w.id));
      const dropdownItems = hiddenWidgets.length > 0
        ? hiddenWidgets.map(w => `<div class="widget-add-item" data-widget-id="${w.id}">${w.title}</div>`).join('')
        : `<div class="widget-add-item widget-add-empty">추가할 위젯이 없습니다</div>`;

      addWidgetBtn = `
        <div class="widget-add-wrap" id="widget-add-wrap">
          <button class="btn btn-primary" id="btn-add-widget" style="font-size:13px;">+ 위젯 추가</button>
          <div class="widget-add-dropdown" id="widget-add-dropdown" style="display:none;">
            ${dropdownItems}
          </div>
        </div>
      `;
    }

    content.innerHTML = `
      <div class="dashboard-grid" id="dashboard-grid">
        ${layout.map(id => this.renderWidgetShell(id, d)).join('')}
      </div>
      ${this.editMode ? `<div class="dashboard-edit-bar">${addWidgetBtn}</div>` : ''}
    `;

    this.bindGridEvents();
  },

  // 위젯 외곽 셸 (편집 핸들 포함)
  renderWidgetShell(widgetId, d) {
    const widget = this.WIDGETS.find(w => w.id === widgetId);
    if (!widget) return '';
    const spanClass = widget.size === 'quarter' ? 'span-1' : widget.size === 'half' ? 'span-2' : 'span-4';
    const editAttrs = this.editMode ? 'draggable="true"' : '';
    const editClass = this.editMode ? 'edit-mode' : '';

    const dragHandle = this.editMode
      ? `<div class="widget-drag-handle" title="드래그하여 이동">
           <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
             <circle cx="4" cy="3" r="1.2" fill="currentColor"/>
             <circle cx="10" cy="3" r="1.2" fill="currentColor"/>
             <circle cx="4" cy="7" r="1.2" fill="currentColor"/>
             <circle cx="10" cy="7" r="1.2" fill="currentColor"/>
             <circle cx="4" cy="11" r="1.2" fill="currentColor"/>
             <circle cx="10" cy="11" r="1.2" fill="currentColor"/>
           </svg>
         </div>`
      : '';

    const removeBtn = this.editMode
      ? `<button class="widget-remove-btn" data-widget-id="${widgetId}" title="위젯 제거">✕</button>`
      : '';

    return `
      <div class="dashboard-widget ${spanClass} ${editClass}" data-widget-id="${widgetId}" ${editAttrs}>
        <div class="widget-header">
          ${dragHandle}
          <span class="widget-title">${widget.title}</span>
          ${removeBtn}
        </div>
        <div class="widget-body">
          ${this.renderWidgetContent(widgetId, d)}
        </div>
      </div>
    `;
  },

  // 위젯 내용 렌더링
  renderWidgetContent(widgetId, d) {
    if (!d) return '<div class="empty-state" style="padding:20px">데이터 없음</div>';
    const week = d.weekSummary || {};
    const cont = d.contentSummary || {};
    const contentPct = cont.total > 0 ? Math.round((cont.done_count / cont.total) * 100) : 0;

    switch (widgetId) {
      case 'week-summary':
        return `
          <div class="metric-value">${week.total || 0}</div>
          <div class="metric-sub">완료 ${week.done_count || 0} · 예정 ${week.pending_count || 0}</div>
        `;

      case 'content-summary':
        return `
          <div class="metric-value">${cont.done_count || 0} / ${cont.total || 0}</div>
          <div class="progress-bar"><div class="progress-fill" style="width:${contentPct}%"></div></div>
          <div class="metric-sub">${contentPct}% 완료</div>
        `;

      case 'active-categories':
        return `
          <div class="metric-value">${d.activeCategoryCount || 0}개</div>
        `;

      case 'blocked-count':
        return `
          <div class="metric-value" style="color:var(--color-warn-text)">${d.blockedCount || 0}</div>
        `;

      case 'week-tasks': {
        const tasks = d.weekTasks || [];
        if (tasks.length === 0) return `
          <div class="empty-state" style="padding:24px 12px">
            <span class="empty-state-icon">📋</span>
            <div class="empty-state-title">이번 주 업무가 없습니다</div>
            <div class="empty-state-desc">업무 현황에서 새 업무를 추가해보세요</div>
          </div>
        `;
        return `
          <table class="data-table">
            <thead><tr><th>업무명</th><th>담당자</th><th>상태</th></tr></thead>
            <tbody>
              ${tasks.map(t => `
                <tr>
                  <td>${t.category_name ? categoryTag(t.category_name) + ' ' : ''}${escHtml(t.title)}</td>
                  <td>${t.assignee_name ? App.avatar({name: t.assignee_name, avatar_bg: t.avatar_bg, avatar_text: t.avatar_text}) + ' ' + escHtml(t.assignee_name) : '-'}</td>
                  <td>${App.statusBadge(t.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }

      case 'channel-stats': {
        const stats = d.channelStats || [];
        if (stats.length === 0) return `
          <div class="empty-state" style="padding:24px 12px">
            <span class="empty-state-icon">📊</span>
            <div class="empty-state-title">발행 데이터가 없습니다</div>
            <div class="empty-state-desc">콘텐츠 캘린더에서 발행 완료 항목을 추가해보세요</div>
          </div>
        `;
        return stats.map(ch => `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <span style="width:24px;font-weight:600;font-size:12px;">${ch.channel}</span>
            <span style="font-size:12px;color:var(--color-text-muted);width:30px;">${ch.count}건</span>
            <div style="flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden">
              <div style="height:100%;background:var(--color-primary);width:${Math.min(ch.count * 10, 100)}%;border-radius:3px;box-shadow:0 0 6px rgba(79,110,247,0.45)"></div>
            </div>
          </div>
        `).join('');
      }

      case 'my-tasks': {
        const myTasks = d.myTasks || [];
        if (myTasks.length === 0) return `
          <div class="empty-state" style="padding:24px 12px">
            <span class="empty-state-icon">👤</span>
            <div class="empty-state-title">나의 이번 주 업무가 없습니다</div>
          </div>
        `;
        return `
          <table class="data-table">
            <thead><tr><th>업무명</th><th>마감일</th><th>상태</th></tr></thead>
            <tbody>
              ${myTasks.map(t => `
                <tr>
                  <td>${escHtml(t.title)}</td>
                  <td>${escHtml(t.due_date) || '-'}</td>
                  <td>${App.statusBadge(t.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }

      default:
        return '';
    }
  },

  bindGridEvents() {
    const grid = document.getElementById('dashboard-grid');
    if (!grid) return;

    if (this.editMode) {
      // 드래그 앤 드롭 이벤트
      grid.querySelectorAll('.dashboard-widget').forEach(widget => {
        widget.addEventListener('dragstart', e => {
          this.dragSrcId = widget.dataset.widgetId;
          widget.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        widget.addEventListener('dragend', () => {
          widget.classList.remove('dragging');
          grid.querySelectorAll('.dashboard-widget').forEach(w => w.classList.remove('drag-over'));
        });
        widget.addEventListener('dragover', e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          grid.querySelectorAll('.dashboard-widget').forEach(w => w.classList.remove('drag-over'));
          if (widget.dataset.widgetId !== this.dragSrcId) {
            widget.classList.add('drag-over');
          }
        });
        widget.addEventListener('drop', e => {
          e.preventDefault();
          const targetId = widget.dataset.widgetId;
          if (this.dragSrcId && targetId && this.dragSrcId !== targetId) {
            const ids = this.getCurrentLayoutIds();
            const srcIdx = ids.indexOf(this.dragSrcId);
            const tgtIdx = ids.indexOf(targetId);
            if (srcIdx !== -1 && tgtIdx !== -1) {
              ids.splice(srcIdx, 1);
              ids.splice(tgtIdx, 0, this.dragSrcId);
              this.saveLayout(ids);
              this.renderGrid();
            }
          }
        });
      });

      // 위젯 제거 버튼
      grid.querySelectorAll('.widget-remove-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const widgetId = btn.dataset.widgetId;
          const ids = this.getCurrentLayoutIds().filter(id => id !== widgetId);
          this.saveLayout(ids);
          this.renderGrid();
        });
      });

      // 위젯 추가 드롭다운
      const addBtn = document.getElementById('btn-add-widget');
      const dropdown = document.getElementById('widget-add-dropdown');
      if (addBtn && dropdown) {
        addBtn.addEventListener('click', e => {
          e.stopPropagation();
          dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });
        dropdown.querySelectorAll('.widget-add-item:not(.widget-add-empty)').forEach(item => {
          item.addEventListener('click', () => {
            const widgetId = item.dataset.widgetId;
            const ids = this.getCurrentLayoutIds();
            if (!ids.includes(widgetId)) {
              ids.push(widgetId);
              this.saveLayout(ids);
              this.renderGrid();
            }
          });
        });
        // 외부 클릭 시 드롭다운 닫기
        document.addEventListener('click', function closeDropdown() {
          if (dropdown) dropdown.style.display = 'none';
          document.removeEventListener('click', closeDropdown);
        });
      }
    }
  },
};
