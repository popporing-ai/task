// 설정 뷰 — 분류 / 제품 / 채널 / 콘텐츠 타입 관리 (탭 기반)
const SettingsView = {
  // 현재 활성 탭
  activeTab: 'categories',

  // 채널 코드 + 설명 (시스템 정의)
  CHANNELS: [
    { code: 'IG', desc: 'Instagram' },
    { code: 'FB', desc: 'Facebook' },
    { code: 'LI', desc: 'LinkedIn' },
    { code: 'YT', desc: 'YouTube' },
    { code: 'BL', desc: 'Blog' },
    { code: 'EM', desc: 'Email' },
    { code: 'HM', desc: 'Homepage' },
  ],

  // 콘텐츠 타입 코드 + 설명 (시스템 정의)
  CONTENT_TYPES: [
    { code: 'I', desc: 'Image' },
    { code: 'C', desc: 'Card News' },
    { code: 'V', desc: 'Video' },
    { code: 'S', desc: 'Short' },
    { code: 'Q', desc: 'Quote' },
    { code: 'A', desc: 'Article' },
    { code: 'L', desc: 'Link' },
    { code: 'T', desc: 'Text' },
  ],

  async render() {
    const container = document.getElementById('content');

    // 상단 액션 영역 초기화
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = '';

    // 탭별 아이콘 + 카운트 계산
    const catCount = App.categories.length;
    const prodCount = App.products.length;
    const chCount = this.CHANNELS.length;
    const typeCount = this.CONTENT_TYPES.length;

    // 탭 + 콘텐츠 골격 렌더링
    container.innerHTML = `
      <div class="settings-tabs-bar">
        <button class="filter-btn ${this.activeTab === 'categories' ? 'active' : ''}" data-tab="categories">
          <span class="settings-tab-icon">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>
            분류
          </span>
          <span class="settings-tab-count">${catCount}</span>
        </button>
        <button class="filter-btn ${this.activeTab === 'products'   ? 'active' : ''}" data-tab="products">
          <span class="settings-tab-icon">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M5 6h6M5 9h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            제품
          </span>
          <span class="settings-tab-count">${prodCount}</span>
        </button>
        <button class="filter-btn ${this.activeTab === 'channels'   ? 'active' : ''}" data-tab="channels">
          <span class="settings-tab-icon">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            채널
          </span>
          <span class="settings-tab-count">${chCount}</span>
        </button>
        <button class="filter-btn ${this.activeTab === 'types'      ? 'active' : ''}" data-tab="types">
          <span class="settings-tab-icon">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 2v12M12 2v12M2 4h12M2 12h12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            콘텐츠 타입
          </span>
          <span class="settings-tab-count">${typeCount}</span>
        </button>
      </div>
      <div id="settings-tab-content"></div>
    `;

    // 탭 클릭 이벤트
    container.querySelectorAll('.filter-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        container.querySelectorAll('.filter-btn[data-tab]').forEach(b => b.classList.toggle('active', b === btn));
        this._renderActiveTab();
      });
    });

    await this._renderActiveTab();
  },

  async _renderActiveTab() {
    switch (this.activeTab) {
      case 'categories': await this._renderCategories(); break;
      case 'products':   await this._renderProducts();   break;
      case 'channels':   this._renderChannels();         break;
      case 'types':      this._renderContentTypes();     break;
    }
  },

  // ─────────────────────────────────────────
  // 분류 탭
  // ─────────────────────────────────────────
  async _renderCategories() {
    const wrap = document.getElementById('settings-tab-content');
    wrap.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><span>불러오는 중...</span></div>`;

    let categories = [];
    try {
      const res = await API.get('/categories');
      categories = res.data;
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">카테고리를 불러오지 못했습니다</div></div>`;
      return;
    }

    // 상단 버튼
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = `<button class="btn btn-primary" id="btn-add-category">+ 분류 추가</button>`;
    document.getElementById('btn-add-category').addEventListener('click', () => {
      this.openCategoryPanel(null, categories);
    });

    wrap.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden">
        <table class="settings-table">
          <thead>
            <tr>
              <th>색상</th>
              <th>분류명</th>
              <th style="width:120px;text-align:right">작업</th>
            </tr>
          </thead>
          <tbody id="category-tbody">
            ${categories.length === 0
              ? `<tr><td colspan="3" style="text-align:center;color:var(--color-text-hint);padding:40px">
                   등록된 분류가 없습니다.<br>
                   <span style="font-size:12px;margin-top:4px;display:block">+ 분류 추가 버튼으로 업무 분류를 만들어보세요</span>
                 </td></tr>`
              : categories.map(c => this._categoryRowHtml(c)).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('category-tbody').addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.btn-edit-cat');
      const delBtn  = e.target.closest('.btn-del-cat');

      if (editBtn) {
        const cat = categories.find(c => String(c.id) === editBtn.dataset.id);
        if (cat) this.openCategoryPanel(cat, categories);
      }

      if (delBtn) {
        const cat = categories.find(c => String(c.id) === delBtn.dataset.id);
        const ok = await App.confirm(`"${cat?.name}" 분류를 삭제하시겠습니까?`);
        if (!ok) return;
        try {
          await API.del(`/categories/${cat.id}`);
          App.toast(`"${cat?.name}" 분류가 삭제되었습니다.`, 'info');
          await App.loadMeta();
          await this._renderCategories();
        } catch {
          App.toast('삭제에 실패했습니다.', 'error');
        }
      }
    });
  },

  _categoryRowHtml(c) {
    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${escHtml(c.color)};flex-shrink:0;box-shadow:0 0 6px ${escHtml(c.color)}55"></span>
            <span style="font-size:13px;color:var(--color-text-muted)">${escHtml(c.color)}</span>
          </div>
        </td>
        <td>${escHtml(c.name)}</td>
        <td style="text-align:right">
          <button class="btn btn-default btn-edit-cat" data-id="${c.id}" style="margin-right:6px">수정</button>
          <button class="btn btn-danger btn-del-cat" data-id="${c.id}">삭제</button>
        </td>
      </tr>
    `;
  },

  openCategoryPanel(category, categories) {
    const isEdit = !!category;
    const html = `
      <div class="form-group">
        <label>분류명 <span style="color:var(--color-warn-text)">*</span></label>
        <input type="text" id="f-cat-name" value="${escHtml(category?.name || '')}" placeholder="예: 홈페이지">
      </div>
      <div class="form-group">
        <label>색상</label>
        <div style="display:flex;align-items:center;gap:10px">
          <input type="color" id="f-cat-color" value="${escHtml(category?.color || '#4F6EF7')}" style="width:44px;height:36px;padding:2px;border:0.5px solid rgba(255,255,255,0.12);border-radius:6px;cursor:pointer;background:transparent">
          <span id="f-cat-color-preview" style="font-size:13px;color:var(--color-text-muted)">${escHtml(category?.color || '#4F6EF7')}</span>
        </div>
      </div>
    `;

    App.openPanel(isEdit ? '분류 수정' : '분류 추가', html, async () => {
      const name  = document.getElementById('f-cat-name').value.trim();
      const color = document.getElementById('f-cat-color').value;
      if (!name) { App.toast('분류명을 입력해주세요.', 'error'); return false; }
      try {
        if (isEdit) {
          await API.put(`/categories/${category.id}`, { name, color });
          App.toast('분류가 수정되었습니다.', 'success');
        } else {
          await API.post('/categories', { name, color });
          App.toast('분류가 추가되었습니다.', 'success');
        }
        await App.loadMeta();
        await this._renderCategories();
      } catch {
        App.toast('저장에 실패했습니다.', 'error');
      }
    });

    setTimeout(() => {
      const colorInput = document.getElementById('f-cat-color');
      const preview    = document.getElementById('f-cat-color-preview');
      if (colorInput && preview) {
        colorInput.addEventListener('input', () => { preview.textContent = colorInput.value; });
      }
    }, 0);
  },

  // ─────────────────────────────────────────
  // 제품 탭
  // ─────────────────────────────────────────
  async _renderProducts() {
    const wrap = document.getElementById('settings-tab-content');
    wrap.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><span>불러오는 중...</span></div>`;

    let products = [];
    try {
      const res = await API.get('/products');
      products = res.data;
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">제품 목록을 불러오지 못했습니다</div></div>`;
      return;
    }

    // 상단 버튼
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = `<button class="btn btn-primary" id="btn-add-product">+ 제품 추가</button>`;
    document.getElementById('btn-add-product').addEventListener('click', () => {
      this.openProductPanel(null, products);
    });

    wrap.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden">
        <table class="settings-table">
          <thead>
            <tr>
              <th>제품명</th>
              <th style="width:120px;text-align:right">작업</th>
            </tr>
          </thead>
          <tbody id="product-tbody">
            ${products.length === 0
              ? `<tr><td colspan="2" style="text-align:center;color:var(--color-text-hint);padding:40px">
                   등록된 제품이 없습니다.<br>
                   <span style="font-size:12px;margin-top:4px;display:block">+ 제품 추가 버튼으로 제품을 등록하세요</span>
                 </td></tr>`
              : products.map(p => this._productRowHtml(p)).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('product-tbody').addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.btn-edit-prod');
      const delBtn  = e.target.closest('.btn-del-prod');

      if (editBtn) {
        const prod = products.find(p => String(p.id) === editBtn.dataset.id);
        if (prod) this.openProductPanel(prod, products);
      }

      if (delBtn) {
        const prod = products.find(p => String(p.id) === delBtn.dataset.id);
        const ok = await App.confirm(`"${prod?.name}" 제품을 삭제하시겠습니까?`);
        if (!ok) return;
        try {
          await API.del(`/products/${prod.id}`);
          App.toast(`"${prod?.name}" 제품이 삭제되었습니다.`, 'info');
          await App.loadMeta();
          await this._renderProducts();
        } catch {
          App.toast('삭제에 실패했습니다.', 'error');
        }
      }
    });
  },

  _productRowHtml(p) {
    return `
      <tr>
        <td>${escHtml(p.name)}</td>
        <td style="text-align:right">
          <button class="btn btn-default btn-edit-prod" data-id="${p.id}" style="margin-right:6px">수정</button>
          <button class="btn btn-danger btn-del-prod" data-id="${p.id}">삭제</button>
        </td>
      </tr>
    `;
  },

  openProductPanel(product, products) {
    const isEdit = !!product;
    const html = `
      <div class="form-group">
        <label>제품명 <span style="color:var(--color-warn-text)">*</span></label>
        <input type="text" id="f-prod-name" value="${escHtml(product?.name || '')}" placeholder="예: Remote">
      </div>
    `;

    App.openPanel(isEdit ? '제품 수정' : '제품 추가', html, async () => {
      const name = document.getElementById('f-prod-name').value.trim();
      if (!name) { App.toast('제품명을 입력해주세요.', 'error'); return false; }
      try {
        if (isEdit) {
          await API.put(`/products/${product.id}`, { name });
          App.toast('제품이 수정되었습니다.', 'success');
        } else {
          await API.post('/products', { name });
          App.toast('제품이 추가되었습니다.', 'success');
        }
        await App.loadMeta();
        await this._renderProducts();
      } catch {
        App.toast('저장에 실패했습니다.', 'error');
      }
    });
  },

  // ─────────────────────────────────────────
  // 채널 탭 (표시 전용)
  // ─────────────────────────────────────────
  _renderChannels() {
    document.getElementById('topbar-actions').innerHTML = '';
    document.getElementById('settings-tab-content').innerHTML = `
      <div class="settings-readonly-notice">
        시스템에 정의된 채널 코드입니다. 현재 변경이 불가합니다.
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <table class="settings-table">
          <thead>
            <tr>
              <th style="width:80px">코드</th>
              <th>채널명</th>
            </tr>
          </thead>
          <tbody>
            ${this.CHANNELS.map(ch => `
              <tr>
                <td><span class="settings-code-badge">${escHtml(ch.code)}</span></td>
                <td>${escHtml(ch.desc)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  // ─────────────────────────────────────────
  // 콘텐츠 타입 탭 (표시 전용)
  // ─────────────────────────────────────────
  _renderContentTypes() {
    document.getElementById('topbar-actions').innerHTML = '';
    document.getElementById('settings-tab-content').innerHTML = `
      <div class="settings-readonly-notice">
        시스템에 정의된 콘텐츠 타입 코드입니다. 현재 변경이 불가합니다.
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <table class="settings-table">
          <thead>
            <tr>
              <th style="width:80px">코드</th>
              <th>타입명</th>
            </tr>
          </thead>
          <tbody>
            ${this.CONTENT_TYPES.map(t => `
              <tr>
                <td><span class="settings-code-badge">${escHtml(t.code)}</span></td>
                <td>${escHtml(t.desc)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },
};
