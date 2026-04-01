// R&R 현황 뷰
const RRRView = {
  data: [],

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    // 항상 추가 버튼 표시
    actions.innerHTML = '<button class="btn btn-primary" id="btn-add-rrr">+ R&R 추가</button>';
    document.getElementById('btn-add-rrr').addEventListener('click', () => this.openAddForm());

    await this.loadData();
    this.renderCards(content);
  },

  async loadData() {
    try {
      const res = await API.get('/rrr');
      this.data = res.data;
    } catch { this.data = []; }
  },

  renderCards(content) {
    if (this.data.length === 0) {
      content.innerHTML = '<div class="empty-state">R&R 데이터가 없습니다.</div>';
      return;
    }

    content.innerHTML = `
      <div class="rrr-grid">
        ${this.data.map(user => {
          const leads = user.items.filter(i => i.role_type === 'solution_lead');
          const funcs = user.items.filter(i => i.role_type === 'function');

          return `
            <div class="rrr-card" data-user-id="${user.user_id}">
              <div class="rrr-card-header">
                ${App.avatar({name: user.user_name, avatar_bg: user.avatar_bg, avatar_text: user.avatar_text})}
                <span class="rrr-card-name">${escHtml(user.user_name)}</span>
              </div>
              ${leads.length > 0 ? `
                <div class="rrr-section">
                  <div class="rrr-section-title">솔루션 리드</div>
                  ${leads.map(item => `
                    <div class="rrr-item" data-item-id="${item.id}">
                      <span>${escHtml(item.description)}</span>
                      <div class="rrr-item-actions">
                        <button class="card-action-btn" data-rrr-edit="${item.id}" title="수정"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></button>
                        <button class="card-action-btn" data-rrr-del="${item.id}" title="삭제"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              ${funcs.length > 0 ? `
                <div class="rrr-section">
                  <div class="rrr-section-title">역할/기능</div>
                  ${funcs.map(item => `
                    <div class="rrr-item" data-item-id="${item.id}">
                      <span>${escHtml(item.description)}</span>
                      <div class="rrr-item-actions">
                        <button class="card-action-btn" data-rrr-edit="${item.id}" title="수정"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></button>
                        <button class="card-action-btn" data-rrr-del="${item.id}" title="삭제"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              <div class="rrr-add-area" style="margin-top:10px;">
                <button class="btn btn-default" data-rrr-add="${user.user_id}" style="font-size:12px;width:100%">+ 역할 추가</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // 항목 수정
    content.querySelectorAll('[data-rrr-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const allItems = this.data.flatMap(u => u.items);
        const item = allItems.find(i => i.id == btn.dataset.rrrEdit);
        if (item) this.openEditForm(item);
      });
    });

    // 항목 삭제
    content.querySelectorAll('[data-rrr-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const confirmed = await App.confirm('이 항목을 삭제하시겠습니까?');
        if (confirmed) {
          await API.del(`/rrr/${btn.dataset.rrrDel}`);
          this.render();
        }
      });
    });

    // 역할 추가
    content.querySelectorAll('[data-rrr-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openAddForm(parseInt(btn.dataset.rrrAdd));
      });
    });
  },

  openAddForm(userId) {
    const html = `
      <div class="form-group">
        <label>팀원</label>
        <select id="f-user">${App.userOptions(userId)}</select>
      </div>
      <div class="form-group">
        <label>유형</label>
        <div class="radio-group">
          <label><input type="radio" name="f-type" value="solution_lead" checked>솔루션 리드</label>
          <label><input type="radio" name="f-type" value="function">역할/기능</label>
        </div>
      </div>
      <div class="form-group">
        <label>설명 *</label>
        <input type="text" id="f-desc" placeholder="예: Remote, Make&View 또는 유튜브 기획&제작">
      </div>
    `;

    App.openPanel('R&R 추가', html, async () => {
      const data = {
        user_id: document.getElementById('f-user').value,
        role_type: document.querySelector('input[name="f-type"]:checked').value,
        description: document.getElementById('f-desc').value,
      };
      if (!data.user_id || !data.description) return alert('필수 항목을 입력해주세요.');
      await API.post('/rrr', data);
      this.render();
    });
  },

  openEditForm(item) {
    const html = `
      <div class="form-group">
        <label>유형</label>
        <div class="radio-group">
          <label><input type="radio" name="f-type" value="solution_lead" ${item.role_type==='solution_lead'?'checked':''}>솔루션 리드</label>
          <label><input type="radio" name="f-type" value="function" ${item.role_type==='function'?'checked':''}>역할/기능</label>
        </div>
      </div>
      <div class="form-group">
        <label>설명 *</label>
        <input type="text" id="f-desc" value="${item.description}">
      </div>
    `;

    App.openPanel('R&R 수정', html, async () => {
      const data = {
        role_type: document.querySelector('input[name="f-type"]:checked').value,
        description: document.getElementById('f-desc').value,
      };
      if (!data.description) return alert('설명을 입력해주세요.');
      await API.put(`/rrr/${item.id}`, data);
      this.render();
    });
  },
};
