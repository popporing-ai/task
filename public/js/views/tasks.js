// 업무 현황 (칸반 보드) 뷰
const TasksView = {
  tasks: [],
  filterCategories: [],  // 다중 선택 배열
  filterAssignees: [],   // 다중 선택 배열
  filterDateFrom: '',
  filterDateTo: '',
  filterDropdownOpen: false,
  showArchived: false,   // 아카이브 보기 모드
  sortBy: 'default',     // 정렬 기준: default | due_date | created_at | title
  viewMode: localStorage.getItem('task_view_mode') || 'kanban', // 'kanban' | 'list'
  compactMode: localStorage.getItem('task_compact_mode') === 'true', // 컴팩트/확장 토글
  selectedTaskIds: [],   // 리스트 뷰 다중 선택

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = '<button class="btn btn-primary" id="btn-add-task">+ 업무 추가</button>';
    document.getElementById('btn-add-task').addEventListener('click', () => this.openForm());

    // 로딩 상태
    content.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <span>업무 목록 불러오는 중...</span>
      </div>
    `;

    await this.loadTasks();
    this.renderBoard(content);
  },

  async loadTasks() {
    try {
      const params = this.showArchived ? '?archived=true' : '';
      const res = await API.get('/tasks' + params);
      this.tasks = res.data;
    } catch (e) {
      this.tasks = [];
    }
  },

  getFiltered() {
    return this.tasks.filter(t => {
      if (this.filterCategories.length && !this.filterCategories.includes(String(t.category_id))) return false;
      if (this.filterAssignees.length && !this.filterAssignees.includes(String(t.assignee_id))) return false;
      if (this.filterDateFrom && t.due_date && t.due_date.slice(0, 10) < this.filterDateFrom) return false;
      if (this.filterDateTo && t.due_date && t.due_date.slice(0, 10) > this.filterDateTo) return false;
      return true;
    });
  },

  getSorted(tasks) {
    const arr = [...tasks];
    if (this.sortBy === 'due_date') {
      arr.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });
    } else if (this.sortBy === 'created_at') {
      arr.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    } else if (this.sortBy === 'title') {
      arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko'));
    }
    return arr;
  },

  renderBoard(content) {
    const filtered = this.getFiltered();
    const cols = [
      { key: 'todo', label: '할 일' },
      { key: 'in_progress', label: '진행 중' },
      { key: 'done', label: '완료' },
      { key: 'blocked', label: '지연' },
    ];

    // 활성 필터 태그 생성
    const activeTags = [
      ...this.filterCategories.map(id => {
        const cat = App.categories.find(c => String(c.id) === id);
        return cat ? `<span class="filter-tag" data-remove-cat="${id}">${escHtml(cat.name)} ×</span>` : '';
      }),
      ...this.filterAssignees.map(id => {
        const user = App.users.find(u => String(u.id) === id);
        return user ? `<span class="filter-tag" data-remove-user="${id}">${escHtml(user.name)} ×</span>` : '';
      }),
      this.filterDateFrom || this.filterDateTo ? `<span class="filter-tag" data-remove-date="1">마감일 ${this.filterDateFrom || ''}~${this.filterDateTo || ''} ×</span>` : '',
    ].join('');

    // 필터 드롭다운 HTML — 다크 테마 색상 사용
    const dropdownHtml = `
      <div class="filter-dropdown" id="filter-dropdown" style="display:none;position:absolute;top:calc(100% + 6px);left:0;z-index:80;background:var(--color-bg-primary);border-radius:10px;padding:16px;min-width:320px;box-shadow:var(--shadow-lg);border:0.5px solid var(--color-border);">
        <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:8px;">분류</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
          ${App.categories.map(c => `
            <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;padding:3px 8px;border-radius:6px;border:0.5px solid var(--color-border);background:${this.filterCategories.includes(String(c.id)) ? 'var(--color-primary-bg)' : 'var(--color-bg-secondary)'};color:var(--color-text-primary);transition:background 0.12s;">
              <input type="checkbox" data-filter-cat="${c.id}" ${this.filterCategories.includes(String(c.id)) ? 'checked' : ''} style="width:auto;height:auto;margin:0;accent-color:var(--color-primary);">
              ${escHtml(c.name)}
            </label>
          `).join('')}
        </div>
        <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:8px;">담당자</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
          ${App.users.map(u => `
            <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;padding:3px 8px;border-radius:6px;border:0.5px solid var(--color-border);background:${this.filterAssignees.includes(String(u.id)) ? 'var(--color-primary-bg)' : 'var(--color-bg-secondary)'};color:var(--color-text-primary);transition:background 0.12s;">
              <input type="checkbox" data-filter-user="${u.id}" ${this.filterAssignees.includes(String(u.id)) ? 'checked' : ''} style="width:auto;height:auto;margin:0;accent-color:var(--color-primary);">
              ${escHtml(u.name)}
            </label>
          `).join('')}
        </div>
        <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:8px;">마감일 범위</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
          <input type="date" id="filter-date-from" value="${this.filterDateFrom}" style="flex:1;font-size:12px;padding:4px 8px;border-radius:6px;border:0.5px solid var(--color-border);background:var(--color-bg-secondary);color:var(--color-text-primary);">
          <span style="color:var(--color-text-muted);font-size:12px;">~</span>
          <input type="date" id="filter-date-to" value="${this.filterDateTo}" style="flex:1;font-size:12px;padding:4px 8px;border-radius:6px;border:0.5px solid var(--color-border);background:var(--color-bg-secondary);color:var(--color-text-primary);">
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:8px;border-top:1px solid var(--color-border);">
          <button class="btn" id="filter-reset" style="font-size:12px;padding:5px 12px;">초기화</button>
          <button class="btn btn-primary" id="filter-apply" style="font-size:12px;padding:5px 12px;">적용</button>
        </div>
      </div>
    `;

    // 정렬 드롭다운 HTML
    const sortLabels = { default: '정렬 ▼', due_date: '마감일순 ▼', created_at: '최신순 ▼', title: '이름순 ▼' };
    const sortDropdownHtml = `
      <div style="position:relative;">
        <button class="filter-btn ${this.sortBy !== 'default' ? 'active' : ''}" id="sort-toggle-btn">${sortLabels[this.sortBy] || '정렬 ▼'}</button>
        <div id="sort-dropdown" style="display:none;position:absolute;top:calc(100% + 6px);left:0;z-index:80;background:var(--color-bg-primary);border-radius:10px;padding:8px;min-width:140px;box-shadow:var(--shadow-lg);border:0.5px solid var(--color-border);">
          ${[
            { key: 'default', label: '기본순' },
            { key: 'due_date', label: '마감일순' },
            { key: 'created_at', label: '최신순' },
            { key: 'title', label: '이름순' },
          ].map(opt => `
            <button data-sort="${opt.key}" style="display:block;width:100%;text-align:left;padding:7px 10px;font-size:12px;border:none;background:${this.sortBy === opt.key ? 'var(--color-primary-bg)' : 'transparent'};color:${this.sortBy === opt.key ? 'var(--color-primary)' : 'var(--color-text-primary)'};border-radius:6px;cursor:pointer;">
              ${opt.label}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    const hasFilters = this.filterCategories.length || this.filterAssignees.length || this.filterDateFrom || this.filterDateTo;

    // 뷰 토글 버튼
    const viewToggleHtml = `
      <div class="view-toggle-group">
        <button class="view-toggle-btn ${this.viewMode === 'kanban' ? 'active' : ''}" id="view-kanban-btn" title="칸반 보기">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="4" height="14" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="6" y="1" width="4" height="14" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="11" y="1" width="4" height="14" rx="1" stroke="currentColor" stroke-width="1.4"/></svg>
          칸반
        </button>
        <button class="view-toggle-btn ${this.viewMode === 'list' ? 'active' : ''}" id="view-list-btn" title="리스트 보기">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          리스트
        </button>
      </div>
    `;

    // 빠른 필터 카테고리 버튼 (localStorage 기반)
    const quickCatIds = this._getQuickFilterButtons();
    const quickCatBtns = quickCatIds.map(id => {
      const cat = App.categories.find(c => String(c.id) === String(id));
      if (!cat) return '';
      const isActive = this.filterCategories.includes(String(cat.id));
      return `<button class="filter-btn ${isActive ? 'active' : ''}" data-quick-cat="${cat.id}">${escHtml(cat.name)}</button>`;
    }).join('');

    // 빠른 필터 기어 드롭다운
    const gearDropdownHtml = `
      <div style="position:relative;display:inline-block;">
        <button class="filter-btn" id="quick-filter-gear-btn" title="빠른 필터 설정" style="padding:4px 8px;display:inline-flex;align-items:center;"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 2h4l.5 2.5 2.12-1.22 1.41 1.42L12.82 6.8 15 7v4l-2.5.5 1.22 2.12-1.42 1.41-2.1-1.21L10 15H6l-.5-2.5-2.12 1.22-1.41-1.42 1.21-2.1L1 10V6l2.5-.5L2.28 3.38l1.42-1.41 2.1 1.21L6 2z" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/></svg></button>
        <div id="quick-filter-gear-dropdown" style="display:none;position:absolute;top:calc(100% + 6px);left:0;z-index:90;background:var(--color-bg-primary);border-radius:10px;padding:12px;min-width:200px;box-shadow:var(--shadow-lg);border:0.5px solid var(--color-border);">
          <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:8px;">빠른 필터 버튼</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${App.categories.map(c => `
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:4px 6px;border-radius:6px;color:var(--color-text-primary);">
                <input type="checkbox" data-gear-cat="${c.id}" ${quickCatIds.includes(String(c.id)) ? 'checked' : ''} style="width:auto;height:auto;margin:0;accent-color:var(--color-primary);">
                ${escHtml(c.name)}
              </label>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    // 컴팩트 모드 토글 버튼
    const compactToggleHtml = `
      <button class="compact-toggle-btn ${this.compactMode ? 'active' : ''}" id="compact-toggle" title="${this.compactMode ? '확장 보기' : '컴팩트 보기'}">
        ${this.compactMode ? '═' : '≡'}
      </button>
    `;

    // 카드 표시 항목 드롭다운
    const cardFields = this._getCardFieldPrefs();
    const cardFieldOptions = [
      { key: 'category', label: '분류 태그', default: true },
      { key: 'assignee', label: '담당자', default: true },
      { key: 'due_date', label: '마감일', default: true },
      { key: 'subtasks', label: '서브태스크 진행률', default: true },
      { key: 'comments', label: '댓글 수', default: true },
      { key: 'attachments', label: '첨부파일 표시', default: true },
    ];
    const cardFieldDropdownHtml = `
      <div style="position:relative;display:inline-block;">
        <button class="filter-btn" id="card-fields-btn" title="표시 항목 설정" style="font-size:11px;padding:4px 8px;">표시 항목</button>
        <div id="card-fields-dropdown" style="display:none;position:absolute;top:calc(100% + 6px);right:0;z-index:90;background:var(--color-bg-primary);border-radius:10px;padding:12px;min-width:180px;box-shadow:var(--shadow-lg);border:0.5px solid var(--color-border);">
          <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:8px;">카드 표시 항목</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${cardFieldOptions.map(opt => `
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:4px 6px;border-radius:6px;color:var(--color-text-primary);">
                <input type="checkbox" data-card-field="${opt.key}" ${cardFields[opt.key] ? 'checked' : ''} style="width:auto;height:auto;margin:0;accent-color:var(--color-primary);">
                ${opt.label}
              </label>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    // 필터 바
    const filterHtml = `
      <div class="filter-bar" style="position:relative;">
        ${viewToggleHtml}
        ${this.viewMode === 'kanban' ? compactToggleHtml : ''}
        ${this.viewMode === 'kanban' ? cardFieldDropdownHtml : ''}
        <button class="filter-btn ${!hasFilters && !this.showArchived ? 'active' : ''}" id="filter-all">전체</button>
        <div style="position:relative;">
          <button class="filter-btn ${hasFilters ? 'active' : ''}" id="filter-toggle-btn">필터 ▼</button>
          ${dropdownHtml}
        </div>
        ${sortDropdownHtml}
        <button class="filter-btn ${this.showArchived ? 'active' : ''}" id="archive-toggle-btn" style="margin-left:4px;">아카이브 보기</button>
        ${quickCatBtns}
        ${gearDropdownHtml}
        ${activeTags}
      </div>
    `;

    // 아카이브 뷰
    if (this.showArchived) {
      const sorted = this.getSorted(filtered);
      const archiveItemsHtml = sorted.length > 0
        ? sorted.map(t => `
          <div class="kanban-card" data-id="${t.id}" style="display:flex;align-items:center;gap:12px;padding:12px 16px;margin-bottom:6px;opacity:1;">
            <div style="flex:1;min-width:0;">
              ${t.category_name ? categoryTag(t.category_name) : ''}
              <div class="card-title" style="margin-top:4px;">${escHtml(t.title)}</div>
              <div style="font-size:11px;color:var(--color-text-muted);margin-top:4px;">
                ${t.assignee_name ? escHtml(t.assignee_name) : '담당자 없음'}
                ${t.due_date ? ' · 마감 ' + t.due_date.slice(0, 10) : ''}
              </div>
            </div>
            <button class="btn" data-restore-id="${t.id}" style="font-size:12px;padding:5px 12px;flex-shrink:0;">복원</button>
          </div>
        `).join('')
        : `<div style="text-align:center;padding:48px;color:var(--color-text-muted);">아카이브된 업무가 없습니다.</div>`;

      // 기간 필터 버튼
      const now = new Date();
      const periodBtns = [
        { label: '이번 달', from: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, to: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31` },
        { label: '이번 분기', from: this._quarterStart(now), to: this._quarterEnd(now) },
        { label: '상반기', from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-06-30` },
        { label: '하반기', from: `${now.getFullYear()}-07-01`, to: `${now.getFullYear()}-12-31` },
        { label: '연간', from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` },
      ];
      const periodHtml = `
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
          <span style="font-size:11px;color:var(--color-text-muted);font-weight:600;">기간:</span>
          ${periodBtns.map(p => `
            <button class="filter-btn archive-period-btn" data-from="${p.from}" data-to="${p.to}" style="font-size:11px;padding:3px 8px;">${p.label}</button>
          `).join('')}
          <button class="filter-btn" id="archive-period-reset" style="font-size:11px;padding:3px 8px;">전체</button>
        </div>
      `;

      content.innerHTML = filterHtml + `
        <div style="max-width:720px;">
          <div style="font-size:13px;font-weight:600;color:var(--color-text-muted);margin-bottom:10px;">아카이브된 업무 ${sorted.length}건</div>
          ${periodHtml}
          <div id="archive-list">${archiveItemsHtml}</div>
        </div>
      `;

      // 복원 버튼 이벤트
      content.querySelectorAll('[data-restore-id]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await API.patch(`/tasks/${btn.dataset.restoreId}/archive`, { archived: false });
          App.toast('복원되었습니다.', 'success');
          await this.loadTasks();
          this.renderBoard(content);
        });
      });

      // 기간 필터 버튼
      content.querySelectorAll('.archive-period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.filterDateFrom = btn.dataset.from;
          this.filterDateTo = btn.dataset.to;
          this.renderBoard(content);
        });
      });
      content.querySelector('#archive-period-reset')?.addEventListener('click', () => {
        this.filterDateFrom = '';
        this.filterDateTo = '';
        this.renderBoard(content);
      });

      this._bindFilterBarEvents(content);
      return;
    }

    // 리스트 뷰
    if (this.viewMode === 'list') {
      const sorted = this.getSorted(filtered);
      const allChecked = sorted.length > 0 && sorted.every(t => this.selectedTaskIds.includes(t.id));
      const someChecked = this.selectedTaskIds.length > 0;

      const listHtml = `
        <div class="list-view-wrap">
          ${someChecked ? `
            <div class="bulk-action-bar">
              <span style="font-size:13px;color:var(--color-text-muted);">${this.selectedTaskIds.length}개 선택됨</span>
              <button class="btn" id="bulk-status-btn">상태 변경</button>
              <button class="btn" id="bulk-assignee-btn">담당자 변경</button>
              <button class="btn btn-danger" id="bulk-delete-btn">삭제</button>
              <button class="btn" id="bulk-cancel-btn">취소</button>
              <div id="bulk-status-dropdown" style="display:none;position:absolute;top:calc(100% + 4px);left:0;background:var(--color-bg-primary);border:0.5px solid var(--color-border);border-radius:8px;padding:6px;z-index:90;box-shadow:var(--shadow-md);">
                ${[{v:'todo',l:'할 일'},{v:'in_progress',l:'진행 중'},{v:'done',l:'완료'},{v:'blocked',l:'지연'}].map(s=>`<button class="bulk-status-opt" data-status="${s.v}" style="display:block;width:100%;text-align:left;padding:6px 10px;font-size:12px;border:none;background:transparent;color:var(--color-text-primary);border-radius:6px;cursor:pointer;">${s.l}</button>`).join('')}
              </div>
              <div id="bulk-assignee-dropdown" style="display:none;position:absolute;top:calc(100% + 4px);left:0;background:var(--color-bg-primary);border:0.5px solid var(--color-border);border-radius:8px;padding:6px;z-index:90;box-shadow:var(--shadow-md);">
                ${App.users.map(u=>`<button class="bulk-assignee-opt" data-user-id="${u.id}" style="display:block;width:100%;text-align:left;padding:6px 10px;font-size:12px;border:none;background:transparent;color:var(--color-text-primary);border-radius:6px;cursor:pointer;">${escHtml(u.name)}</button>`).join('')}
              </div>
            </div>
          ` : ''}
          <table class="list-view-table">
            <thead>
              <tr>
                <th style="width:32px;"><input type="checkbox" id="list-check-all" ${allChecked ? 'checked' : ''}></th>
                <th>업무명</th>
                <th>분류</th>
                <th>담당자</th>
                <th>마감일</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              ${sorted.length === 0 ? `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--color-text-muted);">업무가 없습니다</td></tr>` :
                sorted.map(t => `
                  <tr class="list-row" data-id="${t.id}" ${t.status==='done' ? 'style="opacity:0.65"' : ''}>
                    <td><input type="checkbox" class="list-row-check" data-id="${t.id}" ${this.selectedTaskIds.includes(t.id) ? 'checked' : ''}></td>
                    <td class="list-cell-title" data-field="title" data-id="${t.id}">
                      <span class="list-cell-display">${escHtml(t.title)}</span>
                      <span class="task-id-badge" style="margin-left:6px;">T-${String(t.id).padStart(5,'0')}</span>
                    </td>
                    <td>${t.category_name ? categoryTag(t.category_name) : '<span style="color:var(--color-text-hint)">-</span>'}</td>
                    <td class="list-cell-assignee" data-field="assignee_id" data-id="${t.id}">
                      <span class="list-cell-display">${t.assignee_name ? `${App.avatar({name:t.assignee_name,avatar_bg:t.avatar_bg,avatar_text:t.avatar_text})} ${escHtml(t.assignee_name)}` : '<span style="color:var(--color-text-hint)">-</span>'}</span>
                    </td>
                    <td class="list-cell-due" data-field="due_date" data-id="${t.id}">
                      <span class="list-cell-display">${t.due_date ? t.due_date.slice(0,10) : '<span style="color:var(--color-text-hint)">-</span>'} ${App.dday(t.due_date, t.status)}</span>
                    </td>
                    <td>
                      <select class="list-status-select" data-id="${t.id}" style="font-size:11px;padding:2px 6px;background:var(--color-bg-secondary);color:var(--color-text-primary);border:0.5px solid var(--color-border);border-radius:6px;cursor:pointer;">
                        ${[{v:'todo',l:'할 일'},{v:'in_progress',l:'진행 중'},{v:'done',l:'완료'},{v:'blocked',l:'지연'}].map(s=>`<option value="${s.v}" ${t.status===s.v?'selected':''}>${s.l}</option>`).join('')}
                      </select>
                    </td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>
      `;

      content.innerHTML = filterHtml + listHtml;
      this._bindFilterBarEvents(content);
      this._bindListViewEvents(content);
      return;
    }

    // 칸반 컬럼별 빈 상태 메시지 (SVG 아이콘)
    const colEmptyMessages = {
      todo:        { icon: '<svg width="24" height="24" viewBox="0 0 16 16" fill="none" opacity="0.3"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M5 8h6M8 5v6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>', msg: '할 일이 없습니다' },
      in_progress: { icon: '<svg width="24" height="24" viewBox="0 0 16 16" fill="none" opacity="0.3"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M8 4.5v4l2.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>', msg: '진행 중인 업무 없음' },
      done:        { icon: '<svg width="24" height="24" viewBox="0 0 16 16" fill="none" opacity="0.3"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 8l2 2 3.5-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>', msg: '완료된 업무 없음' },
      blocked:     { icon: '<svg width="24" height="24" viewBox="0 0 16 16" fill="none" opacity="0.3"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>', msg: '지연 없음' },
    };

    content.innerHTML = filterHtml + `
      <div class="kanban-board">
        ${cols.map(col => {
          const colTasks = this.getSorted(filtered.filter(t => t.status === col.key));
          const empty = colEmptyMessages[col.key];
          return `
            <div class="kanban-col col-${col.key}" data-status="${col.key}">
              <div class="kanban-col-header">
                <span class="kanban-col-title">${col.label}</span>
                <span class="kanban-col-count">${colTasks.length}</span>
                ${col.key === 'todo' ? `<button class="card-action-btn" id="kanban-quick-add" title="업무 추가" style="cursor:pointer"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>` : ''}
              </div>
              <div class="kanban-cards" data-status="${col.key}">
                ${colTasks.length > 0
                  ? colTasks.map(t => this.renderCard(t)).join('')
                  : `<div class="kanban-empty">
                       <span class="kanban-empty-icon">${empty.icon}</span>
                       <span>${empty.msg}</span>
                       ${col.key === 'todo' ? '<button class="btn btn-default kanban-empty-add" style="margin-top:8px;font-size:11px;padding:4px 12px;">+ 업무 추가</button>' : ''}
                     </div>`
                }
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // 칸반 빠른 추가 버튼
    content.querySelector('#kanban-quick-add')?.addEventListener('click', () => this.openForm());
    // 빈 상태 추가 버튼
    content.querySelectorAll('.kanban-empty-add').forEach(btn => {
      btn.addEventListener('click', () => this.openForm());
    });

    // 컴팩트 모드 토글
    content.querySelector('#compact-toggle')?.addEventListener('click', () => {
      this.compactMode = !this.compactMode;
      localStorage.setItem('task_compact_mode', this.compactMode);
      this.renderBoard(content);
    });

    // 카드 표시 항목 드롭다운
    const cardFieldsBtn = content.querySelector('#card-fields-btn');
    const cardFieldsDropdown = content.querySelector('#card-fields-dropdown');
    cardFieldsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = cardFieldsDropdown.style.display !== 'none';
      cardFieldsDropdown.style.display = isOpen ? 'none' : 'block';
    });
    content.querySelectorAll('[data-card-field]').forEach(cb => {
      cb.addEventListener('change', () => {
        const prefs = this._getCardFieldPrefs();
        prefs[cb.dataset.cardField] = cb.checked;
        this._setCardFieldPrefs(prefs);
        this.renderBoard(content);
      });
    });
    // 외부 클릭으로 닫기
    if (this._closeCardFieldsHandler) document.removeEventListener('click', this._closeCardFieldsHandler);
    this._closeCardFieldsHandler = (e) => {
      if (cardFieldsDropdown && !cardFieldsDropdown.contains(e.target) && e.target !== cardFieldsBtn) {
        cardFieldsDropdown.style.display = 'none';
      }
    };
    document.addEventListener('click', this._closeCardFieldsHandler);

    // 드래그 앤 드롭
    this.bindDragDrop(content);

    // 카드 이벤트 — 좌클릭 + 우클릭 컨텍스트 메뉴
    content.querySelectorAll('.kanban-card').forEach(card => {
      // 우클릭 → 빠른 상태 변경 컨텍스트 메뉴
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this._showContextMenu(e, card.dataset.id, content);
      });

      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-actions')) return;
        const task = this.tasks.find(t => t.id == card.dataset.id);
        if (task) this.openDetail(task);
      });
      card.querySelector('.card-edit')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const task = this.tasks.find(t => t.id == card.dataset.id);
        if (task) this.openForm(task);
      });
      card.querySelector('.card-delete')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await App.confirm('이 업무를 삭제하시겠습니까?');
        if (confirmed) {
          const taskId = card.dataset.id;
          const task = this.tasks.find(t => t.id == taskId);
          await API.del(`/tasks/${taskId}`);
          await this.loadTasks();
          this.renderBoard(content);
          App.toast('업무가 삭제되었습니다.', 'info', async () => {
            // 취소: 삭제된 업무 복원
            if (task) {
              await API.post('/tasks', { title: task.title, description: task.description, category_id: task.category_id, assignee_id: task.assignee_id, status: task.status, due_date: task.due_date });
              App.toast('삭제가 취소되었습니다.', 'success');
              await this.loadTasks();
              this.renderBoard(document.getElementById('content'));
            }
          });
        }
      });
      card.querySelector('.card-archive')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const taskId = card.dataset.id;
        await API.patch(`/tasks/${taskId}/archive`, { archived: true });
        await this.loadTasks();
        this.renderBoard(content);
        App.toast('아카이브되었습니다.', 'info', async () => {
          // 취소: 아카이브 복원
          await API.patch(`/tasks/${taskId}/archive`, { archived: false });
          App.toast('아카이브가 취소되었습니다.', 'success');
          await this.loadTasks();
          this.renderBoard(document.getElementById('content'));
        });
      });
    });

    this._bindFilterBarEvents(content);
  },

  // 리스트 뷰 이벤트 바인딩
  _bindListViewEvents(content) {
    // 전체 선택
    content.querySelector('#list-check-all')?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      const filtered = this.getFiltered();
      this.selectedTaskIds = checked ? filtered.map(t => t.id) : [];
      this.renderBoard(content);
    });

    // 개별 행 선택
    content.querySelectorAll('.list-row-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = parseInt(cb.dataset.id);
        if (cb.checked) {
          if (!this.selectedTaskIds.includes(id)) this.selectedTaskIds.push(id);
        } else {
          this.selectedTaskIds = this.selectedTaskIds.filter(x => x !== id);
        }
        this.renderBoard(content);
      });
    });

    // 행 클릭 → 상세
    content.querySelectorAll('.list-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('input') || e.target.closest('select') || e.target.closest('.list-cell-edit')) return;
        const task = this.tasks.find(t => t.id == row.dataset.id);
        if (task) this.openDetail(task);
      });
    });

    // 인라인 상태 변경
    content.querySelectorAll('.list-status-select').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        e.stopPropagation();
        const id = sel.dataset.id;
        try {
          await API.patch(`/tasks/${id}/status`, { status: sel.value });
          await this.loadTasks();
          this.renderBoard(content);
        } catch {
          App.toast('상태 변경 실패', 'error');
        }
      });
    });

    // 인라인 제목 편집 (클릭 → input)
    content.querySelectorAll('.list-cell-title').forEach(cell => {
      cell.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const id = cell.dataset.id;
        const display = cell.querySelector('.list-cell-display');
        const task = this.tasks.find(t => t.id == id);
        if (!task) return;
        const input = document.createElement('input');
        input.value = task.title;
        input.style.cssText = 'width:100%;background:var(--color-bg-secondary);color:var(--color-text-primary);border:0.5px solid var(--color-primary);border-radius:4px;padding:2px 6px;font-size:13px;font-family:inherit;';
        display.replaceWith(input);
        input.focus();
        const save = async () => {
          const newTitle = input.value.trim();
          if (newTitle && newTitle !== task.title) {
            try {
              await API.put(`/tasks/${id}`, { ...task, title: newTitle });
              await this.loadTasks();
              this.renderBoard(content);
              return;
            } catch {
              App.toast('수정 실패', 'error');
            }
          }
          input.replaceWith(display);
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') input.replaceWith(display);
        });
      });
    });

    // 일괄 취소
    content.querySelector('#bulk-cancel-btn')?.addEventListener('click', () => {
      this.selectedTaskIds = [];
      this.renderBoard(content);
    });

    // 일괄 삭제
    content.querySelector('#bulk-delete-btn')?.addEventListener('click', async () => {
      const confirmed = await App.confirm(`선택한 ${this.selectedTaskIds.length}개 업무를 삭제하시겠습니까?`);
      if (!confirmed) return;
      try {
        await Promise.all(this.selectedTaskIds.map(id => API.del(`/tasks/${id}`)));
        this.selectedTaskIds = [];
        await this.loadTasks();
        this.renderBoard(content);
        App.toast('삭제되었습니다.', 'success');
      } catch {
        App.toast('일부 삭제 실패', 'error');
      }
    });

    // 일괄 상태 변경 드롭다운
    const bulkStatusBtn = content.querySelector('#bulk-status-btn');
    const bulkStatusDD = content.querySelector('#bulk-status-dropdown');
    bulkStatusBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (bulkStatusDD) bulkStatusDD.style.display = bulkStatusDD.style.display === 'none' ? 'block' : 'none';
    });
    content.querySelectorAll('.bulk-status-opt').forEach(opt => {
      opt.addEventListener('click', async () => {
        const status = opt.dataset.status;
        try {
          await Promise.all(this.selectedTaskIds.map(id => API.patch(`/tasks/${id}/status`, { status })));
          this.selectedTaskIds = [];
          await this.loadTasks();
          this.renderBoard(content);
          App.toast('상태가 변경되었습니다.', 'success');
        } catch {
          App.toast('일부 변경 실패', 'error');
        }
      });
    });

    // 일괄 담당자 변경 드롭다운
    const bulkAssigneeBtn = content.querySelector('#bulk-assignee-btn');
    const bulkAssigneeDD = content.querySelector('#bulk-assignee-dropdown');
    bulkAssigneeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (bulkAssigneeDD) bulkAssigneeDD.style.display = bulkAssigneeDD.style.display === 'none' ? 'block' : 'none';
    });
    content.querySelectorAll('.bulk-assignee-opt').forEach(opt => {
      opt.addEventListener('click', async () => {
        const assigneeId = opt.dataset.userId;
        const tasks = this.tasks.filter(t => this.selectedTaskIds.includes(t.id));
        try {
          await Promise.all(tasks.map(t => API.put(`/tasks/${t.id}`, { ...t, assignee_id: assigneeId })));
          this.selectedTaskIds = [];
          await this.loadTasks();
          this.renderBoard(content);
          App.toast('담당자가 변경되었습니다.', 'success');
        } catch {
          App.toast('일부 변경 실패', 'error');
        }
      });
    });
  },

  // 필터바 공통 이벤트 바인딩
  _bindFilterBarEvents(content) {
    const dropdown = content.querySelector('#filter-dropdown');
    const toggleBtn = content.querySelector('#filter-toggle-btn');
    const sortDropdown = content.querySelector('#sort-dropdown');
    const sortToggleBtn = content.querySelector('#sort-toggle-btn');

    // 뷰 토글
    content.querySelector('#view-kanban-btn')?.addEventListener('click', () => {
      this.viewMode = 'kanban';
      localStorage.setItem('task_view_mode', 'kanban');
      this.selectedTaskIds = [];
      this.renderBoard(content);
    });
    content.querySelector('#view-list-btn')?.addEventListener('click', () => {
      this.viewMode = 'list';
      localStorage.setItem('task_view_mode', 'list');
      this.renderBoard(content);
    });

    // 전체 버튼
    content.querySelector('#filter-all')?.addEventListener('click', () => {
      this.filterCategories = [];
      this.filterAssignees = [];
      this.filterDateFrom = '';
      this.filterDateTo = '';
      this.showArchived = false;
      this.loadTasks().then(() => this.renderBoard(content));
    });

    // 아카이브 보기 토글
    content.querySelector('#archive-toggle-btn')?.addEventListener('click', async () => {
      this.showArchived = !this.showArchived;
      await this.loadTasks();
      this.renderBoard(content);
    });

    // 필터 드롭다운 토글
    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sortDropdown) sortDropdown.style.display = 'none';
      const isOpen = dropdown.style.display !== 'none';
      dropdown.style.display = isOpen ? 'none' : 'block';
    });

    // 정렬 드롭다운 토글
    sortToggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown) dropdown.style.display = 'none';
      const isOpen = sortDropdown.style.display !== 'none';
      sortDropdown.style.display = isOpen ? 'none' : 'block';
    });

    // 정렬 선택
    content.querySelectorAll('[data-sort]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sortBy = btn.dataset.sort;
        sortDropdown.style.display = 'none';
        this.renderBoard(content);
      });
    });

    // 드롭다운 외부 클릭 닫기 (이전 리스너 제거 후 재등록)
    if (this._closeDropdownsHandler) {
      document.removeEventListener('click', this._closeDropdownsHandler);
    }
    this._closeDropdownsHandler = (e) => {
      if (dropdown && !dropdown.contains(e.target) && e.target !== toggleBtn) {
        dropdown.style.display = 'none';
      }
      if (sortDropdown && !sortDropdown.contains(e.target) && e.target !== sortToggleBtn) {
        sortDropdown.style.display = 'none';
      }
    };
    document.addEventListener('click', this._closeDropdownsHandler);

    // 적용 버튼
    content.querySelector('#filter-apply')?.addEventListener('click', () => {
      this.filterCategories = [...content.querySelectorAll('[data-filter-cat]:checked')].map(cb => cb.dataset.filterCat);
      this.filterAssignees = [...content.querySelectorAll('[data-filter-user]:checked')].map(cb => cb.dataset.filterUser);
      this.filterDateFrom = content.querySelector('#filter-date-from')?.value || '';
      this.filterDateTo = content.querySelector('#filter-date-to')?.value || '';
      this.renderBoard(content);
    });

    // 초기화 버튼
    content.querySelector('#filter-reset')?.addEventListener('click', () => {
      this.filterCategories = [];
      this.filterAssignees = [];
      this.filterDateFrom = '';
      this.filterDateTo = '';
      this.renderBoard(content);
    });

    // 빠른 필터 카테고리 버튼 클릭
    content.querySelectorAll('[data-quick-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.quickCat;
        if (this.filterCategories.includes(id)) {
          this.filterCategories = this.filterCategories.filter(c => c !== id);
        } else {
          this.filterCategories = [...this.filterCategories, id];
        }
        this.renderBoard(content);
      });
    });

    // 기어 드롭다운 토글
    const gearBtn = content.querySelector('#quick-filter-gear-btn');
    const gearDropdown = content.querySelector('#quick-filter-gear-dropdown');
    gearBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown) dropdown.style.display = 'none';
      if (sortDropdown) sortDropdown.style.display = 'none';
      const isOpen = gearDropdown.style.display !== 'none';
      gearDropdown.style.display = isOpen ? 'none' : 'block';
    });

    // 기어 체크박스 변경 → 저장 + 리렌더
    content.querySelectorAll('[data-gear-cat]').forEach(cb => {
      cb.addEventListener('change', () => {
        const current = this._getQuickFilterButtons();
        const id = cb.dataset.gearCat;
        const updated = cb.checked ? [...new Set([...current, id])] : current.filter(x => x !== id);
        this._setQuickFilterButtons(updated);
        this.renderBoard(content);
      });
    });

    // 기어 드롭다운 외부 클릭 닫기 포함 document listener 확장
    const existingClose = content._closeDropdownsHandler;
    if (existingClose) document.removeEventListener('click', existingClose);
    const closeAll = (e) => {
      if (gearDropdown && !gearDropdown.contains(e.target) && e.target !== gearBtn) {
        gearDropdown.style.display = 'none';
      }
    };
    document.addEventListener('click', closeAll);
    content._closeDropdownsHandler = closeAll;

    // 활성 태그 제거
    content.querySelectorAll('[data-remove-cat]').forEach(tag => {
      tag.addEventListener('click', () => {
        this.filterCategories = this.filterCategories.filter(id => id !== tag.dataset.removeCat);
        this.renderBoard(content);
      });
    });
    content.querySelectorAll('[data-remove-user]').forEach(tag => {
      tag.addEventListener('click', () => {
        this.filterAssignees = this.filterAssignees.filter(id => id !== tag.dataset.removeUser);
        this.renderBoard(content);
      });
    });
    content.querySelectorAll('[data-remove-date]').forEach(tag => {
      tag.addEventListener('click', () => {
        this.filterDateFrom = '';
        this.filterDateTo = '';
        this.renderBoard(content);
      });
    });
  },

  // 카드 표시 항목 기본값 및 localStorage 읽기/쓰기
  _getCardFieldPrefs() {
    const defaults = { category: true, assignee: true, due_date: true, subtasks: true, comments: true, attachments: true };
    try {
      const saved = localStorage.getItem('kanban_card_fields');
      if (saved) return { ...defaults, ...JSON.parse(saved) };
    } catch {}
    return defaults;
  },

  _setCardFieldPrefs(prefs) {
    try { localStorage.setItem('kanban_card_fields', JSON.stringify(prefs)); } catch {}
  },

  // 빠른 필터 버튼 localStorage 읽기
  _getQuickFilterButtons() {
    try {
      const saved = localStorage.getItem('task_filter_buttons');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  },

  // 빠른 필터 버튼 localStorage 저장
  _setQuickFilterButtons(ids) {
    try {
      localStorage.setItem('task_filter_buttons', JSON.stringify(ids));
    } catch {}
  },

  // 분기 시작일 계산
  _quarterStart(date) {
    const q = Math.floor(date.getMonth() / 3);
    return `${date.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01`;
  },

  // 분기 종료일 계산
  _quarterEnd(date) {
    const q = Math.floor(date.getMonth() / 3);
    const endMonth = q * 3 + 3;
    const lastDay = new Date(date.getFullYear(), endMonth, 0).getDate();
    return `${date.getFullYear()}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
  },

  renderCard(t) {
    const prefs = this._getCardFieldPrefs();

    const assignee = (prefs.assignee && t.assignee_name)
      ? `${App.avatar({name: t.assignee_name, avatar_bg: t.avatar_bg, avatar_text: t.avatar_text})}
         <span>${escHtml(t.assignee_name)}</span>`
      : '';

    const editIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    const deleteIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    // 아카이브 아이콘 (박스에 아래 화살표)
    const archiveIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2" width="13" height="3" rx="1" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 5v7a1 1 0 001 1h9a1 1 0 001-1V5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M6 9l2 2 2-2M8 7v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    // 서브태스크 진행 상황
    const subtaskBadge = (prefs.subtasks && t.subtask_count > 0)
      ? `<span class="subtask-progress">✓ ${t.subtask_done_count || 0}/${t.subtask_count}</span>`
      : '';

    // 댓글 수
    const commentBadge = (prefs.comments && t.comment_count > 0)
      ? `<span class="comment-count">💬 ${t.comment_count}</span>`
      : '';

    // 첨부파일 수 — 클립 아이콘
    const attachmentBadge = (prefs.attachments && t.attachment_count > 0)
      ? `<span class="attachment-count" title="첨부파일 ${t.attachment_count}개"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true" style="vertical-align:-1px"><path d="M10.5 3.5l-5.6 5.6a2.5 2.5 0 003.55 3.55l6.6-6.6a4 4 0 00-5.66-5.66l-6.6 6.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg> ${t.attachment_count}</span>`
      : '';

    // 카테고리 태그 (설정에 따라)
    const categoryHtml = (prefs.category && t.category_name) ? categoryTag(t.category_name) : '';

    // 마감일 (설정에 따라)
    const dueDateHtml = prefs.due_date ? `<span style="margin-left:auto">${App.dday(t.due_date, t.status)}</span>` : '';

    // 업무 유형 뱃지 (항상 표시 — extra/project만, regular은 기본이므로 생략)
    const workType = t.work_type || 'regular';
    const workTypeLabels = { regular: '정규', extra: '추가', project: '프로젝트' };
    const workTypeBadge = workType !== 'regular'
      ? `<span class="work-type-badge work-type-${workType}" title="${workTypeLabels[workType]} 업무">${workTypeLabels[workType]}</span>`
      : '';

    return `
      <div class="kanban-card${this.compactMode ? ' compact-card' : ''}" draggable="true" data-id="${t.id}">
        <div class="card-actions">
          <button class="card-action-btn card-edit" title="수정">${editIcon}</button>
          <button class="card-action-btn card-archive" title="아카이브">${archiveIcon}</button>
          <button class="card-action-btn card-delete" title="삭제">${deleteIcon}</button>
        </div>
        ${(categoryHtml || workTypeBadge) ? `<div style="margin-bottom:4px;display:flex;gap:4px;align-items:center;flex-wrap:wrap;">${categoryHtml}${workTypeBadge}</div>` : ''}
        <div class="card-title">${escHtml(t.title)}</div>
        ${subtaskBadge || commentBadge || attachmentBadge ? `<div class="card-indicators">${subtaskBadge}${commentBadge}${attachmentBadge}</div>` : ''}
        <div class="card-footer">
          ${assignee}
          ${dueDateHtml}
          <span class="task-id-badge" style="margin-left:auto;">T-${String(t.id).padStart(5,'0')}</span>
        </div>
      </div>
    `;
  },

  // 우클릭 컨텍스트 메뉴: 빠른 상태 변경
  _showContextMenu(e, taskId, content) {
    // 기존 메뉴 제거
    document.querySelectorAll('.kanban-context-menu').forEach(m => m.remove());

    const task = this.tasks.find(t => t.id == taskId);
    if (!task) return;

    const statuses = [
      { key: 'todo', label: '할 일', color: 'var(--color-plan-text)' },
      { key: 'in_progress', label: '진행 중', color: 'var(--color-primary)' },
      { key: 'done', label: '완료', color: 'var(--color-done-text)' },
      { key: 'blocked', label: '지연', color: 'var(--color-warn-text)' },
    ];

    const menu = document.createElement('div');
    menu.className = 'kanban-context-menu';
    menu.innerHTML = `
      <div class="ctx-menu-label">상태 변경</div>
      ${statuses.map(s => `
        <button class="ctx-menu-item${task.status === s.key ? ' active' : ''}" data-ctx-status="${s.key}">
          <span class="ctx-menu-dot" style="background:${s.color}"></span>
          ${s.label}
          ${task.status === s.key ? '<span style="margin-left:auto;font-size:11px;color:var(--color-text-muted)">✓</span>' : ''}
        </button>
      `).join('')}
    `;

    // 위치 설정
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    document.body.appendChild(menu);

    // 화면 밖 방지
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';

    // 상태 클릭
    menu.querySelectorAll('[data-ctx-status]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newStatus = btn.dataset.ctxStatus;
        menu.remove();
        if (newStatus === task.status) return;
        try {
          await API.patch(`/tasks/${taskId}/status`, { status: newStatus });
          App.toast('상태가 변경되었습니다.', 'success');
          await this.loadTasks();
          this.renderBoard(content);
        } catch {
          App.toast('상태 변경 실패', 'error');
        }
      });
    });

    // 외부 클릭으로 닫기
    const closeMenu = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  },

  openDetail(task) {
    App.setDeepLink('tasks', task.id);
    const statusLabel = { todo: '할 일', in_progress: '진행 중', done: '완료', blocked: '지연' }[task.status] || task.status;
    const statusClass = { todo: 'badge-plan', in_progress: 'badge-plan', done: 'badge-done', blocked: 'badge-warn' }[task.status] || 'badge-plan';

    const assigneeHtml = task.assignee_name
      ? `<div style="display:flex;align-items:center;gap:8px;">${App.avatar({name: task.assignee_name, avatar_bg: task.avatar_bg, avatar_text: task.avatar_text})}<span>${escHtml(task.assignee_name)}</span></div>`
      : '<span style="color:var(--color-text-hint)">미지정</span>';

    const dueHtml = task.due_date
      ? `${task.due_date.slice(0, 10)} ${App.dday(task.due_date, task.status)}`
      : '<span style="color:var(--color-text-hint)">없음</span>';

    const createdAt = task.created_at ? task.created_at.slice(0, 10) : '-';
    const overlay = document.createElement('div');
    overlay.className = 'popover-overlay';
    overlay.innerHTML = `
      <div class="popover task-detail-popover" style="max-width:560px;width:90%;max-height:85vh;display:flex;flex-direction:column;" role="dialog" aria-modal="true">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;flex-shrink:0;">
          <div style="flex:1;padding-right:16px;">
            ${task.category_name ? `<div style="margin-bottom:8px;">${categoryTag(task.category_name)}</div>` : ''}
            <div style="font-size:18px;font-weight:700;line-height:1.4;color:var(--color-text-primary);">${escHtml(task.title)}</div>
            <button class="btn btn-default" id="detail-edit-btn" style="padding:4px 12px;font-size:12px;display:inline-flex;align-items:center;gap:5px;margin-top:8px;" title="업무 수정">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
              업무 수정
            </button>
          </div>
          <button class="popover-close" id="detail-close" style="flex-shrink:0;" aria-label="닫기">×</button>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;flex-shrink:0;">
          <span class="badge ${statusClass}">${statusLabel}</span>
        </div>

        <!-- 탭 헤더 -->
        <div class="detail-tabs" style="flex-shrink:0;">
          <button class="detail-tab active" data-tab="info">상세</button>
          <button class="detail-tab" data-tab="subtasks">서브태스크</button>
          <button class="detail-tab" data-tab="comments">댓글</button>
          <button class="detail-tab" data-tab="attachments">첨부파일</button>
        </div>

        <!-- 탭 콘텐츠 -->
        <div class="detail-tab-content" style="flex:1;overflow-y:auto;padding-top:16px;">

          <!-- 상세 탭 -->
          <div class="detail-tab-pane active" data-pane="info">
            ${task.description ? `
              <div style="margin-bottom:20px;">
                <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px;">업무 상세</div>
                <div style="font-size:13px;line-height:1.6;color:var(--color-text-primary);white-space:pre-wrap;background:var(--color-bg-secondary);padding:12px;border-radius:8px;">${escHtml(task.description)}</div>
              </div>
            ` : ''}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
              <div>
                <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px;">담당자</div>
                <div style="font-size:13px;">${assigneeHtml}</div>
              </div>
              <div>
                <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px;">마감일</div>
                <div style="font-size:13px;display:flex;align-items:center;gap:6px;">${dueHtml}</div>
              </div>
              <div>
                <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px;">작성자</div>
                <div style="font-size:13px;">${escHtml(task.created_by_name || '-')}</div>
              </div>
              <div>
                <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px;">생성일</div>
                <div style="font-size:13px;">${createdAt}</div>
              </div>
              <div>
                <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px;">업무 ID</div>
                <div style="font-size:13px;"><span class="task-id-badge">T-${String(task.id).padStart(5,'0')}</span></div>
              </div>
            </div>

          </div>

          <!-- 서브태스크 탭 -->
          <div class="detail-tab-pane" data-pane="subtasks" style="display:none;">
            <div id="subtask-progress-bar" style="margin-bottom:12px;"></div>
            <div class="subtask-list" id="subtask-list">
              <div style="text-align:center;padding:20px;color:var(--color-text-muted);font-size:12px;">불러오는 중...</div>
            </div>
            <div class="subtask-add" style="flex-direction:column;gap:6px;padding-top:10px;border-top:0.5px solid var(--color-border);margin-top:10px;">
              <input type="text" placeholder="서브태스크 제목..." id="new-subtask" style="width:100%;">
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <select id="new-subtask-assignee" style="flex:1;min-width:100px;height:32px;font-size:12px;background:var(--color-bg-secondary);color:var(--color-text-primary);border:0.5px solid var(--color-border);border-radius:6px;padding:0 8px;">
                  <option value="">담당자 선택</option>
                  ${App.users.map(u => `<option value="${u.id}">${escHtml(u.name)}</option>`).join('')}
                </select>
                <select id="new-subtask-status" style="width:100px;height:32px;font-size:12px;background:var(--color-bg-secondary);color:var(--color-text-primary);border:0.5px solid var(--color-border);border-radius:6px;padding:0 8px;">
                  <option value="todo">할 일</option>
                  <option value="in_progress">진행 중</option>
                  <option value="done">완료</option>
                </select>
                <input type="date" id="new-subtask-due" style="flex:1;min-width:120px;height:32px;font-size:12px;background:var(--color-bg-secondary);color:var(--color-text-primary);border:0.5px solid var(--color-border);border-radius:6px;padding:0 8px;">
                <button class="btn btn-primary" id="btn-add-subtask" style="padding:6px 14px;font-size:12px;">추가</button>
              </div>
            </div>
          </div>

          <!-- 댓글 탭 -->
          <div class="detail-tab-pane" data-pane="comments" style="display:none;">
            <div class="comment-list" id="comment-list">
              <div style="text-align:center;padding:20px;color:var(--color-text-muted);font-size:12px;">불러오는 중...</div>
            </div>
            <div class="comment-add">
              <textarea placeholder="댓글을 입력하세요... (@이름으로 멘션)" id="new-comment" rows="3"></textarea>
              <button class="btn btn-primary" id="btn-add-comment">등록</button>
            </div>
          </div>

          <!-- 첨부파일 탭 -->
          <div class="detail-tab-pane" data-pane="attachments" style="display:none;">
            <div class="attachment-section">
              <div class="attachment-upload">
                <input type="file" id="attachment-input" style="display:none" multiple>
                <button class="btn btn-default" id="attachment-btn">파일 첨부</button>
              </div>
              <div class="attachment-list" id="attachment-list">
                <div style="text-align:center;padding:20px;color:var(--color-text-muted);font-size:12px;">불러오는 중...</div>
              </div>
            </div>
          </div>

        </div>

        <div style="display:flex;justify-content:flex-end;padding-top:16px;border-top:1px solid var(--color-border);flex-shrink:0;margin-top:4px;">
          <button class="btn" id="detail-close-btn">닫기</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#detail-close')?.addEventListener('click', close);
    overlay.querySelector('#detail-close-btn')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#detail-edit-btn')?.addEventListener('click', () => {
      close();
      this.openForm(task);
    });

    // 탭 전환
    const tabBtns = overlay.querySelectorAll('.detail-tab');
    const tabPanes = overlay.querySelectorAll('.detail-tab-pane');
    let subtasksLoaded = false;
    let commentsLoaded = false;
    let attachmentsLoaded = false;

    tabBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
        btn.classList.add('active');
        const pane = overlay.querySelector(`.detail-tab-pane[data-pane="${btn.dataset.tab}"]`);
        if (pane) { pane.style.display = ''; pane.classList.add('active'); }

        if (btn.dataset.tab === 'subtasks' && !subtasksLoaded) {
          subtasksLoaded = true;
          await this._loadSubtasks(task.id, overlay);
        }
        if (btn.dataset.tab === 'comments' && !commentsLoaded) {
          commentsLoaded = true;
          await this._loadComments(task.id, overlay);
        }
        if (btn.dataset.tab === 'attachments' && !attachmentsLoaded) {
          attachmentsLoaded = true;
          await this._loadAttachments(task.id, overlay);
        }
      });
    });

    // 서브태스크 추가 — 중복 제출 방지(busy 플래그) + Enter 키 preventDefault
    let _subtaskAddBusy = false;
    const addSubtask = async () => {
      if (_subtaskAddBusy) return;
      const input = overlay.querySelector('#new-subtask');
      const title = input?.value.trim();
      if (!title) return;
      _subtaskAddBusy = true;
      const addBtn = overlay.querySelector('#btn-add-subtask');
      if (addBtn) addBtn.disabled = true;
      const assignee_id = overlay.querySelector('#new-subtask-assignee')?.value || null;
      const status = overlay.querySelector('#new-subtask-status')?.value || 'todo';
      const due_date = overlay.querySelector('#new-subtask-due')?.value || null;
      try {
        await API.post(`/tasks/${task.id}/subtasks`, { title, assignee_id, status, due_date });
        input.value = '';
        subtasksLoaded = false;
        await this._loadSubtasks(task.id, overlay);
      } catch (e) {
        App.toast('서브태스크 추가 실패', 'error');
      } finally {
        _subtaskAddBusy = false;
        if (addBtn) addBtn.disabled = false;
      }
    };
    overlay.querySelector('#btn-add-subtask')?.addEventListener('click', addSubtask);
    overlay.querySelector('#new-subtask')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        addSubtask();
      }
    });

    // 댓글 추가
    overlay.querySelector('#btn-add-comment')?.addEventListener('click', async () => {
      const textarea = overlay.querySelector('#new-comment');
      const body = textarea?.value.trim();
      if (!body) return;
      try {
        await API.post(`/tasks/${task.id}/comments`, { content: body });
        textarea.value = '';
        // 멘션 드롭다운 숨기기
        const md = overlay.querySelector('#mention-dropdown');
        if (md) md.style.display = 'none';
        commentsLoaded = false;
        await this._loadComments(task.id, overlay);
      } catch (e) {
        App.toast('댓글 등록 실패', 'error');
      }
    });

    // @멘션 드롭다운 지원
    const mentionTextarea = overlay.querySelector('#new-comment');
    if (mentionTextarea) {
      mentionTextarea.addEventListener('input', () => {
        const val = mentionTextarea.value;
        const cursorPos = mentionTextarea.selectionStart;
        const beforeCursor = val.substring(0, cursorPos);
        const atMatch = beforeCursor.match(/@(\S*)$/);

        let mentionDropdown = overlay.querySelector('#mention-dropdown');

        if (atMatch) {
          const query = atMatch[1].toLowerCase();
          const matches = App.users.filter(u => u.name.toLowerCase().includes(query));

          if (matches.length > 0) {
            if (!mentionDropdown) {
              mentionDropdown = document.createElement('div');
              mentionDropdown.id = 'mention-dropdown';
              mentionDropdown.className = 'mention-dropdown';
              mentionTextarea.parentNode.style.position = 'relative';
              mentionTextarea.parentNode.appendChild(mentionDropdown);
            }
            mentionDropdown.innerHTML = matches.map(u =>
              `<div class="mention-item" data-name="${escHtml(u.name)}">${App.avatar(u)} <span>${escHtml(u.name)}</span></div>`
            ).join('');
            mentionDropdown.style.display = 'block';

            mentionDropdown.querySelectorAll('.mention-item').forEach(item => {
              item.addEventListener('click', () => {
                const name = item.dataset.name;
                const before = val.substring(0, cursorPos - atMatch[1].length);
                const after = val.substring(cursorPos);
                mentionTextarea.value = before + name + ' ' + after;
                mentionTextarea.focus();
                const newPos = (before + name + ' ').length;
                mentionTextarea.setSelectionRange(newPos, newPos);
                mentionDropdown.style.display = 'none';
                // 멘션 태그 미리보기 표시
                this._updateMentionPreview(mentionTextarea, overlay);
              });
            });
          } else {
            if (mentionDropdown) mentionDropdown.style.display = 'none';
          }
        } else {
          if (mentionDropdown) mentionDropdown.style.display = 'none';
        }
      });

      // Escape 키로 멘션 드롭다운 닫기
      mentionTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const md = overlay.querySelector('#mention-dropdown');
          if (md) md.style.display = 'none';
        }
      });
    }

    // 새 태그 생성 후 현재 업무에 자동 연결
    overlay.querySelector('#btn-create-tag')?.addEventListener('click', async () => {
      const nameInput = overlay.querySelector('#new-tag-name');
      const colorInput = overlay.querySelector('#new-tag-color');
      const name = nameInput?.value.trim();
      if (!name) { App.toast('태그 이름을 입력하세요', 'error'); return; }
      const color = colorInput?.value || '#4F6EF7';
      try {
        const res = await API.post('/tags', { name, color });
        const newTag = res.data;
        // 생성된 태그를 현재 업무에 자동 연결
        await API.post(`/tasks/${task.id}/tags`, { tag_id: newTag.id });
        nameInput.value = '';
        colorInput.value = '#4F6EF7';
        await this._loadTags(task.id, overlay);
        App.toast(`태그 "${name}" 생성 및 추가됨`, 'success');
      } catch (e) {
        App.toast('태그 생성 실패', 'error');
      }
    });

    // 첨부파일 버튼 클릭 → file input 트리거
    overlay.querySelector('#attachment-btn')?.addEventListener('click', () => {
      overlay.querySelector('#attachment-input')?.click();
    });

    // 파일 선택 → 업로드
    overlay.querySelector('#attachment-input')?.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      try {
        for (const file of files) {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('task_id', task.id);
          await API.upload('/attachments/upload', fd);
        }
        e.target.value = '';
        attachmentsLoaded = false;
        await this._loadAttachments(task.id, overlay);
        App.toast('파일이 첨부되었습니다.', 'success');
      } catch {
        App.toast('업로드 실패', 'error');
      }
    });
  },

  // 서브태스크 로드 및 렌더
  async _loadSubtasks(taskId, overlay) {
    const container = overlay.querySelector('#subtask-list');
    const progressWrap = overlay.querySelector('#subtask-progress-bar');
    if (!container) return;
    try {
      const res = await API.get(`/tasks/${taskId}/subtasks`);
      const subtasks = res.data || [];

      // 진행 바
      if (progressWrap) {
        if (subtasks.length > 0) {
          const done = subtasks.filter(s => s.status === 'done').length;
          const pct = Math.round((done / subtasks.length) * 100);
          progressWrap.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <div style="flex:1;height:5px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:var(--color-primary);border-radius:3px;transition:width 0.3s;"></div>
              </div>
              <span style="font-size:11px;color:var(--color-text-muted);flex-shrink:0;">${done}/${subtasks.length} 완료</span>
            </div>`;
        } else {
          progressWrap.innerHTML = '';
        }
      }

      if (subtasks.length === 0) {
        container.innerHTML = '<div style="padding:12px;color:var(--color-text-muted);font-size:12px;text-align:center;">서브태스크가 없습니다</div>';
        return;
      }

      const statusLabel = { todo: '할 일', in_progress: '진행 중', done: '완료' };
      const statusClass = { todo: 'subtask-status-todo', in_progress: 'subtask-status-in_progress', done: 'subtask-status-done' };

      container.innerHTML = subtasks.map(s => {
        const st = s.status || (s.done ? 'done' : 'todo');
        const assigneeHtml = s.assignee_name
          ? `<span style="font-size:11px;color:var(--color-text-muted);margin-left:4px;">@${escHtml(s.assignee_name)}</span>`
          : '';
        const dueHtml = s.due_date
          ? `<span style="font-size:10px;color:var(--color-text-hint);">${s.due_date.slice(0,10)}</span>`
          : '';
        const statusSelectHtml = `
          <select class="subtask-status-select ${statusClass[st] || 'subtask-status-todo'}" title="상태 변경">
            ${['todo','in_progress','done'].map(v =>
              `<option value="${v}" ${st === v ? 'selected' : ''}>${statusLabel[v]}</option>`
            ).join('')}
          </select>`;
        return `
          <div class="subtask-item${st === 'done' ? ' done' : ''}" data-subtask-id="${s.id}">
            <input type="checkbox" class="subtask-check" ${st === 'done' ? 'checked' : ''} title="완료 토글">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span class="subtask-title">${escHtml(s.title)}</span>
                ${statusSelectHtml}
                ${assigneeHtml}${dueHtml}
              </div>
            </div>
            <button class="subtask-delete" title="삭제">✕</button>
          </div>`;
      }).join('');

      // 체크박스 토글 → status 동기화 (todo ↔ done)
      container.querySelectorAll('.subtask-check').forEach(cb => {
        cb.addEventListener('change', async () => {
          const item = cb.closest('.subtask-item');
          const id = item.dataset.subtaskId;
          try {
            await API.patch(`/tasks/${taskId}/subtasks/${id}/toggle`, {});
            await this._loadSubtasks(taskId, overlay);
          } catch (e) {
            App.toast('업데이트 실패', 'error');
            cb.checked = !cb.checked;
          }
        });
      });

      // 상태 dropdown 변경 → 직접 상태 지정 (todo / in_progress / done)
      container.querySelectorAll('.subtask-status-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
          e.stopPropagation();
          const item = sel.closest('.subtask-item');
          const id = item.dataset.subtaskId;
          const newStatus = sel.value;
          try {
            await API.patch(`/tasks/${taskId}/subtasks/${id}/status`, { status: newStatus });
            await this._loadSubtasks(taskId, overlay);
          } catch {
            App.toast('상태 변경 실패', 'error');
          }
        });
      });

      // 삭제
      container.querySelectorAll('.subtask-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('.subtask-item').dataset.subtaskId;
          try {
            await API.del(`/tasks/${taskId}/subtasks/${id}`);
            await this._loadSubtasks(taskId, overlay);
          } catch { App.toast('삭제 실패', 'error'); }
        });
      });
    } catch (e) {
      container.innerHTML = '<div style="padding:12px;color:var(--color-warn-text);font-size:12px;">불러오기 실패</div>';
    }
  },

  // 댓글 로드 및 렌더 — 본인 댓글에 수정/삭제 UI 포함
  async _loadComments(taskId, overlay) {
    const container = overlay.querySelector('#comment-list');
    if (!container) return;
    try {
      const res = await API.get(`/tasks/${taskId}/comments`);
      const comments = res.data || [];
      if (comments.length === 0) {
        container.innerHTML = '<div style="padding:12px;color:var(--color-text-muted);font-size:12px;text-align:center;">댓글이 없습니다</div>';
        return;
      }
      const currentUserId = App.user?.id;
      container.innerHTML = comments.map(c => {
        const timeAgo = this._timeAgo(c.created_at);
        const isOwn = c.user_id == currentUserId;
        const avatarHtml = App.avatar({ name: c.user_name, avatar_bg: c.avatar_bg, avatar_text: c.avatar_text, avatar_url: c.avatar_url });
        return `
          <div class="comment-item" data-comment-id="${c.id}">
            <div class="comment-header">
              ${avatarHtml}
              <strong>${escHtml(c.user_name || '-')}</strong>
              <span class="comment-time">${timeAgo}</span>
              ${isOwn ? `
                <span class="comment-actions" style="margin-left:auto;display:flex;gap:4px;opacity:0;transition:opacity 0.15s;">
                  <button class="card-action-btn comment-edit-btn" data-comment-id="${c.id}" title="수정" style="padding:2px;">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
                  </button>
                  <button class="card-action-btn comment-delete-btn" data-comment-id="${c.id}" title="삭제" style="padding:2px;">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                </span>
              ` : ''}
            </div>
            <div class="comment-body" data-raw-content="${escHtml(c.content)}">${this._highlightMentions(c.content)}</div>
          </div>
        `;
      }).join('');

      // 호버 시 수정/삭제 아이콘 표시
      container.querySelectorAll('.comment-item').forEach(item => {
        const actions = item.querySelector('.comment-actions');
        if (!actions) return;
        item.addEventListener('mouseenter', () => { actions.style.opacity = '1'; });
        item.addEventListener('mouseleave', () => { actions.style.opacity = '0'; });
      });

      // 삭제 버튼
      container.querySelectorAll('.comment-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const confirmed = await App.confirm('이 댓글을 삭제하시겠습니까?');
          if (!confirmed) return;
          try {
            await API.del(`/tasks/${taskId}/comments/${btn.dataset.commentId}`);
            App.toast('댓글이 삭제되었습니다.', 'success');
            await this._loadComments(taskId, overlay);
          } catch { App.toast('댓글 삭제 실패', 'error'); }
        });
      });

      // 수정 버튼 — 인라인 편집
      container.querySelectorAll('.comment-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const commentId = btn.dataset.commentId;
          const item = btn.closest('.comment-item');
          const bodyEl = item.querySelector('.comment-body');
          const rawContent = bodyEl.dataset.rawContent;

          bodyEl.innerHTML = `
            <textarea class="comment-edit-textarea" style="width:100%;min-height:60px;font-size:12px;font-family:inherit;padding:8px;border-radius:6px;border:0.5px solid var(--color-primary);background:var(--color-bg-secondary);color:var(--color-text-primary);resize:vertical;outline:none;">${escHtml(rawContent)}</textarea>
            <div style="display:flex;gap:6px;margin-top:6px;">
              <button class="btn btn-primary comment-save-btn" style="font-size:11px;padding:4px 10px;">저장</button>
              <button class="btn comment-cancel-btn" style="font-size:11px;padding:4px 10px;">취소</button>
            </div>
          `;
          bodyEl.querySelector('.comment-edit-textarea').focus();

          bodyEl.querySelector('.comment-save-btn').addEventListener('click', async () => {
            const newContent = bodyEl.querySelector('.comment-edit-textarea').value.trim();
            if (!newContent) { App.toast('댓글 내용을 입력하세요', 'error'); return; }
            try {
              await API.put(`/tasks/${taskId}/comments/${commentId}`, { content: newContent });
              App.toast('댓글이 수정되었습니다.', 'success');
              await this._loadComments(taskId, overlay);
            } catch { App.toast('댓글 수정 실패', 'error'); }
          });

          bodyEl.querySelector('.comment-cancel-btn').addEventListener('click', async () => {
            await this._loadComments(taskId, overlay);
          });

          bodyEl.querySelector('.comment-edit-textarea').addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
              bodyEl.querySelector('.comment-save-btn').click();
            }
            if (ev.key === 'Escape') {
              bodyEl.querySelector('.comment-cancel-btn').click();
            }
          });
        });
      });

    } catch (e) {
      container.innerHTML = '<div style="padding:12px;color:var(--color-warn-text);font-size:12px;">불러오기 실패</div>';
    }
  },

  // 태그 로드 및 렌더 — 전체 태그를 체크박스 리스트로 표시
  async _loadTags(taskId, overlay) {
    const container = overlay.querySelector('#task-tags-list');
    if (!container) return;
    try {
      const [taskTagsRes, allTagsRes] = await Promise.all([
        API.get(`/tasks/${taskId}/tags`),
        API.get('/tags'),
      ]);
      const taskTags = taskTagsRes.data || [];
      const allTags = allTagsRes.data || [];
      const attachedIds = taskTags.map(t => String(t.id));

      if (allTags.length === 0) {
        container.innerHTML = '<div style="font-size:12px;color:var(--color-text-muted);">태그가 없습니다. 아래에서 새 태그를 만들어보세요.</div>';
        return;
      }

      // 이름순 정렬 후 컴팩트 그리드로 표시
      const sorted = [...allTags].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      container.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
      container.innerHTML = sorted.map(tag => {
        const isAttached = attachedIds.includes(String(tag.id));
        return `
          <div class="tag-select-item${isAttached ? ' tag-selected' : ''}" data-tag-id="${tag.id}" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:99px;cursor:pointer;border:1px solid ${isAttached ? escHtml(tag.color) + '80' : 'var(--color-border)'};background:${isAttached ? escHtml(tag.color) + '20' : 'transparent'};transition:all 0.15s;font-size:12px;white-space:nowrap;position:relative;">
            <span style="width:8px;height:8px;border-radius:50%;background:${escHtml(tag.color)};flex-shrink:0;"></span>
            <span class="tag-select-name" style="color:${isAttached ? escHtml(tag.color) : 'var(--color-text-primary)'};font-weight:${isAttached ? '600' : '400'};">${escHtml(tag.name)}</span>
            ${isAttached ? '<span style="font-size:10px;color:var(--color-done-text);margin-left:2px;">✓</span>' : ''}
            <button class="tag-edit-btn" data-tag-id="${tag.id}" title="수정" style="display:none;padding:1px;border:none;background:transparent;cursor:pointer;color:var(--color-text-muted);flex-shrink:0;">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
            </button>
            <button class="tag-delete-btn" data-tag-id="${tag.id}" title="삭제" style="display:none;padding:1px;border:none;background:transparent;cursor:pointer;color:var(--color-warn-text);flex-shrink:0;">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        `;
      }).join('');

      // 호버 시 편집/삭제 아이콘 표시
      container.querySelectorAll('.tag-select-item').forEach(item => {
        item.addEventListener('mouseenter', () => {
          item.querySelectorAll('.tag-edit-btn, .tag-delete-btn').forEach(b => b.style.display = 'inline-flex');
        });
        item.addEventListener('mouseleave', () => {
          item.querySelectorAll('.tag-edit-btn, .tag-delete-btn').forEach(b => b.style.display = 'none');
        });
      });

      // 클릭하여 태그 토글 (attach/detach)
      container.querySelectorAll('.tag-select-item').forEach(item => {
        item.addEventListener('click', async (e) => {
          if (e.target.closest('.tag-edit-btn') || e.target.closest('.tag-delete-btn')) return;
          const tagId = item.dataset.tagId;
          const isAttached = item.classList.contains('tag-selected');
          try {
            if (isAttached) {
              await API.del(`/tasks/${taskId}/tags/${tagId}`);
            } else {
              await API.post(`/tasks/${taskId}/tags`, { tag_id: tagId });
            }
            await this._loadTags(taskId, overlay);
          } catch {
            App.toast(isAttached ? '태그 제거 실패' : '태그 추가 실패', 'error');
          }
        });
      });

      // 태그 수정 (인라인)
      container.querySelectorAll('.tag-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tagId = btn.dataset.tagId;
          const tag = allTags.find(t => String(t.id) === String(tagId));
          if (!tag) return;
          const item = btn.closest('.tag-select-item');
          item.innerHTML = `
            <input type="text" class="tag-edit-name" value="${escHtml(tag.name)}" style="flex:1;font-size:12px;padding:3px 6px;border-radius:4px;border:0.5px solid var(--color-primary);background:var(--color-bg-secondary);color:var(--color-text-primary);font-family:inherit;outline:none;">
            <input type="color" class="tag-edit-color" value="${escHtml(tag.color)}" style="width:28px;height:28px;padding:1px;border:0.5px solid var(--color-border);border-radius:4px;cursor:pointer;background:transparent;">
            <button class="btn btn-primary tag-save-btn" style="font-size:11px;padding:3px 8px;">저장</button>
            <button class="btn tag-cancel-btn" style="font-size:11px;padding:3px 8px;">취소</button>
          `;
          item.querySelector('.tag-edit-name').focus();
          item.querySelector('.tag-save-btn').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const newName = item.querySelector('.tag-edit-name').value.trim();
            const newColor = item.querySelector('.tag-edit-color').value;
            if (!newName) { App.toast('태그 이름을 입력하세요', 'error'); return; }
            try {
              await API.put(`/tags/${tagId}`, { name: newName, color: newColor });
              App.toast('태그가 수정되었습니다.', 'success');
              await this._loadTags(taskId, overlay);
            } catch { App.toast('태그 수정 실패', 'error'); }
          });
          item.querySelector('.tag-cancel-btn').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            await this._loadTags(taskId, overlay);
          });
          item.querySelector('.tag-edit-name').addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') item.querySelector('.tag-save-btn').click();
            if (ev.key === 'Escape') item.querySelector('.tag-cancel-btn').click();
          });
        });
      });

      // 태그 삭제
      container.querySelectorAll('.tag-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const tagId = btn.dataset.tagId;
          const tag = allTags.find(t => String(t.id) === String(tagId));
          const confirmed = await App.confirm(`태그 "${tag?.name || ''}"을(를) 삭제하시겠습니까?`);
          if (!confirmed) return;
          try {
            await API.del(`/tags/${tagId}`);
            App.toast('태그가 삭제되었습니다.', 'success');
            await this._loadTags(taskId, overlay);
          } catch { App.toast('태그 삭제 실패', 'error'); }
        });
      });

    } catch (e) {
      container.innerHTML = '<div style="font-size:12px;color:var(--color-warn-text);">불러오기 실패</div>';
    }
  },

  // 첨부파일 로드 및 렌더
  async _loadAttachments(taskId, overlay) {
    const list = overlay.querySelector('#attachment-list');
    if (!list) return;
    try {
      const res = await API.get(`/attachments/task/${taskId}`);
      const attachments = res.data || [];
      if (attachments.length === 0) {
        list.innerHTML = '<div style="padding:12px;color:var(--color-text-muted);font-size:12px;text-align:center;">첨부파일이 없습니다</div>';
        return;
      }
      list.innerHTML = attachments.map(a => {
        const size = a.filesize ? this._formatFileSize(a.filesize) : '';
        return `
          <div class="attachment-item" data-attach-id="${a.id}">
            <span class="attachment-icon">📎</span>
            <a href="/task/api/attachments/download/${a.id}" target="_blank" class="attachment-name">${escHtml(a.filename)}</a>
            ${size ? `<span class="attachment-size">${size}</span>` : ''}
            <button class="attachment-del" title="삭제">✕</button>
          </div>
        `;
      }).join('');

      // 삭제 버튼
      list.querySelectorAll('.attachment-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          const item = btn.closest('.attachment-item');
          const attachId = item.dataset.attachId;
          const confirmed = await App.confirm('이 파일을 삭제하시겠습니까?');
          if (!confirmed) return;
          try {
            await API.del(`/attachments/${attachId}`);
            item.remove();
          } catch {
            App.toast('삭제 실패', 'error');
          }
        });
      });
    } catch {
      list.innerHTML = '<div style="padding:12px;color:var(--color-warn-text);font-size:12px;">불러오기 실패</div>';
    }
  },

  // 파일 크기 포맷
  _formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  },

  // 멘션 미리보기 업데이트 (textarea 아래에 파란 태그 표시)
  _updateMentionPreview(textarea, overlay) {
    let preview = overlay.querySelector('#mention-preview');
    if (!preview) {
      preview = document.createElement('div');
      preview.id = 'mention-preview';
      preview.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;';
      textarea.parentNode.appendChild(preview);
    }
    const mentions = textarea.value.match(/@(\S+)/g) || [];
    const validMentions = mentions.filter(m => App.users.some(u => u.name === m.slice(1)));
    preview.innerHTML = validMentions.map(m =>
      `<span class="mention-tag">${escHtml(m)}</span>`
    ).join('');
  },

  // 댓글 텍스트에서 @멘션을 파란색으로 표시
  _highlightMentions(text) {
    return escHtml(text).replace(/@(\S+)/g, (match) => {
      const name = match.slice(1);
      if (App.users.some(u => u.name === name)) {
        return `<span class="mention-highlight">${match}</span>`;
      }
      return match;
    });
  },

  // 상대 시간 포맷 (댓글용)
  _timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return `${diff}초 전`;
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return new Date(dateStr).toLocaleDateString('ko-KR');
  },

  bindDragDrop(content) {
    const cards = content.querySelectorAll('.kanban-card');
    const dropZones = content.querySelectorAll('.kanban-cards');

    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', card.dataset.id);
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        dropZones.forEach(z => z.querySelectorAll('.kanban-card').forEach(c => c.classList.remove('drag-over')));
      });
    });

    dropZones.forEach(zone => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.closest('.kanban-col').style.outline = '2px dashed var(--color-primary)';
      });
      zone.addEventListener('dragleave', () => {
        zone.closest('.kanban-col').style.outline = '';
      });
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.closest('.kanban-col').style.outline = '';
        const taskId = e.dataTransfer.getData('text/plain');
        const newStatus = zone.dataset.status;
        try {
          await API.patch(`/tasks/${taskId}/status`, { status: newStatus });
          await this.loadTasks();
          this.renderBoard(content);
        } catch (err) {
          console.error(err);
          App.toast('상태 변경에 실패했습니다.', 'error');
        }
      });
    });
  },

  openForm(task) {
    const isEdit = !!task;
    if (isEdit && task?.id) App.setDeepLink('tasks', task.id);
    const title = isEdit ? '업무 수정' : '업무 추가';

    const statusHtml = isEdit ? `
      <div class="form-group">
        <label>상태</label>
        <div class="radio-group">
          <label><input type="radio" name="f-status" value="todo" ${task.status==='todo' ? 'checked' : ''}>할 일</label>
          <label><input type="radio" name="f-status" value="in_progress" ${task.status==='in_progress' ? 'checked' : ''}>진행 중</label>
          <label><input type="radio" name="f-status" value="done" ${task.status==='done' ? 'checked' : ''}>완료</label>
          <label><input type="radio" name="f-status" value="blocked" ${task.status==='blocked' ? 'checked' : ''}>지연</label>
        </div>
      </div>
    ` : '';

    const html = `
      <div class="form-group">
        <label>업무명 *</label>
        <input type="text" id="f-title" value="${escHtml(task?.title || '')}" placeholder="업무명을 입력하세요">
      </div>
      <div class="form-group">
        <label>분류 카테고리</label>
        <select id="f-category">${App.categoryOptions(task?.category_id)}</select>
      </div>
      <div class="form-group">
        <label>업무 상세</label>
        <textarea id="f-desc" placeholder="업무 내용을 입력하세요">${escHtml(task?.description || '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>담당자</label>
          <select id="f-assignee">${App.userOptions(task?.assignee_id)}</select>
        </div>
        <div class="form-group">
          <label>마감일</label>
          <input type="date" id="f-due" value="${task?.due_date?.slice(0,10) || ''}">
        </div>
      </div>
      <div class="form-group">
        <label>업무 유형</label>
        <select id="f-work-type" style="width:100%">
          <option value="regular" ${(!task?.work_type || task?.work_type==='regular')?'selected':''}>정규 업무 (R&R)</option>
          <option value="extra" ${task?.work_type==='extra'?'selected':''}>추가 업무</option>
          <option value="project" ${task?.work_type==='project'?'selected':''}>프로젝트</option>
        </select>
        <div style="font-size:11px;color:var(--color-text-hint);margin-top:4px;">업무의 성격 분류 (반기 리포트에서 집계됨)</div>
      </div>
      ${statusHtml}
    `;

    App.openPanel(title, html, async () => {
      const data = {
        title: document.getElementById('f-title').value.trim(),
        description: document.getElementById('f-desc').value,
        category_id: document.getElementById('f-category').value || null,
        assignee_id: document.getElementById('f-assignee').value || null,
        due_date: document.getElementById('f-due').value || null,
        work_type: document.getElementById('f-work-type')?.value || 'regular',
        status: isEdit ? document.querySelector('input[name="f-status"]:checked').value : 'todo',
      };
      if (!data.title) {
        App.toast('업무명을 입력해주세요.', 'error');
        return false;
      }
      if (isEdit) {
        await API.put(`/tasks/${task.id}`, data);
        App.toast('업무가 수정되었습니다.', 'success');
      } else {
        await API.post('/tasks', data);
        App.toast('업무가 추가되었습니다.', 'success');
      }
      await this.loadTasks();
      this.renderBoard(document.getElementById('content'));
    });
  },
};
