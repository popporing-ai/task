// R&R 현황 뷰
const RRRView = {
  data: [],

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    const isAdmin = App.user?.role === 'admin';
    if (isAdmin) {
      actions.innerHTML = '<button class="btn btn-primary" id="btn-add-rrr">+ R&R 추가</button>';
      document.getElementById('btn-add-rrr').addEventListener('click', () => this.openAddForm());
    } else {
      actions.innerHTML = '';
    }

    content.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <span>R&R 데이터 불러오는 중...</span>
      </div>
    `;

    await this.loadData();
    this.renderCards(content);

    // 일반 사용자 안내 (R&R 추가는 관리자만)
    if (!isAdmin) {
      const banner = document.createElement('div');
      banner.className = 'rrr-permission-banner';
      banner.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/><path d="M8 5v3M8 11h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        R&R 추가·수정은 <b>관리자</b>만 가능합니다. 권한이 필요하면 관리자에게 역할 배정을 요청해주세요.
      `;
      content.prepend(banner);
    }
  },

  async loadData() {
    try {
      const res = await API.get('/rrr');
      this.data = res.data;
    } catch { this.data = []; }
  },

  renderCards(content) {
    const isAdmin = App.user?.role === 'admin';
    // 마케팅 멤버만 표시
    const memberIds = App.assignableUsers().map(u => u.id);
    this.data = this.data.filter(u => memberIds.includes(u.user_id));
    if (this.data.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon-svg">
            <svg width="48" height="48" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" stroke-width="1"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
          </div>
          <div class="empty-state-title">R&R 데이터가 없습니다</div>
          <div class="empty-state-desc">팀원의 역할을 등록해보세요</div>
          ${isAdmin ? '<div class="empty-state-action"><button class="btn btn-primary" id="empty-add-rrr">+ R&R 추가</button></div>' : ''}
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
    const isAdmin = App.user?.role === 'admin';

    return `
      <div class="rrr-card" data-user-id="${user.user_id}" draggable="${isAdmin}">
        <div class="rrr-card-header">
          ${isAdmin ? `
          <div class="rrr-drag-handle" title="드래그하여 순서 변경">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="4" r="1.2" fill="currentColor"/><circle cx="11" cy="4" r="1.2" fill="currentColor"/><circle cx="5" cy="8" r="1.2" fill="currentColor"/><circle cx="11" cy="8" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="11" cy="12" r="1.2" fill="currentColor"/></svg>
          </div>
          ` : ''}
          ${App.avatar({ name: user.user_name, avatar_bg: user.avatar_bg, avatar_text: user.avatar_text, avatar_url: user.avatar_url })}
          <span class="rrr-card-name">${escHtml(user.user_name)}</span>
          ${isAdmin ? `
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
                ${leads.map(item => this._itemHtml(item)).join('')}
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
                ${funcs.map(item => this._itemHtml(item)).join('')}
              </ul>
            </div>
          ` : ''}
          ${!hasItems ? `
            <div class="rrr-empty-hint">등록된 역할이 없습니다</div>
          ` : ''}
        </div>

        ${isAdmin ? `
        <div class="rrr-add-area">
          <button class="btn btn-default rrr-add-btn" data-rrr-add="${user.user_id}">+ 역할 추가</button>
        </div>
        ` : ''}
      </div>
    `;
  },

  _itemHtml(item) {
    const isAdmin = App.user?.role === 'admin';
    return `
      <li class="rrr-item" data-item-id="${item.id}" draggable="${isAdmin}">
        ${isAdmin ? `
        <span class="rrr-item-drag">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="4" r="1.2" fill="currentColor"/><circle cx="11" cy="4" r="1.2" fill="currentColor"/><circle cx="5" cy="8" r="1.2" fill="currentColor"/><circle cx="11" cy="8" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="11" cy="12" r="1.2" fill="currentColor"/></svg>
        </span>
        ` : ''}
        <span class="rrr-item-text">${escHtml(item.description)}</span>
        ${isAdmin ? `
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

  _bindCardEvents(content) {
    // 카드 본문 클릭 → 담당자 상세 (업무·콘텐츠 진행 상황)
    content.querySelectorAll('.rrr-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // 드래그 핸들, 액션 버튼 등은 제외
        if (e.target.closest('.rrr-drag-handle')) return;
        if (e.target.closest('.rrr-item-drag')) return;
        if (e.target.closest('.card-action-btn')) return;
        if (e.target.closest('.rrr-add-btn')) return;
        if (e.target.closest('button')) return;
        const userId = card.dataset.userId;
        if (userId) this._showUserDetail(parseInt(userId));
      });
    });

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
  // 카드 클릭 → 담당자별 상세 진행 내역 (업무·콘텐츠·일정)
  async _showUserDetail(userId) {
    const user = this.data.find(u => String(u.user_id) === String(userId));
    if (!user) return;

    // 기존 팝오버 제거
    document.querySelector('.popover-overlay')?.remove();

    // 로딩 상태
    const overlay = document.createElement('div');
    overlay.className = 'popover-overlay';
    overlay.innerHTML = `
      <div class="popover" style="max-width:600px;width:92%;max-height:85vh;display:flex;flex-direction:column;">
        <button class="popover-close" title="닫기">×</button>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;padding-right:24px;">
          ${App.avatar({ name: user.user_name, avatar_bg: user.avatar_bg, avatar_text: user.avatar_text, avatar_url: user.avatar_url })}
          <div style="flex:1;">
            <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;">${escHtml(user.user_name)}</div>
            <div style="font-size:13px;color:var(--color-text-muted);margin-top:2px;">담당 R&R · 업무 진행 상황</div>
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

      // R&R 항목 표시
      const rrrHtml = (leads.length + funcs.length) > 0 ? `
        <div style="background:var(--color-bg-secondary);padding:14px 16px;border-radius:12px;margin-bottom:18px;">
          ${leads.length ? `<div style="margin-bottom:${funcs.length?'12px':'0'};">
            <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);letter-spacing:0.04em;margin-bottom:6px;">⭐ 솔루션 리드</div>
            <div style="font-size:13px;color:var(--color-text-primary);line-height:1.7;">${leads.map(i => escHtml(i.description)).join(' · ')}</div>
          </div>` : ''}
          ${funcs.length ? `<div>
            <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);letter-spacing:0.04em;margin-bottom:6px;">🔧 역할/기능</div>
            <div style="font-size:13px;color:var(--color-text-primary);line-height:1.7;">${funcs.map(i => escHtml(i.description)).join(' · ')}</div>
          </div>` : ''}
        </div>
      ` : '';

      // 요약 수치
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

      // 카테고리별 진행
      const catRows = (d.by_category || []).map(c => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid var(--color-border);">
          <span style="color:var(--color-text-primary);">${escHtml(c.name)}</span>
          <span style="color:var(--color-text-muted);font-weight:600;">${c.count}건</span>
        </div>
      `).join('');

      // 진행 중 / 미진행 (최대 10)
      const inProgList = (d.in_progress_tasks || []).slice(0, 10).map(t => {
        const statusLabel = t.status === 'in_progress' ? '진행' : t.status === 'blocked' ? '지연' : '예정';
        const statusClass = t.status === 'blocked' ? 'badge-warn' : 'badge-plan';
        const due = t.due_date ? ` · 마감 ${String(t.due_date).slice(5, 10)}` : '';
        return `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--color-border);font-size:13px;">
            <span class="badge ${statusClass}" style="font-size:10px;flex-shrink:0;">${statusLabel}</span>
            <span style="flex:1;">${t.category_name ? `<span style="color:var(--color-text-hint);font-size:11px;">[${escHtml(t.category_name)}]</span> ` : ''}${escHtml(t.title)}</span>
            <span style="color:var(--color-text-hint);font-size:11px;flex-shrink:0;">${due}</span>
          </div>
        `;
      }).join('') || '<div style="padding:12px;text-align:center;color:var(--color-text-hint);font-size:13px;">진행 중인 업무가 없습니다</div>';

      // 최근 완료 (최대 10)
      const recentDone = (d.completed_tasks || []).slice(0, 10).map(t => {
        const dt = t.updated_at ? String(t.updated_at).slice(5, 10) : '';
        return `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--color-border);font-size:13px;">
            <span style="color:var(--color-done-text);flex-shrink:0;">✓</span>
            <span style="flex:1;">${t.category_name ? `<span style="color:var(--color-text-hint);font-size:11px;">[${escHtml(t.category_name)}]</span> ` : ''}${escHtml(t.title)}</span>
            <span style="color:var(--color-text-hint);font-size:11px;flex-shrink:0;">${dt}</span>
          </div>
        `;
      }).join('') || '<div style="padding:12px;text-align:center;color:var(--color-text-hint);font-size:13px;">완료된 업무가 없습니다</div>';

      const body = document.getElementById('rrr-detail-body');
      body.innerHTML = `
        ${rrrHtml}
        <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:6px;">📊 올해 누적 (${from} ~ ${to})</div>
        ${summaryHtml}

        ${catRows ? `
          <div style="margin-bottom:18px;">
            <div style="font-size:13px;font-weight:700;margin-bottom:8px;">🗂️ 카테고리별 완료</div>
            <div>${catRows}</div>
          </div>
        ` : ''}

        <div style="margin-bottom:18px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;">🔄 현재 진행/지연 (최대 10건)</div>
          <div>${inProgList}</div>
        </div>

        <div>
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;">✅ 최근 완료 (최대 10건)</div>
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

  openAddForm(userId) {
    const html = `
      <div class="form-group">
        <label>팀원</label>
        <select id="f-user">${App.assignableUserOptions(userId)}</select>
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
