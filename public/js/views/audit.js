// 변경 이력 뷰
const AuditView = {
  logs: [],
  total: 0,
  page: 1,
  filterTable: null,
  filterUser: null,
  dateFrom: null,
  dateTo: null,
  tableLabels: {},

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = '<button class="btn btn-default" id="btn-export-csv">CSV 내보내기</button>';
    document.getElementById('btn-export-csv').addEventListener('click', () => this.exportCsv());

    // 기본 날짜 범위: 최근 30일
    if (!this.dateFrom) {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      this.dateFrom = d.toISOString().slice(0, 10);
      this.dateTo = new Date().toISOString().slice(0, 10);
    }

    // 로딩 상태
    content.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <span>변경 이력 불러오는 중...</span>
      </div>
    `;

    await this.loadData();
    this.renderTable(content);
  },

  async loadData() {
    try {
      let url = `/audit?page=${this.page}`;
      if (this.filterTable) url += `&table_name=${this.filterTable}`;
      if (this.filterUser) url += `&user_id=${this.filterUser}`;
      if (this.dateFrom) url += `&date_from=${this.dateFrom}`;
      if (this.dateTo) url += `&date_to=${this.dateTo}`;
      const res = await API.get(url);
      this.logs = res.data;
      this.total = res.total;
      this.tableLabels = res.tableLabels || {};
    } catch {
      this.logs = [];
      this.total = 0;
    }
  },

  renderTable(content) {
    const tables = [
      { key: 'tasks', label: '업무 현황' },
      { key: 'content_items', label: '콘텐츠 캘린더' },
      { key: 'timeline_items', label: '연간 타임라인' },
      { key: 'rrr_items', label: 'R&R' },
    ];

    const actionBadge = (action) => {
      const map = { CREATE: 'badge-create', UPDATE: 'badge-update', DELETE: 'badge-delete' };
      const label = { CREATE: '생성', UPDATE: '수정', DELETE: '삭제' };
      return `<span class="badge ${map[action] || ''}">${label[action] || action}</span>`;
    };

    // 필터 바 — CSS 클래스 기반, 인라인 light 색상 제거
    const filterHtml = `
      <div class="filter-bar">
        <label style="font-size:12px;color:var(--color-text-muted)">대상:</label>
        <select id="f-table">
          <option value="">전체</option>
          ${tables.map(t => `<option value="${t.key}" ${this.filterTable===t.key?'selected':''}>${t.label}</option>`).join('')}
        </select>
        <label style="font-size:12px;color:var(--color-text-muted);margin-left:8px">작업자:</label>
        <select id="f-user">
          <option value="">전체</option>
          ${App.users.map(u => `<option value="${u.id}" ${this.filterUser==u.id?'selected':''}>${escHtml(u.name)}</option>`).join('')}
        </select>
        <label style="font-size:12px;color:var(--color-text-muted);margin-left:8px">기간:</label>
        <input type="date" id="f-from" value="${this.dateFrom}">
        <span style="color:var(--color-text-hint)">~</span>
        <input type="date" id="f-to" value="${this.dateTo}">
        <button class="btn btn-default" id="f-search" style="font-size:12px;padding:4px 12px;">조회</button>
      </div>
    `;

    const isAdmin = App.user && App.user.role === 'admin';

    const tableHtml = this.logs.length > 0 ? `
      <table class="data-table">
        <thead>
          <tr>
            <th>변경일시</th>
            <th>작업자</th>
            <th>유형</th>
            <th>대상</th>
            <th>레코드</th>
            <th>변경 내용</th>
            <th>상세</th>
            ${isAdmin ? '<th>복구</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${this.logs.map(log => {
            const dt = new Date(log.created_at);
            const dtStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
            const tableLabel = this.tableLabels[log.table_name] || log.table_name;
            const summary = this.getSummary(log);

            return `
              <tr>
                <td style="white-space:nowrap">${dtStr}</td>
                <td>
                  ${log.avatar_bg ? App.avatar({name: log.user_name, avatar_bg: log.avatar_bg, avatar_text: log.avatar_text}) : ''}
                  ${escHtml(log.user_name)}
                </td>
                <td>${actionBadge(log.action)}</td>
                <td>${escHtml(tableLabel)}</td>
                <td>${escHtml(log.record_id)}</td>
                <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(summary)}</td>
                <td><button class="btn btn-default" data-detail-idx="${log.id}" style="font-size:11px;padding:2px 8px">보기</button></td>
                ${isAdmin ? `<td><button class="btn btn-default" data-restore-log="${log.id}" style="font-size:11px;padding:2px 8px;color:var(--color-primary)">복구</button></td>` : ''}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : `
      <div class="empty-state">
        <div class="empty-state-icon-svg">
          <svg width="48" height="48" viewBox="0 0 16 16" fill="none"><path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1"/><path d="M5 6h6M5 9h6M5 12h3" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
        </div>
        <div class="empty-state-title">변경 이력이 없습니다</div>
        <div class="empty-state-desc">조회 기간 또는 필터를 변경해보세요</div>
      </div>
    `;

    // 페이지네이션
    const totalPages = Math.ceil(this.total / 50);
    let paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml = '<div class="pagination">';
      paginationHtml += `<button class="page-btn" ${this.page <= 1 ? 'disabled' : ''} data-page="${this.page - 1}">◀</button>`;
      for (let i = 1; i <= totalPages && i <= 10; i++) {
        paginationHtml += `<button class="page-btn ${this.page === i ? 'active' : ''}" data-page="${i}">${i}</button>`;
      }
      paginationHtml += `<button class="page-btn" ${this.page >= totalPages ? 'disabled' : ''} data-page="${this.page + 1}">▶</button>`;
      paginationHtml += '</div>';
    }

    content.innerHTML = filterHtml + tableHtml + paginationHtml;

    // 이벤트
    document.getElementById('f-search')?.addEventListener('click', () => {
      this.filterTable = document.getElementById('f-table').value || null;
      this.filterUser = document.getElementById('f-user').value || null;
      this.dateFrom = document.getElementById('f-from').value || null;
      this.dateTo = document.getElementById('f-to').value || null;
      this.page = 1;
      this.render();
    });

    // 조회 입력에서 엔터 키 처리
    content.querySelectorAll('#f-from, #f-to').forEach(el => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('f-search')?.click();
      });
    });

    content.querySelectorAll('.page-btn[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.page);
        if (p >= 1 && p <= totalPages) {
          this.page = p;
          this.loadData().then(() => this.renderTable(content));
        }
      });
    });

    // 상세 보기 팝오버 (Map 기반, XSS 안전)
    const logMap = {};
    this.logs.forEach(log => { logMap[log.id] = { old: log.old_value, new: log.new_value }; });
    content.querySelectorAll('[data-detail-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const detail = logMap[btn.dataset.detailIdx];
        if (detail) this.showDetail(detail);
      });
    });

    // 복구 버튼 (관리자 전용)
    content.querySelectorAll('[data-restore-log]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const logId = btn.dataset.restoreLog;
        const confirmed = await App.confirm('이 변경 사항을 복구하시겠습니까? 현재 데이터가 변경될 수 있습니다.');
        if (!confirmed) return;
        try {
          btn.disabled = true;
          btn.textContent = '복구 중...';
          const res = await API.post(`/audit/${logId}/restore`, {});
          App.toast(res.message || '복구되었습니다.', 'success');
          await this.loadData();
          this.renderTable(content);
        } catch (err) {
          App.toast(err?.message || '복구에 실패했습니다.', 'error');
          btn.disabled = false;
          btn.textContent = '복구';
        }
      });
    });
  },

  getSummary(log) {
    if (log.action === 'CREATE') {
      const nv = log.new_value;
      return nv?.title || nv?.description || '새 항목 생성';
    }
    if (log.action === 'DELETE') {
      const ov = log.old_value;
      return `"${ov?.title || ov?.description || ''}" 삭제`;
    }
    // UPDATE: 변경된 필드 요약
    const ov = log.old_value || {};
    const nv = log.new_value || {};
    const changes = [];
    for (const key of Object.keys(nv)) {
      if (['updated_at', 'created_at', 'id'].includes(key)) continue;
      if (JSON.stringify(ov[key]) !== JSON.stringify(nv[key])) {
        const label = key === 'status' ? '상태' : key === 'title' ? '제목' : key;
        changes.push(`${label}: ${ov[key] || '-'} → ${nv[key] || '-'}`);
      }
    }
    return changes.join(', ') || '변경 사항 없음';
  },

  showDetail(detail) {
    const overlay = document.createElement('div');
    overlay.className = 'popover-overlay';
    overlay.innerHTML = `
      <div class="popover">
        <button class="popover-close">✕</button>
        <div class="popover-title">변경 상세</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <div style="font-size:12px;font-weight:500;margin-bottom:8px;color:var(--color-text-muted)">변경 전</div>
            <pre>${escHtml(detail.old ? JSON.stringify(detail.old, null, 2) : '(없음)')}</pre>
          </div>
          <div>
            <div style="font-size:12px;font-weight:500;margin-bottom:8px;color:var(--color-text-muted)">변경 후</div>
            <pre>${escHtml(detail.new ? JSON.stringify(detail.new, null, 2) : '(없음)')}</pre>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('.popover-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  },

  exportCsv() {
    let url = '/task/api/audit/export.csv?';
    const params = [];
    if (this.filterTable) params.push(`table_name=${this.filterTable}`);
    if (this.filterUser) params.push(`user_id=${this.filterUser}`);
    if (this.dateFrom) params.push(`date_from=${this.dateFrom}`);
    if (this.dateTo) params.push(`date_to=${this.dateTo}`);
    url += params.join('&');
    window.open(url, '_blank');
  },
};
