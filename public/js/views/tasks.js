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
      { key: 'blocked', label: '미진행' },
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
        <button class="filter-btn" id="quick-filter-gear-btn" title="빠른 필터 설정" style="padding:4px 8px;">⚙</button>
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

    // 필터 바
    const filterHtml = `
      <div class="filter-bar" style="position:relative;">
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

    // 칸반 컬럼별 빈 상태 메시지
    const colEmptyMessages = {
      todo:        { icon: '📝', msg: '할 일이 없습니다' },
      in_progress: { icon: '⚡', msg: '진행 중인 업무 없음' },
      done:        { icon: '✓',  msg: '완료된 업무 없음' },
      blocked:     { icon: '—',  msg: '미진행 없음' },
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

    // 드래그 앤 드롭
    this.bindDragDrop(content);

    // 카드 이벤트
    content.querySelectorAll('.kanban-card').forEach(card => {
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

  // 필터바 공통 이벤트 바인딩
  _bindFilterBarEvents(content) {
    const dropdown = content.querySelector('#filter-dropdown');
    const toggleBtn = content.querySelector('#filter-toggle-btn');
    const sortDropdown = content.querySelector('#sort-dropdown');
    const sortToggleBtn = content.querySelector('#sort-toggle-btn');

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

    // 드롭다운 외부 클릭 닫기
    document.addEventListener('click', function closeDropdowns(e) {
      if (dropdown && !dropdown.contains(e.target) && e.target !== toggleBtn) {
        dropdown.style.display = 'none';
      }
      if (sortDropdown && !sortDropdown.contains(e.target) && e.target !== sortToggleBtn) {
        sortDropdown.style.display = 'none';
      }
      // 두 드롭다운 모두 닫혔으면 리스너 제거
      if (dropdown?.style.display === 'none' && sortDropdown?.style.display === 'none') {
        document.removeEventListener('click', closeDropdowns);
      }
    });

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
    const assignee = t.assignee_name
      ? `${App.avatar({name: t.assignee_name, avatar_bg: t.avatar_bg, avatar_text: t.avatar_text})}
         <span>${escHtml(t.assignee_name)}</span>`
      : '';

    const editIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    const deleteIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    // 아카이브 아이콘 (박스에 아래 화살표)
    const archiveIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2" width="13" height="3" rx="1" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 5v7a1 1 0 001 1h9a1 1 0 001-1V5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M6 9l2 2 2-2M8 7v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    return `
      <div class="kanban-card" draggable="true" data-id="${t.id}">
        <div class="card-actions">
          <button class="card-action-btn card-edit" title="수정">${editIcon}</button>
          <button class="card-action-btn card-archive" title="아카이브">${archiveIcon}</button>
          <button class="card-action-btn card-delete" title="삭제">${deleteIcon}</button>
        </div>
        ${t.category_name ? categoryTag(t.category_name) : ''}
        <div class="card-title">${escHtml(t.title)}</div>
        <div class="card-footer">
          ${assignee}
          <span style="margin-left:auto">${App.dday(t.due_date, t.status)}</span>
        </div>
      </div>
    `;
  },

  openDetail(task) {
    const statusLabel = { todo: '할 일', in_progress: '진행 중', done: '완료', blocked: '미진행' }[task.status] || task.status;
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
      <div class="popover task-detail-popover" style="max-width:480px;width:90%;" role="dialog" aria-modal="true">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;">
          <div style="flex:1;padding-right:16px;">
            ${task.category_name ? `<div style="margin-bottom:8px;">${categoryTag(task.category_name)}</div>` : ''}
            <div style="font-size:18px;font-weight:700;line-height:1.4;color:var(--color-text-primary);">${escHtml(task.title)}</div>
          </div>
          <button class="popover-close" id="detail-close" style="flex-shrink:0;margin-top:2px;" aria-label="닫기">×</button>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
          <span class="badge ${statusClass}">${statusLabel}</span>
        </div>

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
            <div style="font-size:13px;">${escHtml(task.creator_name || '-')}</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px;">생성일</div>
            <div style="font-size:13px;">${createdAt}</div>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:16px;border-top:1px solid var(--color-border);">
          <button class="btn" id="detail-close-btn">닫기</button>
          <button class="btn btn-primary" id="detail-edit-btn">수정</button>
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
    const title = isEdit ? '업무 수정' : '업무 추가';

    const statusHtml = isEdit ? `
      <div class="form-group">
        <label>상태</label>
        <div class="radio-group">
          <label><input type="radio" name="f-status" value="todo" ${task.status==='todo' ? 'checked' : ''}>할 일</label>
          <label><input type="radio" name="f-status" value="in_progress" ${task.status==='in_progress' ? 'checked' : ''}>진행 중</label>
          <label><input type="radio" name="f-status" value="done" ${task.status==='done' ? 'checked' : ''}>완료</label>
          <label><input type="radio" name="f-status" value="blocked" ${task.status==='blocked' ? 'checked' : ''}>미진행</label>
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
      ${statusHtml}
    `;

    App.openPanel(title, html, async () => {
      const data = {
        title: document.getElementById('f-title').value.trim(),
        description: document.getElementById('f-desc').value,
        category_id: document.getElementById('f-category').value || null,
        assignee_id: document.getElementById('f-assignee').value || null,
        due_date: document.getElementById('f-due').value || null,
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
