// 업무 현황 (칸반 보드) 뷰
const TasksView = {
  tasks: [],
  filterCategories: [],  // 다중 선택 배열
  filterAssignees: [],   // 다중 선택 배열
  filterDropdownOpen: false,

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = '<button class="btn btn-primary" id="btn-add-task">+ 업무 추가</button>';
    document.getElementById('btn-add-task').addEventListener('click', () => this.openForm());

    await this.loadTasks();
    this.renderBoard(content);
  },

  async loadTasks() {
    try {
      const res = await API.get('/tasks');
      this.tasks = res.data;
    } catch (e) {
      this.tasks = [];
    }
  },

  getFiltered() {
    return this.tasks.filter(t => {
      if (this.filterCategories.length && !this.filterCategories.includes(String(t.category_id))) return false;
      if (this.filterAssignees.length && !this.filterAssignees.includes(String(t.assignee_id))) return false;
      return true;
    });
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
    ].join('');

    // 필터 드롭다운 HTML
    const dropdownHtml = `
      <div class="filter-dropdown" id="filter-dropdown" style="display:none;position:absolute;top:calc(100% + 6px);left:0;z-index:80;background:#fff;border-radius:10px;padding:16px;min-width:320px;box-shadow:0 8px 32px rgba(30,35,60,0.18),0 2px 8px rgba(30,35,60,0.10);border:0.5px solid rgba(30,35,60,0.10);">
        <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:8px;">분류</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
          ${App.categories.map(c => `
            <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;padding:3px 8px;border-radius:6px;border:0.5px solid rgba(30,35,60,0.13);background:${this.filterCategories.includes(String(c.id)) ? 'var(--color-primary-bg)' : '#fff'};">
              <input type="checkbox" data-filter-cat="${c.id}" ${this.filterCategories.includes(String(c.id)) ? 'checked' : ''} style="width:auto;height:auto;margin:0;">
              ${escHtml(c.name)}
            </label>
          `).join('')}
        </div>
        <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:8px;">담당자</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
          ${App.users.map(u => `
            <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;padding:3px 8px;border-radius:6px;border:0.5px solid rgba(30,35,60,0.13);background:${this.filterAssignees.includes(String(u.id)) ? 'var(--color-primary-bg)' : '#fff'};">
              <input type="checkbox" data-filter-user="${u.id}" ${this.filterAssignees.includes(String(u.id)) ? 'checked' : ''} style="width:auto;height:auto;margin:0;">
              ${escHtml(u.name)}
            </label>
          `).join('')}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:8px;border-top:1px solid rgba(30,35,60,0.07);">
          <button class="btn" id="filter-reset" style="font-size:12px;padding:5px 12px;">초기화</button>
          <button class="btn btn-primary" id="filter-apply" style="font-size:12px;padding:5px 12px;">적용</button>
        </div>
      </div>
    `;

    const hasFilters = this.filterCategories.length || this.filterAssignees.length;

    // 필터 바
    const filterHtml = `
      <div class="filter-bar" style="position:relative;">
        <button class="filter-btn ${!hasFilters ? 'active' : ''}" id="filter-all">전체</button>
        <div style="position:relative;">
          <button class="filter-btn ${hasFilters ? 'active' : ''}" id="filter-toggle-btn">필터 ▼</button>
          ${dropdownHtml}
        </div>
        ${activeTags}
      </div>
    `;

    content.innerHTML = filterHtml + `
      <div class="kanban-board">
        ${cols.map(col => {
          const colTasks = filtered.filter(t => t.status === col.key);
          return `
            <div class="kanban-col col-${col.key}" data-status="${col.key}">
              <div class="kanban-col-header">
                <span class="kanban-col-title">${col.label}</span>
                <span class="kanban-col-count">${colTasks.length}</span>
              </div>
              <div class="kanban-cards" data-status="${col.key}">
                ${colTasks.map(t => this.renderCard(t)).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // 전체 버튼
    content.querySelector('#filter-all')?.addEventListener('click', () => {
      this.filterCategories = [];
      this.filterAssignees = [];
      this.renderBoard(content);
    });

    // 필터 드롭다운 토글
    const toggleBtn = content.querySelector('#filter-toggle-btn');
    const dropdown = content.querySelector('#filter-dropdown');
    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.style.display !== 'none';
      dropdown.style.display = isOpen ? 'none' : 'block';
    });

    // 드롭다운 외부 클릭 닫기
    document.addEventListener('click', function closeDropdown(e) {
      if (dropdown && !dropdown.contains(e.target) && e.target !== toggleBtn) {
        dropdown.style.display = 'none';
        document.removeEventListener('click', closeDropdown);
      }
    });

    // 적용 버튼
    content.querySelector('#filter-apply')?.addEventListener('click', () => {
      this.filterCategories = [...content.querySelectorAll('[data-filter-cat]:checked')].map(cb => cb.dataset.filterCat);
      this.filterAssignees = [...content.querySelectorAll('[data-filter-user]:checked')].map(cb => cb.dataset.filterUser);
      this.renderBoard(content);
    });

    // 초기화 버튼
    content.querySelector('#filter-reset')?.addEventListener('click', () => {
      this.filterCategories = [];
      this.filterAssignees = [];
      this.renderBoard(content);
    });

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

    // 드래그 앤 드롭
    this.bindDragDrop(content);

    // 카드 이벤트
    content.querySelectorAll('.kanban-card').forEach(card => {
      // 카드 클릭 → 상세 팝오버 (아이콘 버튼 제외)
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
          await API.del(`/tasks/${card.dataset.id}`);
          await this.loadTasks();
          this.renderBoard(content);
        }
      });
    });
  },

  renderCard(t) {
    const assignee = t.assignee_name
      ? `${App.avatar({name: t.assignee_name, avatar_bg: t.avatar_bg, avatar_text: t.avatar_text})}
         <span>${escHtml(t.assignee_name)}</span>`
      : '';

    const editIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    const deleteIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    return `
      <div class="kanban-card" draggable="true" data-id="${t.id}">
        <div class="card-actions">
          <button class="card-action-btn card-edit" title="수정">${editIcon}</button>
          <button class="card-action-btn card-delete" title="삭제">${deleteIcon}</button>
        </div>
        ${t.category_name ? categoryTag(escHtml(t.category_name)) : ''}
        <div class="card-title">${escHtml(t.title)}</div>
        <div class="card-footer">
          ${assignee}
          <span style="margin-left:auto">${App.dday(t.due_date, t.status)}</span>
        </div>
      </div>
    `;
  },

  openDetail(task) {
    // 상태 레이블
    const statusLabel = { todo: '할 일', in_progress: '진행 중', done: '완료', blocked: '미진행' }[task.status] || task.status;
    const statusClass = { todo: 'badge-plan', in_progress: 'badge-plan', done: 'badge-done', blocked: 'badge-warn' }[task.status] || 'badge-plan';

    // 담당자
    const assigneeHtml = task.assignee_name
      ? `<div style="display:flex;align-items:center;gap:8px;">${App.avatar({name: task.assignee_name, avatar_bg: task.avatar_bg, avatar_text: task.avatar_text})}<span>${escHtml(task.assignee_name)}</span></div>`
      : '<span style="color:var(--color-text-hint)">미지정</span>';

    // 마감일
    const dueHtml = task.due_date
      ? `${task.due_date.slice(0, 10)} ${App.dday(task.due_date, task.status)}`
      : '<span style="color:var(--color-text-hint)">없음</span>';

    // 생성일
    const createdAt = task.created_at ? task.created_at.slice(0, 10) : '-';

    const overlay = document.createElement('div');
    overlay.className = 'popover-overlay';
    overlay.innerHTML = `
      <div class="popover task-detail-popover" style="max-width:480px;width:90%;" role="dialog">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;">
          <div style="flex:1;padding-right:16px;">
            ${task.category_name ? `<div style="margin-bottom:8px;">${categoryTag(escHtml(task.category_name))}</div>` : ''}
            <div style="font-size:18px;font-weight:700;line-height:1.4;color:var(--color-text-primary);">${escHtml(task.title)}</div>
          </div>
          <button class="popover-close" id="detail-close" style="flex-shrink:0;margin-top:2px;">×</button>
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

        <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:16px;border-top:1px solid rgba(30,35,60,0.07);">
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
        }
      });
    });
  },

  openForm(task) {
    const isEdit = !!task;
    const title = isEdit ? '업무 수정' : '업무 추가';

    const html = `
      <div class="form-group">
        <label>업무명 *</label>
        <input type="text" id="f-title" value="${task?.title || ''}">
      </div>
      <div class="form-group">
        <label>분류 카테고리</label>
        <select id="f-category">${App.categoryOptions(task?.category_id)}</select>
      </div>
      <div class="form-group">
        <label>업무 상세</label>
        <textarea id="f-desc">${task?.description || ''}</textarea>
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
        <label>상태</label>
        <div class="radio-group">
          <label><input type="radio" name="f-status" value="todo" ${(!task || task.status==='todo') ? 'checked' : ''}>할 일</label>
          <label><input type="radio" name="f-status" value="in_progress" ${task?.status==='in_progress' ? 'checked' : ''}>진행 중</label>
          <label><input type="radio" name="f-status" value="done" ${task?.status==='done' ? 'checked' : ''}>완료</label>
          <label><input type="radio" name="f-status" value="blocked" ${task?.status==='blocked' ? 'checked' : ''}>미진행</label>
        </div>
      </div>
    `;

    App.openPanel(title, html, async () => {
      const data = {
        title: document.getElementById('f-title').value,
        description: document.getElementById('f-desc').value,
        category_id: document.getElementById('f-category').value || null,
        assignee_id: document.getElementById('f-assignee').value || null,
        due_date: document.getElementById('f-due').value || null,
        status: document.querySelector('input[name="f-status"]:checked').value,
      };
      if (!data.title) return alert('업무명을 입력해주세요.');
      if (isEdit) {
        await API.put(`/tasks/${task.id}`, data);
      } else {
        await API.post('/tasks', data);
      }
      await this.loadTasks();
      this.renderBoard(document.getElementById('content'));
    });
  },
};
