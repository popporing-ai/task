// 관리자 — 대량 삭제 (Salesforce 스타일)
// 엔티티 선택 → 필터 적용 → 결과 테이블 다중 체크박스 → 일괄 삭제
const AdminBulkView = {
  entity: 'tasks', // 현재 탭
  items: [],
  selected: new Set(), // 선택된 id 집합
  filters: {}, // 엔티티별 필터 상태
  loading: false,

  // 엔티티별 메타 — 컬럼·필터·리스트 엔드포인트
  ENTITIES: {
    tasks: {
      label: '업무',
      listPath: '/tasks',
      columns: [
        { key: 'title',         label: '제목',    render: r => escHtml(r.title || '') },
        { key: 'category_name', label: '분류',    render: r => escHtml(r.category_name || '-') },
        { key: 'assignee_name', label: '담당자',  render: r => escHtml(r.assignee_name || '-') },
        { key: 'status',        label: '상태',    render: r => App.statusBadge(r.status) },
        { key: 'due_date',      label: '마감',    render: r => r.due_date ? String(r.due_date).slice(0,10) : '-' },
        { key: 'created_at',    label: '생성',    render: r => r.created_at ? String(r.created_at).slice(0,10) : '-' },
      ],
      filterFields: ['keyword', 'status', 'assignee_me', 'archived'],
    },
    content: {
      label: '콘텐츠',
      listPath: '/content',
      columns: [
        { key: 'title',         label: '제목',    render: r => escHtml(r.title || '') },
        { key: 'channel',       label: '채널',    render: r => escHtml(r.channel || '-') },
        { key: 'content_type',  label: '타입',    render: r => escHtml(r.content_type || '-') },
        { key: 'assignee_name', label: '담당자',  render: r => escHtml(r.assignee_name || '-') },
        { key: 'status',        label: '상태',    render: r => App.statusBadge(r.status) },
        { key: 'publish_date',  label: '배포일',  render: r => r.publish_date ? String(r.publish_date).slice(0,10) : '-' },
      ],
      filterFields: ['keyword', 'channel', 'status', 'month'],
    },
    timeline: {
      label: '타임라인',
      listPath: '/timeline',
      columns: [
        { key: 'title',         label: '제목',    render: r => escHtml(r.title || '') },
        { key: 'category_name', label: '분류',    render: r => escHtml(r.category_name || '-') },
        { key: 'status',        label: '상태',    render: r => App.statusBadge(r.status) },
        { key: 'start_month',   label: '시작',    render: r => r.start_month ? String(r.start_month).slice(0,7) : '-' },
        { key: 'end_month',     label: '종료',    render: r => r.end_month ? String(r.end_month).slice(0,7) : '-' },
      ],
      filterFields: ['keyword', 'year', 'status'],
    },
    calendar: {
      label: '일정',
      listPath: '/calendar',
      columns: [
        { key: 'title',         label: '제목',    render: r => escHtml(r.title || '') },
        { key: 'event_type',    label: '유형',    render: r => escHtml(r.event_type || '-') },
        { key: 'assignee_name', label: '담당자',  render: r => escHtml(r.assignee_name || '-') },
        { key: 'start_date',    label: '시작',    render: r => r.start_date ? String(r.start_date).slice(0,10) : '-' },
        { key: 'end_date',      label: '종료',    render: r => r.end_date ? String(r.end_date).slice(0,10) : '-' },
      ],
      filterFields: ['keyword', 'event_type', 'date_range'],
    },
  },

  async render() {
    const content = document.getElementById('content');
    document.getElementById('topbar-actions').innerHTML = '';

    if (App.user?.role !== 'admin') {
      content.innerHTML = `<div class="empty-state"><div class="empty-state-title">관리자 전용</div><div class="empty-state-desc">이 화면은 관리자만 접근할 수 있습니다.</div></div>`;
      return;
    }

    content.innerHTML = `
      <div class="bd-warn">
        ⚠ 여기서 삭제하면 즉시 영구 삭제됩니다 (되돌릴 수 없음). 신중히 선택하세요.
      </div>
      <div class="bd-tabs">
        ${Object.entries(this.ENTITIES).map(([k, m]) =>
          `<button class="bd-tab ${this.entity === k ? 'active' : ''}" data-bd-entity="${k}">${m.label}</button>`
        ).join('')}
      </div>
      <div id="bd-body"></div>
    `;
    content.querySelectorAll('[data-bd-entity]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.entity = btn.dataset.bdEntity;
        this.selected = new Set();
        this.filters = {};
        this.renderBody();
      });
    });
    await this.renderBody();
  },

  async renderBody() {
    const body = document.getElementById('bd-body');
    if (!body) return;
    const meta = this.ENTITIES[this.entity];

    body.innerHTML = `
      <div class="bd-filter-bar">
        ${this._renderFilters(meta)}
        <button class="btn btn-default" id="bd-reload">조회</button>
      </div>
      <div id="bd-table-wrap">
        <div class="loading-state"><div class="loading-spinner"></div><span>불러오는 중...</span></div>
      </div>
    `;

    this._bindFilters();
    document.getElementById('bd-reload')?.addEventListener('click', () => this.reload());

    await this.reload();
  },

  _renderFilters(meta) {
    const f = this.filters;
    const fields = meta.filterFields || [];
    const parts = [];
    if (fields.includes('keyword')) {
      parts.push(`<input type="text" id="bd-f-keyword" placeholder="키워드" value="${escHtml(f.keyword || '')}" style="min-width:160px">`);
    }
    if (fields.includes('status')) {
      const opts = this.entity === 'tasks'
        ? [['', '상태 전체'], ['todo','할 일'], ['in_progress','진행 중'], ['done','완료'], ['blocked','지연']]
        : this.entity === 'content'
        ? [['', '상태 전체'], ['planned','예정'], ['done','완료'], ['skipped','미진행']]
        : this.entity === 'timeline'
        ? [['', '상태 전체'], ['planned','예정'], ['in_progress','진행 중'], ['done','완료'], ['tbd','TBD']]
        : [];
      parts.push(`<select id="bd-f-status">${opts.map(([v,l]) => `<option value="${v}" ${f.status==v?'selected':''}>${l}</option>`).join('')}</select>`);
    }
    if (fields.includes('channel')) {
      const chs = [['','채널 전체'],['IG','IG'],['FB','FB'],['LI','LI'],['YT','YT'],['BL','BL'],['EM','EM'],['HM','HM']];
      parts.push(`<select id="bd-f-channel">${chs.map(([v,l]) => `<option value="${v}" ${f.channel==v?'selected':''}>${l}</option>`).join('')}</select>`);
    }
    if (fields.includes('month')) {
      parts.push(`<input type="month" id="bd-f-month" value="${escHtml(f.month || '')}" placeholder="배포월">`);
    }
    if (fields.includes('year')) {
      const cur = new Date().getFullYear();
      const years = [cur+1, cur, cur-1, cur-2];
      parts.push(`<select id="bd-f-year">${['',...years].map(y => `<option value="${y}" ${String(f.year||'')==String(y)?'selected':''}>${y || '연도 전체'}</option>`).join('')}</select>`);
    }
    if (fields.includes('event_type')) {
      parts.push(`<input type="text" id="bd-f-event-type" placeholder="유형 키" value="${escHtml(f.event_type || '')}" style="width:120px">`);
    }
    if (fields.includes('date_range')) {
      parts.push(`<input type="date" id="bd-f-start-from" value="${escHtml(f.start_from || '')}" title="시작일 from">`);
      parts.push(`<input type="date" id="bd-f-start-to" value="${escHtml(f.start_to || '')}" title="시작일 to">`);
    }
    if (fields.includes('archived')) {
      parts.push(`<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px"><input type="checkbox" id="bd-f-archived" ${f.archived ? 'checked' : ''}> 아카이브만</label>`);
    }
    return parts.join(' ');
  },

  _bindFilters() {
    const f = this.filters;
    document.getElementById('bd-f-keyword')?.addEventListener('input', e => f.keyword = e.target.value);
    document.getElementById('bd-f-status')?.addEventListener('change', e => f.status = e.target.value);
    document.getElementById('bd-f-channel')?.addEventListener('change', e => f.channel = e.target.value);
    document.getElementById('bd-f-month')?.addEventListener('change', e => f.month = e.target.value);
    document.getElementById('bd-f-year')?.addEventListener('change', e => f.year = e.target.value);
    document.getElementById('bd-f-event-type')?.addEventListener('input', e => f.event_type = e.target.value);
    document.getElementById('bd-f-start-from')?.addEventListener('change', e => f.start_from = e.target.value);
    document.getElementById('bd-f-start-to')?.addEventListener('change', e => f.start_to = e.target.value);
    document.getElementById('bd-f-archived')?.addEventListener('change', e => f.archived = e.target.checked);
  },

  async reload() {
    const meta = this.ENTITIES[this.entity];
    const wrap = document.getElementById('bd-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><span>불러오는 중...</span></div>`;
    this.loading = true;

    // 쿼리 빌드
    const q = [];
    const f = this.filters;
    // tasks 는 keyword를 백엔드에서 직접 받지 않으면 클라이언트 필터 사용
    if (f.status) q.push(`status=${encodeURIComponent(f.status)}`);
    if (this.entity === 'content') {
      if (f.channel) q.push(`channel=${encodeURIComponent(f.channel)}`);
      if (f.month) q.push(`month=${encodeURIComponent(f.month)}`);
    }
    if (this.entity === 'timeline' && f.year) q.push(`year=${encodeURIComponent(f.year)}`);
    if (this.entity === 'calendar') {
      if (f.event_type) q.push(`event_type=${encodeURIComponent(f.event_type)}`);
      if (f.start_from) q.push(`start_from=${encodeURIComponent(f.start_from)}`);
      if (f.start_to) q.push(`start_to=${encodeURIComponent(f.start_to)}`);
    }
    if (this.entity === 'tasks' && f.archived) q.push(`archived=true`);

    let items = [];
    try {
      const res = await API.get(`${meta.listPath}${q.length ? '?' + q.join('&') : ''}`);
      items = res.data || [];
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-state-title">조회 실패</div><div class="empty-state-desc">${escHtml(e.message)}</div></div>`;
      this.loading = false;
      return;
    }

    // 키워드 클라이언트 필터 (백엔드가 미지원이면 안전망)
    if (f.keyword) {
      const k = f.keyword.toLowerCase();
      items = items.filter(r => (r.title || '').toLowerCase().includes(k) || (r.description || '').toLowerCase().includes(k));
    }

    this.items = items;
    // 기존 선택 중 사라진 id 정리
    const idSet = new Set(items.map(r => r.id));
    this.selected = new Set([...this.selected].filter(id => idSet.has(id)));

    this.renderTable();
    this.loading = false;
  },

  renderTable() {
    const meta = this.ENTITIES[this.entity];
    const wrap = document.getElementById('bd-table-wrap');
    if (!wrap) return;

    if (this.items.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-state-title">조건에 맞는 ${meta.label}이(가) 없습니다</div></div>`;
      return;
    }

    const allChecked = this.items.length > 0 && this.items.every(r => this.selected.has(r.id));
    const headerCols = meta.columns.map(c => `<th>${escHtml(c.label)}</th>`).join('');
    const rowsHtml = this.items.map(r => {
      const checked = this.selected.has(r.id) ? 'checked' : '';
      const cells = meta.columns.map(c => `<td>${c.render(r)}</td>`).join('');
      return `
        <tr class="bd-row ${checked ? 'bd-row-selected' : ''}" data-bd-id="${r.id}">
          <td class="bd-cell-cb"><input type="checkbox" class="bd-cb" data-id="${r.id}" ${checked}></td>
          <td class="bd-cell-id">#${r.id}</td>
          ${cells}
        </tr>
      `;
    }).join('');

    wrap.innerHTML = `
      <div class="bd-toolbar">
        <div class="bd-toolbar-l">
          <span class="bd-count">총 ${this.items.length}건 · 선택 ${this.selected.size}건</span>
        </div>
        <div class="bd-toolbar-r">
          <button class="btn btn-default" id="bd-select-all">전체 선택</button>
          <button class="btn btn-default" id="bd-clear-sel">선택 해제</button>
          <button class="btn btn-danger" id="bd-delete" ${this.selected.size === 0 ? 'disabled' : ''}>선택한 ${this.selected.size}건 삭제</button>
        </div>
      </div>
      <div class="bd-table-scroll">
        <table class="bd-table">
          <thead>
            <tr>
              <th class="bd-cell-cb"><input type="checkbox" id="bd-cb-all" ${allChecked ? 'checked' : ''}></th>
              <th>ID</th>
              ${headerCols}
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;

    // 바인딩
    document.getElementById('bd-cb-all')?.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.items.forEach(r => this.selected.add(r.id));
      } else {
        this.items.forEach(r => this.selected.delete(r.id));
      }
      this.renderTable();
    });
    document.querySelectorAll('.bd-cb').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = parseInt(cb.dataset.id, 10);
        if (cb.checked) this.selected.add(id);
        else this.selected.delete(id);
        // toolbar count 갱신만 빠르게 (전체 재렌더 X)
        document.querySelector('.bd-count').textContent = `총 ${this.items.length}건 · 선택 ${this.selected.size}건`;
        const delBtn = document.getElementById('bd-delete');
        if (delBtn) {
          delBtn.disabled = this.selected.size === 0;
          delBtn.textContent = `선택한 ${this.selected.size}건 삭제`;
        }
        cb.closest('tr')?.classList.toggle('bd-row-selected', cb.checked);
        // 전체 체크박스 상태 동기화
        const allCb = document.getElementById('bd-cb-all');
        if (allCb) allCb.checked = this.items.length > 0 && this.items.every(r => this.selected.has(r.id));
      });
    });
    document.getElementById('bd-select-all')?.addEventListener('click', () => {
      this.items.forEach(r => this.selected.add(r.id));
      this.renderTable();
    });
    document.getElementById('bd-clear-sel')?.addEventListener('click', () => {
      this.selected = new Set();
      this.renderTable();
    });
    document.getElementById('bd-delete')?.addEventListener('click', () => this.bulkDelete());
  },

  async bulkDelete() {
    if (this.selected.size === 0) return;
    const meta = this.ENTITIES[this.entity];
    const ids = [...this.selected];
    const ok = await App.confirm(`정말 ${meta.label} ${ids.length}건을 영구 삭제하시겠습니까? 되돌릴 수 없습니다.`);
    if (!ok) return;

    try {
      const res = await API.post(`/admin/bulk-delete/${this.entity}`, { ids });
      const deleted = res.data?.deleted ?? 0;
      App.toast(`${meta.label} ${deleted}건 삭제 완료`, 'success');
      this.selected = new Set();
      await this.reload();
    } catch (e) {
      App.toast(`삭제 실패: ${e.message}`, 'error');
    }
  },
};
