// 업무 현황 (칸반 보드) 뷰
const TasksView = {
  tasks: [],
  filterCategory: null,
  filterAssignee: null,

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
      if (this.filterCategory && t.category_id != this.filterCategory) return false;
      if (this.filterAssignee && t.assignee_id != this.filterAssignee) return false;
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

    // 필터 바
    const filterHtml = `
      <div class="filter-bar">
        <button class="filter-btn ${!this.filterCategory ? 'active' : ''}" data-cat="">전체</button>
        ${App.categories.map(c =>
          `<button class="filter-btn ${this.filterCategory == c.id ? 'active' : ''}" data-cat="${c.id}">${c.name}</button>`
        ).join('')}
        <div class="filter-sep"></div>
        <button class="filter-btn ${!this.filterAssignee ? 'active' : ''}" data-user="">전체</button>
        ${App.users.map(u =>
          `<button class="filter-btn ${this.filterAssignee == u.id ? 'active' : ''}" data-user="${u.id}">${u.name}</button>`
        ).join('')}
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

    // 필터 이벤트
    content.querySelectorAll('.filter-btn[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterCategory = btn.dataset.cat || null;
        this.renderBoard(content);
      });
    });
    content.querySelectorAll('.filter-btn[data-user]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterAssignee = btn.dataset.user || null;
        this.renderBoard(content);
      });
    });

    // 드래그 앤 드롭
    this.bindDragDrop(content);

    // 카드 이벤트
    content.querySelectorAll('.kanban-card').forEach(card => {
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

    return `
      <div class="kanban-card" draggable="true" data-id="${t.id}">
        <div class="card-actions">
          <button class="card-action-btn card-edit" title="수정">✏</button>
          <button class="card-action-btn card-delete" title="삭제">✕</button>
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
