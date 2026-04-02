// 연간 타임라인 뷰
const TimelineView = {
  items: [],
  year: new Date().getFullYear(),
  filterCategory: null,
  sortBy: 'sort_order', // 'sort_order' | 'category' | 'start_month' | 'title'
  _dragSrcId: null,

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = '<button class="btn btn-primary" id="btn-add-timeline">+ 추가</button>';
    document.getElementById('btn-add-timeline').addEventListener('click', () => this.openForm());

    // 로딩 상태
    content.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <span>타임라인 불러오는 중...</span>
      </div>
    `;

    await this.loadData();
    this.renderTimeline(content);
  },

  async loadData() {
    try {
      const res = await API.get(`/timeline?year=${this.year}`);
      this.items = res.data;
    } catch { this.items = []; }
  },

  // 정렬 기준에 따라 아이템 배열 반환
  getSortedItems(items) {
    const arr = [...items];
    if (this.sortBy === 'category') {
      arr.sort((a, b) => (a.category_name || '').localeCompare(b.category_name || '', 'ko'));
    } else if (this.sortBy === 'start_month') {
      arr.sort((a, b) => new Date(a.start_month) - new Date(b.start_month));
    } else if (this.sortBy === 'title') {
      arr.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    } else {
      // sort_order 기본: 서버에서 이미 정렬되어 있음
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    return arr;
  },

  renderTimeline(content) {
    const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    const currentMonth = new Date().getMonth(); // 0-indexed
    const currentYear = new Date().getFullYear();

    // 필터
    const filtered = this.filterCategory
      ? this.items.filter(i => i.category_id == this.filterCategory)
      : this.items;

    // 정렬
    const sortedItems = this.getSortedItems(filtered);

    // 카테고리별 그룹 (정렬된 순서 유지를 위해 Map 사용)
    const groups = {};
    for (const item of sortedItems) {
      const catName = item.category_name || '미분류';
      if (!groups[catName]) groups[catName] = { color: item.category_color, items: [] };
      groups[catName].items.push(item);
    }

    // 필터 바
    const filterHtml = `
      <div class="filter-bar">
        <button class="filter-btn ${!this.filterCategory ? 'active' : ''}" data-cat="">전체</button>
        ${App.categories.map(c =>
          `<button class="filter-btn ${this.filterCategory == c.id ? 'active' : ''}" data-cat="${c.id}">${escHtml(c.name)}</button>`
        ).join('')}
        <div class="filter-sep"></div>
        <button class="filter-btn" id="btn-prev-year">◀</button>
        <span style="font-size:14px;font-weight:600;padding:0 8px;color:var(--color-text-primary)">${this.year}년</span>
        <button class="filter-btn" id="btn-next-year">▶</button>
        <div class="filter-sep"></div>
        <span style="font-size:12px;color:var(--color-text-muted);padding:0 4px 0 2px;">정렬:</span>
        <select id="timeline-sort-select" style="background:var(--color-bg-secondary);color:var(--color-text-primary);border:1px solid var(--color-border);border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;outline:none;">
          <option value="sort_order" ${this.sortBy === 'sort_order' ? 'selected' : ''}>직접 정렬</option>
          <option value="category"   ${this.sortBy === 'category'   ? 'selected' : ''}>분류</option>
          <option value="start_month" ${this.sortBy === 'start_month' ? 'selected' : ''}>시작월</option>
          <option value="title"      ${this.sortBy === 'title'      ? 'selected' : ''}>이름</option>
        </select>
      </div>
    `;

    if (Object.keys(groups).length === 0) {
      content.innerHTML = filterHtml + `
        <div class="empty-state">
          <span class="empty-state-icon">📆</span>
          <div class="empty-state-title">${this.year}년 타임라인이 없습니다</div>
          <div class="empty-state-desc">+ 추가 버튼으로 첫 계획을 등록해보세요</div>
        </div>
      `;
    } else {
      // 타임라인 그리드
      const headerRow = `
        <div class="timeline-header">분류 / 업무</div>
        ${months.map(() => `<div class="timeline-header"></div>`).join('')}
      `;
      // 월 헤더 텍스트 복원
      const headerRowFixed = `
        <div class="timeline-header">분류 / 업무</div>
        ${months.map((m) => `<div class="timeline-header">${m}</div>`).join('')}
      `;

      let rowsHtml = '';
      // 정렬된 flat 순서로 rows 생성 (드래그용 data-item-id 보존)
      for (const item of sortedItems) {
        const catName = item.category_name || '미분류';
        const group = groups[catName];
        const startM = new Date(item.start_month).getMonth();
        const endM = new Date(item.end_month).getMonth();
        const isDraggable = this.sortBy === 'sort_order';

        rowsHtml += `
          <div class="timeline-row-label${isDraggable ? ' tl-draggable' : ''}"
               ${isDraggable ? 'draggable="true"' : ''}
               data-item-id="${item.id}"
               data-sort="${item.sort_order ?? 0}">
            ${isDraggable ? `<span class="tl-drag-handle" title="드래그하여 순서 변경">⠿</span>` : ''}
            <span class="category-dot" style="background:${escHtml(group.color || '#888')}"></span>
            <span>${escHtml(item.title)}</span>
          </div>
        `;

        for (let m = 0; m < 12; m++) {
          const isCurrent = (this.year === currentYear && m === currentMonth);
          const inRange = m >= startM && m <= endM;
          const statusLabel = { planned: '예정', in_progress: '진행 중', done: '완료', tbd: 'TBD' }[item.status] || item.status;
          const tooltip = inRange ? `title="${escHtml(item.title)} (${statusLabel})"` : '';
          rowsHtml += `
            <div class="timeline-cell ${isCurrent ? 'current-month' : ''}"
                 data-item-id="${item.id}" data-month="${m}" ${tooltip}>
              ${inRange ? `<div class="timeline-bar ${item.status}"></div>` : ''}
            </div>
          `;
        }
      }

      content.innerHTML = filterHtml + `
        <div class="timeline-grid" id="timeline-grid">${headerRowFixed}${rowsHtml}</div>
      `;
    }

    // 이벤트 바인딩
    content.querySelectorAll('.filter-btn[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterCategory = btn.dataset.cat || null;
        this.renderTimeline(content);
      });
    });
    document.getElementById('btn-prev-year')?.addEventListener('click', () => {
      this.year--;
      this.render();
    });
    document.getElementById('btn-next-year')?.addEventListener('click', () => {
      this.year++;
      this.render();
    });

    // 정렬 드롭다운
    document.getElementById('timeline-sort-select')?.addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.renderTimeline(content);
    });

    // 셀 더블클릭 → 수정
    content.querySelectorAll('.timeline-cell[data-item-id]').forEach(cell => {
      cell.addEventListener('dblclick', () => {
        const item = this.items.find(i => i.id == cell.dataset.itemId);
        if (item) this.openForm(item);
      });
    });

    // 행 라벨 클릭 → 수정 (드래그 핸들 제외)
    content.querySelectorAll('.timeline-row-label').forEach(label => {
      label.style.cursor = 'pointer';
      label.addEventListener('click', (e) => {
        if (e.target.classList.contains('tl-drag-handle')) return;
        const itemId = label.dataset.itemId;
        const item = this.items.find(i => i.id == itemId);
        if (item) this.openForm(item);
      });
    });

    // 드래그 앤 드롭 (sort_order 모드일 때만)
    if (this.sortBy === 'sort_order') {
      this._bindDragReorder(content, sortedItems);
    }
  },

  _bindDragReorder(content, sortedItems) {
    const labels = content.querySelectorAll('.timeline-row-label.tl-draggable');

    labels.forEach(label => {
      label.addEventListener('dragstart', (e) => {
        this._dragSrcId = parseInt(label.dataset.itemId);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => label.classList.add('tl-dragging'), 0);
      });

      label.addEventListener('dragend', () => {
        label.classList.remove('tl-dragging');
        content.querySelectorAll('.tl-drag-over').forEach(el => el.classList.remove('tl-drag-over'));
      });

      label.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        content.querySelectorAll('.tl-drag-over').forEach(el => el.classList.remove('tl-drag-over'));
        if (parseInt(label.dataset.itemId) !== this._dragSrcId) {
          label.classList.add('tl-drag-over');
        }
      });

      label.addEventListener('dragleave', () => {
        label.classList.remove('tl-drag-over');
      });

      label.addEventListener('drop', async (e) => {
        e.preventDefault();
        label.classList.remove('tl-drag-over');
        const srcId = this._dragSrcId;
        const tgtId = parseInt(label.dataset.itemId);
        if (!srcId || srcId === tgtId) return;

        // sortedItems 배열에서 위치 교환
        const srcIdx = sortedItems.findIndex(i => i.id === srcId);
        const tgtIdx = sortedItems.findIndex(i => i.id === tgtId);
        if (srcIdx === -1 || tgtIdx === -1) return;

        // 드래그한 항목을 목표 위치에 삽입
        const arr = [...sortedItems];
        const [moved] = arr.splice(srcIdx, 1);
        arr.splice(tgtIdx, 0, moved);

        // sort_order 재계산
        const reorderPayload = arr.map((item, idx) => ({ id: item.id, sort_order: idx }));

        // items 배열의 sort_order 업데이트
        reorderPayload.forEach(({ id, sort_order }) => {
          const it = this.items.find(i => i.id === id);
          if (it) it.sort_order = sort_order;
        });

        try {
          await API.patch('/timeline/reorder', { items: reorderPayload });
        } catch (err) {
          App.toast('순서 저장에 실패했습니다.', 'error');
        }

        this.renderTimeline(content);
      });
    });
  },

  openForm(item) {
    const isEdit = !!item;
    const title = isEdit ? '타임라인 수정' : '타임라인 추가';

    const monthOptions = (selected) => {
      let html = '<option value="">선택</option>';
      for (let m = 1; m <= 12; m++) {
        const val = `${this.year}-${String(m).padStart(2,'0')}-01`;
        html += `<option value="${val}" ${selected?.startsWith(`${this.year}-${String(m).padStart(2,'0')}`) ? 'selected' : ''}>${m}월</option>`;
      }
      return html;
    };

    const html = `
      <div class="form-group">
        <label>업무명 *</label>
        <input type="text" id="f-title" value="${escHtml(item?.title || '')}" placeholder="업무명을 입력하세요">
      </div>
      <div class="form-group">
        <label>분류 카테고리</label>
        <select id="f-category">${App.categoryOptions(item?.category_id)}</select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>시작 월 *</label>
          <select id="f-start">${monthOptions(item?.start_month)}</select>
        </div>
        <div class="form-group">
          <label>종료 월 *</label>
          <select id="f-end">${monthOptions(item?.end_month)}</select>
        </div>
      </div>
      <div class="form-group">
        <label>상태</label>
        <div class="radio-group">
          <label><input type="radio" name="f-status" value="planned" ${(!item || item.status==='planned') ? 'checked' : ''}>예정</label>
          <label><input type="radio" name="f-status" value="in_progress" ${item?.status==='in_progress' ? 'checked' : ''}>진행 중</label>
          <label><input type="radio" name="f-status" value="done" ${item?.status==='done' ? 'checked' : ''}>완료</label>
          <label><input type="radio" name="f-status" value="tbd" ${item?.status==='tbd' ? 'checked' : ''}>TBD</label>
        </div>
      </div>
      <div class="form-group">
        <label>메모</label>
        <textarea id="f-memo" placeholder="메모를 입력하세요">${escHtml(item?.memo || '')}</textarea>
      </div>
      ${isEdit ? '<button class="btn btn-danger" id="f-delete" style="margin-top:8px">삭제</button>' : ''}
    `;

    App.openPanel(title, html, async () => {
      const data = {
        title: document.getElementById('f-title').value.trim(),
        category_id: document.getElementById('f-category').value || null,
        start_month: document.getElementById('f-start').value,
        end_month: document.getElementById('f-end').value,
        status: document.querySelector('input[name="f-status"]:checked').value,
        memo: document.getElementById('f-memo').value,
      };
      if (!data.title || !data.start_month || !data.end_month) {
        App.toast('필수 항목을 입력해주세요.', 'error');
        return false;
      }
      if (isEdit) {
        await API.put(`/timeline/${item.id}`, data);
        App.toast('타임라인이 수정되었습니다.', 'success');
      } else {
        await API.post('/timeline', data);
        App.toast('타임라인이 추가되었습니다.', 'success');
      }
      await this.loadData();
      this.renderTimeline(document.getElementById('content'));
    });

    if (isEdit) {
      document.getElementById('f-delete')?.addEventListener('click', async () => {
        const confirmed = await App.confirm('이 항목을 삭제하시겠습니까?');
        if (confirmed) {
          await API.del(`/timeline/${item.id}`);
          App.toast('항목이 삭제되었습니다.', 'info');
          App.closePanel();
          await this.loadData();
          this.renderTimeline(document.getElementById('content'));
        }
      });
    }
  },
};
