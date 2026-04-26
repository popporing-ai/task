// 주간보고 뷰
const WeeklyReportView = {
  _currentWeekStart: null,
  _isAdmin: false,
  _activeTab: 'my', // 'my' | 'team'

  render() {
    this._isAdmin = App.user.role === 'admin';
    if (!this._currentWeekStart) {
      this._currentWeekStart = this._getWeekStart(new Date());
    }

    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');

    actions.innerHTML = `
      <button class="btn btn-primary" id="btn-wr-save" style="display:none">저장</button>
    `;

    content.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>불러오는 중...</span></div>';

    this._renderTabs();
  },

  _getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  _toDateStr(d) {
    return d.toISOString().slice(0, 10);
  },

  _weekLabel(weekStart) {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
    const today = this._getWeekStart(new Date());
    const diff = Math.round((weekStart - today) / (7 * 24 * 3600 * 1000));
    let suffix = '';
    if (diff === 0) suffix = ' (이번 주)';
    else if (diff === -1) suffix = ' (지난 주)';
    return `${weekStart.getFullYear()}년 ${fmt(weekStart)} ~ ${fmt(end)}${suffix}`;
  },

  _renderTabs() {
    const content = document.getElementById('content');
    const tabs = this._isAdmin
      ? `<div class="wr-tabs">
           <button class="wr-tab ${this._activeTab === 'my' ? 'active' : ''}" data-tab="my">내 보고서</button>
           <button class="wr-tab ${this._activeTab === 'team' ? 'active' : ''}" data-tab="team">팀 전체 보기</button>
         </div>`
      : '';

    content.innerHTML = `
      <div class="wr-container">
        <div class="wr-header">
          <div class="wr-week-nav">
            <button class="wr-week-btn" id="wr-prev">‹</button>
            <span class="wr-week-label" id="wr-week-label">${this._weekLabel(this._currentWeekStart)}</span>
            <button class="wr-week-btn" id="wr-next">›</button>
          </div>
          ${tabs}
        </div>
        <div class="wr-body" id="wr-body">
          <div class="loading-state"><div class="loading-spinner"></div></div>
        </div>
      </div>
    `;

    document.getElementById('wr-prev').addEventListener('click', () => {
      this._currentWeekStart = new Date(this._currentWeekStart);
      this._currentWeekStart.setDate(this._currentWeekStart.getDate() - 7);
      this._updateWeekLabel();
      this._loadActiveTab();
    });

    document.getElementById('wr-next').addEventListener('click', () => {
      this._currentWeekStart = new Date(this._currentWeekStart);
      this._currentWeekStart.setDate(this._currentWeekStart.getDate() + 7);
      this._updateWeekLabel();
      this._loadActiveTab();
    });

    if (this._isAdmin) {
      document.querySelectorAll('.wr-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          this._activeTab = tab.dataset.tab;
          document.querySelectorAll('.wr-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this._loadActiveTab();
        });
      });
    }

    this._loadActiveTab();
  },

  _updateWeekLabel() {
    const el = document.getElementById('wr-week-label');
    if (el) el.textContent = this._weekLabel(this._currentWeekStart);
  },

  _loadActiveTab() {
    if (this._activeTab === 'team' && this._isAdmin) {
      this._loadTeamView();
    } else {
      this._loadMyReport();
    }
  },

  async _loadMyReport() {
    const body = document.getElementById('wr-body');
    if (!body) return;
    body.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';

    const saveBtn = document.getElementById('btn-wr-save');
    if (saveBtn) saveBtn.style.display = '';

    try {
      const weekStr = this._toDateStr(this._currentWeekStart);
      const res = await API.get(`/weekly-reports/me?week=${weekStr}`);
      const { report, tasks } = res.data;
      const { week_start, week_end } = res.meta;

      const doneTasks = tasks.filter(t => t.status === 'done');
      const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
      const todoTasks = tasks.filter(t => t.status === 'todo' || t.status === 'blocked');

      const taskChipHtml = (arr) => arr.map(t => `
        <span class="wr-task-chip wr-task-${t.status}" title="${escHtml(t.title)}">
          ${t.category_name ? `<span class="wr-chip-cat">${escHtml(t.category_name)}</span>` : ''}
          ${escHtml(t.title.length > 30 ? t.title.slice(0, 30) + '…' : t.title)}
        </span>
      `).join('');

      body.innerHTML = `
        <div class="wr-edit-layout">
          <div class="wr-form-area">
            <div class="wr-form-section">
              <label class="wr-label">
                <span class="wr-label-dot" style="background:#5DD984"></span>
                이번 주 한 일
              </label>
              <textarea class="wr-textarea" id="wr-this-week" placeholder="이번 주에 완료하거나 진행한 업무를 작성해주세요.">${escHtml(report?.this_week || '')}</textarea>
            </div>
            <div class="wr-form-section">
              <label class="wr-label">
                <span class="wr-label-dot" style="background:#4F6EF7"></span>
                다음 주 계획
              </label>
              <textarea class="wr-textarea" id="wr-next-week" placeholder="다음 주에 진행할 업무 계획을 작성해주세요.">${escHtml(report?.next_week || '')}</textarea>
            </div>
            <div class="wr-form-section">
              <label class="wr-label">
                <span class="wr-label-dot" style="background:#F59E0B"></span>
                이슈 / 특이사항
              </label>
              <textarea class="wr-textarea wr-textarea-sm" id="wr-issues" placeholder="지연, 블로커, 공유사항 등을 작성해주세요.">${escHtml(report?.issues || '')}</textarea>
            </div>
            ${report ? `<div class="wr-saved-at">마지막 저장: ${this._fmtDate(report.updated_at)}</div>` : ''}
          </div>

          <div class="wr-task-ref">
            <div class="wr-task-ref-title">이번 주 업무 현황 <span class="wr-task-ref-hint">참고용</span></div>
            ${doneTasks.length ? `
              <div class="wr-task-group-label">완료 (${doneTasks.length})</div>
              <div class="wr-task-chips">${taskChipHtml(doneTasks)}</div>
            ` : ''}
            ${inProgressTasks.length ? `
              <div class="wr-task-group-label">진행 중 (${inProgressTasks.length})</div>
              <div class="wr-task-chips">${taskChipHtml(inProgressTasks)}</div>
            ` : ''}
            ${todoTasks.length ? `
              <div class="wr-task-group-label">예정 / 미진행 (${todoTasks.length})</div>
              <div class="wr-task-chips">${taskChipHtml(todoTasks)}</div>
            ` : ''}
            ${!tasks.length ? '<div class="wr-no-tasks">이번 주 배정된 업무가 없습니다.</div>' : ''}

            <div class="wr-task-ref-title" style="margin-top:20px">과거 보고서</div>
            <div id="wr-history-list"><div class="wr-history-loading">불러오는 중...</div></div>
          </div>
        </div>
      `;

      // 저장 버튼 이벤트
      if (saveBtn) {
        const newBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newBtn, saveBtn);
        newBtn.id = 'btn-wr-save';
        newBtn.style.display = '';
        newBtn.addEventListener('click', () => this._save(weekStr));
      }

      // Ctrl+S 저장
      document.addEventListener('keydown', this._ctrlSHandler = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          this._save(weekStr);
        }
      });

      // 과거 보고서 목록 로드
      this._loadHistory();

    } catch (e) {
      body.innerHTML = '<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">불러오기 실패</div></div>';
    }
  },

  async _save(weekStr) {
    const thisWeek = document.getElementById('wr-this-week')?.value || '';
    const nextWeek = document.getElementById('wr-next-week')?.value || '';
    const issues = document.getElementById('wr-issues')?.value || '';

    const btn = document.getElementById('btn-wr-save');
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

    try {
      await API.post('/weekly-reports', {
        week_start: weekStr,
        this_week: thisWeek,
        next_week: nextWeek,
        issues,
      });
      App.toast('주간보고가 저장되었습니다.', 'success');
      const savedAt = document.querySelector('.wr-saved-at');
      if (savedAt) {
        savedAt.textContent = `마지막 저장: 방금`;
      } else {
        const form = document.querySelector('.wr-form-area');
        if (form) {
          const el = document.createElement('div');
          el.className = 'wr-saved-at';
          el.textContent = '마지막 저장: 방금';
          form.appendChild(el);
        }
      }
      this._loadHistory();
    } catch (e) {
      App.toast('저장에 실패했습니다.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '저장'; }
    }
  },

  async _loadHistory() {
    const listEl = document.getElementById('wr-history-list');
    if (!listEl) return;
    try {
      const res = await API.get('/weekly-reports/history');
      const items = res.data || [];
      if (!items.length) {
        listEl.innerHTML = '<div class="wr-history-empty">이전 보고서가 없습니다.</div>';
        return;
      }
      listEl.innerHTML = items.map(r => {
        const ws = new Date(r.week_start);
        const we = new Date(r.week_end);
        const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
        return `
          <div class="wr-history-item" data-week="${r.week_start}">
            <span class="wr-history-week">${fmt(ws)} ~ ${fmt(we)}</span>
            <span class="wr-history-preview">${escHtml((r.this_week_preview || '').replace(/\n/g, ' ').slice(0, 40))}</span>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('.wr-history-item').forEach(item => {
        item.addEventListener('click', () => {
          const week = item.dataset.week;
          this._currentWeekStart = this._getWeekStart(new Date(week));
          this._updateWeekLabel();
          this._loadMyReport();
        });
      });
    } catch {}
  },

  async _loadTeamView() {
    const body = document.getElementById('wr-body');
    if (!body) return;
    body.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';

    const saveBtn = document.getElementById('btn-wr-save');
    if (saveBtn) saveBtn.style.display = 'none';

    try {
      const weekStr = this._toDateStr(this._currentWeekStart);

      // 제출 현황 + 상세 보고서 동시 로드
      const [summaryRes, reportsRes] = await Promise.all([
        API.get(`/weekly-reports/team-summary?week=${weekStr}`),
        API.get(`/weekly-reports?week=${weekStr}`),
      ]);

      const members = summaryRes.data || [];
      const reports = reportsRes.data || [];
      const reportMap = {};
      reports.forEach(r => { reportMap[r.user_id] = r; });

      const submitted = members.filter(m => m.report_id);
      const pending = members.filter(m => !m.report_id);

      body.innerHTML = `
        <div class="wr-team-layout">
          <div class="wr-team-summary-bar">
            <span class="wr-summary-stat">
              <span class="wr-summary-num" style="color:#5DD984">${submitted.length}</span>
              <span class="wr-summary-lbl">제출 완료</span>
            </span>
            <span class="wr-summary-div">/</span>
            <span class="wr-summary-stat">
              <span class="wr-summary-num" style="color:var(--color-text-muted)">${members.length}</span>
              <span class="wr-summary-lbl">전체 팀원</span>
            </span>
            ${pending.length ? `
              <span class="wr-pending-badges">
                ${pending.map(m => `
                  <span class="wr-pending-badge" title="미제출">
                    <span class="avatar avatar-sm" style="background:${escHtml(m.avatar_bg||'#EEF1FD')};color:${escHtml(m.avatar_text||'#4F6EF7')}">${escHtml(m.name.charAt(0))}</span>
                    ${escHtml(m.name)}
                  </span>
                `).join('')}
              </span>
            ` : '<span class="wr-all-done">전원 제출 완료 ✓</span>'}
          </div>

          <div class="wr-team-grid">
            ${members.map(m => {
              const r = reportMap[m.id];
              return `
                <div class="wr-team-card ${r ? '' : 'wr-team-card-empty'}">
                  <div class="wr-team-card-header">
                    <span class="avatar avatar-sm" style="background:${escHtml(m.avatar_bg||'#EEF1FD')};color:${escHtml(m.avatar_text||'#4F6EF7')}">${escHtml(m.name.charAt(0))}</span>
                    <span class="wr-team-name">${escHtml(m.name)}</span>
                    ${r ? `<span class="wr-submitted-badge">제출</span>` : `<span class="wr-pending-tag">미제출</span>`}
                  </div>
                  ${r ? `
                    <div class="wr-team-section">
                      <div class="wr-team-section-label" style="color:#5DD984">이번 주 한 일</div>
                      <div class="wr-team-text">${escHtml(r.this_week || '').replace(/\n/g, '<br>')}</div>
                    </div>
                    <div class="wr-team-section">
                      <div class="wr-team-section-label" style="color:#4F6EF7">다음 주 계획</div>
                      <div class="wr-team-text">${escHtml(r.next_week || '').replace(/\n/g, '<br>')}</div>
                    </div>
                    ${r.issues ? `
                      <div class="wr-team-section">
                        <div class="wr-team-section-label" style="color:#F59E0B">이슈</div>
                        <div class="wr-team-text">${escHtml(r.issues).replace(/\n/g, '<br>')}</div>
                      </div>
                    ` : ''}
                    <div class="wr-team-updated">${this._fmtDate(r.updated_at)}</div>
                  ` : `
                    <div class="wr-team-empty-msg">아직 보고서를 제출하지 않았습니다.</div>
                  `}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } catch (e) {
      body.innerHTML = '<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">불러오기 실패</div></div>';
    }
  },

  _fmtDate(str) {
    if (!str) return '';
    const d = new Date(str);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },
};
