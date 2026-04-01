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

    const filterHtml = `
      <div class="filter-bar">
        <button class="filter-btn ${!this.filterChannel ? 'active' : ''}" data-ch="">전체</button>
        ${channels.map(ch =>
          `<button class="filter-btn ${this.filterChannel === ch ? 'active' : ''}" data-ch="${ch}">${ch}</button>`
        ).join('')}
        <div class="filter-sep"></div>
        <button class="filter-btn ${!this.filterAssignee ? 'active' : ''}" data-user="">전체</button>
        ${App.users.map(u =>
          `<button class="filter-btn ${this.filterAssignee == u.id ? 'active' : ''}" data-user="${u.id}">${u.name}</button>`
        ).join('')}
        <div class="filter-sep"></div>
        <label style="font-size:12px;color:var(--color-text-muted)">월 선택:</label>
        <input type="month" value="${this.month}" id="f-month" style="height:30px;border:0.5px solid rgba(0,0,0,0.12);border-radius:6px;padding:0 8px;font-size:12px;font-family:inherit;">
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
                ${item.publish_url ? `<a href="${escHtml(item.publish_url)}" target="_blank" rel="noopener" style="color:var(--color-primary)">${escHtml(item.title)} ↗</a>` : escHtml(item.title)}
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
                <button class="card-action-btn" data-edit="${item.id}" title="수정">✏</button>
                <button class="card-action-btn" data-del="${item.id}" title="삭제">✕</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<div class="empty-state">콘텐츠가 없습니다.</div>';

    content.innerHTML = filterHtml + tableHtml;

    // 필터 이벤트
    content.querySelectorAll('.filter-btn[data-ch]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterChannel = btn.dataset.ch || null;
        this.render();
      });
    });
    content.querySelectorAll('.filter-btn[data-user]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterAssignee = btn.dataset.user || null;
        this.render();
      });
    });
    document.getElementById('f-month')?.addEventListener('change', (e) => {
      this.month = e.target.value;
      this.render();
    });

    // 콘텐츠 ID 복사
    content.querySelectorAll('[data-copy-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.copyId);
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
        <input type="text" id="f-title" value="${item?.title || ''}">
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
        <input type="text" id="f-content-id" value="${item?.content_id || ''}" placeholder="배포일+채널+타입 입력 시 자동 생성">
        <div class="preview-text" id="f-id-preview">${item?.content_id || '배포일, 채널, 타입을 입력하면 미리보기가 표시됩니다.'}</div>
      </div>
      <div class="form-group">
        <label>유입 URL (자동 생성)</label>
        <input type="text" id="f-inflow-url" value="${item?.inflow_url || ''}" placeholder="콘텐츠 ID 기반 자동 생성">
      </div>
      <div class="form-group">
        <label>배포 완료 URL</label>
        <input type="text" id="f-publish-url" value="${item?.publish_url || ''}" placeholder="https://...">
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
        <textarea id="f-memo">${item?.memo || ''}</textarea>
      </div>
    `;

    App.openPanel(title, html, async () => {
      const data = {
        title: document.getElementById('f-title').value,
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
      if (!data.title) return alert('제목을 입력해주세요.');
      if (isEdit) {
        await API.put(`/content/${item.id}`, data);
      } else {
        await API.post('/content', data);
      }
      // 저장된 항목의 publish_date 월로 필터를 맞춰 새 항목이 보이도록 함
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
