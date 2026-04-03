// 성과 관리 뷰 — 팀 성과, 목표, 피드백, 리포트
const PerformanceView = {
  activeTab: 'overview',
  periodFilter: 'month', // week | month | quarter | custom
  customFrom: '',
  customTo: '',
  _teamData: null,
  _goalsData: null,
  _feedbackData: null,

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = `
      <button class="btn btn-default" id="btn-export-report">리포트 내보내기</button>
    `;
    content.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>성과 데이터 불러오는 중...</span></div>';

    document.getElementById('btn-export-report')?.addEventListener('click', () => this._showExportModal());

    try {
      await this._fetchAll();
      this._renderMain(content);
    } catch (e) {
      content.innerHTML = '<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">성과 데이터를 불러올 수 없습니다</div></div>';
    }
  },

  async _fetchAll() {
    const params = this._buildDateParams();
    const [teamRes, goalsRes, recvRes, sentRes] = await Promise.all([
      API.get('/performance/team' + params).catch(() => ({ data: null })),
      API.get('/goals').catch(() => ({ data: [] })),
      API.get('/feedbacks/received').catch(() => ({ data: [] })),
      API.get('/feedbacks/sent').catch(() => ({ data: [] })),
    ]);
    this._teamData = teamRes.data || { summary: {}, members: [], contribution: { byCategory: [], byProduct: [] } };
    this._goalsData = goalsRes.data || [];
    this._feedbackReceived = recvRes.data || [];
    this._feedbackSent = sentRes.data || [];
  },

  _buildDateParams() {
    const now = new Date();
    let from = '', to = '';
    if (this.periodFilter === 'week') {
      const d = new Date(now); d.setDate(now.getDate() - now.getDay());
      from = d.toISOString().slice(0, 10);
      const e = new Date(now); e.setDate(now.getDate() + (6 - now.getDay()));
      to = e.toISOString().slice(0, 10);
    } else if (this.periodFilter === 'month') {
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;
    } else if (this.periodFilter === 'quarter') {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      from = `${now.getFullYear()}-${String(qStart + 1).padStart(2, '0')}-01`;
      to = `${now.getFullYear()}-${String(qStart + 3).padStart(2, '0')}-${new Date(now.getFullYear(), qStart + 3, 0).getDate()}`;
    } else if (this.periodFilter === 'custom' && this.customFrom && this.customTo) {
      from = this.customFrom;
      to = this.customTo;
    }
    if (from && to) return `?date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}`;
    return '';
  },

  _renderMain(content) {
    const tabs = [
      { key: 'overview', label: '팀 현황' },
      { key: 'goals', label: '팀 목표' },
      { key: 'feedback', label: '피드백' },
    ];

    content.innerHTML = `
      <div class="perf-period-filter">
        <span style="font-size:12px;color:var(--color-text-muted);font-weight:600;">기간:</span>
        <button class="filter-btn perf-period-btn ${this.periodFilter === 'week' ? 'active' : ''}" data-period="week">이번 주</button>
        <button class="filter-btn perf-period-btn ${this.periodFilter === 'month' ? 'active' : ''}" data-period="month">이번 달</button>
        <button class="filter-btn perf-period-btn ${this.periodFilter === 'quarter' ? 'active' : ''}" data-period="quarter">이번 분기</button>
        <button class="filter-btn perf-period-btn ${this.periodFilter === 'custom' ? 'active' : ''}" data-period="custom">커스텀</button>
        ${this.periodFilter === 'custom' ? `
          <input type="date" id="perf-date-from" value="${this.customFrom}" style="background:var(--color-bg-secondary);color:var(--color-text-primary);border:1px solid var(--color-border);border-radius:6px;padding:4px 8px;font-size:12px;">
          <span style="color:var(--color-text-muted);">~</span>
          <input type="date" id="perf-date-to" value="${this.customTo}" style="background:var(--color-bg-secondary);color:var(--color-text-primary);border:1px solid var(--color-border);border-radius:6px;padding:4px 8px;font-size:12px;">
          <button class="btn btn-primary" id="perf-apply-custom" style="padding:4px 12px;font-size:12px;">적용</button>
        ` : ''}
      </div>

      <div class="perf-tabs">
        ${tabs.map(t => `<button class="detail-tab ${this.activeTab === t.key ? 'active' : ''}" data-perf-tab="${t.key}">${t.label}</button>`).join('')}
      </div>

      <div class="perf-tab-content" id="perf-tab-content"></div>
    `;

    // 기간 필터 이벤트
    content.querySelectorAll('.perf-period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.periodFilter = btn.dataset.period;
        this.render();
      });
    });

    content.querySelector('#perf-apply-custom')?.addEventListener('click', () => {
      this.customFrom = content.querySelector('#perf-date-from')?.value || '';
      this.customTo = content.querySelector('#perf-date-to')?.value || '';
      this.render();
    });

    // 탭 전환
    content.querySelectorAll('[data-perf-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.perfTab;
        content.querySelectorAll('.detail-tab').forEach(b => b.classList.toggle('active', b === btn));
        this._renderActiveTab();
      });
    });

    this._renderActiveTab();
  },

  _renderActiveTab() {
    const container = document.getElementById('perf-tab-content');
    if (!container) return;
    switch (this.activeTab) {
      case 'overview': this._renderOverview(container); break;
      case 'goals': this._renderGoals(container); break;
      case 'feedback': this._renderFeedback(container); break;
    }
  },

  // ── 팀 현황 요약 ──
  _renderOverview(container) {
    const s = this._teamData?.summary || {};
    const members = this._teamData?.members || [];
    const contrib = this._teamData?.contribution || { byCategory: [], byProduct: [] };

    container.innerHTML = `
      <!-- 지표 카드 -->
      <div class="perf-metric-grid">
        <div class="perf-metric-card">
          <div class="perf-metric-label">총 완료</div>
          <div class="perf-metric-value" style="color:var(--color-done-text)">${s.total_done || 0}</div>
        </div>
        <div class="perf-metric-card">
          <div class="perf-metric-label">총 지연</div>
          <div class="perf-metric-value" style="color:var(--color-warn-text)">${s.total_overdue || 0}</div>
        </div>
        <div class="perf-metric-card">
          <div class="perf-metric-label">평균 소요일</div>
          <div class="perf-metric-value">${s.avg_days != null ? Number(s.avg_days).toFixed(1) : '-'}일</div>
        </div>
        <div class="perf-metric-card">
          <div class="perf-metric-label">팀 완료율</div>
          <div class="perf-metric-value" style="color:var(--color-primary)">${s.completion_rate != null ? Number(s.completion_rate).toFixed(0) : 0}%</div>
          <div class="progress-bar" style="margin-top:8px;"><div class="progress-fill" style="width:${s.completion_rate || 0}%"></div></div>
        </div>
      </div>

      <!-- 팀원별 성과 테이블 -->
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:20px;">
        <div style="padding:14px 16px;border-bottom:1px solid var(--color-border);font-size:13px;font-weight:600;color:var(--color-text-primary);">팀원별 성과</div>
        <table class="settings-table perf-member-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>완료 수</th>
              <th>지연 수</th>
              <th>평균 소요일</th>
              <th>포인트</th>
              <th>완료율</th>
            </tr>
          </thead>
          <tbody>
            ${members.length === 0
              ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--color-text-muted);">데이터가 없습니다</td></tr>'
              : members.map(m => `
                <tr class="perf-member-row" data-user-id="${m.user_id}" style="cursor:pointer;">
                  <td style="display:flex;align-items:center;gap:8px;">
                    ${App.avatar({ name: m.name || '-', avatar_bg: m.avatar_bg, avatar_text: m.avatar_text })}
                    ${escHtml(m.name || '-')}
                  </td>
                  <td><span style="color:var(--color-done-text);font-weight:600;">${m.done_count || 0}</span></td>
                  <td><span style="color:var(--color-warn-text);font-weight:600;">${m.overdue_count || 0}</span></td>
                  <td>${m.avg_days != null ? Number(m.avg_days).toFixed(1) : '-'}일</td>
                  <td><span class="points-badge">${m.total_points || 0}pt</span></td>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span>${m.completion_rate != null ? Number(m.completion_rate).toFixed(0) : 0}%</span>
                      <div class="progress-bar" style="flex:1;max-width:80px;"><div class="progress-fill" style="width:${m.completion_rate || 0}%"></div></div>
                    </div>
                  </td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>

      <!-- 기여도 분석 -->
      <div class="grid-2">
        <div class="card">
          <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--color-text-primary);">카테고리별 기여도</div>
          ${this._renderBarChart(contrib.byCategory || [], 'name', 'count')}
        </div>
        <div class="card">
          <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--color-text-primary);">제품별 기여도</div>
          ${this._renderBarChart(contrib.byProduct || [], 'name', 'count')}
        </div>
      </div>
    `;

    // 멤버 행 클릭 → 상세
    container.querySelectorAll('.perf-member-row').forEach(row => {
      row.addEventListener('click', () => this._showMemberDetail(row.dataset.userId));
    });
  },

  _renderBarChart(items, labelKey, valueKey) {
    if (!items || items.length === 0) {
      return '<div style="padding:20px;text-align:center;color:var(--color-text-muted);font-size:12px;">데이터가 없습니다</div>';
    }
    const max = Math.max(...items.map(i => i[valueKey] || 0), 1);
    return `<div class="perf-bar-chart">
      ${items.map(item => {
        const pct = Math.round(((item[valueKey] || 0) / max) * 100);
        return `
          <div class="perf-bar-row">
            <span class="perf-bar-label">${escHtml(item[labelKey] || '-')}</span>
            <div class="perf-bar-track"><div class="perf-bar-fill" style="width:${pct}%"></div></div>
            <span class="perf-bar-value">${item[valueKey] || 0}</span>
          </div>`;
      }).join('')}
    </div>`;
  },

  async _showMemberDetail(userId) {
    try {
      const params = this._buildDateParams();
      const res = await API.get(`/performance/user/${userId}${params}`);
      const d = res.data || {};
      const overlay = document.createElement('div');
      overlay.className = 'popover-overlay';
      overlay.innerHTML = `
        <div class="popover" style="max-width:480px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <div style="font-size:16px;font-weight:700;color:var(--color-text-primary);">${escHtml(d.name || '팀원')} 상세 성과</div>
            <button class="popover-close" id="perf-detail-close">×</button>
          </div>
          <div class="perf-metric-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px;">
            <div class="perf-metric-card"><div class="perf-metric-label">완료</div><div class="perf-metric-value" style="font-size:18px;color:var(--color-done-text)">${d.done_count || 0}</div></div>
            <div class="perf-metric-card"><div class="perf-metric-label">지연</div><div class="perf-metric-value" style="font-size:18px;color:var(--color-warn-text)">${d.overdue_count || 0}</div></div>
            <div class="perf-metric-card"><div class="perf-metric-label">포인트</div><div class="perf-metric-value" style="font-size:18px;">${d.total_points || 0}pt</div></div>
          </div>
          ${d.recent_tasks && d.recent_tasks.length > 0 ? `
            <div style="font-size:12px;font-weight:600;color:var(--color-text-muted);margin-bottom:8px;">최근 업무</div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              ${d.recent_tasks.slice(0, 10).map(t => `
                <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--color-bg-secondary);border-radius:6px;border:0.5px solid var(--color-border);">
                  ${App.statusBadge(t.status)}
                  <span style="flex:1;font-size:12px;">${escHtml(t.title)}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div style="display:flex;justify-content:flex-end;margin-top:16px;">
            <button class="btn" id="perf-detail-close-btn">닫기</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelector('#perf-detail-close')?.addEventListener('click', close);
      overlay.querySelector('#perf-detail-close-btn')?.addEventListener('click', close);
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    } catch {
      App.toast('상세 정보를 불러올 수 없습니다.', 'error');
    }
  },

  // ── 팀 목표 ──
  _renderGoals(container) {
    const goals = this._goalsData || [];
    const isAdmin = App.user?.role === 'admin';

    container.innerHTML = `
      ${isAdmin ? '<div style="margin-bottom:12px;"><button class="btn btn-primary" id="btn-add-goal">+ 목표 추가</button></div>' : ''}
      <div class="perf-goals-grid">
        ${goals.length === 0
          ? '<div class="empty-state" style="padding:40px;"><div class="empty-state-title">등록된 목표가 없습니다</div></div>'
          : goals.map(g => this._renderGoalCard(g, isAdmin)).join('')}
      </div>
    `;

    container.querySelector('#btn-add-goal')?.addEventListener('click', () => this._openGoalForm(null));

    container.querySelectorAll('.goal-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const goal = goals.find(g => String(g.id) === btn.dataset.id);
        if (goal) this._openGoalForm(goal);
      });
    });

    container.querySelectorAll('.goal-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await App.confirm('이 목표를 삭제하시겠습니까?');
        if (!ok) return;
        try {
          await API.del(`/goals/${btn.dataset.id}`);
          App.toast('목표가 삭제되었습니다.', 'success');
          this._goalsData = this._goalsData.filter(g => String(g.id) !== btn.dataset.id);
          this._renderGoals(container);
        } catch {
          App.toast('삭제 실패', 'error');
        }
      });
    });
  },

  _renderGoalCard(g, isAdmin) {
    const pct = g.target_value > 0 ? Math.min(100, Math.round((g.current_value / g.target_value) * 100)) : 0;
    const progressColor = pct >= 100 ? 'var(--color-done-text)' : pct >= 60 ? 'var(--color-primary)' : 'var(--color-warn-text)';
    return `
      <div class="goal-card">
        <div class="goal-card-header">
          <div class="goal-title">${escHtml(g.title)}</div>
          ${isAdmin ? `
            <div class="goal-actions">
              <button class="btn btn-default goal-edit-btn" data-id="${g.id}" style="font-size:11px;padding:3px 8px;">수정</button>
              <button class="btn btn-danger goal-delete-btn" data-id="${g.id}" style="font-size:11px;padding:3px 8px;">삭제</button>
            </div>
          ` : ''}
        </div>
        ${g.period ? `<div class="goal-period">${escHtml(g.period)}</div>` : ''}
        <div class="goal-progress-wrap">
          <div class="goal-progress-circle" style="--pct:${pct};--color:${progressColor}">
            <svg viewBox="0 0 36 36">
              <path class="goal-progress-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
              <path class="goal-progress-fill" stroke="${progressColor}" stroke-dasharray="${pct}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
            </svg>
            <span class="goal-progress-text">${pct}%</span>
          </div>
          <div class="goal-progress-info">
            <div class="goal-progress-values">${g.current_value || 0} / ${g.target_value || 0}</div>
            <div class="progress-bar" style="margin-top:6px;"><div class="progress-fill" style="width:${pct}%;background:${progressColor}"></div></div>
          </div>
        </div>
      </div>
    `;
  },

  _openGoalForm(goal) {
    const isEdit = !!goal;
    const html = `
      <div class="form-group">
        <label>목표명 <span style="color:var(--color-warn-text)">*</span></label>
        <input type="text" id="f-goal-title" value="${escHtml(goal?.title || '')}" placeholder="예: 월간 콘텐츠 10건 발행">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>목표값</label>
          <input type="number" id="f-goal-target" value="${goal?.target_value || ''}" min="0" placeholder="0">
        </div>
        <div class="form-group">
          <label>현재값</label>
          <input type="number" id="f-goal-current" value="${goal?.current_value || ''}" min="0" placeholder="0">
        </div>
      </div>
      <div class="form-group">
        <label>기간</label>
        <input type="text" id="f-goal-period" value="${escHtml(goal?.period || '')}" placeholder="예: 2026 Q2">
      </div>
    `;

    App.openPanel(isEdit ? '목표 수정' : '목표 추가', html, async () => {
      const data = {
        title: document.getElementById('f-goal-title').value.trim(),
        target_value: parseInt(document.getElementById('f-goal-target').value) || 0,
        current_value: parseInt(document.getElementById('f-goal-current').value) || 0,
        period: document.getElementById('f-goal-period').value.trim(),
      };
      if (!data.title) { App.toast('목표명을 입력해주세요.', 'error'); return false; }
      try {
        if (isEdit) {
          await API.put(`/goals/${goal.id}`, data);
          App.toast('목표가 수정되었습니다.', 'success');
        } else {
          await API.post('/goals', data);
          App.toast('목표가 추가되었습니다.', 'success');
        }
        const res = await API.get('/goals').catch(() => ({ data: [] }));
        this._goalsData = res.data || [];
        this._renderActiveTab();
      } catch {
        App.toast('저장 실패', 'error');
        return false;
      }
    });
  },

  // ── 피드백 ──
  _renderFeedback(container) {
    const received = this._feedbackReceived || [];
    const sent = this._feedbackSent || [];

    container.innerHTML = `
      <div style="margin-bottom:12px;"><button class="btn btn-primary" id="btn-send-feedback">피드백 보내기</button></div>

      <div class="grid-2">
        <div class="card">
          <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--color-text-primary);">받은 피드백 <span style="color:var(--color-text-muted);font-weight:400;">(${received.length})</span></div>
          ${received.length === 0
            ? '<div style="padding:20px;text-align:center;color:var(--color-text-muted);font-size:12px;">받은 피드백이 없습니다</div>'
            : received.map(f => this._renderFeedbackItem(f, 'received')).join('')}
        </div>
        <div class="card">
          <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--color-text-primary);">보낸 피드백 <span style="color:var(--color-text-muted);font-weight:400;">(${sent.length})</span></div>
          ${sent.length === 0
            ? '<div style="padding:20px;text-align:center;color:var(--color-text-muted);font-size:12px;">보낸 피드백이 없습니다</div>'
            : sent.map(f => this._renderFeedbackItem(f, 'sent')).join('')}
        </div>
      </div>
    `;

    container.querySelector('#btn-send-feedback')?.addEventListener('click', () => this._openFeedbackModal());
  },

  _renderFeedbackItem(f, type) {
    const name = type === 'received' ? (f.from_name || '-') : (f.to_name || '-');
    const label = type === 'received' ? 'From' : 'To';
    const timeAgo = f.created_at ? new Date(f.created_at).toLocaleDateString('ko-KR') : '';
    return `
      <div class="feedback-card">
        <div class="feedback-header">
          <span class="feedback-from">${label}: ${escHtml(name)}</span>
          ${f.is_private ? '<span class="feedback-private-badge">비공개</span>' : ''}
          <span class="feedback-time">${timeAgo}</span>
        </div>
        <div class="feedback-body">${escHtml(f.content)}</div>
      </div>
    `;
  },

  _openFeedbackModal() {
    const html = `
      <div class="form-group">
        <label>대상자 <span style="color:var(--color-warn-text)">*</span></label>
        <select id="f-fb-target">${App.userOptions('')}</select>
      </div>
      <div class="form-group">
        <label>내용 <span style="color:var(--color-warn-text)">*</span></label>
        <textarea id="f-fb-content" rows="5" placeholder="피드백 내용을 입력하세요..."></textarea>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="f-fb-private" style="width:auto;height:auto;">
          비공개
        </label>
      </div>
    `;

    App.openPanel('피드백 보내기', html, async () => {
      const to_user_id = document.getElementById('f-fb-target').value;
      const content = document.getElementById('f-fb-content').value.trim();
      const is_private = document.getElementById('f-fb-private').checked;
      if (!to_user_id || !content) { App.toast('대상자와 내용을 입력해주세요.', 'error'); return false; }
      try {
        await API.post('/feedbacks', { to_user_id, content, is_private });
        App.toast('피드백이 전송되었습니다.', 'success');
        // 새로고침
        const [recvRes, sentRes] = await Promise.all([
          API.get('/feedbacks/received').catch(() => ({ data: [] })),
          API.get('/feedbacks/sent').catch(() => ({ data: [] })),
        ]);
        this._feedbackReceived = recvRes.data || [];
        this._feedbackSent = sentRes.data || [];
        this._renderActiveTab();
      } catch {
        App.toast('전송 실패', 'error');
        return false;
      }
    });
  },

  // ── 리포트 내보내기 ──
  _showExportModal() {
    const overlay = document.createElement('div');
    overlay.className = 'popover-overlay';
    overlay.innerHTML = `
      <div class="popover" style="max-width:360px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="font-size:16px;font-weight:700;color:var(--color-text-primary);">리포트 내보내기</div>
          <button class="popover-close" id="export-close">×</button>
        </div>
        <div class="form-group">
          <label>기간</label>
          <select id="export-period" style="width:100%;background:var(--color-bg-secondary);color:var(--color-text-primary);border:0.5px solid var(--color-border);border-radius:8px;padding:8px 12px;font-size:13px;">
            <option value="week">주간</option>
            <option value="month" selected>월간</option>
            <option value="quarter">분기</option>
          </select>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
          <button class="btn" id="export-cancel">취소</button>
          <button class="btn btn-primary" id="export-download">다운로드</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#export-close')?.addEventListener('click', close);
    overlay.querySelector('#export-cancel')?.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#export-download')?.addEventListener('click', () => {
      const period = overlay.querySelector('#export-period').value;
      window.open(`${API.BASE}/performance/report/export?period=${period}`, '_blank');
      close();
    });
  },
};
