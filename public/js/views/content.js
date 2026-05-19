// 콘텐츠 캘린더 뷰 — 주제별 그룹 + 캘린더 뷰 + 일괄 생성
const ContentView = {
  // ─ 상수 ─
  CHANNEL_LABELS: {
    IG: '인스타그램', FB: '페이스북', LI: '링크드인',
    YT: '유튜브', BL: '블로그', EM: '이메일', HM: '홈페이지',
  },
  TYPE_LABELS: {
    I: '이미지', C: '카드뉴스', V: '비디오', S: '쇼츠/릴스',
    Q: 'Q&A / FAQ', A: '아티클', L: '라이브', T: '텍스트',
  },
  CHANNEL_COLOR: {
    IG: '#E1306C', FB: '#1877F2', LI: '#0A66C2',
    YT: '#FF0000', BL: '#5DD984', EM: '#F5A94A', HM: '#4F6EF7',
  },
  PRODUCT_URLS: {
    'Core':        'https://virnect.com/support/inquiry',
    'Remote':      'https://remotehome.virnect.com/ko-kr/pages/contact',
    'Scout':       'https://scout.virnect.com/ko-kr/pages/contact-us-1',
    'VisionX':     'https://visionx.virnect.com/ko-kr/pages/contact',
    'Make&View':   'https://makeview.virnect.com/ko-kr/pages/contact',
    'Robotics':    'https://robotics.virnect.com/ko-kr/pages/contact',
    'Inspect':     'https://xr.virnect.com/ko-kr/pages/contact',
    'HoloX':       'https://xr.virnect.com/ko/pages/contact',
    'Twin':        'https://xr.virnect.com/ko/pages/contact',
    'XR':          'https://xr.virnect.com/ko/pages/contact',
    'AutoGuide':   'https://xr.virnect.com/ko/pages/contact',
    'Workstation': 'https://xr.virnect.com/ko/pages/contact',
  },

  items: [],
  filterAssignee: null,
  month: new Date().toISOString().slice(0, 7),
  viewMode: 'list', // 'list' | 'calendar'
  collapsedTopics: new Set(), // 펼치기/접기 상태

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = '<button class="btn btn-primary" id="btn-add-content">+ 콘텐츠 추가</button>';
    document.getElementById('btn-add-content').addEventListener('click', () => this.openForm());

    content.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><span>콘텐츠 불러오는 중...</span></div>`;

    await this.loadData();
    this.renderBody();
  },

  async loadData() {
    try {
      let url = `/content?month=${this.month}`;
      if (this.filterAssignee) url += `&assignee_id=${this.filterAssignee}`;
      const res = await API.get(url);
      this.items = res.data || [];
    } catch { this.items = []; }
  },

  renderBody() {
    const content = document.getElementById('content');

    const assigneeOptions = `
      <option value="">전체 담당자</option>
      ${App.users.map(u =>
        `<option value="${u.id}" ${this.filterAssignee == u.id ? 'selected' : ''}>${escHtml(u.name)}</option>`
      ).join('')}
    `;

    const filterHtml = `
      <div class="filter-bar">
        <div class="content-view-toggle">
          <button class="filter-btn ${this.viewMode === 'list' ? 'active' : ''}" data-vm="list">📋 리스트</button>
          <button class="filter-btn ${this.viewMode === 'calendar' ? 'active' : ''}" data-vm="calendar">🗓️ 캘린더</button>
        </div>
        <div class="filter-sep"></div>
        <select id="f-assignee">${assigneeOptions}</select>
        <div class="filter-sep"></div>
        <label style="font-size:12px;color:var(--color-text-muted)">월 선택:</label>
        <input type="month" value="${this.month}" id="f-month">
        <button class="filter-btn" id="btn-reset-filters" title="필터 초기화">✕ 초기화</button>
      </div>
    `;

    const bodyHtml = this.viewMode === 'calendar'
      ? this._renderCalendarView()
      : this._renderListView();

    content.innerHTML = filterHtml + bodyHtml;
    this._bindToolbar(content);
    this._bindRowEvents(content);
  },

  // ───────── 리스트 뷰 (주제별 그룹) ─────────
  _renderListView() {
    if (this.items.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon-svg">
            <svg width="48" height="48" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1"/><path d="M1 5h14" stroke="currentColor" stroke-width="1"/></svg>
          </div>
          <div class="empty-state-title">${this.month} 콘텐츠가 없습니다</div>
          <div class="empty-state-action"><button class="btn btn-primary empty-add-content">+ 콘텐츠 추가</button></div>
        </div>
      `;
    }

    // topic 기준 그룹핑 — topic이 없으면 title을 단일 그룹으로
    const groups = new Map();
    for (const item of this.items) {
      const key = item.topic && item.topic.trim() ? item.topic.trim() : `__solo__:${item.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }

    // 그룹별 정렬: 가장 빠른 publish_date 기준
    const sortedGroups = [...groups.entries()].sort((a, b) => {
      const da = a[1].reduce((min, x) => !min || (x.publish_date && x.publish_date < min) ? x.publish_date : min, null);
      const db = b[1].reduce((min, x) => !min || (x.publish_date && x.publish_date < min) ? x.publish_date : min, null);
      return (db || '').localeCompare(da || '');
    });

    const groupsHtml = sortedGroups.map(([key, items]) => {
      const isSolo = key.startsWith('__solo__:');
      const topic = isSolo ? items[0].title : key;
      const isCollapsed = this.collapsedTopics.has(key);
      const itemCount = items.length;

      // 그룹 헤더 통계
      const channels = [...new Set(items.map(i => i.channel))];
      const doneCount = items.filter(i => i.status === 'done').length;
      const dateMin = items.reduce((m, x) => !m || (x.publish_date && x.publish_date < m) ? x.publish_date : m, null);
      const dateMax = items.reduce((m, x) => !m || (x.publish_date && x.publish_date > m) ? x.publish_date : m, null);
      const dateRange = dateMin === dateMax
        ? (dateMin ? String(dateMin).slice(0, 10) : '미정')
        : `${String(dateMin || '').slice(5,10)} ~ ${String(dateMax || '').slice(5,10)}`;

      const channelsBadge = channels.map(c =>
        `<span class="cc-channel-chip" style="background:${this.CHANNEL_COLOR[c] || '#9A9BA3'}22;color:${this.CHANNEL_COLOR[c] || '#9A9BA3'};">${escHtml(c)}</span>`
      ).join('');

      if (isSolo) {
        // 단독 콘텐츠 — 행 그대로
        return `
          <div class="cc-group cc-solo">
            ${this._renderItemRow(items[0])}
          </div>
        `;
      }

      // 주제 그룹
      return `
        <div class="cc-group" data-group-key="${escHtml(key)}">
          <div class="cc-group-header ${isCollapsed ? 'collapsed' : ''}" data-toggle-group="${escHtml(key)}">
            <span class="cc-group-caret">${isCollapsed ? '▶' : '▼'}</span>
            <span class="cc-group-title">${escHtml(topic)}</span>
            <span class="cc-group-meta">
              <span class="cc-group-channels">${channelsBadge}</span>
              <span class="cc-group-stat">${doneCount}/${itemCount} 완료</span>
              <span class="cc-group-stat">${escHtml(dateRange)}</span>
            </span>
          </div>
          ${isCollapsed ? '' : `<div class="cc-group-body">${items.map(it => this._renderItemRow(it)).join('')}</div>`}
        </div>
      `;
    }).join('');

    return `<div class="cc-list">${groupsHtml}</div>`;
  },

  _renderItemRow(item) {
    const chColor = this.CHANNEL_COLOR[item.channel] || '#9A9BA3';
    const chLabel = this.CHANNEL_LABELS[item.channel] || item.channel;
    const typeLabel = this.TYPE_LABELS[item.content_type] || item.content_type;
    const publishLink = item.publish_url
      ? `<a href="${escHtml(item.publish_url)}" target="_blank" rel="noopener" class="cc-row-link" title="배포 URL 열기">↗</a>`
      : '';
    // 원본 유입 URL 복사 + 단축 URL 복사 — 둘 다 노출 (있을 때만)
    const copyIcon = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5.5" y="5.5" width="8.5" height="9" rx="1.3" stroke="currentColor" stroke-width="1.4"/><path d="M3 11V3.3A1.3 1.3 0 0 1 4.3 2H11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
    const shortCopyIcon = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 2.5a2 2 0 11.7 1.55L6.95 6.45a2 2 0 010 3.1l3.75 2.4A2 2 0 1110 13.5a2 2 0 01.3-1.05L6.55 10.05a2 2 0 110-4.1L10.3 3.55A2 2 0 0110 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
    let copyButtons = '';
    if (item.inflow_url) {
      copyButtons += `<button class="cc-cid-copy" data-copy-text="${escHtml(item.inflow_url)}" data-copy-kind="url" title="원본 유입 URL 복사">${copyIcon}</button>`;
    } else if (item.content_id) {
      copyButtons += `<button class="cc-cid-copy" data-copy-text="${escHtml(item.content_id)}" data-copy-kind="id" title="콘텐츠 ID 복사">${copyIcon}</button>`;
    }
    if (item.short_url) {
      copyButtons += `<button class="cc-cid-copy cc-cid-copy-short" data-copy-text="${escHtml(item.short_url)}" data-copy-kind="short" title="단축 URL 복사 (${escHtml(item.short_url)})">${shortCopyIcon}</button>`;
    }
    const idBadge = item.content_id
      ? `<span class="cc-row-cid" title="${escHtml(item.content_id)}">${escHtml(item.content_id)}${copyButtons}</span>`
      : '<span class="cc-row-cid cc-row-cid-empty">—</span>';

    return `
      <div class="cc-row" data-row-id="${item.id}">
        <span class="cc-row-ch" style="background:${chColor}22;color:${chColor};" title="${escHtml(chLabel)}">${escHtml(item.channel)}</span>
        <span class="cc-row-type" title="${escHtml(typeLabel)}">${escHtml(item.content_type)}</span>
        <span class="cc-row-product">${escHtml(item.product_name || '-')}</span>
        ${idBadge}
        <span class="cc-row-date">${item.publish_date ? String(item.publish_date).slice(5, 10) : '미정'}</span>
        <span class="cc-row-assignee">${item.assignee_name ? App.avatar({name: item.assignee_name, avatar_bg: item.avatar_bg, avatar_text: item.avatar_text}) + escHtml(item.assignee_name) : '-'}</span>
        <span class="cc-row-status">${App.statusBadge(item.status)}</span>
        <span class="cc-row-actions">
          ${publishLink}
          <button class="card-action-btn" data-edit="${item.id}" title="수정"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></button>
          <button class="card-action-btn" data-del="${item.id}" title="삭제"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>
        </span>
      </div>
    `;
  },

  // ───────── 캘린더 뷰 (월 그리드) ─────────
  _renderCalendarView() {
    const [yStr, mStr] = this.month.split('-');
    const year = parseInt(yStr); const monthIdx = parseInt(mStr) - 1;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const firstDay = new Date(year, monthIdx, 1);
    const lastDay = new Date(year, monthIdx + 1, 0);
    const startDow = firstDay.getDay();

    // 날짜별 콘텐츠 그룹화
    const byDate = new Map();
    for (const it of this.items) {
      if (!it.publish_date) continue;
      const dStr = String(it.publish_date).slice(0, 10);
      if (!byDate.has(dStr)) byDate.set(dStr, []);
      byDate.get(dStr).push(it);
    }

    const cells = [];
    // 이전 월 채움
    const prevLast = new Date(year, monthIdx, 0);
    for (let i = startDow - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, monthIdx - 1, prevLast.getDate() - i), other: true });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      cells.push({ date: new Date(year, monthIdx, d), other: false });
    }
    const remaining = (cells.length % 7 === 0) ? 0 : 7 - (cells.length % 7);
    for (let d = 1; d <= remaining; d++) {
      cells.push({ date: new Date(year, monthIdx + 1, d), other: true });
    }

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    let html = `
      <div class="cc-cal-grid">
        <div class="cc-cal-header">
          ${dayNames.map((n, i) => `<div class="cc-cal-h ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${n}</div>`).join('')}
        </div>
        <div class="cc-cal-body">
    `;

    for (let w = 0; w < cells.length / 7; w++) {
      html += '<div class="cc-cal-week">';
      for (let d = 0; d < 7; d++) {
        const cell = cells[w * 7 + d];
        const dateStr = this._toDateStr(cell.date);
        const isToday = cell.date.getTime() === today.getTime();
        let cls = 'cc-cal-day';
        if (cell.other) cls += ' other';
        if (isToday) cls += ' today';
        if (d === 0) cls += ' sun';
        if (d === 6) cls += ' sat';

        const items = byDate.get(dateStr) || [];
        const chips = items.slice(0, 5).map(it => {
          const color = this.CHANNEL_COLOR[it.channel] || '#9A9BA3';
          return `<div class="cc-cal-chip" data-row-id="${it.id}" style="background:${color}22;color:${color};border-left:3px solid ${color};" title="${escHtml(it.title || it.topic || '')}">${escHtml(it.channel)} ${escHtml(it.content_type)}</div>`;
        }).join('');
        const more = items.length > 5 ? `<div class="cc-cal-more">+${items.length - 5}</div>` : '';

        html += `<div class="${cls}" data-date="${dateStr}">
          <div class="cc-cal-d">${cell.date.getDate()}</div>
          <div class="cc-cal-items">${chips}${more}</div>
        </div>`;
      }
      html += '</div>';
    }

    html += `</div></div>`;
    return html;
  },

  _toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  },

  // ───────── 바인딩 ─────────
  _bindToolbar(content) {
    content.querySelector('.empty-add-content')?.addEventListener('click', () => this.openForm());

    content.querySelectorAll('[data-vm]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.viewMode = btn.dataset.vm;
        this.renderBody();
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
      this.filterAssignee = null;
      this.month = new Date().toISOString().slice(0, 7);
      this.render();
    });
  },

  _bindRowEvents(content) {
    // 주제 그룹 토글
    content.querySelectorAll('[data-toggle-group]').forEach(h => {
      h.addEventListener('click', (e) => {
        if (e.target.closest('.cc-row-actions') || e.target.closest('.cc-cid-copy')) return;
        const key = h.dataset.toggleGroup;
        if (this.collapsedTopics.has(key)) this.collapsedTopics.delete(key);
        else this.collapsedTopics.add(key);
        this.renderBody();
      });
    });

    // 복사 (유입 URL 또는 콘텐츠 ID)
    content.querySelectorAll('[data-copy-text]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = btn.dataset.copyText;
        if (!text) { App.toast('복사할 내용이 없습니다.', 'error'); return; }
        const kindMap = { url: '원본 URL', short: '단축 URL', id: '콘텐츠 ID' };
        const kind = kindMap[btn.dataset.copyKind] || 'URL';
        const done = () => App.toast(`${kind}이(가) 복사되었습니다`, 'success');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(done).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            done();
          });
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          done();
        }
      });
    });

    // 행/캘린더 칩 클릭 → 수정 폼
    content.querySelectorAll('.cc-row, .cc-cal-chip').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('a')) return;
        const item = this.items.find(i => i.id == el.dataset.rowId);
        if (item) this.openForm(item);
      });
    });

    content.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = this.items.find(i => i.id == btn.dataset.edit);
        if (item) this.openForm(item);
      });
    });
    content.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await App.confirm('이 콘텐츠를 삭제하시겠습니까?');
        if (ok) {
          await API.del(`/content/${btn.dataset.del}`);
          App.toast('삭제되었습니다.', 'info');
          this.render();
        }
      });
    });
  },

  // ───────── 폼 (단일/일괄 통합) ─────────
  openForm(item) {
    const isEdit = !!item;
    if (isEdit && item?.id) App.setDeepLink('content', item.id);
    const title = isEdit ? '콘텐츠 수정' : '콘텐츠 추가';

    const chOpts = Object.entries(this.CHANNEL_LABELS).map(([c, label]) =>
      `<option value="${c}" title="${escHtml(label)}" ${item?.channel===c?'selected':''}>${c} — ${escHtml(label)}</option>`
    ).join('');
    const typeOpts = Object.entries(this.TYPE_LABELS).map(([t, label]) =>
      `<option value="${t}" title="${escHtml(label)}" ${item?.content_type===t?'selected':''}>${t} — ${escHtml(label)}</option>`
    ).join('');

    // 일괄 생성용 — 채널 체크박스 + 각 채널별 타입 선택
    const channelCheckboxes = Object.entries(this.CHANNEL_LABELS).map(([c, label]) => {
      const color = this.CHANNEL_COLOR[c] || '#9A9BA3';
      const tOpts = Object.entries(this.TYPE_LABELS).map(([t, l]) =>
        `<option value="${t}">${t} — ${l}</option>`
      ).join('');
      return `
        <div class="cc-batch-row" data-batch-ch="${c}">
          <label class="cc-batch-check">
            <input type="checkbox" data-bch="${c}">
            <span class="cc-batch-ch-badge" style="background:${color}22;color:${color};">${escHtml(c)}</span>
            <span class="cc-batch-ch-label">${escHtml(label)}</span>
          </label>
          <select class="cc-batch-type" data-btype="${c}" disabled>
            <option value="">타입 선택</option>
            ${tOpts}
          </select>
        </div>
      `;
    }).join('');

    const modeToggle = isEdit ? '' : `
      <div class="form-group cc-form-mode">
        <label>등록 모드</label>
        <div class="cc-mode-tabs">
          <button type="button" class="cc-mode-tab active" data-mode="single">단일 콘텐츠</button>
          <button type="button" class="cc-mode-tab" data-mode="batch">주제별 다중 (여러 채널 한 번에)</button>
        </div>
      </div>
    `;

    const singleFormHtml = `
      <div class="cc-mode-pane" data-pane="single">
        <div class="form-group">
          <label>콘텐츠 제목 *</label>
          <input type="text" id="f-title" value="${escHtml(item?.title || '')}" placeholder="콘텐츠 제목">
        </div>
        ${!isEdit ? `
        <div class="form-group">
          <label>주제 (선택, 같은 주제로 묶고 싶다면)</label>
          <input type="text" id="f-topic-single" value="${escHtml(item?.topic || '')}" placeholder="예: 2026 신제품 런칭 캠페인">
          <div style="font-size:11px;color:var(--color-text-hint);margin-top:4px;">주제를 입력하면 리스트에서 같은 주제끼리 묶여서 보입니다.</div>
        </div>
        ` : ''}
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
            <select id="f-form-assignee">${App.userOptions(item?.assignee_id)}</select>
          </div>
          <div class="form-group">
            <label>배포 예정일</label>
            <input type="date" id="f-date" value="${item?.publish_date?.slice(0,10) || ''}">
          </div>
        </div>
        <div class="form-group">
          <label>콘텐츠 ID (자동 생성)</label>
          <input type="text" id="f-content-id" value="${escHtml(item?.content_id || '')}" placeholder="배포일+채널+타입 입력 시 자동">
          <div class="preview-text" id="f-id-preview">${escHtml(item?.content_id || '배포일, 채널, 타입을 입력하면 미리보기')}</div>
        </div>
        <div class="form-group">
          <label>유입 URL (원본)</label>
          <input type="text" id="f-inflow-url" value="${escHtml(item?.inflow_url || '')}" placeholder="콘텐츠 ID 기반 자동 생성">
        </div>
        <div class="form-group">
          <label>단축 URL (da.gd 자동 생성)</label>
          <input type="text" id="f-short-url" value="${escHtml(item?.short_url || '')}" placeholder="${isEdit ? '저장 시 자동 단축 (수동 입력도 가능)' : '저장 시 자동 단축됨 (da.gd)'}">
          <div style="font-size:11px;color:var(--color-text-hint);margin-top:4px;">SNS 게시용 짧은 링크. 비워두면 유입 URL을 기준으로 자동 생성됩니다(da.gd, preview 페이지 없음).</div>
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
          <textarea id="f-memo" placeholder="메모">${escHtml(item?.memo || '')}</textarea>
        </div>
      </div>
    `;

    const batchFormHtml = isEdit ? '' : `
      <div class="cc-mode-pane" data-pane="batch" style="display:none;">
        <div class="form-group">
          <label>주제 *</label>
          <input type="text" id="f-topic-batch" placeholder="예: 2026 신제품 런칭 캠페인">
          <div style="font-size:11px;color:var(--color-text-hint);margin-top:4px;">선택한 모든 채널의 콘텐츠가 이 주제 하위로 묶입니다.</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>제품</label>
            <select id="f-product-batch">${App.productOptions()}</select>
          </div>
          <div class="form-group">
            <label>배포 예정일 (공통)</label>
            <input type="date" id="f-date-batch">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>담당자 (공통)</label>
            <select id="f-assignee-batch">${App.userOptions()}</select>
          </div>
          <div class="form-group">
            <label>상태</label>
            <div class="radio-group">
              <label><input type="radio" name="f-status-batch" value="planned" checked>예정</label>
              <label><input type="radio" name="f-status-batch" value="done">완료</label>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>채널 × 타입 선택 *</label>
          <div class="cc-batch-list">${channelCheckboxes}</div>
          <div style="font-size:11px;color:var(--color-text-hint);margin-top:6px;">체크한 채널마다 타입을 선택해야 생성됩니다. 콘텐츠 ID는 각 채널별로 자동 생성됩니다.</div>
        </div>
        <div class="form-group">
          <label>메모 (공통)</label>
          <textarea id="f-memo-batch" placeholder="공통 메모"></textarea>
        </div>
      </div>
    `;

    const html = `${modeToggle}${singleFormHtml}${batchFormHtml}`;

    App.openPanel(title, html, async () => {
      const mode = document.querySelector('.cc-mode-tab.active')?.dataset.mode || 'single';

      if (mode === 'batch' && !isEdit) {
        const topic = document.getElementById('f-topic-batch').value.trim();
        if (!topic) { App.toast('주제를 입력해주세요.', 'error'); return false; }
        const checked = [...document.querySelectorAll('[data-bch]:checked')];
        if (checked.length === 0) { App.toast('최소 1개 채널을 선택해주세요.', 'error'); return false; }
        const channels = [];
        for (const cb of checked) {
          const ch = cb.dataset.bch;
          const typeSel = document.querySelector(`[data-btype="${ch}"]`);
          const ct = typeSel?.value;
          if (!ct) { App.toast(`${ch} 채널의 타입을 선택해주세요.`, 'error'); return false; }
          channels.push({ channel: ch, content_type: ct });
        }
        const data = {
          topic,
          channels,
          product_id: document.getElementById('f-product-batch').value || null,
          publish_date: document.getElementById('f-date-batch').value || null,
          assignee_id: document.getElementById('f-assignee-batch').value || null,
          status: document.querySelector('input[name="f-status-batch"]:checked').value,
          memo: document.getElementById('f-memo-batch').value || null,
        };
        const res = await API.post('/content/batch', data);
        App.toast(`${res.data.length}개 콘텐츠가 생성되었습니다.`, 'success');
        if (data.publish_date) this.month = data.publish_date.slice(0, 7);
        this.render();
        return;
      }

      // 단일
      const data = {
        title: document.getElementById('f-title').value.trim(),
        topic: document.getElementById('f-topic-single')?.value.trim() || null,
        product_id: document.getElementById('f-product').value || null,
        channel: document.getElementById('f-channel').value,
        content_type: document.getElementById('f-type').value,
        assignee_id: document.getElementById('f-form-assignee').value || null,
        publish_date: document.getElementById('f-date').value || null,
        content_id: document.getElementById('f-content-id').value || null,
        inflow_url: document.getElementById('f-inflow-url').value || null,
        short_url: document.getElementById('f-short-url').value || null,
        publish_url: document.getElementById('f-publish-url').value || null,
        status: document.querySelector('input[name="f-status"]:checked').value,
        memo: document.getElementById('f-memo').value,
      };
      if (!data.title) { App.toast('제목을 입력해주세요.', 'error'); return false; }
      if (isEdit) {
        await API.put(`/content/${item.id}`, data);
        App.toast('수정되었습니다.', 'success');
      } else {
        await API.post('/content', data);
        App.toast('추가되었습니다.', 'success');
      }
      if (data.publish_date) this.month = data.publish_date.slice(0, 7);
      this.render();
    });

    // 모드 토글
    document.querySelectorAll('.cc-mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const m = tab.dataset.mode;
        document.querySelectorAll('.cc-mode-tab').forEach(t => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.cc-mode-pane').forEach(p => {
          p.style.display = p.dataset.pane === m ? '' : 'none';
        });
      });
    });

    // 일괄 모드 — 체크박스 활성화 → 타입 select 활성화
    document.querySelectorAll('[data-bch]').forEach(cb => {
      cb.addEventListener('change', () => {
        const sel = document.querySelector(`[data-btype="${cb.dataset.bch}"]`);
        if (sel) sel.disabled = !cb.checked;
      });
    });

    // source 필드 변경 시: content_id + inflow_url + short_url 모두 비워서 서버가 재생성하도록 함
    const onSourceFieldChange = async () => {
      const date = document.getElementById('f-date')?.value;
      const ch = document.getElementById('f-channel')?.value;
      const type = document.getElementById('f-type')?.value;
      // 미리보기 갱신 + 폼 필드 비우기 (저장 시 서버가 새로 채움)
      const cidInput = document.getElementById('f-content-id');
      const inflowInput = document.getElementById('f-inflow-url');
      const shortInput = document.getElementById('f-short-url');
      if (cidInput) cidInput.value = '';
      if (inflowInput) inflowInput.value = '';
      if (shortInput) shortInput.value = '';
      if (date && ch && type) {
        try {
          const res = await API.get(`/content/preview-id?publish_date=${date}&channel=${ch}&content_type=${type}`);
          document.getElementById('f-id-preview').textContent = res.data.content_id;
        } catch {}
      } else {
        document.getElementById('f-id-preview').textContent = '배포일, 채널, 타입을 입력하면 미리보기';
      }
    };

    document.getElementById('f-date')?.addEventListener('change', onSourceFieldChange);
    document.getElementById('f-channel')?.addEventListener('change', onSourceFieldChange);
    document.getElementById('f-type')?.addEventListener('change', onSourceFieldChange);

    // 제품 변경 → inflow_url + short_url 비움 (content_id는 유지)
    document.getElementById('f-product')?.addEventListener('change', () => {
      const inflowInput = document.getElementById('f-inflow-url');
      const shortInput = document.getElementById('f-short-url');
      if (inflowInput) inflowInput.value = '';
      if (shortInput) shortInput.value = '';
    });

    // 유입 URL이 사용자에 의해 직접 수정되면 단축 URL 비움 → 저장 시 서버가 재단축
    document.getElementById('f-inflow-url')?.addEventListener('input', () => {
      const shortInput = document.getElementById('f-short-url');
      if (shortInput) shortInput.value = '';
    });
  },

  _updateInflowUrl(contentId) {
    const inflowInput = document.getElementById('f-inflow-url');
    if (!inflowInput || inflowInput.value) return;
    const productSelect = document.getElementById('f-product');
    const productName = productSelect?.selectedOptions[0]?.text || '';
    const cid = contentId || document.getElementById('f-content-id')?.value;
    if (!cid) return;
    const base = (productName && this.PRODUCT_URLS[productName]) ? this.PRODUCT_URLS[productName] : 'https://virnect.com';
    const sep = base.includes('?') ? '&' : '?';
    inflowInput.value = `${base}${sep}src=${cid}`;
  },
};
