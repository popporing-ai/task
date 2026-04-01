// 연간 타임라인 뷰
const TimelineView = {
  items: [],
  year: new Date().getFullYear(),
  filterCategory: null,

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = '<button class="btn btn-primary" id="btn-add-timeline">+ 추가</button>';
    document.getElementById('btn-add-timeline').addEventListener('click', () => this.openForm());

    await this.loadData();
    this.renderTimeline(content);
  },

  async loadData() {
    try {
      const res = await API.get(`/timeline?year=${this.year}`);
      this.items = res.data;
    } catch { this.items = []; }
  },

  renderTimeline(content) {
    const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    const currentMonth = new Date().getMonth(); // 0-indexed
    const currentYear = new Date().getFullYear();

    // 필터
    const filtered = this.filterCategory
      ? this.items.filter(i => i.category_id == this.filterCategory)
      : this.items;

    // 카테고리별 그룹
    const groups = {};
    for (const item of filtered) {
      const catName = item.category_name || '미분류';
      if (!groups[catName]) groups[catName] = { color: item.category_color, items: [] };
      groups[catName].items.push(item);
    }

    // 필터 바
    const filterHtml = `
      <div class="filter-bar">
        <button class="filter-btn ${!this.filterCategory ? 'active' : ''}" data-cat="">전체</button>
        ${App.categories.map(c =>
          `<button class="filter-btn ${this.filterCategory == c.id ? 'active' : ''}" data-cat="${c.id}">${c.name}</button>`
        ).join('')}
        <div class="filter-sep"></div>
        <button class="filter-btn" id="btn-prev-year">◀</button>
        <span style="font-size:14px;font-weight:600;padding:0 8px">${this.year}년</span>
        <button class="filter-btn" id="btn-next-year">▶</button>
      </div>
    `;

    // 타임라인 그리드
    const headerRow = `
      <div class="timeline-header">분류 / 업무</div>
      ${months.map((m, i) =>
        `<div class="timeline-header">${m}</div>`
      ).join('')}
    `;

    let rowsHtml = '';
    for (const [catName, group] of Object.entries(groups)) {
      for (const item of group.items) {
        const startM = new Date(item.start_month).getMonth();
        const endM = new Date(item.end_month).getMonth();

        rowsHtml += `
          <div class="timeline-row-label">
            <span class="category-dot" style="background:${group.color}"></span>
            <span>${escHtml(item.title)}</span>
          </div>
        `;

        for (let m = 0; m < 12; m++) {
          const isCurrent = (this.year === currentYear && m === currentMonth);
          const inRange = m >= startM && m <= endM;
          // 범위 내 셀에 툴팁 표시 (제목 + 상태)
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
    }

    if (Object.keys(groups).length === 0) {
      content.innerHTML = filterHtml + '<div class="empty-state">타임라인 항목이 없습니다.</div>';
    } else {
      content.innerHTML = filterHtml + `
        <div class="timeline-grid">${headerRow}${rowsHtml}</div>
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

    // 셀 클릭 → 수정
    content.querySelectorAll('.timeline-cell[data-item-id]').forEach(cell => {
      cell.addEventListener('dblclick', () => {
        const item = this.items.find(i => i.id == cell.dataset.itemId);
        if (item) this.openForm(item);
      });
    });

    // 행 라벨 클릭 → 수정
    content.querySelectorAll('.timeline-row-label').forEach((label, idx) => {
      label.style.cursor = 'pointer';
      label.addEventListener('click', () => {
        const allItems = Object.values(groups).flatMap(g => g.items);
        if (allItems[idx]) this.openForm(allItems[idx]);
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
        <input type="text" id="f-title" value="${item?.title || ''}">
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
        <textarea id="f-memo">${item?.memo || ''}</textarea>
      </div>
      ${isEdit ? '<button class="btn btn-danger" id="f-delete" style="margin-top:8px">삭제</button>' : ''}
    `;

    App.openPanel(title, html, async () => {
      const data = {
        title: document.getElementById('f-title').value,
        category_id: document.getElementById('f-category').value || null,
        start_month: document.getElementById('f-start').value,
        end_month: document.getElementById('f-end').value,
        status: document.querySelector('input[name="f-status"]:checked').value,
        memo: document.getElementById('f-memo').value,
      };
      if (!data.title || !data.start_month || !data.end_month) return alert('필수 항목을 입력해주세요.');
      if (isEdit) {
        await API.put(`/timeline/${item.id}`, data);
      } else {
        await API.post('/timeline', data);
      }
      await this.loadData();
      this.renderTimeline(document.getElementById('content'));
    });

    if (isEdit) {
      document.getElementById('f-delete')?.addEventListener('click', async () => {
        const confirmed = await App.confirm('이 항목을 삭제하시겠습니까?');
        if (confirmed) {
          await API.del(`/timeline/${item.id}`);
          App.closePanel();
          await this.loadData();
          this.renderTimeline(document.getElementById('content'));
        }
      });
    }
  },
};
