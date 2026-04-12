// R&R 현황 뷰
const RRRView = {
  data: [],

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = '<button class="btn btn-primary" id="btn-add-rrr">+ R&R 추가</button>';
    document.getElementById('btn-add-rrr').addEventListener('click', () => this.openAddForm());

    content.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <span>R&R 데이터 불러오는 중...</span>
      </div>
    `;

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
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon-svg">
            <svg width="48" height="48" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" stroke-width="1"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
          </div>
          <div class="empty-state-title">R&R 데이터가 없습니다</div>
          <div class="empty-state-desc">팀원의 역할을 등록해보세요</div>
          <div class="empty-state-action"><button class="btn btn-primary" id="empty-add-rrr">+ R&R 추가</button></div>
        </div>
      `;
      content.querySelector('#empty-add-rrr')?.addEventListener('click', () => this.openAddForm());
      return;
    }

    content.innerHTML = `<div class="rrr-grid" id="rrr-grid">${this.data.map(user => this._cardHtml(user)).join('')}</div>`;

    this._bindCardEvents(content);
    this._initCardDrag(content);
  },

  _cardHtml(user) {
    const leads = user.items.filter(i => i.role_type === 'solution_lead');
    const funcs = user.items.filter(i => i.role_type === 'function');
    const hasItems = leads.length > 0 || funcs.length > 0;

    return `
      <div class="rrr-card" data-user-id="${user.user_id}" draggable="true">
        <div class="rrr-card-header">
          <div class="rrr-drag-handle" title="드래그하여 순서 변경">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="4" r="1.2" fill="currentColor"/><circle cx="11" cy="4" r="1.2" fill="currentColor"/><circle cx="5" cy="8" r="1.2" fill="currentColor"/><circle cx="11" cy="8" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="11" cy="12" r="1.2" fill="currentColor"/></svg>
          </div>
          ${App.avatar({ name: user.user_name, avatar_bg: user.avatar_bg, avatar_text: user.avatar_text, avatar_url: user.avatar_url })}
          <span class="rrr-card-name">${escHtml(user.user_name)}</span>
          <button class="card-action-btn rrr-card-delete" data-rrr-del-user="${user.user_id}" title="${escHtml(user.user_name)} 전체 삭제">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>

        <div class="rrr-sections-wrap">
          ${leads.length > 0 ? `
            <div class="rrr-section">
              <div class="rrr-section-title">솔루션 리드</div>
              <ul class="rrr-item-list" data-user-id="${user.user_id}" data-role-type="solution_lead">
                ${leads.map(item => this._itemHtml(item)).join('')}
              </ul>
            </div>
          ` : ''}
          ${funcs.length > 0 ? `
            <div class="rrr-section">
              <div class="rrr-section-title">역할/기능</div>
              <ul class="rrr-item-list" data-user-id="${user.user_id}" data-role-type="function">
                ${funcs.map(item => this._itemHtml(item)).join('')}
              </ul>
            </div>
          ` : ''}
          ${!hasItems ? `
            <div class="rrr-empty-hint">등록된 역할이 없습니다</div>
          ` : ''}
        </div>

        <div class="rrr-add-area">
          <button class="btn btn-default rrr-add-btn" data-rrr-add="${user.user_id}">+ 역할 추가</button>
        </div>
      </div>
    `;
  },

  _itemHtml(item) {
    return `
      <li class="rrr-item" data-item-id="${item.id}" draggable="true">
        <span class="rrr-item-drag">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="4" r="1.2" fill="currentColor"/><circle cx="11" cy="4" r="1.2" fill="currentColor"/><circle cx="5" cy="8" r="1.2" fill="currentColor"/><circle cx="11" cy="8" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="11" cy="12" r="1.2" fill="currentColor"/></svg>
        </span>
        <span class="rrr-item-text">${escHtml(item.description)}</span>
        <div class="rrr-item-actions">
          <button class="card-action-btn" data-rrr-edit="${item.id}" title="수정">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
          </button>
          <button class="card-action-btn" data-rrr-del="${item.id}" title="삭제">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </li>
    `;
  },

  _bindCardEvents(content) {
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
          App.toast('항목이 삭제되었습니다.', 'info');
          this.render();
        }
      });
    });

    // 역할 추가
    content.querySelectorAll('[data-rrr-add]').forEach(btn => {
      btn.addEventListener('click', () => this.openAddForm(parseInt(btn.dataset.rrrAdd)));
    });

    // 카드 전체 삭제
    content.querySelectorAll('[data-rrr-del-user]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const userId = btn.dataset.rrrDelUser;
        const userData = this.data.find(u => String(u.user_id) === String(userId));
        const userName = userData ? userData.user_name : '이 팀원';
        const confirmed = await App.confirm(`${userName}의 R&R 전체를 삭제하시겠습니까?`);
        if (confirmed) {
          await Promise.all((userData?.items || []).map(item => API.del(`/rrr/${item.id}`)));
          App.toast('R&R이 모두 삭제되었습니다.', 'info');
          this.render();
        }
      });
    });
  },

  // ── 드래그앤드롭 ─────────────────────────────────
  _initCardDrag(content) {
    // 1) 카드 간 순서 (localStorage 저장)
    const grid = content.querySelector('#rrr-grid');
    let dragCard = null;

    grid.querySelectorAll('.rrr-card').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        // 아이템 드래그와 구분
        if (e.target.closest('.rrr-item')) return;
        dragCard = card;
        card.classList.add('rrr-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        dragCard = null;
        card.classList.remove('rrr-dragging');
        grid.querySelectorAll('.rrr-card').forEach(c => c.classList.remove('rrr-drag-over'));
        this._saveCardOrder();
      });
      card.addEventListener('dragover', (e) => {
        if (!dragCard || dragCard === card || e.target.closest('.rrr-item')) return;
        e.preventDefault();
        grid.querySelectorAll('.rrr-card').forEach(c => c.classList.remove('rrr-drag-over'));
        card.classList.add('rrr-drag-over');
        const rect = card.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) grid.insertBefore(dragCard, card);
        else grid.insertBefore(dragCard, card.nextSibling);
      });
      card.addEventListener('dragleave', () => card.classList.remove('rrr-drag-over'));
    });

    // 2) 항목 간 순서 (API 저장)
    grid.querySelectorAll('.rrr-item-list').forEach(list => {
      let dragItem = null;

      list.querySelectorAll('.rrr-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
          dragItem = item;
          item.classList.add('rrr-item-dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.stopPropagation();
        });
        item.addEventListener('dragend', async () => {
          item.classList.remove('rrr-item-dragging');
          list.querySelectorAll('.rrr-item').forEach(i => i.classList.remove('rrr-item-drag-over'));
          dragItem = null;
          await this._saveItemOrder(list);
        });
        item.addEventListener('dragover', (e) => {
          if (!dragItem || dragItem === item) return;
          e.preventDefault();
          e.stopPropagation();
          list.querySelectorAll('.rrr-item').forEach(i => i.classList.remove('rrr-item-drag-over'));
          item.classList.add('rrr-item-drag-over');
          const rect = item.getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) list.insertBefore(dragItem, item);
          else list.insertBefore(dragItem, item.nextSibling);
        });
        item.addEventListener('dragleave', () => item.classList.remove('rrr-item-drag-over'));
      });
    });
  },

  _saveCardOrder() {
    const grid = document.getElementById('rrr-grid');
    if (!grid) return;
    const order = [...grid.querySelectorAll('.rrr-card')].map(c => c.dataset.userId);
    localStorage.setItem('rrr_card_order', JSON.stringify(order));
  },

  async _saveItemOrder(list) {
    const items = [...list.querySelectorAll('.rrr-item')];
    const orders = items.map((el, idx) => ({ id: parseInt(el.dataset.itemId), sort_order: idx }));
    try {
      await API.post('/rrr/reorder', { orders });
    } catch {
      App.toast('순서 저장에 실패했습니다.', 'error');
    }
  },

  // ── 폼 ───────────────────────────────────────────
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
        description: document.getElementById('f-desc').value.trim(),
      };
      if (!data.user_id || !data.description) {
        App.toast('필수 항목을 입력해주세요.', 'error');
        return false;
      }
      await API.post('/rrr', data);
      App.toast('R&R이 추가되었습니다.', 'success');
      this.render();
    });
  },

  openEditForm(item) {
    const html = `
      <div class="form-group">
        <label>유형</label>
        <div class="radio-group">
          <label><input type="radio" name="f-type" value="solution_lead" ${item.role_type === 'solution_lead' ? 'checked' : ''}>솔루션 리드</label>
          <label><input type="radio" name="f-type" value="function" ${item.role_type === 'function' ? 'checked' : ''}>역할/기능</label>
        </div>
      </div>
      <div class="form-group">
        <label>설명 *</label>
        <input type="text" id="f-desc" value="${escHtml(item.description)}">
      </div>
    `;

    App.openPanel('R&R 수정', html, async () => {
      const data = {
        role_type: document.querySelector('input[name="f-type"]:checked').value,
        description: document.getElementById('f-desc').value.trim(),
      };
      if (!data.description) {
        App.toast('설명을 입력해주세요.', 'error');
        return false;
      }
      await API.put(`/rrr/${item.id}`, data);
      App.toast('R&R이 수정되었습니다.', 'success');
      this.render();
    });
  },
};
