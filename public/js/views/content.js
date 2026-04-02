// 콘텐츠 캘린더 뷰
const ContentView = {
  items: [],
  filterChannel: null,
  filterAssignee: null,
  month: new Date().toISOString().slice(0, 7),

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = '<button class="btn btn-primary" id="btn-add-content">+ 콘텐츠 추가</button>';
    document.getElementById('btn-add-content').addEventListener('click', () => this.openForm());

    // 로딩 상태
    content.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <span>콘텐츠 목록 불러오는 중...</span>
      </div>
    `;

    await this.loadData();
    this.renderTable(content);
  },

  async loadData() {
    try {
      let url = `/content?month=${this.month}`;
      if (this.filterChannel) url += `&channel=${this.filterChannel}`;
      if (this.filterAssignee) url += `&assignee_id=${this.filterAssignee}`;
      const res = await API.get(url);
      this.items = res.data;
    } catch { this.items = []; }
  },

  renderTable(content) {
    const channels = ['YT','BL','LI','IG','FB','EM','HM'];

    const assigneeOptions = `
      <option value="">전체 담당자</option>
      ${App.users.map(u =>
        `<option value="${u.id}" ${this.filterAssignee == u.id ? 'selected' : ''}>${escHtml(u.name)}</option>`
      ).join('')}
    `;

    // 필터 바 — CSS 클래스 사용, 인라인 light 색상 제거
    const filterHtml = `
      <div class="filter-bar">
        <button class="filter-btn ${!this.filterChannel ? 'active' : ''}" data-ch="">전체</button>
        ${channels.map(ch =>
          `<button class="filter-btn ${this.filterChannel === ch ? 'active' : ''}" data-ch="${ch}">${ch}</button>`
        ).join('')}
        <div class="filter-sep"></div>
        <select id="f-assignee">${assigneeOptions}</select>
        <div class="filter-sep"></div>
        <label style="font-size:12px;color:var(--color-text-muted)">월 선택:</label>
        <input type="month" value="${this.month}" id="f-month">
        <button class="filter-btn" id="btn-reset-filters" title="필터 초기화">✕ 초기화</button>
      </div>
    `;

    const tableHtml = this.items.length > 0 ? `
      <table class="data-table">
        <thead>
          <tr>
            <th>콘텐츠 제목</th>
            <th>제품</th>
            <th>채널</th>
            <th>타입</th>
            <th>배포일</th>
            <th>콘텐츠 ID</th>
            <th>담당자</th>
            <th>상태</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${this.items.map(item => `
            <tr>
              <td>
                ${item.publish_url
                  ? `<a href="${escHtml(item.publish_url)}" target="_blank" rel="noopener" style="color:var(--color-primary)">${escHtml(item.title)} ↗</a>`
                  : escHtml(item.title)}
              </td>
              <td>${escHtml(item.product_name) || '-'}</td>
              <td><span class="badge badge-plan">${escHtml(item.channel)}</span></td>
              <td>${escHtml(item.content_type)}</td>
              <td>${escHtml(item.publish_date) || '-'}</td>
              <td>
                ${escHtml(item.content_id) || '-'}
                ${item.content_id ? `<button class="card-action-btn" data-copy-id="${escHtml(item.content_id)}" title="복사" style="display:inline;vertical-align:middle;margin-left:4px">🔗</button>` : ''}
              </td>
              <td>${item.assignee_name ? App.avatar({name: item.assignee_name, avatar_bg: item.avatar_bg, avatar_text: item.avatar_text}) + ' ' + escHtml(item.assignee_name) : '-'}</td>
              <td>${App.statusBadge(item.status)}</td>
              <td>
                <button class="card-action-btn" data-edit="${item.id}" title="수정"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></button>
                <button class="card-action-btn" data-del="${item.id}" title="삭제"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : `
      <div class="empty-state">
        <span class="empty-state-icon">📅</span>
        <div class="empty-state-title">${this.month} 콘텐츠가 없습니다</div>
        <div class="empty-state-desc">+ 콘텐츠 추가 버튼으로 첫 콘텐츠를 등록해보세요</div>
      </div>
    `;

    content.innerHTML = filterHtml + tableHtml;

    // 필터 이벤트
    content.querySelectorAll('.filter-btn[data-ch]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterChannel = btn.dataset.ch || null;
        this.render();
      });
    });
    document.getElementById('f-assignee')?.addEventListener('change', (e) => {
      this.filterAssignee = e.target.value || null;
      this.render();
    });
    document.getElementById('f-month')?.addEventListener('change', (e) => {
      this.month = e.target.value;
      this.render();
    });
    document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
      this.filterChannel = null;
      this.filterAssignee = null;
      this.render();
    });

    // 콘텐츠 ID 복사 (HTTPS/localhost가 아닌 환경 fallback 포함)
    content.querySelectorAll('[data-copy-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.copyId;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(() => App.toast('복사되었습니다', 'success'));
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          App.toast('복사되었습니다', 'success');
        }
      });
    });

    // 수정/삭제
    content.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = this.items.find(i => i.id == btn.dataset.edit);
        if (item) this.openForm(item);
      });
    });
    content.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const confirmed = await App.confirm('이 콘텐츠를 삭제하시겠습니까?');
        if (confirmed) {
          await API.del(`/content/${btn.dataset.del}`);
          App.toast('콘텐츠가 삭제되었습니다.', 'info');
          this.render();
        }
      });
    });
  },

  openForm(item) {
    const isEdit = !!item;
    const title = isEdit ? '콘텐츠 수정' : '콘텐츠 추가';
    const channels = ['IG','FB','LI','YT','BL','EM','HM'];
    const types = ['I','C','V','S','Q','A','L','T'];

    const chOpts = channels.map(c => `<option value="${c}" ${item?.channel===c?'selected':''}>${c}</option>`).join('');
    const typeOpts = types.map(t => `<option value="${t}" ${item?.content_type===t?'selected':''}>${t}</option>`).join('');

    const html = `
      <div class="form-group">
        <label>콘텐츠 제목 *</label>
        <input type="text" id="f-title" value="${escHtml(item?.title || '')}" placeholder="콘텐츠 제목을 입력하세요">
      </div>
      <div class="form-row" style="grid-template-columns:1fr 1fr 1fr">
        <div class="form-group">
          <label>제품</label>
          <select id="f-product">${App.productOptions(item?.product_id)}</select>
        </div>
        <div class="form-group">
          <label>채널 *</label>
          <select id="f-channel">${chOpts}</select>
        </div>
        <div class="form-group">
          <label>타입 *</label>
          <select id="f-type">${typeOpts}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>담당자</label>
          <select id="f-assignee">${App.userOptions(item?.assignee_id)}</select>
        </div>
        <div class="form-group">
          <label>배포 예정일</label>
          <input type="date" id="f-date" value="${item?.publish_date?.slice(0,10) || ''}">
        </div>
      </div>
      <div class="form-group">
        <label>콘텐츠 ID (자동 생성)</label>
        <input type="text" id="f-content-id" value="${escHtml(item?.content_id || '')}" placeholder="배포일+채널+타입 입력 시 자동 생성">
        <div class="preview-text" id="f-id-preview">${escHtml(item?.content_id || '배포일, 채널, 타입을 입력하면 미리보기가 표시됩니다.')}</div>
      </div>
      <div class="form-group">
        <label>유입 URL (자동 생성)</label>
        <input type="text" id="f-inflow-url" value="${escHtml(item?.inflow_url || '')}" placeholder="콘텐츠 ID 기반 자동 생성">
      </div>
      <div class="form-group">
        <label>배포 완료 URL</label>
        <input type="text" id="f-publish-url" value="${escHtml(item?.publish_url || '')}" placeholder="https://...">
      </div>
      <div class="form-group">
        <label>상태</label>
        <div class="radio-group">
          <label><input type="radio" name="f-status" value="planned" ${(!item || item.status==='planned')?'checked':''}>예정</label>
          <label><input type="radio" name="f-status" value="done" ${item?.status==='done'?'checked':''}>완료</label>
          <label><input type="radio" name="f-status" value="skipped" ${item?.status==='skipped'?'checked':''}>미진행</label>
        </div>
      </div>
      <div class="form-group">
        <label>메모</label>
        <textarea id="f-memo" placeholder="메모를 입력하세요">${escHtml(item?.memo || '')}</textarea>
      </div>
    `;

    App.openPanel(title, html, async () => {
      const data = {
        title: document.getElementById('f-title').value.trim(),
        product_id: document.getElementById('f-product').value || null,
        channel: document.getElementById('f-channel').value,
        content_type: document.getElementById('f-type').value,
        assignee_id: document.getElementById('f-assignee').value || null,
        publish_date: document.getElementById('f-date').value || null,
        content_id: document.getElementById('f-content-id').value || null,
        inflow_url: document.getElementById('f-inflow-url').value || null,
        publish_url: document.getElementById('f-publish-url').value || null,
        status: document.querySelector('input[name="f-status"]:checked').value,
        memo: document.getElementById('f-memo').value,
      };
      if (!data.title) {
        App.toast('제목을 입력해주세요.', 'error');
        return false;
      }
      if (isEdit) {
        await API.put(`/content/${item.id}`, data);
        App.toast('콘텐츠가 수정되었습니다.', 'success');
      } else {
        await API.post('/content', data);
        App.toast('콘텐츠가 추가되었습니다.', 'success');
      }
      if (data.publish_date) {
        this.month = data.publish_date.slice(0, 7);
      }
      this.render();
    });

    // 콘텐츠 ID 미리보기
    const updatePreview = async () => {
      const date = document.getElementById('f-date').value;
      const ch = document.getElementById('f-channel').value;
      const type = document.getElementById('f-type').value;
      if (date && ch && type) {
        try {
          const res = await API.get(`/content/preview-id?publish_date=${date}&channel=${ch}&content_type=${type}`);
          document.getElementById('f-id-preview').textContent = res.data.content_id;
          if (!document.getElementById('f-content-id').value) {
            document.getElementById('f-content-id').value = res.data.content_id;
          }
        } catch {}
      }
    };

    document.getElementById('f-date')?.addEventListener('change', updatePreview);
    document.getElementById('f-channel')?.addEventListener('change', updatePreview);
    document.getElementById('f-type')?.addEventListener('change', updatePreview);
  },
};
