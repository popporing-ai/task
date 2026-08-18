// R&R 현황 뷰 — 엑셀 업무분장표와 동일한 표 형태

// 엑셀(업무분장표) 업무명 순서 — 표 정렬 기준
const EXCEL_ORDER = [
  '마케팅본부 업무 총괄', '대외 산출물 검토, 승인', '주간 보고', '인력 운영, 평가, 면담', '예산, 비용 집행 관리', '기타 정의되지 않은 본부 운영 업무',
  '브랜드 가이드라인, 슬로건 관리', 'CI, 디자인 자산 관리', '마케팅 아이디어 등록', '마케팅 아이디어 기획 판단', '기타 정의되지 않은 기획, 브랜드 업무',
  'PR 기획, 초안 작성', '기사 송출, 매체 대응', 'PR 관리 대장 운영', 'PR 소재 자동 수집 운영', '방송, 외부 미디어 협업',
  '기타 정의되지 않은 PR 업무', '유튜브 영상 기획, 제작, 발행', '제품 소개 영상 제작', '고객사 현장 촬영', '영상 자산 아카이브 관리',
  '콘텐츠 기획, 주제 선정', '납품사례 포트폴리오 자산화', '영문 콘텐츠 대응', '기타 정의되지 않은 콘텐츠 업무', '홈페이지 개발, 배포, 운영',
  '홈페이지 콘텐츠 게시, 업데이트', '문의, 예약 폼 운영', '채널 운영: 네이버 블로그', '채널 운영: 링크드인', '채널 운영: 페이스북', '채널 운영: 유튜브',
  '키워드 전략, 검색 노출 관리', '검색광고 집행: 네이버, 구글', '기타 정의되지 않은 채널, 광고 업무', '이메일마케팅 기획, 발송', '발송 대상 DB 관리',
  '전시회, 외부행사 총괄', '전시 부스 자료 제작', '전시 지원사업 확보', '수상, 어워드 출품 총괄', '체험관 관리', '회사 연혁 관리',
  '기타 정의되지 않은 캠페인, 전시 업무', '회사소개서 제작, 업데이트', '솔루션 소개자료 제작, 업데이트', '리플렛, 브로슈어 제작',
  '마케팅, 영업 제안 자료 제작', '고도화 자료 제작', '디자인 대응', '기타 정의되지 않은 자료, 제안 업무', '데이터, 성과 분석 및 리포팅',
  '유입경로 추적 관리', '리드, 고객 DB 관리', '납품이력 데이터 취합', '외주 업체 서칭, 견적', '기타 정의되지 않은 데이터, 오퍼레이션 업무',
  '마케팅 서버, 인프라 운영', '마케팅 업무 시스템 운영', '슬랙 봇, 업무 자동화 운영', 'NAS, 문서 아카이브 관리', '계정, 구독 툴 관리',
  '기타 정의되지 않은 시스템 업무', '특허 출원 관리', 'OA(의견제출통지) 대응', '특허 등록, 등록증 관리', '특허 유지 검토, 포기 처리', '연차료 관리',
  '상표, 디자인 출원 및 관리', '저작권(프로그램) 등록 관리', '기술이전, 권리이전 처리', '침해 대응, 선행기술 조사', '직무발명제도 운영',
  '기타 정의되지 않은 지식재산권 업무', '신원스틸 마케팅 지원 총괄', '신원스틸 홈페이지, 검색광고 운영', '과제, 사업 홍보 지원', '사내 요청 검토 대응',
  '기타 정의되지 않은 업무',
];

