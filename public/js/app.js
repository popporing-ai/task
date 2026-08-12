// === 글로벌 이벤트 버스 ===
// 같은 브라우저 내에서 데이터 변경 즉시 반영 (예: tasks CRUD → 팀 활동 자동 갱신)
const AppEvents = {
  _listeners: {},
  on(event, fn) {
    (this._listeners[event] = this._listeners[event] || []).push(fn);
    return () => this.off(event, fn);
  },
  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  },
  emit(event, payload) {
    (this._listeners[event] || []).forEach(fn => {
      try { fn(payload); } catch (e) { console.error('Event handler error:', e); }
    });
  },
};

// 앱 상태
const App = {
  currentView: 'dashboard',
  user: null,
  categories: [],
  products: [],
  users: [],
  events: AppEvents,
  // 딥링크 상태 — 현재 슬라이드 패널이 표시 중인 엔티티 (있을 때)
  _deepLink: null, // { type, id }
  // 딥링크 가능한 엔티티 화이트리스트
  DEEPLINK_TYPES: ['tasks', 'content', 'timeline'],

  async init() {
    // 세션 확인
    try {
      const res = await API.get('/auth/me');
      this.user = res.data;
    } catch {
      window.location.href = '/task/login.html';
      return;
    }

    // 메타데이터 로드
    await this.loadMeta();

    // UI 초기화
    this.renderUserInfo();
    this.bindNav();
    this.bindPanel();
    this.bindDialog();
    this.bindGlobalKeys();
    this.bindGlobalSearch();
    this.initNotifications();

    // 사이드바 뱃지 업데이트
    this.updateSidebarBadges();

    // 딥링크 라우팅 (해시 → 엔티티 직접 오픈)
    this._bindHashRouting();

    // 초기 뷰 렌더링
    const initialRoute = this._parseHash();
    if (initialRoute.view && initialRoute.view !== 'dashboard') {
      this.navigate(initialRoute.view);
      if (initialRoute.id) {
        setTimeout(() => this._openEntityById(initialRoute.view, initialRoute.id), 350);
      }
    } else {
      this.navigate('dashboard');
    }

    // 새 버전 업데이트 안내 팝업 (1회)
    setTimeout(() => { try { ReleaseNotes.showLatest(); } catch {} }, 600);

    // 사이드바 하단 버전 라벨 + 클릭 시 전체 릴리즈 노트
    try {
      const verEl = document.getElementById('sb-version-text');
      if (verEl && typeof CURRENT_VERSION !== 'undefined') verEl.textContent = `v${CURRENT_VERSION}`;
      document.getElementById('sb-version')?.addEventListener('click', () => ReleaseNotes.showAll());
    } catch {}
  },

  // 사이드바 뱃지 업데이트 — 마지막 방문 이후 새로 추가된 항목 수 표시
  async updateSidebarBadges() {
    if (!this.user) return;
    const userId = this.user.id;

    try {
      const [tasksRes, contentRes, timelineRes, calendarRes] = await Promise.all([
        API.get('/tasks').catch(() => ({ data: [] })),
        API.get('/content?month=' + new Date().toISOString().slice(0, 7)).catch(() => ({ data: [] })),
        API.get('/timeline?year=' + new Date().getFullYear()).catch(() => ({ data: [] })),
        API.get('/calendar/upcoming').catch(() => ({ data: [] })),
      ]);

      const counts = {
        tasks:    (tasksRes.data    || []).length,
        content:  (contentRes.data  || []).length,
        timeline: (timelineRes.data || []).length,
        calendar: (calendarRes.data || []).length,
      };

      for (const [view, total] of Object.entries(counts)) {
        const key = `task_last_seen_${userId}_${view}`;
        const lastSeen = parseInt(localStorage.getItem(key)) || 0;
        const newCount = Math.max(0, total - lastSeen);
        this._setSidebarBadge(view, newCount);
      }
    } catch {}
  },

  // 해당 뷰 방문 시 현재 카운트를 localStorage에 저장 → 뱃지 0으로 초기화
  async _markViewSeen(view) {
    if (!this.user) return;
    const userId = this.user.id;
    try {
      let res;
      if (view === 'tasks')    res = await API.get('/tasks').catch(() => ({ data: [] }));
      else if (view === 'content')  res = await API.get('/content?month=' + new Date().toISOString().slice(0, 7)).catch(() => ({ data: [] }));
      else if (view === 'timeline') res = await API.get('/timeline?year=' + new Date().getFullYear()).catch(() => ({ data: [] }));
      else if (view === 'calendar') res = await API.get('/calendar/upcoming').catch(() => ({ data: [] }));
      else return;

      const count = (res.data || []).length;
      localStorage.setItem(`task_last_seen_${userId}_${view}`, count);
      this._setSidebarBadge(view, 0);
    } catch {}
  },

  _setSidebarBadge(view, count) {
    const navItem = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (!navItem) return;
    let badge = navItem.querySelector('.nav-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        navItem.appendChild(badge);
      }
      badge.textContent = count > 99 ? '99+' : count;
    } else if (badge) {
      badge.remove();
    }
  },

  async loadMeta() {
    try {
      const [catRes, prodRes, userRes] = await Promise.all([
        API.get('/categories'),
        API.get('/products'),
        API.get('/users'),
      ]);
      this.categories = catRes.data;
      this.products = prodRes.data;
      this.users = userRes.data;
    } catch (e) {
      console.error('메타데이터 로드 실패:', e);
    }
  },

  renderUserInfo() {
    const avatar = document.getElementById('sb-avatar');
    const name = document.getElementById('sb-user-name');
    if (this.user.avatar_url) {
      avatar.innerHTML = `<img src="${escHtml(this.user.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">`;
      avatar.style.background = '';
      avatar.style.color = '';
    } else {
      avatar.textContent = this.user.name.charAt(0);
      avatar.style.background = this.user.avatar_bg;
      avatar.style.color = this.user.avatar_text;
    }
    name.textContent = this.user.name;

    const logoutBtn = document.getElementById('btn-logout');
    const newLogout = logoutBtn.cloneNode(true);
    logoutBtn.parentNode.replaceChild(newLogout, logoutBtn);
    newLogout.addEventListener('click', async () => {
      clearInterval(this._notifTimer);
      await API.post('/auth/logout');
      window.location.href = '/task/login.html';
    });

    // 관리자 메뉴 표시
    if (this.user.role === 'admin') {
      document.querySelectorAll('.nav-admin-only').forEach(el => {
        el.style.display = '';
      });
    }
  },

  bindNav() {
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        this.navigate(item.dataset.view);
      });
    });
    // 로고 영역 클릭 → 홈(대시보드)
    document.querySelector('.sb-logo')?.addEventListener('click', () => {
      this.navigate('dashboard');
    });
  },

  navigate(view) {
    // 관리자 전용 뷰 접근 차단 (비관리자는 대시보드로 이동)
    const adminOnlyViews = ['audit', 'bulk-delete'];
    if (adminOnlyViews.includes(view) && this.user?.role !== 'admin') {
      view = 'dashboard';
    }
    this.currentView = view;

    // 네비게이션 활성 상태
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const active = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (active) active.classList.add('active');

    // 뷰 타이틀 매핑
    const titles = {
      dashboard: '대시보드',
      tasks: '업무 현황',
      timeline: '연간 타임라인',
      content: '콘텐츠 캘린더',
      rrr: 'R&R 현황',
      calendar: '팀 캘린더',
      'weekly-report': '팀 활동',
      settings: '설정',
      audit: '변경 이력',
      'bulk-delete': '대량 삭제 (관리자)',
      'brand-guide': '브랜드 메시지 가이드',
    };
    // 브레드크럼 업데이트
    const currentEl = document.getElementById('topbar-current');
    if (currentEl) currentEl.textContent = titles[view] || '';

    // 콘텐츠 영역에 fade-in 애니메이션 재트리거
    const contentEl = document.getElementById('content');
    if (contentEl) {
      contentEl.style.animation = 'none';
      contentEl.offsetHeight; // reflow
      contentEl.style.animation = '';
    }
    document.getElementById('topbar-actions').innerHTML = '';

    // 뷰 렌더링
    const views = {
      dashboard: DashboardView,
      tasks: TasksView,
      timeline: TimelineView,
      content: ContentView,
      rrr: RRRView,
      calendar: CalendarView,
      'weekly-report': WeeklyReportView,
      settings: SettingsView,
      audit: AuditView,
      'bulk-delete': typeof AdminBulkView !== 'undefined' ? AdminBulkView : null,
      'brand-guide': typeof BrandGuideView !== 'undefined' ? BrandGuideView : null,
    };

    if (views[view]) views[view].render();

    // 뷰 변경 이벤트 발행 (다른 뷰가 _isActive 토글에 사용)
    this.events.emit('view-changed', view);

    // 해당 뷰 방문 처리 → 뱃지 초기화
    this._markViewSeen(view);

    // 뷰 변경 시 해시도 갱신 (딥링크 활성 상태 아닐 때만)
    if (!this._deepLink) {
      this._writeHash(view === 'dashboard' ? '' : `#/${view}`);
    }
  },

  // ───────── 딥링크 (공유 가능한 URL) ─────────
  _parseHash() {
    // 형식: #/tasks/123  또는  #/content  또는  비어 있음
    const h = (location.hash || '').replace(/^#\/?/, '');
    if (!h) return { view: null, id: null };
    const [view, id] = h.split('/');
    return { view: view || null, id: id || null };
  },

  _writeHash(hash) {
    // 페이지 점프 막기 위해 replaceState 사용
    const url = `${location.pathname}${location.search}${hash || ''}`;
    try { history.replaceState(null, '', url); } catch {}
  },

  _bindHashRouting() {
    window.addEventListener('hashchange', () => {
      const { view, id } = this._parseHash();
      if (!view) return;
      // 현재 뷰가 다르면 먼저 뷰 전환
      if (view !== this.currentView) {
        this.navigate(view);
      }
      // 엔티티 ID가 있고 현재 열려있는 것과 다르면 오픈
      if (id) {
        if (!this._deepLink || String(this._deepLink.id) !== String(id) || this._deepLink.type !== view) {
          setTimeout(() => this._openEntityById(view, id), 200);
        }
      } else {
        // ID 없는 해시 → 패널 열려있으면 닫기
        if (this._deepLink) this.closePanel();
      }
    });
  },

  // type: 'tasks' | 'content' | 'timeline'
  async _openEntityById(type, id) {
    try {
      if (type === 'tasks') {
        const res = await API.get('/tasks');
        const task = (res.data || []).find(t => String(t.id) === String(id));
        if (task && typeof TasksView !== 'undefined') TasksView.openDetail(task);
        else this.toast('해당 업무를 찾을 수 없습니다.', 'error');
      } else if (type === 'content') {
        const res = await API.get('/content');
        const item = (res.data || []).find(c => String(c.id) === String(id));
        if (item && typeof ContentView !== 'undefined') ContentView.openForm(item);
        else this.toast('해당 콘텐츠를 찾을 수 없습니다.', 'error');
      } else if (type === 'timeline') {
        // 타임라인은 다년도일 수 있어 올해 → 작년 → 내년 순으로 탐색
        const years = [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() + 1];
        let item = null;
        for (const y of years) {
          const res = await API.get(`/timeline?year=${y}`);
          item = (res.data || []).find(t => String(t.id) === String(id));
          if (item) break;
        }
        if (item && typeof TimelineView !== 'undefined') TimelineView.openForm(item);
        else this.toast('해당 타임라인 항목을 찾을 수 없습니다.', 'error');
      }
    } catch (e) {
      console.error('딥링크 오픈 실패:', e);
    }
  },

  // 뷰의 openDetail/openForm 안에서 호출 — 현재 패널이 가리키는 엔티티 등록
  setDeepLink(type, id) {
    if (!type || !id) return;
    if (!this.DEEPLINK_TYPES.includes(type)) return;
    this._deepLink = { type, id };
    this._writeHash(`#/${type}/${id}`);
    // share 버튼 노출
    const btn = document.getElementById('panel-share');
    if (btn) btn.style.display = '';
  },

  // 현재 패널의 공유 링크를 클립보드에 복사
  copyDeepLink() {
    if (!this._deepLink) { this.toast('공유할 항목이 없습니다.', 'error'); return; }
    const { type, id } = this._deepLink;
    const url = `${location.origin}${location.pathname}#/${type}/${id}`;
    const done = () => this.toast('링크가 복사되었습니다', 'success');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(done).catch(() => this._fallbackCopy(url, done));
    } else {
      this._fallbackCopy(url, done);
    }
  },

  _fallbackCopy(text, onDone) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); onDone?.(); } catch {}
    document.body.removeChild(ta);
  },

  // 슬라이드 패널
  bindPanel() {
    const overlay = document.getElementById('overlay');
    const panel = document.getElementById('slide-panel');
    const closeBtn = document.getElementById('panel-close');
    const cancelBtn = document.getElementById('panel-cancel');
    const shareBtn = document.getElementById('panel-share');

    closeBtn.addEventListener('click', () => this.closePanel());
    cancelBtn.addEventListener('click', () => this.closePanel());
    shareBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.copyDeepLink();
    });
    // 오버레이 클릭 시 패널 닫지 않음 (사용자 요청)
  },

  openPanel(title, bodyHtml, onSave) {
    document.getElementById('panel-title').textContent = title;
    document.getElementById('panel-body').innerHTML = bodyHtml;
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('slide-panel').classList.add('open');

    const saveBtn = document.getElementById('panel-save');
    const newSave = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSave, saveBtn);
    newSave.id = 'panel-save';
    newSave.addEventListener('click', async () => {
      const result = await onSave();
      if (result !== false) this.closePanel();
    });

    // 패널 내 폼에서 Ctrl+Enter 저장 (cloneNode로 이전 리스너 제거)
    const panelBody = document.getElementById('panel-body');
    const newPanelBody = panelBody.cloneNode(false);
    panelBody.parentNode.replaceChild(newPanelBody, panelBody);
    newPanelBody.id = 'panel-body';
    newPanelBody.innerHTML = panelBody.innerHTML;
    newPanelBody.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.getElementById('panel-save')?.click();
      }
    });
  },

  closePanel() {
    document.getElementById('slide-panel').classList.remove('open');
    document.getElementById('overlay').style.display = 'none';
    // 딥링크 정리 — share 버튼 숨기고 해시를 현재 뷰 단위로 되돌림
    if (this._deepLink) {
      this._deepLink = null;
      const btn = document.getElementById('panel-share');
      if (btn) btn.style.display = 'none';
      this._writeHash(this.currentView === 'dashboard' ? '' : `#/${this.currentView}`);
    }
  },

  // 확인 다이얼로그
  bindDialog() {
    document.getElementById('dialog-cancel').addEventListener('click', () => {
      document.getElementById('dialog-overlay').style.display = 'none';
    });
  },

  confirm(msg) {
    return new Promise(resolve => {
      document.getElementById('dialog-msg').textContent = msg;
      document.getElementById('dialog-overlay').style.display = 'flex';

      const confirmBtn = document.getElementById('dialog-confirm');
      const newBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
      newBtn.id = 'dialog-confirm';

      const escHandler = (e) => {
        if (e.key === 'Escape') {
          document.getElementById('dialog-overlay').style.display = 'none';
          document.removeEventListener('keydown', escHandler);
          resolve(false);
        }
      };
      document.addEventListener('keydown', escHandler);

      newBtn.addEventListener('click', () => {
        document.getElementById('dialog-overlay').style.display = 'none';
        document.removeEventListener('keydown', escHandler);
        resolve(true);
      });
      document.getElementById('dialog-cancel').addEventListener('click', () => {
        document.removeEventListener('keydown', escHandler);
        resolve(false);
      }, { once: true });
    });
  },

  // 글로벌 검색
  bindGlobalSearch() {
    const input = document.getElementById('global-search');
    const results = document.getElementById('search-results');
    const hint = document.getElementById('search-hint');
    if (!input || !results) return;

    let debounceTimer = null;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      if (!q) { results.style.display = 'none'; return; }
      debounceTimer = setTimeout(() => this._runSearch(q, input, results), 300);
    });

    // 외부 클릭 닫기
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#global-search-wrap')) {
        results.style.display = 'none';
      }
    });

    // 포커스 시 다시 표시 + 숨기기 Ctrl+K 힌트
    input.addEventListener('focus', () => {
      if (hint) hint.style.display = 'none';
      if (input.value.trim() && results.children.length > 0) {
        results.style.display = 'block';
      }
    });

    // 블러 시 힌트 다시 표시
    input.addEventListener('blur', () => {
      if (hint && !input.value.trim()) hint.style.display = '';
    });
  },

  async _runSearch(q, input, results) {
    try {
      const res = await API.get(`/search?q=${encodeURIComponent(q)}`);
      const data = res.data || {};
      const groups = [
        { key: 'tasks',    label: '업무',      view: 'tasks' },
        { key: 'content_items',  label: '콘텐츠',    view: 'content' },
        { key: 'timeline_items', label: '타임라인',  view: 'timeline' },
        { key: 'comments', label: '댓글',      view: 'tasks' },
      ];

      let html = '';
      let total = 0;
      for (const g of groups) {
        const items = data[g.key] || [];
        if (!items.length) continue;
        total += items.length;
        html += `<div class="search-results-group-label">${escHtml(g.label)}</div>`;
        html += items.slice(0, 5).map(item => `
          <div class="search-result-item" data-view="${g.view}" data-id="${item.id || ''}" data-type="${g.key}" data-task-id="${item.task_id || ''}">
            <span class="search-result-title">${escHtml(item.title || item.content || item.body || item.name || '')}</span>
            ${item.category_name ? `<span class="search-result-sub">${escHtml(item.category_name)}</span>` : ''}
            ${item.task_title ? `<span class="search-result-sub">${escHtml(item.task_title)}</span>` : ''}
          </div>
        `).join('');
      }

      if (total === 0) {
        html = `<div class="search-results-empty">검색 결과가 없습니다</div>`;
      }

      results.innerHTML = html;
      results.style.display = 'block';

      // 결과 클릭 → 해당 뷰로 이동 + 상세 팝업 열기
      results.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', async () => {
          results.style.display = 'none';
          input.value = '';
          const view = item.dataset.view;
          const id = item.dataset.id;
          const type = item.dataset.type;

          this.navigate(view);

          // 뷰 렌더링 완료 대기 후 상세 열기
          setTimeout(async () => {
            try {
              if (type === 'tasks') {
                const res = await API.get('/tasks');
                const task = (res.data || []).find(t => t.id == id);
                if (task) TasksView.openDetail(task);
              } else if (type === 'content_items') {
                const res = await API.get('/content');
                const found = (res.data || []).find(c => c.id == id);
                if (found) ContentView.openForm(found);
              } else if (type === 'timeline_items') {
                const res = await API.get(`/timeline?year=${new Date().getFullYear()}`);
                const found = (res.data || []).find(t => t.id == id);
                if (found) TimelineView.openForm(found);
              } else if (type === 'comments') {
                // 댓글 검색 결과: task_id로 업무 찾기
                const taskId = item.dataset.taskId;
                const res = await API.get('/tasks');
                const task = (res.data || []).find(t => t.id == taskId);
                if (task) {
                  TasksView.openDetail(task);
                  // 댓글 탭 자동 활성화
                  setTimeout(() => {
                    const commentTab = document.querySelector('.detail-tab[data-tab="comments"]');
                    if (commentTab) commentTab.click();
                  }, 100);
                }
              }
            } catch {}
          }, 300);
        });
      });
    } catch (e) {
      results.innerHTML = '<div class="search-results-empty">검색 실패</div>';
      results.style.display = 'block';
    }
  },

  // 글로벌 키보드 단축키
  bindGlobalKeys() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+K → 검색 포커스
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('global-search');
        if (searchInput) searchInput.focus();
        return;
      }
      if (e.key === 'Escape') {
        // 팝오버 닫기
        const popover = document.querySelector('.popover-overlay');
        if (popover) { popover.remove(); return; }
        // 다이얼로그 닫기
        const dialog = document.getElementById('dialog-overlay');
        if (dialog && dialog.style.display !== 'none') {
          dialog.style.display = 'none';
          return;
        }
        // 슬라이드 패널 닫기
        const panel = document.getElementById('slide-panel');
        if (panel && panel.classList.contains('open')) {
          this.closePanel();
          return;
        }
      }
    });
  },

  // 토스트 알림
  // 토스트 알림 (onUndo 전달 시 취소 버튼 표시)
  toast(message, type = 'info', onUndo = null) {
    const colors = {
      success: { bg: 'rgba(74,185,100,0.15)', border: 'rgba(74,185,100,0.35)', text: '#5DD984', icon: '✓' },
      error:   { bg: 'rgba(226,75,74,0.15)',  border: 'rgba(226,75,74,0.35)',  text: '#F07070', icon: '✕' },
      info:    { bg: 'rgba(79,110,247,0.15)', border: 'rgba(79,110,247,0.35)', text: '#7B9BFA', icon: 'i' },
    };
    const c = colors[type] || colors.info;

    const el = document.createElement('div');
    el.className = 'app-toast';
    el.innerHTML = `
      <span class="app-toast-icon" style="color:${c.text}">${c.icon}</span>
      <span class="app-toast-msg">${escHtml(message)}</span>
      ${onUndo ? '<button class="app-toast-undo">취소</button>' : ''}
    `;
    el.style.cssText = `background:${c.bg};border:0.5px solid ${c.border};`;

    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      el.classList.remove('show');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    };

    // 취소 버튼 클릭
    if (onUndo) {
      el.querySelector('.app-toast-undo')?.addEventListener('click', async () => {
        dismissed = true;
        el.remove();
        await onUndo();
      });
    }

    // 3초 후 소멸
    setTimeout(dismiss, 3000);
  },

  // 마케팅본부 소속 활성 사용자 목록
  marketingMembers() {
    return this.users.filter(u => u.is_marketing_member && u.is_active !== false);
  },

  // 업무 배정 가능한 사용자 (marketingMembers 별칭)
  assignableUsers() {
    return this.marketingMembers();
  },

  // 유틸리티
  getCategoryName(id) {
    return this.categories.find(c => c.id == id)?.name || '';
  },
  getCategoryColor(id) {
    return this.categories.find(c => c.id == id)?.color || '#EEF1FD';
  },
  getUserName(id) {
    return this.users.find(u => u.id == id)?.name || '';
  },
  getProductName(id) {
    return this.products.find(p => p.id == id)?.name || '';
  },

  categoryOptions(selected) {
    return '<option value="">선택</option>' +
      this.categories.map(c =>
        `<option value="${c.id}" ${c.id == selected ? 'selected' : ''}>${c.name}</option>`
      ).join('');
  },
  userOptions(selected) {
    return '<option value="">선택</option>' +
      this.users.map(u =>
        `<option value="${u.id}" ${u.id == selected ? 'selected' : ''}>${u.name}</option>`
      ).join('');
  },
  productOptions(selected) {
    return '<option value="">선택</option>' +
      this.products.map(p =>
        `<option value="${p.id}" ${p.id == selected ? 'selected' : ''}>${p.name}</option>`
      ).join('');
  },

  avatar(user) {
    if (user.avatar_url) {
      return `<span class="avatar avatar-img"><img src="${escHtml(user.avatar_url)}" alt="${escHtml(user.name || '')}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"></span>`;
    }
    const bg = user.avatar_bg || '#EEF1FD';
    const color = user.avatar_text || '#4F6EF7';
    const initial = escHtml((user.name || user.assignee_name || '?').charAt(0));
    return `<span class="avatar" style="background:${escHtml(bg)};color:${escHtml(color)}">${initial}</span>`;
  },

  dday(dateStr, status) {
    if (!dateStr) return '';
    if (status === 'done') {
      const d = new Date(dateStr);
      return `<span class="due-badge due-done">${d.getMonth()+1}/${d.getDate()} 완료</span>`;
    }
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dateStr);
    due.setHours(0,0,0,0);
    const diff = Math.ceil((due - today) / (1000*60*60*24));

    if (diff < 0) return `<span class="due-badge due-over">D+${Math.abs(diff)}</span>`;
    if (diff <= 3) return `<span class="due-badge due-warning">D-${diff}</span>`;
    return `<span class="due-badge due-normal">D-${diff}</span>`;
  },

  statusBadge(status) {
    const map = {
      todo: { label: '할 일', cls: 'badge-plan' },
      in_progress: { label: '진행 중', cls: 'badge-plan' },
      done: { label: '완료', cls: 'badge-done' },
      blocked: { label: '지연', cls: 'badge-skip' },
      planned: { label: '예정', cls: 'badge-plan' },
      skipped: { label: '미진행', cls: 'badge-skip' },
      tbd: { label: 'TBD', cls: 'badge-skip' },
    };
    const s = map[status] || { label: status, cls: '' };
    return `<span class="badge ${s.cls}">${s.label}</span>`;
  },

  // 알림 초기화 — init()에서 호출
  async initNotifications() {
    const bell = document.getElementById('notif-bell');
    const dropdown = document.getElementById('notif-dropdown');
    const readAllBtn = document.getElementById('notif-read-all');

    if (!bell || !dropdown) return;

    // 벨 클릭 → 드롭다운 토글
    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleNotifDropdown();
    });

    // 모두 읽음 버튼
    readAllBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this._markAllRead();
    });

    // 외부 클릭 닫기
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#notif-wrap')) {
        dropdown.style.display = 'none';
      }
    });

    // 브라우저 푸시 알림 권한 요청
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // 최초 기존 알림 ID 수집 (팝업 중복 방지)
    this._shownNotifIds = new Set();
    this._prevUnreadCount = 0;
    try {
      const initRes = await API.get('/notifications');
      (initRes.data || []).forEach(n => this._shownNotifIds.add(n.id));
      this._prevUnreadCount = (initRes.data || []).filter(n => !n.is_read).length;
    } catch {}

    // 배지 갱신 + 15초 주기 폴링
    this._fetchUnreadCount();
    this._notifTimer = setInterval(() => this._fetchUnreadCount(), 8000);
  },

  // 미읽음 수 조회 → 배지 업데이트 + 팝업 표시
  async _fetchUnreadCount() {
    try {
      const res = await API.get('/notifications/unread-count');
      const count = res.data?.count ?? 0;
      const badge = document.getElementById('notif-badge');
      if (badge) {
        if (count > 0) {
          badge.textContent = count > 99 ? '99+' : count;
          badge.style.display = '';
        } else {
          badge.style.display = 'none';
        }
      }
      // 새 알림 발생 시 팝업 표시
      if (count > (this._prevUnreadCount || 0)) {
        await this._showNewNotifPopups();
      }
      this._prevUnreadCount = count;
    } catch {}
  },

  // 새 알림 팝업 표시
  async _showNewNotifPopups() {
    try {
      const res = await API.get('/notifications');
      const notifs = res.data || [];
      for (const n of notifs) {
        if (!n.is_read && !this._shownNotifIds.has(n.id)) {
          this._shownNotifIds.add(n.id);
          this._showNotifPopup(n);
        }
      }
    } catch {}
  },

  // 팝업 카드 생성 및 표시
  _showNotifPopup(notif) {
    const container = document.getElementById('notif-popup-container');
    if (!container) return;

    const typeMap = {
      task_assigned: { label: '업무 배정', color: '#4F6EF7', icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M5 8h6M5 5.5h6M5 10.5h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' },
      task_updated: { label: '업무 수정', color: '#8B5CF6', icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>' },
      comment_added: { label: '댓글', color: '#10B981', icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2h12v9H9l-3 3v-3H2V2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>' },
      mention: { label: '멘션', color: '#F59E0B', icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M11 8c0 2.2-1.3 3-3 3-2.2 0-3-1.8-3-3s.8-3 3-3 3 .8 3 3z" stroke="currentColor" stroke-width="1.4"/><path d="M11 8v1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>' },
      due_soon: { label: '마감 임박', color: '#EF4444', icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/><path d="M8 5v3.5l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>' },
    };
    const t = typeMap[notif.type] || { label: '알림', color: '#4F6EF7', icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2a5 5 0 015 5v3l1.5 2h-13L3 10V7a5 5 0 015-5zM6.5 13.5a1.5 1.5 0 003 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' };

    const popup = document.createElement('div');
    popup.className = 'notif-popup';
    popup.dataset.notifId = notif.id;
    popup.style.setProperty('--np-color', t.color);
    popup.innerHTML = `
      <div class="notif-popup-header">
        <span class="notif-popup-badge" style="background:${t.color}22;color:${t.color}">
          ${t.icon}${t.label}
        </span>
        <button class="notif-popup-close" title="닫기">✕</button>
      </div>
      <div class="notif-popup-msg">${escHtml(notif.message)}</div>
      <div class="notif-popup-footer">
        <span class="notif-popup-time">${this._timeAgoNotif(notif.created_at)}</span>
        ${notif.link_view ? `<span class="notif-popup-action">바로가기 →</span>` : ''}
      </div>
      <div class="notif-popup-progress"><div class="notif-popup-progress-bar"></div></div>
    `;

    container.appendChild(popup);

    // 슬라이드 인
    requestAnimationFrame(() => {
      requestAnimationFrame(() => popup.classList.add('show'));
    });

    // 닫기 버튼
    popup.querySelector('.notif-popup-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this._dismissNotifPopup(popup);
    });

    // 클릭 → 이동 + 상세 열기
    if (notif.link_view) {
      popup.style.cursor = 'pointer';
      popup.addEventListener('click', () => {
        this._openNotifTarget(notif);
        this._markRead(notif.id);
        this._dismissNotifPopup(popup);
      });
    }

    // 자동 닫힘 (6초)
    let elapsed = 0;
    const bar = popup.querySelector('.notif-popup-progress-bar');
    const DURATION = 6000;
    const TICK = 50;
    let timer = setInterval(() => {
      elapsed += TICK;
      if (bar) bar.style.width = `${100 - (elapsed / DURATION) * 100}%`;
      if (elapsed >= DURATION) {
        clearInterval(timer);
        this._dismissNotifPopup(popup);
      }
    }, TICK);

    // 호버 시 타이머 일시정지
    popup.addEventListener('mouseenter', () => clearInterval(timer));
    popup.addEventListener('mouseleave', () => {
      timer = setInterval(() => {
        elapsed += TICK;
        if (bar) bar.style.width = `${100 - (elapsed / DURATION) * 100}%`;
        if (elapsed >= DURATION) {
          clearInterval(timer);
          this._dismissNotifPopup(popup);
        }
      }, TICK);
    });
  },

  _dismissNotifPopup(popup) {
    popup.classList.remove('show');
    popup.classList.add('hide');
    setTimeout(() => popup.remove(), 350);
  },

  // 드롭다운 표시/숨김 토글
  _toggleNotifDropdown() {
    const dropdown = document.getElementById('notif-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.style.display !== 'none';
    if (isOpen) {
      dropdown.style.display = 'none';
    } else {
      dropdown.style.display = 'block';
      this._loadNotifications();
    }
  },

  // 알림 목록 로드 및 렌더
  async _loadNotifications() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--color-text-muted);font-size:12px;">불러오는 중...</div>';
    try {
      const res = await API.get('/notifications');
      const notifs = res.data || [];
      if (notifs.length === 0) {
        list.innerHTML = '<div class="notif-empty">알림이 없습니다</div>';
        return;
      }
      list.innerHTML = notifs.map(n => `
        <div class="notif-item ${n.is_read ? '' : 'unread'}" data-notif-id="${n.id}" data-link-view="${escHtml(n.link_view || '')}" data-link-id="${n.link_id || ''}" data-notif-type="${escHtml(n.type || '')}">
          <div class="notif-message">${escHtml(n.message)}</div>
          <div class="notif-time">${this._timeAgoNotif(n.created_at)}</div>
        </div>
      `).join('');

      // 클릭 → 이동 + 상세 열기 + 읽음 처리
      list.querySelectorAll('.notif-item').forEach(item => {
        item.addEventListener('click', async () => {
          const id = item.dataset.notifId;
          const view = item.dataset.linkView;
          const linkId = item.dataset.linkId;
          const notifType = item.dataset.notifType;
          await this._markRead(id);
          item.classList.remove('unread');
          document.getElementById('notif-dropdown').style.display = 'none';
          if (view) {
            this._openNotifTarget({ link_view: view, link_id: linkId, type: notifType });
          }
        });
      });
    } catch {
      list.innerHTML = '<div class="notif-empty">불러오기 실패</div>';
    }
  },

  // 알림 클릭 → 뷰 이동 + 해당 항목 상세 열기
  // notif: { link_view, link_id, type }
  async _openNotifTarget(notif) {
    const view = notif.link_view;
    const id = notif.link_id;
    const type = notif.type;
    if (!view) return;

    this.navigate(view);
    if (!id) return;

    // 뷰 렌더링 대기 후 상세 오픈
    setTimeout(async () => {
      try {
        if (view === 'tasks') {
          const res = await API.get('/tasks');
          const task = (res.data || []).find(t => t.id == id);
          if (!task) return;
          TasksView.openDetail(task);
          // 댓글/멘션 알림이면 댓글 탭 자동 활성화
          if (type === 'comment_added' || type === 'mention') {
            setTimeout(() => {
              document.querySelector('.detail-tab[data-tab="comments"]')?.click();
            }, 120);
          }
        } else if (view === 'content') {
          const res = await API.get('/content');
          const found = (res.data || []).find(c => c.id == id);
          if (found) ContentView.openForm(found);
        } else if (view === 'timeline') {
          const res = await API.get(`/timeline?year=${new Date().getFullYear()}`);
          const found = (res.data || []).find(t => t.id == id);
          if (found) TimelineView.openForm(found);
        } else if (view === 'calendar') {
          const res = await API.get('/calendar');
          const found = (res.data || []).find(e => e.id == id);
          if (found) CalendarView.openForm?.(found);
        }
      } catch (e) { /* 무시 — 뷰만 보여주면 됨 */ }
    }, 250);
  },

  // 개별 읽음 처리
  async _markRead(id) {
    try {
      await API.patch(`/notifications/${id}/read`, {});
      await this._fetchUnreadCount();
    } catch {}
  },

  // 전체 읽음 처리
  async _markAllRead() {
    try {
      await API.patch('/notifications/read-all', {});
      await this._fetchUnreadCount();
      await this._loadNotifications();
    } catch {}
  },

  // 상대 시간 포맷 (알림용)
  _timeAgoNotif(dateStr) {
    if (!dateStr) return '';
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return `${diff}초 전`;
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return new Date(dateStr).toLocaleDateString('ko-KR');
  },
};

// 카테고리 태그 색상 매핑 (다크 테마 호환)
const CATEGORY_TAG_COLORS = {
  '소개자료':        { bg: 'rgba(245,158,11,0.18)',  text: '#F5A94A' },
  '회사소개서':      { bg: 'rgba(245,158,11,0.18)',  text: '#F5A94A' },
  '홈페이지':        { bg: 'rgba(59,130,246,0.18)',  text: '#7BA8F7' },
  '전시회':          { bg: 'rgba(139,92,246,0.18)',  text: '#B08CF9' },
  '온라인광고':      { bg: 'rgba(34,197,94,0.16)',   text: '#5DD984' },
  'PR':              { bg: 'rgba(236,72,153,0.16)',  text: '#F07DB0' },
  '브랜딩':          { bg: 'rgba(148,163,184,0.16)', text: '#94A3B8' },
  '콘텐츠 제작':     { bg: 'rgba(79,110,247,0.18)',  text: '#7B9BFA' },
  '고도화 자료 제작':{ bg: 'rgba(251,146,60,0.18)',  text: '#FB924A' },
  '1층 체험관':      { bg: 'rgba(99,102,241,0.18)',  text: '#9DA3FA' },
  '지원사업':        { bg: 'rgba(148,163,184,0.12)', text: '#9A9BA3' },
  '제안서 지원':     { bg: 'rgba(148,163,184,0.12)', text: '#9A9BA3' },
};

function categoryTag(name) {
  const c = CATEGORY_TAG_COLORS[name] || { bg: 'rgba(148,163,184,0.12)', text: '#9A9BA3' };
  return `<span class="card-category" style="background:${c.bg};color:${c.text}">${escHtml(name)}</span>`;
}

// 앱 시작
document.addEventListener('DOMContentLoaded', () => App.init());
