// 앱 상태
const App = {
  currentView: 'dashboard',
  user: null,
  categories: [],
  products: [],
  users: [],

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

    // 초기 뷰 렌더링
    this.navigate('dashboard');
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
    avatar.textContent = this.user.name.charAt(0);
    avatar.style.background = this.user.avatar_bg;
    avatar.style.color = this.user.avatar_text;
    name.textContent = this.user.name;

    document.getElementById('btn-logout').addEventListener('click', async () => {
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
  },

  navigate(view) {
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
      settings: '설정',
      audit: '변경 이력',
    };
    document.getElementById('topbar-title').textContent = titles[view] || '';
    document.getElementById('topbar-actions').innerHTML = '';

    // 뷰 렌더링
    const views = {
      dashboard: DashboardView,
      tasks: TasksView,
      timeline: TimelineView,
      content: ContentView,
      rrr: RRRView,
      settings: SettingsView,
      audit: AuditView,
    };

    if (views[view]) views[view].render();
  },

  // 슬라이드 패널
  bindPanel() {
    const overlay = document.getElementById('overlay');
    const panel = document.getElementById('slide-panel');
    const closeBtn = document.getElementById('panel-close');
    const cancelBtn = document.getElementById('panel-cancel');

    const close = () => {
      panel.classList.remove('open');
      overlay.style.display = 'none';
    };

    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
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

    // 패널 내 폼에서 Ctrl+Enter 또는 단순 Enter(textarea 제외) 저장
    const panelBody = document.getElementById('panel-body');
    panelBody.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.getElementById('panel-save')?.click();
      }
    });
  },

  closePanel() {
    document.getElementById('slide-panel').classList.remove('open');
    document.getElementById('overlay').style.display = 'none';
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

      newBtn.addEventListener('click', () => {
        document.getElementById('dialog-overlay').style.display = 'none';
        resolve(true);
      });
      document.getElementById('dialog-cancel').addEventListener('click', () => {
        resolve(false);
      }, { once: true });
    });
  },

  // 글로벌 키보드 단축키
  bindGlobalKeys() {
    document.addEventListener('keydown', (e) => {
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
  toast(message, type = 'info') {
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
    `;
    el.style.cssText = `
      background:${c.bg};
      border:0.5px solid ${c.border};
    `;

    // 토스트 컨테이너
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    container.appendChild(el);

    // 애니메이션 진입
    requestAnimationFrame(() => el.classList.add('show'));

    // 3초 후 소멸
    setTimeout(() => {
      el.classList.remove('show');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }, 3000);
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
      blocked: { label: '미진행', cls: 'badge-skip' },
      planned: { label: '예정', cls: 'badge-plan' },
      skipped: { label: '미진행', cls: 'badge-skip' },
      tbd: { label: 'TBD', cls: 'badge-skip' },
    };
    const s = map[status] || { label: status, cls: '' };
    return `<span class="badge ${s.cls}">${s.label}</span>`;
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