const RRRView = {
  data: [],
  versions: [],
  currentVersion: null,
  viewingVersionId: null, // 과거 버전 열람 중일 때
  filterUserId: null,     // 사람별 필터 (null = 전체)

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');

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

    // 탑바 액션 — 아카이브(보관본)는 되돌릴 수 없음. 현재 버전에서만 편집 가능.
    if (isAdmin && isViewingCurrent) {
      actions.innerHTML = `
        <button class="btn btn-default" id="btn-archive-rrr" title="현재 R&R을 보관하고 새 버전 시작">새 버전으로 아카이브</button>
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

    this.renderTable(content);
  },

  // -- 데이터 준비 ---
  _flatItems() {
    return this.data.flatMap(u => u.items.map(i => ({
      ...i,
      user_id: u.user_id,
      _user_name: u.user_name,
    })));
  },

  _memberButtons() {
    const members = App.assignableUsers();
    const btn = (id, label) => `<button class="rrr-filter-btn ${(id === 'all' ? !this.filterUserId : this.filterUserId === id) ? 'active' : ''}" data-filter="${id}">${escHtml(label)}</button>`;
    return `<div class="rrr-filter-bar">${btn('all', '전체')}${members.map(m => btn(m.id, m.name)).join('')}</div>`;
  },

  renderTable(content) {
    const isAdmin = App.user?.role === 'admin';
    const isViewingCurrent = !this.viewingVersionId || (this.currentVersion && this.viewingVersionId === this.currentVersion.id);
    const isEditable = isAdmin && isViewingCurrent;

    const version = this.viewingVersionId
      ? this.versions.find(v => v.id === this.viewingVersionId)
      : this.currentVersion;
    const versionHeaderHtml = this._versionHeaderHtml(version, isViewingCurrent);

    // 마케팅 멤버만 대상
    const memberIds = App.assignableUsers().map(u => u.id);
    let items = this._flatItems().filter(i => memberIds.includes(i.user_id));
    if (this.filterUserId) items = items.filter(i => i.user_id === this.filterUserId);

    let funcItems = items.filter(i => i.role_type === 'function');
    let leadItems = items.filter(i => i.role_type === 'solution_lead');

    // 업무명 엑셀 순서로 정렬, 같으면 담당자 id 순
    const oidx = (d) => { const k = EXCEL_ORDER.indexOf(d); return k === -1 ? 9999 : k; };
    funcItems.sort((a, b) => oidx(a.description) - oidx(b.description) || a.user_id - b.user_id);
    leadItems.sort((a, b) => a.user_id - b.user_id || (a.sort_order || 0) - (b.sort_order || 0));

    const hasAny = funcItems.length + leadItems.length > 0;

    content.innerHTML = `
      ${versionHeaderHtml}
      ${!isViewingCurrent ? '<div class="rrr-readonly-banner"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3v4m0 3h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg> 이 버전은 보관본입니다. 열람만 가능하며 되돌릴 수 없습니다.</div>' : ''}
      ${this._memberButtons()}
      ${!hasAny ? `
        <div class="empty-state">
          <div class="empty-state-title">표시할 R&R이 없습니다</div>
          <div class="empty-state-desc">${this.filterUserId ? '이 담당자에게 배정된 업무가 없습니다' : (isViewingCurrent ? '업무를 등록해보세요' : '이 버전에 등록된 업무가 없습니다')}</div>
          ${isEditable ? '<div class="empty-state-action"><button class="btn btn-primary" id="empty-add-rrr">+ R&R 추가</button></div>' : ''}
        </div>
      ` : `
        ${this._funcTableHtml(funcItems, isEditable)}
        ${this._leadTableHtml(leadItems, isEditable)}
      `}
    `;

    content.querySelector('#empty-add-rrr')?.addEventListener('click', () => this.openAddForm());
    this._bindVersionSelect(content);
    this._bindTableEvents(content, isEditable);

    if (!isAdmin && isViewingCurrent) {
      const banner = document.createElement('div');
      banner.className = 'rrr-permission-banner';
      banner.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/><path d="M8 5v3M8 11h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        R&R 추가, 수정은 <b>관리자</b>만 가능합니다.
      `;
      content.prepend(banner);
    }
  },

  _funcTableHtml(rows, isEditable) {
    if (!rows.length) return '';
    const body = rows.map((it, idx) => `
      <tr data-item-id="${it.id}">
        <td class="rrr-td-no">${idx + 1}</td>
        <td class="rrr-td-part">${escHtml(it.part || '')}</td>
        <td class="rrr-td-cat">${escHtml(it.category || '')}</td>
        <td class="rrr-td-name"><span class="rrr-name-link" data-item-detail="${it.id}">${escHtml(it.description)}</span></td>
        <td class="rrr-td-detail">${escHtml(it.task_detail || '')}</td>
        <td class="rrr-td-freq">${escHtml(it.frequency || '')}</td>
        <td class="rrr-td-owner">${escHtml(it._user_name)}</td>
        <td class="rrr-td-sub">${escHtml(it.sub_assignee || '')}</td>
        ${isEditable ? `<td class="rrr-td-act">${this._rowActions(it.id)}</td>` : ''}
      </tr>
    `).join('');

    return `
      <div class="rrr-table-wrap">
        <div class="rrr-table-title">정기 업무분장</div>
        <div class="rrr-table-scroll">
          <table class="rrr-table">
            <thead>
              <tr>
                <th class="rrr-td-no">No</th>
                <th>파트</th>
                <th>대분류</th>
                <th>업무명</th>
                <th>주요 내용</th>
                <th>주기</th>
                <th>정 담당</th>
                <th>부 담당</th>
                ${isEditable ? '<th></th>' : ''}
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  _leadTableHtml(rows, isEditable) {
    if (!rows.length) return '';
    const body = rows.map(it => `
      <tr data-item-id="${it.id}">
        <td class="rrr-td-name"><span class="rrr-name-link" data-item-detail="${it.id}">${escHtml(it.description)}</span></td>
        <td class="rrr-td-owner">${escHtml(it._user_name)}</td>
        <td class="rrr-td-note">${escHtml(it.status_note || '')}</td>
        ${isEditable ? `<td class="rrr-td-act">${this._rowActions(it.id)}</td>` : ''}
      </tr>
    `).join('');

    return `
      <div class="rrr-table-wrap">
        <div class="rrr-table-title">솔루션별 리드 담당자</div>
        <div class="rrr-table-scroll">
          <table class="rrr-table">
            <thead>
              <tr>
                <th>솔루션명</th>
                <th>리드 담당자</th>
                <th>상태, 비고</th>
                ${isEditable ? '<th></th>' : ''}
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  _rowActions(id) {
    return `
      <button class="card-action-btn" data-rrr-edit="${id}" title="수정">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
      </button>
      <button class="card-action-btn" data-rrr-del="${id}" title="삭제">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    `;
  },

  _versionHeaderHtml(version, isViewingCurrent) {
    if (!version) return '';
    const effectiveDate = version.effective_date
      ? new Date(version.effective_date).toLocaleDateString('ko-KR')
      : '-';

    const historyOptions = this.versions.map(h => {
      const d = h.effective_date ? new Date(h.effective_date).toLocaleDateString('ko-KR') : '';
      const label = `v${escHtml(h.version)}${d ? ' (' + d + ')' : ''}${h.is_current ? ' - 현재' : ' - 보관본'}`;
      return `<option value="${h.id}" ${h.id === version.id ? 'selected' : ''}>${label}</option>`;
    }).join('');

    return `
      <div class="rrr-version-header">
        <div class="rrr-version-header-left">
          <span class="brand-guide-version-badge">v${escHtml(version.version)}</span>
          ${isViewingCurrent
            ? '<span class="brand-guide-current-badge">현재 버전</span>'
            : '<span class="brand-guide-past-badge">보관본</span>'}
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
        this.viewingVersionId = null;
        await this.loadData();
      } else {
        // 보관본은 열람만 (되돌릴 수 없음)
        this.viewingVersionId = selectedId;
        this.data = await this.loadVersionItems(selectedId);
      }
      this._renderFull(document.getElementById('content'), document.getElementById('topbar-actions'));
    });
  },

  _bindTableEvents(content, isEditable) {
    // 사람별 필터
    content.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = btn.dataset.filter;
        this.filterUserId = f === 'all' ? null : parseInt(f);
        this.renderTable(content);
      });
    });

    // 업무명(솔루션명) 클릭 -> 상세 팝업
    content.querySelectorAll('[data-item-detail]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = this._flatItems().find(i => String(i.id) === String(el.dataset.itemDetail));
        if (item) this._showItemDetail(item);
      });
    });

    if (!isEditable) return;

    content.querySelectorAll('[data-rrr-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = this._flatItems().find(i => String(i.id) === String(btn.dataset.rrrEdit));
        if (item) this.openEditForm(item);
      });
    });

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
  },

  // 현재 데이터에서 특정 필드의 고유값 목록 (datalist 옵션용)
  _distinct(field) {
    const set = new Set();
    this.data.forEach(u => u.items.forEach(i => { if (i[field]) set.add(i[field]); }));
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
  },

  // 업무 상세 팝업
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

  // 새 버전 아카이브 폼 — 현재 R&R을 보관본으로 넘기고 새 버전 시작
  openArchiveForm() {
    let suggestedVersion = '1.0.0';
    if (this.currentVersion && this.currentVersion.version) {
      const parts = this.currentVersion.version.split('.').map(Number);
      if (parts.length === 3) {
        parts[2] += 1;
        suggestedVersion = parts.join('.');
      } else if (parts.length === 2) {
        suggestedVersion = `${parts[0]}.${(parts[1] || 0) + 1}`;
      }
    }
    const today = new Date().toISOString().slice(0, 10);

    const html = `
      <div class="form-group">
        <label>새 버전 번호</label>
        <input type="text" id="f-version" value="${escHtml(suggestedVersion)}" placeholder="예: 1.2">
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
        현재 R&R이 보관본으로 넘어가고, 동일한 내용의 새 버전이 생성됩니다.
        보관본은 열람만 가능하며 되돌릴 수 없습니다.
      </p>
    `;

    App.openPanel('새 R&R 버전 아카이브', html, async () => {
      const confirmed = await App.confirm('현재 R&R을 보관본으로 넘기고 새 버전을 시작하시겠습니까? 보관본은 되돌릴 수 없습니다.');
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
