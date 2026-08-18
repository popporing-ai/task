// R&R 현황 뷰
const RRRView = {
  data: [],
  versions: [],
  currentVersion: null,
  viewingVersionId: null, // 과거 버전 열람 중일 때

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    const isAdmin = App.user?.role === 'admin';

    // 초기 로딩 표시
    actions.innerHTML = '';
    content.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <span>R&R 데이터 불러오는 중...</span>
      </div>
    `;

    await this.loadData();
    this.viewingVersionId = null;
    this._renderFull(content, actions);
  },

  async loadData() {
    try {
      const [rrrRes, versionsRes] = await Promise.all([
        API.get('/rrr'),
        API.get('/rrr/versions'),
      ]);
      this.data = rrrRes.data || [];
      this.versions = versionsRes.data || [];
      this.currentVersion = this.versions.find(v => v.is_current) || null;
    } catch {
      this.data = [];
      this.versions = [];
      this.currentVersion = null;
    }
  },

  async loadVersionItems(versionId) {
    try {
      const res = await API.get(`/rrr/versions/${versionId}/items`);
      return res.data || [];
    } catch {
      return [];
    }
  },

  _renderFull(content, actions) {
    const isAdmin = App.user?.role === 'admin';
    const isViewingCurrent = !this.viewingVersionId || (this.currentVersion && this.viewingVersionId === this.currentVersion.id);

    // 탑바 액션
    if (isAdmin && isViewingCurrent) {
      actions.innerHTML = `
        <button class="btn btn-default" id="btn-archive-rrr" title="현재 R&R을 아카이브하고 새 버전 시작">새 버전으로 아카이브</button>
        <button class="btn btn-primary" id="btn-add-rrr">+ R&R 추가</button>
      `;
      document.getElementById('btn-add-rrr').addEventListener('click', () => this.openAddForm());
      document.getElementById('btn-archive-rrr').addEventListener('click', () => this.openArchiveForm());
    } else if (isAdmin && !isViewingCurrent) {
      actions.innerHTML = '<button class="btn btn-default" id="btn-back-current">현재 버전으로 돌아가기</button>';
      document.getElementById('btn-back-current').addEventListener('click', () => {
        this.viewingVersionId = null;
        this._renderFull(document.getElementById('content'), document.getElementById('topbar-actions'));
      });
    } else {
      actions.innerHTML = '';
    }

    this.renderCards(content);
  },

  renderCards(content) {
    const isAdmin = App.user?.role === 'admin';
    const isViewingCurrent = !this.viewingVersionId || (this.currentVersion && this.viewingVersionId === this.currentVersion.id);
    const isEditable = isAdmin && isViewingCurrent;

    // 버전 헤더
    const version = this.viewingVersionId
      ? this.versions.find(v => v.id === this.viewingVersionId)
      : this.currentVersion;

    const versionHeaderHtml = this._versionHeaderHtml(version, isViewingCurrent);

    // 마케팅 멤버만 표시
    const memberIds = App.assignableUsers().map(u => u.id);
    const filteredData = this.data.filter(u => memberIds.includes(u.user_id));

    if (filteredData.length === 0) {
      content.innerHTML = `
        ${versionHeaderHtml}
        <div class="empty-state">
          <div class="empty-state-icon-svg">
            <svg width="48" height="48" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" stroke-width="1"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
          </div>
          <div class="empty-state-title">R&R 데이터가 없습니다</div>
          <div class="empty-state-desc">${isViewingCurrent ? '팀원의 역할을 등록해보세요' : '이 버전에 등록된 역할이 없습니다'}</div>
          ${isEditable ? '<div class="empty-state-action"><button class="btn btn-primary" id="empty-add-rrr">+ R&R 추가</button></div>' : ''}
        </div>
      `;
      content.querySelector('#empty-add-rrr')?.addEventListener('click', () => this.openAddForm());
      this._bindVersionSelect(content);
      return;
    }

    content.innerHTML = `
      ${versionHeaderHtml}
      ${!isViewingCurrent ? '<div class="rrr-readonly-banner"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3v4m0 3h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg> 과거 버전은 읽기 전용입니다</div>' : ''}
      <div class="rrr-grid" id="rrr-grid">${filteredData.map(user => this._cardHtml(user, isEditable)).join('')}</div>
    `;

    this._bindVersionSelect(content);
    this._bindCardEvents(content, isEditable);
    if (isEditable) this._initCardDrag(content);

    // 일반 사용자 안내 (R&R 추가는 관리자만)
    if (!isAdmin && isViewingCurrent) {
      const banner = document.createElement('div');
      banner.className = 'rrr-permission-banner';
      banner.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/><path d="M8 5v3M8 11h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        R&R 추가, 수정은 <b>관리자</b>만 가능합니다. 권한이 필요하면 관리자에게 역할 배정을 요청해주세요.
      `;
      content.prepend(banner);
    }
  },

  _versionHeaderHtml(version, isViewingCurrent) {
    if (!version) return '';
    const effectiveDate = version.effective_date
      ? new Date(version.effective_date).toLocaleDateString('ko-KR')
      : '-';

    // 버전 히스토리 셀렉트 옵션
    const historyOptions = this.versions.map(h => {
      const d = h.effective_date ? new Date(h.effective_date).toLocaleDateString('ko-KR') : '';
      const label = `v${escHtml(h.version)}${d ? ' (' + d + ')' : ''}${h.is_current ? ' - 현재' : ''}`;
      return `<option value="${h.id}" ${h.id === version.id ? 'selected' : ''}>${label}</option>`;
    }).join('');

    return `
      <div class="rrr-version-header">
        <div class="rrr-version-header-left">
          <span class="brand-guide-version-badge">v${escHtml(version.version)}</span>
          ${isViewingCurrent
            ? '<span class="brand-guide-current-badge">현재 버전</span>'
            : '<span class="brand-guide-past-badge">과거 버전</span>'}
          <span class="brand-guide-date">${effectiveDate} 시행</span>
        </div>
        <div class="rrr-version-header-right">
          <select class="brand-guide-history-select" id="rrr-version-select">
            ${historyOptions}
          </select>
        </div>
      </div>
      ${version.title ? `<div class="rrr-version-title">${escHtml(version.title)}</div>` : ''}
      ${version.change_note ? `<div class="rrr-version-note">${escHtml(version.change_note)}</div>` : ''}
    `;
  },

  _bindVersionSelect(content) {
    const select = content.querySelector('#rrr-version-select');
    if (!select) return;
    select.addEventListener('change', async (e) => {
      const selectedId = parseInt(e.target.value);
      if (!selectedId) return;
      const isCurrent = this.currentVersion && selectedId === this.currentVersion.id;
      if (isCurrent) {
        // 현재 버전 복귀
        this.viewingVersionId = null;
        await this.loadData();
      } else {
        // 과거 버전 로드
        this.viewingVersionId = selectedId;
        this.data = await this.loadVersionItems(selectedId);
      }
      this._renderFull(document.getElementById('content'), document.getElementById('topbar-actions'));
    });
  },

  _cardHtml(user, isEditable) {
    const leads = user.items.filter(i => i.role_type === 'solution_lead');
    const funcs = user.items.filter(i => i.role_type === 'function');
    const hasItems = leads.length > 0 || funcs.length > 0;

    return `
      <div class="rrr-card" data-user-id="${user.user_id}" draggable="${isEditable}">
        <div class="rrr-card-header">
          ${isEditable ? `
          <div class="rrr-drag-handle" title="드래그하여 순서 변경">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="4" r="1.2" fill="currentColor"/><circle cx="11" cy="4" r="1.2" fill="currentColor"/><circle cx="5" cy="8" r="1.2" fill="currentColor"/><circle cx="11" cy="8" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="11" cy="12" r="1.2" fill="currentColor"/></svg>
          </div>
          ` : ''}
          ${App.avatar({ name: user.user_name, avatar_bg: user.avatar_bg, avatar_text: user.avatar_text, avatar_url: user.avatar_url })}
          <span class="rrr-card-name">${escHtml(user.user_name)}</span>
          ${isEditable ? `
          <button class="card-action-btn rrr-card-delete" data-rrr-del-user="${user.user_id}" title="${escHtml(user.user_name)} 전체 삭제">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          ` : ''}
        </div>

        <div class="rrr-sections-wrap">
          ${leads.length > 0 ? `
            <div class="rrr-section">
              <div class="rrr-section-title">
                <span class="rrr-section-icon lead"><svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M8 1l2.2 4.4L15 6.1l-3.5 3.4.8 4.9L8 12.1 3.7 14.4l.8-4.9L1 6.1l4.8-.7z" fill="currentColor"/></svg></span>
                솔루션 리드
                <span class="rrr-section-count">${leads.length}</span>
              </div>
              <ul class="rrr-item-list" data-user-id="${user.user_id}" data-role-type="solution_lead">
                ${leads.map(item => this._itemHtml(item, isEditable)).join('')}
              </ul>
            </div>
          ` : ''}
          ${funcs.length > 0 ? `
            <div class="rrr-section">
              <div class="rrr-section-title">
                <span class="rrr-section-icon func"><svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M6.5 1A5.5 5.5 0 0112 6.5c0 1.3-.5 2.5-1.2 3.4l4.4 4.3-.7.7-4.4-4.3A5.5 5.5 0 116.5 1zm0 1a4.5 4.5 0 100 9 4.5 4.5 0 000-9z" fill="currentColor"/></svg></span>
                역할/기능
                <span class="rrr-section-count">${funcs.length}</span>
              </div>
              <ul class="rrr-item-list" data-user-id="${user.user_id}" data-role-type="function">
                ${funcs.map(item => this._itemHtml(item, isEditable)).join('')}
              </ul>
            </div>
          ` : ''}
          ${!hasItems ? `
            <div class="rrr-empty-hint">등록된 역할이 없습니다</div>
          ` : ''}
        </div>

        ${isEditable ? `
        <div class="rrr-add-area">
          <button class="btn btn-default rrr-add-btn" data-rrr-add="${user.user_id}">+ 역할 추가</button>
        </div>
        ` : ''}
      </div>
    `;
  },

  _itemHtml(item, isEditable) {
    const isLead = item.role_type === 'solution_lead';
    const note = item.status_note
      ? `<span class="rrr-item-note">(${escHtml(item.status_note)})</span>` : '';

    // 메타 줄: 대분류, 주기, 부담당 (역할/기능에만 표시)
    const metaParts = [];
    if (!isLead && item.category) metaParts.push(`<span class="rrr-item-chip">${escHtml(item.category)}</span>`);
    if (!isLead && item.frequency) metaParts.push(`<span class="rrr-item-chip freq">${escHtml(item.frequency)}</span>`);
    if (!isLead && item.sub_assignee) metaParts.push(`<span class="rrr-item-sub">부 ${escHtml(item.sub_assignee)}</span>`);
    const metaLine = metaParts.length ? `<span class="rrr-item-meta">${metaParts.join('')}</span>` : '';

    return `
      <li class="rrr-item" data-item-id="${item.id}" draggable="${isEditable}">
        ${isEditable ? `
        <span class="rrr-item-drag">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="4" r="1.2" fill="currentColor"/><circle cx="11" cy="4" r="1.2" fill="currentColor"/><circle cx="5" cy="8" r="1.2" fill="currentColor"/><circle cx="11" cy="8" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="11" cy="12" r="1.2" fill="currentColor"/></svg>
        </span>
        ` : ''}
        <span class="rrr-item-main" data-item-detail="${item.id}" title="클릭하면 상세 보기">
          <span class="rrr-item-text">${escHtml(item.description)}${note ? ' ' + note : ''}</span>
          ${metaLine}
        </span>
        ${isEditable ? `
        <div class="rrr-item-actions">
          <button class="card-action-btn" data-rrr-edit="${item.id}" title="수정">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
          </button>
          <button class="card-action-btn" data-rrr-del="${item.id}" title="삭제">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        ` : ''}
      </li>
    `;
  },

  _bindCardEvents(content, isEditable) {
    // 카드 본문 클릭 -> 담당자 상세 (업무, 콘텐츠 진행 상황)
    content.querySelectorAll('.rrr-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.rrr-drag-handle')) return;
        if (e.target.closest('.rrr-item-drag')) return;
        if (e.target.closest('.card-action-btn')) return;
        if (e.target.closest('.rrr-add-btn')) return;
        if (e.target.closest('button')) return;
        const userId = card.dataset.userId;
        if (userId) this._showUserDetail(parseInt(userId));
      });
    });

    // 항목 클릭 -> 업무 상세 팝업 (업무명, 주요내용, 파트, 대분류, 주기, 정/부담당)
    content.querySelectorAll('[data-item-detail]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemId = el.dataset.itemDetail;
        const allItems = this.data.flatMap(u => u.items.map(i => ({ ...i, _user_name: u.user_name })));
        const item = allItems.find(i => String(i.id) === String(itemId));
        if (item) this._showItemDetail(item);
      });
    });

    if (!isEditable) return;

    // 항목 수정
    content.querySelectorAll('[data-rrr-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const allItems = this.data.flatMap(u => u.items);
        const item = allItems.find(i => i.id == btn.dataset.rrrEdit);
        if (item) this.openEditForm(item);
      });
    });

    // 항목 삭제
    content.querySelectorAll('[data-rrr-del]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await App.confirm('이 항목을 삭제하시겠습니까?');
        if (confirmed) {
          try {
            await API.del(`/rrr/${btn.dataset.rrrDel}`);
            App.toast('항목이 삭제되었습니다.', 'info');
            this.render();
          } catch { App.toast('삭제에 실패했습니다.', 'error'); }
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
          try {
            await Promise.all((userData?.items || []).map(item => API.del(`/rrr/${item.id}`)));
            App.toast('R&R이 모두 삭제되었습니다.', 'info');
            this.render();
          } catch { App.toast('삭제에 실패했습니다.', 'error'); }
        }
      });
    });
  },

  // -- 드래그앤드롭 ---
  _initCardDrag(content) {
    const grid = content.querySelector('#rrr-grid');
    if (!grid) return;
    let dragCard = null;

    grid.querySelectorAll('.rrr-card').forEach(card => {
      card.addEventListener('dragstart', (e) => {
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

    // 항목 간 순서
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

  // 현재 데이터에서 특정 필드의 고유값 목록 (datalist 옵션용)
  _distinct(field) {
    const set = new Set();
    this.data.forEach(u => u.items.forEach(i => { if (i[field]) set.add(i[field]); }));
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
  },

  // 항목 클릭 -> 업무 상세 팝업
  _showItemDetail(item) {
    document.querySelector('.popover-overlay')?.remove();
    const isLead = item.role_type === 'solution_lead';

    const row = (label, value) => value
      ? `<div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--color-border);font-size:13px;">
           <span style="flex-shrink:0;width:64px;color:var(--color-text-muted);font-weight:600;">${label}</span>
           <span style="flex:1;color:var(--color-text-primary);line-height:1.6;word-break:break-word;">${escHtml(value)}</span>
         </div>`
      : '';

    const overlay = document.createElement('div');
    overlay.className = 'popover-overlay';
    overlay.innerHTML = `
      <div class="popover" style="max-width:480px;width:92%;max-height:85vh;display:flex;flex-direction:column;">
        <button class="popover-close" title="닫기">×</button>
        <div style="margin-bottom:14px;padding-right:24px;">
          <div style="display:inline-block;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;margin-bottom:8px;
            ${isLead ? 'background:rgba(79,110,247,0.14);color:#4F6EF7;' : 'background:rgba(52,199,89,0.16);color:#2F9E52;'}">
            ${isLead ? '솔루션 리드' : '역할/기능'}
          </div>
          <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;line-height:1.35;">${escHtml(item.description)}</div>
        </div>
        <div style="flex:1;overflow-y:auto;padding-right:4px;">
          ${row('담당', item._user_name)}
          ${isLead ? '' : row('파트', item.part)}
          ${isLead ? '' : row('대분류', item.category)}
          ${isLead ? '' : row('주기', item.frequency)}
          ${isLead ? '' : row('부 담당', item.sub_assignee)}
          ${isLead ? row('상태, 비고', item.status_note) : ''}
          ${item.task_detail ? `
            <div style="padding:12px 0 4px;">
              <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);margin-bottom:6px;letter-spacing:0.02em;">주요 내용</div>
              <div style="font-size:13px;color:var(--color-text-primary);line-height:1.75;word-break:break-word;">${escHtml(item.task_detail)}</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.popover-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  },

  // -- 폼 ---
  // 카드 클릭 -> 담당자별 상세 진행 내역
  async _showUserDetail(userId) {
    const user = this.data.find(u => String(u.user_id) === String(userId));
    if (!user) return;

    // 기존 팝오버 제거
    document.querySelector('.popover-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'popover-overlay';
    overlay.innerHTML = `
      <div class="popover" style="max-width:600px;width:92%;max-height:85vh;display:flex;flex-direction:column;">
        <button class="popover-close" title="닫기">×</button>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;padding-right:24px;">
          ${App.avatar({ name: user.user_name, avatar_bg: user.avatar_bg, avatar_text: user.avatar_text, avatar_url: user.avatar_url })}
          <div style="flex:1;">
            <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;">${escHtml(user.user_name)}</div>
            <div style="font-size:13px;color:var(--color-text-muted);margin-top:2px;">담당 R&R, 업무 진행 상황</div>
          </div>
        </div>
        <div id="rrr-detail-body" style="flex:1;overflow-y:auto;padding-right:4px;">
          <div class="loading-state" style="padding:32px 0;"><div class="loading-spinner"></div><span>불러오는 중...</span></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.popover-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    try {
      const today = new Date();
      const from = new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10);
      const to = new Date(today.getFullYear(), 11, 31).toISOString().slice(0, 10);
      const res = await API.get(`/weekly-reports/activity?user_id=${userId}&date_from=${from}&date_to=${to}`);
      const d = res.data;
      if (!d) throw new Error('데이터 없음');

      const leads = user.items.filter(i => i.role_type === 'solution_lead');
      const funcs = user.items.filter(i => i.role_type === 'function');

      const rrrHtml = (leads.length + funcs.length) > 0 ? `
        <div style="background:var(--color-bg-secondary);padding:14px 16px;border-radius:12px;margin-bottom:18px;">
          ${leads.length ? `<div style="margin-bottom:${funcs.length?'12px':'0'};">
            <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);letter-spacing:0.04em;margin-bottom:6px;">솔루션 리드</div>
            <div style="font-size:13px;color:var(--color-text-primary);line-height:1.7;">${leads.map(i => escHtml(i.description)).join(', ')}</div>
          </div>` : ''}
          ${funcs.length ? `<div>
            <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);letter-spacing:0.04em;margin-bottom:6px;">역할/기능</div>
            <div style="font-size:13px;color:var(--color-text-primary);line-height:1.7;">${funcs.map(i => escHtml(i.description)).join(', ')}</div>
          </div>` : ''}
        </div>
      ` : '';

      const summaryHtml = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;">
          <div style="background:var(--color-done-bg);padding:12px;border-radius:10px;text-align:center;">
            <div style="font-size:11px;color:var(--color-done-text);font-weight:600;margin-bottom:2px;">완료</div>
            <div style="font-size:20px;font-weight:700;color:var(--color-done-text);">${d.summary.tasks_completed}</div>
          </div>
          <div style="background:var(--color-plan-bg);padding:12px;border-radius:10px;text-align:center;">
            <div style="font-size:11px;color:var(--color-plan-text);font-weight:600;margin-bottom:2px;">진행 중</div>
            <div style="font-size:20px;font-weight:700;color:var(--color-plan-text);">${d.summary.tasks_in_progress}</div>
          </div>
          <div style="background:var(--color-warn-bg);padding:12px;border-radius:10px;text-align:center;">
            <div style="font-size:11px;color:var(--color-warn-text);font-weight:600;margin-bottom:2px;">지연</div>
            <div style="font-size:20px;font-weight:700;color:var(--color-warn-text);">${d.summary.tasks_blocked}</div>
          </div>
          <div style="background:var(--color-attention-bg);padding:12px;border-radius:10px;text-align:center;">
            <div style="font-size:11px;color:var(--color-attention-text);font-weight:600;margin-bottom:2px;">콘텐츠</div>
            <div style="font-size:20px;font-weight:700;color:var(--color-attention-text);">${d.summary.content_published}</div>
          </div>
        </div>
      `;

      const catRows = (d.by_category || []).map(c => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid var(--color-border);">
          <span style="color:var(--color-text-primary);">${escHtml(c.name)}</span>
          <span style="color:var(--color-text-muted);font-weight:600;">${c.count}건</span>
        </div>
      `).join('');

      const inProgList = (d.in_progress_tasks || []).slice(0, 10).map(t => {
        const statusLabel = t.status === 'in_progress' ? '진행' : t.status === 'blocked' ? '지연' : '예정';
        const statusClass = t.status === 'blocked' ? 'badge-warn' : 'badge-plan';
        const due = t.due_date ? ` / 마감 ${String(t.due_date).slice(5, 10)}` : '';
        return `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--color-border);font-size:13px;">
            <span class="badge ${statusClass}" style="font-size:10px;flex-shrink:0;">${statusLabel}</span>
            <span style="flex:1;">${t.category_name ? `<span style="color:var(--color-text-hint);font-size:11px;">[${escHtml(t.category_name)}]</span> ` : ''}${escHtml(t.title)}</span>
            <span style="color:var(--color-text-hint);font-size:11px;flex-shrink:0;">${due}</span>
          </div>
        `;
      }).join('') || '<div style="padding:12px;text-align:center;color:var(--color-text-hint);font-size:13px;">진행 중인 업무가 없습니다</div>';

      const recentDone = (d.completed_tasks || []).slice(0, 10).map(t => {
        const dt = t.updated_at ? String(t.updated_at).slice(5, 10) : '';
        return `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--color-border);font-size:13px;">
            <span style="color:var(--color-done-text);flex-shrink:0;">&#10003;</span>
            <span style="flex:1;">${t.category_name ? `<span style="color:var(--color-text-hint);font-size:11px;">[${escHtml(t.category_name)}]</span> ` : ''}${escHtml(t.title)}</span>
            <span style="color:var(--color-text-hint);font-size:11px;flex-shrink:0;">${dt}</span>
          </div>
        `;
      }).join('') || '<div style="padding:12px;text-align:center;color:var(--color-text-hint);font-size:13px;">완료된 업무가 없습니다</div>';

      const body = document.getElementById('rrr-detail-body');
      body.innerHTML = `
        ${rrrHtml}
        <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:6px;">올해 누적 (${from} ~ ${to})</div>
        ${summaryHtml}

        ${catRows ? `
          <div style="margin-bottom:18px;">
            <div style="font-size:13px;font-weight:700;margin-bottom:8px;">카테고리별 완료</div>
            <div>${catRows}</div>
          </div>
        ` : ''}

        <div style="margin-bottom:18px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;">현재 진행/지연 (최대 10건)</div>
          <div>${inProgList}</div>
        </div>

        <div>
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;">최근 완료 (최대 10건)</div>
          <div>${recentDone}</div>
        </div>
      `;
    } catch (e) {
      document.getElementById('rrr-detail-body').innerHTML = `
        <div class="empty-state" style="padding:32px 0;">
          <div class="empty-state-title">불러오기 실패</div>
          <div class="empty-state-desc">${escHtml(e.message || '')}</div>
        </div>
      `;
    }
  },

  // datalist HTML 생성 (파트, 대분류, 주기, 부담당 선택지)
  _datalists() {
    const opts = (arr) => arr.map(v => `<option value="${escHtml(v)}">`).join('');
    const memberNames = App.assignableUsers().map(u => u.name);
    return `
      <datalist id="dl-part">${opts(this._distinct('part'))}</datalist>
      <datalist id="dl-category">${opts(this._distinct('category'))}</datalist>
      <datalist id="dl-frequency">${opts(this._distinct('frequency'))}</datalist>
      <datalist id="dl-sub">${opts([...new Set([...memberNames, ...this._distinct('sub_assignee')])])}</datalist>
    `;
  },

  // 유형(솔루션 리드/역할·기능)에 따른 입력 필드
  _formFieldsHtml(item) {
    const it = item || {};
    const isLead = (it.role_type || 'function') === 'solution_lead';
    return `
      ${this._datalists()}
      <div class="form-group">
        <label>유형</label>
        <div class="radio-group">
          <label><input type="radio" name="f-type" value="function" ${!isLead ? 'checked' : ''}>역할/기능</label>
          <label><input type="radio" name="f-type" value="solution_lead" ${isLead ? 'checked' : ''}>솔루션 리드</label>
        </div>
      </div>
      <div class="form-group">
        <label id="f-desc-label">${isLead ? '솔루션명 *' : '업무명 *'}</label>
        <input type="text" id="f-desc" value="${escHtml(it.description || '')}" placeholder="${isLead ? '예: Remote, VisionX' : '예: 유튜브 영상 기획, 제작, 발행'}">
      </div>

      <div id="f-func-fields" style="display:${isLead ? 'none' : 'block'};">
        <div class="form-row" style="display:flex;gap:10px;">
          <div class="form-group" style="flex:1;">
            <label>파트</label>
            <input type="text" id="f-part" list="dl-part" value="${escHtml(it.part || '')}" placeholder="예: 콘텐츠">
          </div>
          <div class="form-group" style="flex:1;">
            <label>대분류</label>
            <input type="text" id="f-category" list="dl-category" value="${escHtml(it.category || '')}" placeholder="예: 영상">
          </div>
        </div>
        <div class="form-group">
          <label>주요 내용</label>
          <textarea id="f-detail" rows="3" placeholder="업무명 클릭 시 팝업에 표시됩니다">${escHtml(it.task_detail || '')}</textarea>
        </div>
        <div class="form-row" style="display:flex;gap:10px;">
          <div class="form-group" style="flex:1;">
            <label>주기</label>
            <input type="text" id="f-freq" list="dl-frequency" value="${escHtml(it.frequency || '')}" placeholder="예: 상시, 주, 분기">
          </div>
          <div class="form-group" style="flex:1;">
            <label>부 담당</label>
            <input type="text" id="f-sub" list="dl-sub" value="${escHtml(it.sub_assignee || '')}" placeholder="예: 남병진">
          </div>
        </div>
      </div>

      <div id="f-lead-fields" style="display:${isLead ? 'block' : 'none'};">
        <div class="form-group">
          <label>상태, 비고</label>
          <input type="text" id="f-note" value="${escHtml(it.status_note || '')}" placeholder="예: 보류, 예정">
        </div>
      </div>
    `;
  },

  // 유형 라디오 변경 시 필드 토글
  _bindFormToggle() {
    const radios = document.querySelectorAll('input[name="f-type"]');
    const apply = () => {
      const isLead = document.querySelector('input[name="f-type"]:checked').value === 'solution_lead';
      document.getElementById('f-func-fields').style.display = isLead ? 'none' : 'block';
      document.getElementById('f-lead-fields').style.display = isLead ? 'block' : 'none';
      const label = document.getElementById('f-desc-label');
      if (label) label.textContent = isLead ? '솔루션명 *' : '업무명 *';
    };
    radios.forEach(r => r.addEventListener('change', apply));
  },

  // 폼에서 payload 수집 (유형에 따라 필드 정리)
  _collectForm() {
    const role_type = document.querySelector('input[name="f-type"]:checked').value;
    const isLead = role_type === 'solution_lead';
    const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    return {
      role_type,
      description: val('f-desc'),
      task_detail: isLead ? null : (val('f-detail') || null),
      part: isLead ? null : (val('f-part') || null),
      category: isLead ? null : (val('f-category') || null),
      frequency: isLead ? null : (val('f-freq') || null),
      sub_assignee: isLead ? null : (val('f-sub') || null),
      status_note: isLead ? (val('f-note') || null) : null,
    };
  },

  openAddForm(userId) {
    const html = `
      <div class="form-group">
        <label>팀원</label>
        <select id="f-user">${App.assignableUserOptions(userId)}</select>
      </div>
      ${this._formFieldsHtml(null)}
    `;

    App.openPanel('R&R 추가', html, async () => {
      const data = { user_id: document.getElementById('f-user').value, ...this._collectForm() };
      if (!data.user_id || !data.description) {
        App.toast('팀원과 업무명(솔루션명)을 입력해주세요.', 'error');
        return false;
      }
      await API.post('/rrr', data);
      App.toast('R&R이 추가되었습니다.', 'success');
      this.render();
    });
    this._bindFormToggle();
  },

  openEditForm(item) {
    App.openPanel('R&R 수정', this._formFieldsHtml(item), async () => {
      const data = this._collectForm();
      if (!data.description) {
        App.toast('업무명(솔루션명)을 입력해주세요.', 'error');
        return false;
      }
      await API.put(`/rrr/${item.id}`, data);
      App.toast('R&R이 수정되었습니다.', 'success');
      this.render();
    });
    this._bindFormToggle();
  },

  // 새 버전 아카이브 폼
  openArchiveForm() {
    let suggestedVersion = '1.0.0';
    if (this.currentVersion && this.currentVersion.version) {
      const parts = this.currentVersion.version.split('.').map(Number);
      if (parts.length === 3) {
        parts[2] += 1;
        suggestedVersion = parts.join('.');
      }
    }
    const today = new Date().toISOString().slice(0, 10);

    const html = `
      <div class="form-group">
        <label>새 버전 번호</label>
        <input type="text" id="f-version" value="${escHtml(suggestedVersion)}" placeholder="예: 1.1.0">
      </div>
      <div class="form-group">
        <label>시행일</label>
        <input type="date" id="f-effective-date" value="${today}">
      </div>
      <div class="form-group">
        <label>제목</label>
        <input type="text" id="f-title" placeholder="예: 2026년 하반기 R&R 개편">
      </div>
      <div class="form-group">
        <label>변경 요약</label>
        <textarea id="f-change-note" rows="3" placeholder="이번 변경 사항 요약"></textarea>
      </div>
      <p style="font-size:12px;color:var(--color-text-muted);margin-top:8px;">
        현재 R&R이 과거 버전으로 보존되고, 동일한 내용의 새 버전이 생성됩니다.
        새 버전에서 인원 변경 등을 편집하세요.
      </p>
    `;

    App.openPanel('새 R&R 버전 아카이브', html, async () => {
      const confirmed = await App.confirm('현재 R&R을 아카이브하고 새 버전을 시작하시겠습니까?');
      if (!confirmed) return false;

      try {
        await API.post('/rrr/versions/archive', {
          version: document.getElementById('f-version').value.trim() || null,
          effective_date: document.getElementById('f-effective-date').value || null,
          title: document.getElementById('f-title').value.trim() || null,
          change_note: document.getElementById('f-change-note').value.trim() || null,
        });
        App.toast('새 R&R 버전이 생성되었습니다.', 'success');
        this.viewingVersionId = null;
        await this.loadData();
        this._renderFull(document.getElementById('content'), document.getElementById('topbar-actions'));
      } catch (e) {
        App.toast(e.message || '버전 생성에 실패했습니다.', 'error');
        return false;
      }
    });
  },
};
