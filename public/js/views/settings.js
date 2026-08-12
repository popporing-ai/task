// 설정 뷰 — 분류 / 제품 / 채널 / 콘텐츠 타입 관리 (탭 기반)
const SettingsView = {
  // 현재 활성 탭
  activeTab: 'myaccount',

  // 외부에서 설정 화면 진입 시 특정 엔터티에 포커스 (인라인 추가 후 설정 확인용)
  // { type: 'category'|'product'|'eventType', id: number }
  focusEntity: null,

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
    const isAdmin = App.user?.role === 'admin';

    // 탭 + 콘텐츠 골격 렌더링
    container.innerHTML = `
      <div class="settings-tabs-bar">
        <button class="filter-btn ${this.activeTab === 'myaccount' ? 'active' : ''}" data-tab="myaccount">
          <span class="settings-tab-icon">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" stroke-width="1.3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            내 계정
          </span>
        </button>
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
        <button class="filter-btn ${this.activeTab === 'event_types' ? 'active' : ''}" data-tab="event_types">
          <span class="settings-tab-icon">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="13" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M1 6h14M5 1v3M11 1v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            일정 유형
          </span>
        </button>
        ${isAdmin ? `
        <button class="filter-btn ${this.activeTab === 'members' ? 'active' : ''}" data-tab="members">
          <span class="settings-tab-icon">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" stroke-width="1.3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            팀원 관리
          </span>
        </button>
        ` : ''}
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

    // focusEntity가 설정되어 있으면 해당 탭으로 전환 후 편집 패널 열기
    if (this.focusEntity) {
      const fe = this.focusEntity;
      this.focusEntity = null;
      const tabMap = { category: 'categories', product: 'products', eventType: 'event_types' };
      const targetTab = tabMap[fe.type];
      if (targetTab && targetTab !== this.activeTab) {
        this.activeTab = targetTab;
        container.querySelectorAll('.filter-btn[data-tab]').forEach(b =>
          b.classList.toggle('active', b.dataset.tab === targetTab)
        );
      }
      await this._renderActiveTab();
      // 탭 렌더 완료 후 해당 엔터티의 편집 패널 열기
      await this._openFocusedEntityEdit(fe);
    } else {
      await this._renderActiveTab();
    }
  },

  async _openFocusedEntityEdit(fe) {
    try {
      if (fe.type === 'category') {
        const res = await API.get('/categories');
        const cat = (res.data || []).find(c => c.id === fe.id || String(c.id) === String(fe.id));
        if (cat) this.openCategoryPanel(cat, res.data);
      } else if (fe.type === 'product') {
        const res = await API.get('/products');
        const prod = (res.data || []).find(p => p.id === fe.id || String(p.id) === String(fe.id));
        if (prod) this.openProductPanel(prod, res.data);
      } else if (fe.type === 'eventType') {
        const res = await API.get('/calendar/event-types');
        const et = (res.data || []).find(t => t.id === fe.id || String(t.id) === String(fe.id));
        if (et) this._openEventTypePanel(et);
      }
    } catch {
      // 엔터티를 찾지 못해도 설정 화면은 정상 표시
    }
  },

  async _renderActiveTab() {
    switch (this.activeTab) {
      case 'myaccount':  await this._renderMyAccount();  break;
      case 'categories': await this._renderCategories(); break;
      case 'products':   await this._renderProducts();   break;
      case 'channels':   this._renderChannels();         break;
      case 'types':      this._renderContentTypes();     break;
      case 'event_types': await this._renderEventTypes(); break;
      case 'members':    await this._renderMembers();    break;
    }
  },

  // ─────────────────────────────────────────
  // 일정 유형 탭 (캘린더 event_type CRUD)
  // ─────────────────────────────────────────
  async _renderEventTypes() {
    const wrap = document.getElementById('settings-tab-content');
    wrap.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><span>불러오는 중...</span></div>`;
    document.getElementById('topbar-actions').innerHTML = '';

    let types = [];
    try {
      const res = await API.get('/calendar/event-types');
      types = res.data || [];
    } catch {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-state-title">일정 유형을 불러오지 못했습니다</div></div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="settings-section-header">
        <div>
          <div class="settings-section-title">일정 유형</div>
          <div class="settings-section-desc">팀 캘린더에서 사용할 일정 유형. 기본 유형은 색상, 이름만 수정 가능합니다.</div>
        </div>
        <button class="btn btn-primary" id="btn-add-event-type">+ 유형 추가</button>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <table class="settings-table">
          <thead><tr><th style="width:80px">색상</th><th>이름</th><th style="width:90px;color:var(--color-text-muted);font-size:11px;">분류</th><th style="width:160px;text-align:right">작업</th></tr></thead>
          <tbody id="event-type-tbody">
            ${types.length === 0
              ? `<tr><td colspan="4" style="text-align:center;color:var(--color-text-hint);padding:40px">등록된 유형이 없습니다.</td></tr>`
              : types.map(t => this._eventTypeRowHtml(t, true)).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('btn-add-event-type').addEventListener('click', () => {
      this._openEventTypePanel(null);
    });

    document.getElementById('event-type-tbody').addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.btn-edit-et');
      const delBtn  = e.target.closest('.btn-del-et');

      if (editBtn) {
        const t = types.find(x => String(x.id) === editBtn.dataset.id);
        if (t) this._openEventTypePanel(t);
      }
      if (delBtn) {
        const t = types.find(x => String(x.id) === delBtn.dataset.id);
        if (!t) return;
        if (t.is_builtin) {
          App.toast('기본 유형은 삭제할 수 없습니다.', 'error');
          return;
        }
        const ok = await App.confirm(`"${t.label}" 유형을 삭제하시겠습니까? (해당 유형 사용 중인 일정은 '일반'으로 변경됩니다.)`);
        if (!ok) return;
        try {
          await API.del(`/calendar/event-types/${t.id}`);
          App.toast(`"${t.label}" 유형이 삭제되었습니다.`, 'info');
          await this._renderEventTypes();
        } catch (err) {
          App.toast(err.message || '삭제 실패', 'error');
        }
      }
    });
  },

  _eventTypeRowHtml(t, isAdmin) {
    const badge = t.is_builtin
      ? `<span class="badge badge-plan" style="font-size:10px;">기본</span>`
      : `<span class="badge badge-skip" style="font-size:10px;">사용자</span>`;
    const actionsCol = isAdmin ? `
        <td style="text-align:right">
          <button class="btn btn-default btn-edit-et" data-id="${t.id}" style="margin-right:6px">수정</button>
          ${t.is_builtin
            ? `<button class="btn btn-default" disabled title="기본 유형은 삭제할 수 없습니다" style="opacity:0.45;cursor:not-allowed;">삭제</button>`
            : `<button class="btn btn-danger btn-del-et" data-id="${t.id}">삭제</button>`}
        </td>` : '';
    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${escHtml(t.color)};flex-shrink:0;box-shadow:0 0 6px ${escHtml(t.color)}55"></span>
            <span style="font-size:12px;color:var(--color-text-muted)">${escHtml(t.color)}</span>
          </div>
        </td>
        <td>${escHtml(t.label)}</td>
        <td>${badge}</td>
        ${actionsCol}
      </tr>
    `;
  },

  _openEventTypePanel(et) {
    const isEdit = !!et;
    const title = isEdit ? '일정 유형 수정' : '일정 유형 추가';
    const html = `
      <div class="form-group">
        <label>유형 이름 *</label>
        <input type="text" id="f-et-label" value="${escHtml(et?.label || '')}" placeholder="예: 외부 미팅">
      </div>
      <div class="form-group">
        <label>색상</label>
        <div style="display:flex;align-items:center;gap:10px">
          <input type="color" id="f-et-color" value="${escHtml(et?.color || '#4F6EF7')}" style="width:44px;height:36px;padding:2px;border-radius:8px;cursor:pointer;background:transparent;border:1px solid var(--color-border);">
          <span id="f-et-color-preview" style="font-size:13px;color:var(--color-text-muted)">${escHtml(et?.color || '#4F6EF7')}</span>
        </div>
        <div style="font-size:11px;color:var(--color-text-hint);margin-top:6px;">이 색상이 캘린더의 해당 일정에 자동 적용됩니다.</div>
      </div>
      ${isEdit && et.is_builtin ? `
      <div class="rrr-permission-banner" style="margin:8px 0 0;font-size:12px;">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/><path d="M8 5v3M8 11h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        기본 제공 유형이라 삭제는 불가하지만, 이름·색상은 자유롭게 변경할 수 있습니다.
      </div>` : ''}
    `;

    App.openPanel(title, html, async () => {
      const label = document.getElementById('f-et-label').value.trim();
      const color = document.getElementById('f-et-color').value;
      if (!label) { App.toast('유형 이름을 입력해주세요.', 'error'); return false; }
      try {
        if (isEdit) {
          await API.put(`/calendar/event-types/${et.id}`, { label, color });
          App.toast('유형이 수정되었습니다.', 'success');
        } else {
          await API.post('/calendar/event-types', { label, color });
          App.toast('유형이 추가되었습니다.', 'success');
        }
        await this._renderEventTypes();
      } catch (e) {
        App.toast(e.message || '저장 실패', 'error');
      }
    });

    setTimeout(() => {
      const colorInput = document.getElementById('f-et-color');
      const preview = document.getElementById('f-et-color-preview');
      if (colorInput && preview) {
        colorInput.addEventListener('input', () => { preview.textContent = colorInput.value; });
      }
    }, 0);
  },

  // ─────────────────────────────────────────
  // 내 계정 탭
  // ─────────────────────────────────────────
  async _renderMyAccount() {
    const wrap = document.getElementById('settings-tab-content');
    document.getElementById('topbar-actions').innerHTML = '';
    const u = App.user;

    wrap.innerHTML = `
      <div class="my-account-wrap">
        <!-- 프로필 이미지 -->
        <div class="card" style="padding:24px;">
          <div class="settings-section-title">프로필 이미지</div>
          <div style="display:flex;align-items:center;gap:20px;margin-top:16px;">
            <label class="avatar-upload-wrap" title="클릭하여 이미지 변경" style="cursor:pointer;width:64px;height:64px;border-radius:50%;flex-shrink:0;">
              ${u.avatar_url
                ? `<span class="avatar" style="width:64px;height:64px;font-size:24px;"><img src="${escHtml(u.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"></span>`
                : `<span class="avatar" style="width:64px;height:64px;font-size:24px;background:${escHtml(u.avatar_bg)};color:${escHtml(u.avatar_text)}">${escHtml(u.name.charAt(0))}</span>`
              }
              <span class="avatar-upload-overlay" style="inset:0;width:64px;height:64px;">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
              </span>
              <input type="file" id="my-avatar-input" accept="image/*" style="display:none;">
            </label>
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--color-text-primary);margin-bottom:4px;">${escHtml(u.name)}</div>
              <div style="font-size:12px;color:var(--color-text-muted);">${escHtml(u.email)}</div>
              ${u.avatar_url ? `<button class="btn btn-danger" id="btn-del-avatar" style="margin-top:10px;font-size:12px;padding:4px 12px;">이미지 삭제</button>` : ''}
            </div>
          </div>
        </div>

        <!-- 비밀번호 변경 -->
        <div class="card" style="padding:24px;margin-top:16px;">
          <div class="settings-section-title">비밀번호 변경</div>
          <div style="max-width:360px;margin-top:16px;">
            <div class="form-group">
              <label>현재 비밀번호</label>
              <input type="password" id="pw-current" placeholder="현재 비밀번호 입력">
            </div>
            <div class="form-group">
              <label>새 비밀번호 <span style="color:var(--color-text-hint);font-size:11px;">(8자 이상)</span></label>
              <input type="password" id="pw-new" placeholder="새 비밀번호 입력">
            </div>
            <div class="form-group">
              <label>새 비밀번호 확인</label>
              <input type="password" id="pw-confirm" placeholder="새 비밀번호 재입력">
            </div>
            <button class="btn btn-primary" id="btn-change-pw" style="width:100%;">비밀번호 변경</button>
          </div>
        </div>
      </div>
    `;

    // 아바타 업로드
    document.getElementById('my-avatar-input')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('avatar', file);
      try {
        await API.upload(`/users/${u.id}/avatar`, formData);
        App.toast('프로필 이미지가 변경되었습니다.', 'success');
        const res = await API.get('/auth/me');
        App.user = res.data;
        App.renderUserInfo();
        await this._renderMyAccount();
      } catch {
        App.toast('이미지 업로드에 실패했습니다.', 'error');
      }
    });

    // 아바타 삭제
    document.getElementById('btn-del-avatar')?.addEventListener('click', async () => {
      const ok = await App.confirm('프로필 이미지를 삭제하시겠습니까?');
      if (!ok) return;
      try {
        await API.del(`/users/${u.id}/avatar`);
        App.toast('이미지가 삭제되었습니다.', 'info');
        const res = await API.get('/auth/me');
        App.user = res.data;
        App.renderUserInfo();
        await this._renderMyAccount();
      } catch {
        App.toast('삭제에 실패했습니다.', 'error');
      }
    });

    // 비밀번호 변경
    document.getElementById('btn-change-pw')?.addEventListener('click', async () => {
      const current = document.getElementById('pw-current').value;
      const newPw = document.getElementById('pw-new').value;
      const confirm = document.getElementById('pw-confirm').value;
      if (!current || !newPw || !confirm) {
        App.toast('모든 항목을 입력해주세요.', 'error'); return;
      }
      if (newPw !== confirm) {
        App.toast('새 비밀번호가 일치하지 않습니다.', 'error'); return;
      }
      if (newPw.length < 8) {
        App.toast('새 비밀번호는 8자 이상이어야 합니다.', 'error'); return;
      }
      try {
        await API.patch('/auth/me/password', { current_password: current, new_password: newPw });
        App.toast('비밀번호가 변경되었습니다.', 'success');
        document.getElementById('pw-current').value = '';
        document.getElementById('pw-new').value = '';
        document.getElementById('pw-confirm').value = '';
      } catch (e) {
        App.toast(e.message || '변경에 실패했습니다.', 'error');
      }
    });
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

    // 상단 토픽 버튼은 사용 안 함 (바디로 이동)
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = '';

    wrap.innerHTML = `
      <div class="settings-section-header">
        <div>
          <div class="settings-section-title">업무 분류</div>
          <div class="settings-section-desc">업무 카드의 분류 태그로 사용됩니다. 위/아래 화살표로 순서를 바꾸면 선택 목록에도 그 순서로 반영됩니다.</div>
        </div>
        <button class="btn btn-primary" id="btn-add-category">+ 분류 추가</button>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <table class="settings-table">
          <thead><tr><th>색상</th><th>분류명</th><th style="width:120px;text-align:right">작업</th></tr></thead>
          <tbody id="category-tbody">
            ${categories.length === 0
              ? `<tr><td colspan="3" style="text-align:center;color:var(--color-text-hint);padding:40px">
                   등록된 분류가 없습니다.<br>
                   <span style="font-size:12px;margin-top:4px;display:block">상단의 + 분류 추가 버튼으로 만들어보세요</span>
                 </td></tr>`
              : categories.map(c => this._categoryRowHtml(c, true)).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('btn-add-category').addEventListener('click', () => {
      this.openCategoryPanel(null, categories);
    });

    // 순서 변경 — 위/아래 이동 후 전체 순서를 서버에 저장
    const moveCat = async (id, dir) => {
      const idx = categories.findIndex(c => String(c.id) === String(id));
      if (idx < 0) return;
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= categories.length) return; // 경계에서는 무시
      [categories[idx], categories[swap]] = [categories[swap], categories[idx]];
      const orders = categories.map((c, i) => ({ id: c.id, sort_order: i + 1 }));
      try {
        await API.post('/categories/reorder', { orders });
        await App.loadMeta();
        await this._renderCategories();
      } catch {
        App.toast('순서 변경에 실패했습니다.', 'error');
      }
    };

    document.getElementById('category-tbody').addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.btn-edit-cat');
      const delBtn  = e.target.closest('.btn-del-cat');
      const upBtn   = e.target.closest('.btn-cat-up');
      const downBtn = e.target.closest('.btn-cat-down');

      if (upBtn)   { await moveCat(upBtn.dataset.id, 'up'); return; }
      if (downBtn) { await moveCat(downBtn.dataset.id, 'down'); return; }

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

  _categoryRowHtml(c, isAdmin = true) {
    const actionsCol = isAdmin ? `
        <td style="text-align:right;white-space:nowrap">
          <button class="btn btn-default btn-cat-up" data-id="${c.id}" title="위로" style="padding:4px 8px;margin-right:2px">↑</button>
          <button class="btn btn-default btn-cat-down" data-id="${c.id}" title="아래로" style="padding:4px 8px;margin-right:6px">↓</button>
          <button class="btn btn-default btn-edit-cat" data-id="${c.id}" style="margin-right:6px">수정</button>
          <button class="btn btn-danger btn-del-cat" data-id="${c.id}">삭제</button>
        </td>` : '';
    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${escHtml(c.color)};flex-shrink:0;box-shadow:0 0 6px ${escHtml(c.color)}55"></span>
            <span style="font-size:13px;color:var(--color-text-muted)">${escHtml(c.color)}</span>
          </div>
        </td>
        <td>${escHtml(c.name)}</td>
        ${actionsCol}
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

    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = '';

    wrap.innerHTML = `
      <div class="settings-section-header">
        <div>
          <div class="settings-section-title">제품 목록</div>
          <div class="settings-section-desc">콘텐츠/업무에서 제품 태그로 사용됩니다.</div>
        </div>
        <button class="btn btn-primary" id="btn-add-product">+ 제품 추가</button>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <table class="settings-table">
          <thead><tr><th>제품명</th><th style="width:120px;text-align:right">작업</th></tr></thead>
          <tbody id="product-tbody">
            ${products.length === 0
              ? `<tr><td colspan="2" style="text-align:center;color:var(--color-text-hint);padding:40px">등록된 제품이 없습니다.</td></tr>`
              : products.map(p => this._productRowHtml(p, true)).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('btn-add-product').addEventListener('click', () => {
      this.openProductPanel(null, products);
    });

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

  _productRowHtml(p, isAdmin = true) {
    const actionsCol = isAdmin ? `
        <td style="text-align:right">
          <button class="btn btn-default btn-edit-prod" data-id="${p.id}" style="margin-right:6px">수정</button>
          <button class="btn btn-danger btn-del-prod" data-id="${p.id}">삭제</button>
        </td>` : '';
    return `
      <tr>
        <td>${escHtml(p.name)}</td>
        ${actionsCol}
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

  // ─────────────────────────────────────────
  // 팀원 관리 탭 (admin only)
  // ─────────────────────────────────────────
  async _renderMembers() {
    const wrap = document.getElementById('settings-tab-content');
    document.getElementById('topbar-actions').innerHTML = '';
    wrap.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>불러오는 중...</span></div>';

    let users = [];
    try {
      const res = await API.get('/users');
      users = res.data || [];
    } catch {
      wrap.innerHTML = '<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">사용자 목록을 불러오지 못했습니다</div></div>';
      return;
    }

    wrap.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden">
        <table class="settings-table member-mgmt-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th>권한</th>
              <th>마케팅본부</th>
              <th>상태</th>
              <th>가입일</th>
              <th style="width:240px;text-align:right">작업</th>
            </tr>
          </thead>
          <tbody id="member-tbody">
            ${users.length === 0
              ? '<tr><td colspan="7" style="text-align:center;color:var(--color-text-hint);padding:40px">등록된 사용자가 없습니다</td></tr>'
              : users.map(u => this._memberRowHtml(u)).join('')}
          </tbody>
        </table>
      </div>
    `;

    // 이벤트 위임
    document.getElementById('member-tbody')?.addEventListener('click', async (e) => {
      const roleBtn = e.target.closest('.btn-toggle-role');
      const activeBtn = e.target.closest('.btn-toggle-active');
      const mktBtn = e.target.closest('.btn-toggle-mkt');
      const delBtn = e.target.closest('.btn-del-user');

      if (roleBtn) {
        const userId = roleBtn.dataset.id;
        const newRole = roleBtn.dataset.currentRole === 'admin' ? 'user' : 'admin';
        try {
          await API.patch(`/users/${userId}/role`, { role: newRole });
          App.toast(`권한이 ${newRole === 'admin' ? '관리자' : '일반'}(으)로 변경되었습니다.`, 'success');
          await App.loadMeta();
          await this._renderMembers();
        } catch {
          App.toast('권한 변경 실패', 'error');
        }
      }

      if (activeBtn) {
        const userId = activeBtn.dataset.id;
        const newActive = activeBtn.dataset.currentActive === 'true' ? false : true;
        try {
          await API.patch(`/users/${userId}/active`, { is_active: newActive });
          App.toast(newActive ? '활성화되었습니다.' : '비활성화되었습니다.', 'success');
          await App.loadMeta();
          await this._renderMembers();
        } catch {
          App.toast('상태 변경 실패', 'error');
        }
      }

      if (mktBtn) {
        const userId = mktBtn.dataset.id;
        const newVal = mktBtn.dataset.currentMkt === 'true' ? false : true;
        try {
          await API.patch(`/users/${userId}/marketing-member`, { is_marketing_member: newVal });
          App.toast(newVal ? '마케팅본부 소속으로 설정되었습니다.' : '마케팅본부 소속이 해제되었습니다.', 'success');
          await App.loadMeta();
          await this._renderMembers();
        } catch {
          App.toast('마케팅본부 소속 변경 실패', 'error');
        }
      }

      if (delBtn) {
        const userId = delBtn.dataset.id;
        const userName = delBtn.dataset.name;
        if (String(userId) === String(App.user.id)) {
          App.toast('자기 자신은 삭제할 수 없습니다.', 'error');
          return;
        }
        const ok = await App.confirm(`"${userName}" 사용자를 삭제하시겠습니까? 이 사용자의 세션, 알림, 댓글, R&R 등이 함께 삭제되고, 배정된 업무는 담당자가 비워집니다. 되돌릴 수 없습니다.`);
        if (!ok) return;
        try {
          await API.del(`/users/${userId}`);
          App.toast(`"${userName}" 사용자가 삭제되었습니다.`, 'success');
          await App.loadMeta();
          await this._renderMembers();
        } catch (err) {
          App.toast(err.message || '삭제 실패', 'error');
        }
      }
    });
  },

  _memberRowHtml(u) {
    const isActive = u.is_active !== false;
    const isMkt = u.is_marketing_member === true;
    const isSelf = String(u.id) === String(App.user?.id);
    const roleBadge = u.role === 'admin'
      ? '<span class="badge badge-plan">관리자</span>'
      : '<span class="badge" style="background:rgba(148,163,184,0.15);color:#94A3B8;">일반</span>';
    const mktBadge = isMkt
      ? '<span class="badge badge-done">소속</span>'
      : '<span class="badge badge-skip">미소속</span>';
    const statusBadge = isActive
      ? '<span class="badge badge-done">활성</span>'
      : '<span class="badge badge-skip">비활성</span>';
    const joinDate = u.created_at ? u.created_at.slice(0, 10) : '-';

    return `
      <tr class="${isActive ? '' : 'member-inactive-row'}">
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            ${App.avatar({ name: u.name || '-', avatar_bg: u.avatar_bg, avatar_text: u.avatar_text, avatar_url: u.avatar_url })}
            ${escHtml(u.name || '-')}
          </div>
        </td>
        <td>${escHtml(u.email || '-')}</td>
        <td>${roleBadge}</td>
        <td>${mktBadge}</td>
        <td>${statusBadge}</td>
        <td>${joinDate}</td>
        <td style="text-align:right">
          <button class="btn btn-default btn-toggle-role" data-id="${u.id}" data-current-role="${u.role}" style="margin-right:4px;font-size:12px;padding:4px 8px;">
            ${u.role === 'admin' ? '일반으로' : '관리자로'}
          </button>
          <button class="btn btn-default btn-toggle-mkt" data-id="${u.id}" data-current-mkt="${isMkt}" style="margin-right:4px;font-size:12px;padding:4px 8px;">
            ${isMkt ? '본부 해제' : '본부 설정'}
          </button>
          <button class="btn ${isActive ? 'btn-danger' : 'btn-primary'} btn-toggle-active" data-id="${u.id}" data-current-active="${isActive}" style="margin-right:4px;font-size:12px;padding:4px 8px;">
            ${isActive ? '비활성화' : '활성화'}
          </button>
          ${isSelf ? '' : `<button class="btn btn-danger btn-del-user" data-id="${u.id}" data-name="${escHtml(u.name || '')}" style="font-size:12px;padding:4px 8px;" title="사용자 삭제">삭제</button>`}
        </td>
      </tr>
    `;
  },
};
