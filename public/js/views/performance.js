// 성과 관리 뷰 — 팀 성과, 목표, 피드백, 리포트
const PerformanceView = {
  activeTab: 'overview',
  periodFilter: 'month', // week | month | quarter | custom
  customFrom: '',
  customTo: '',
  _teamData: null,
  _goalsData: null,
  _feedbackData: null,
  _scoresData: null,
  _meetingsData: null,
  _alertsData: null,
  _scorePeriod: 'month', // month | quarter

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
    // /performance/team returns flat array of user rows; transform to expected structure
    const teamRows = Array.isArray(teamRes.data) ? teamRes.data : [];
    const totalDone = teamRows.reduce((s, r) => s + (parseInt(r.completed) || 0), 0);
    const totalDelayed = teamRows.reduce((s, r) => s + (parseInt(r.delayed) || 0), 0);
    const totalAll = teamRows.reduce((s, r) => s + (parseInt(r.total) || 0), 0);
    const totalPoints = teamRows.reduce((s, r) => s + (parseInt(r.total_points) || 0), 0);
    const avgCompletionRate = totalAll > 0 ? Math.round((totalDone / totalAll) * 1000) / 10 : 0;
    this._teamData = {
      summary: {
        total_done: totalDone,
        total_overdue: totalDelayed,
        total_points: totalPoints,
        completion_rate: avgCompletionRate,
        avg_days: null,
        in_progress: 0,
      },
      members: teamRows.map(r => ({
        user_id: r.id,
        name: r.name,
        avatar_bg: r.avatar_bg,
        avatar_text: r.avatar_text,
        done_count: parseInt(r.completed) || 0,
        overdue_count: parseInt(r.delayed) || 0,
        total_points: parseInt(r.total_points) || 0,
        completion_rate: parseFloat(r.completion_rate) || 0,
        avg_days: null,
      })),
      contribution: { byCategory: [], byProduct: [] },
    };
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
    const isAdmin = App.user?.role === 'admin';
    const tabs = [
      { key: 'overview', label: '팀 현황' },
      { key: 'goals', label: '팀 목표' },
      { key: 'feedback', label: '피드백' },
    ];
    if (isAdmin) {
      tabs.push({ key: 'scores', label: '성과 스코어' });
      tabs.push({ key: 'meetings', label: '면담 기록' });
      tabs.push({ key: 'alerts', label: '경고 현황' });
    }

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
      case 'scores': this._renderScores(container); break;
      case 'meetings': this._renderMeetings(container); break;
      case 'alerts': this._renderAlerts(container); break;
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
          <div class="perf-metric-label">총 포인트</div>
          <div class="perf-metric-value"><span class="points-badge" style="font-size:18px;">${s.total_points || 0}pt</span></div>
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
      const stats = d.stats || {};
      const monthlyTrend = d.monthly_trend || [];
      const byCategory = d.by_category || [];
      const overlay = document.createElement('div');
      overlay.className = 'popover-overlay';
      overlay.innerHTML = `
        <div class="popover" style="max-width:520px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <div style="font-size:16px;font-weight:700;color:var(--color-text-primary);">개인 상세 성과</div>
            <button class="popover-close" id="perf-detail-close">×</button>
          </div>
          <div class="perf-metric-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
            <div class="perf-metric-card"><div class="perf-metric-label">완료</div><div class="perf-metric-value" style="font-size:18px;color:var(--color-done-text)">${stats.completed || 0}</div></div>
            <div class="perf-metric-card"><div class="perf-metric-label">지연</div><div class="perf-metric-value" style="font-size:18px;color:var(--color-warn-text)">${stats.delayed || 0}</div></div>
            <div class="perf-metric-card"><div class="perf-metric-label">포인트</div><div class="perf-metric-value" style="font-size:18px;">${stats.total_points || 0}pt</div></div>
            <div class="perf-metric-card"><div class="perf-metric-label">완료율</div><div class="perf-metric-value" style="font-size:18px;color:var(--color-primary)">${stats.completion_rate != null ? Number(stats.completion_rate).toFixed(0) : 0}%</div></div>
          </div>
          <div class="perf-metric-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px;">
            <div class="perf-metric-card"><div class="perf-metric-label">진행 중</div><div class="perf-metric-value" style="font-size:16px;">${stats.in_progress || 0}</div></div>
            <div class="perf-metric-card"><div class="perf-metric-label">할 일</div><div class="perf-metric-value" style="font-size:16px;">${stats.todo || 0}</div></div>
            <div class="perf-metric-card"><div class="perf-metric-label">평균 소요일</div><div class="perf-metric-value" style="font-size:16px;">${stats.avg_completion_days != null ? Number(stats.avg_completion_days).toFixed(1) : '-'}일</div></div>
          </div>
          ${byCategory.length > 0 ? `
            <div style="font-size:12px;font-weight:600;color:var(--color-text-muted);margin-bottom:8px;">카테고리별 업무</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
              ${byCategory.map(c => `
                <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--color-bg-secondary);border-radius:6px;border:0.5px solid var(--color-border);font-size:12px;">
                  ${escHtml(c.category_name)} <strong>${c.count}</strong>
                </span>
              `).join('')}
            </div>
          ` : ''}
          ${monthlyTrend.length > 0 ? `
            <div style="font-size:12px;font-weight:600;color:var(--color-text-muted);margin-bottom:8px;">월별 완료 추이</div>
            <div style="display:flex;align-items:flex-end;gap:6px;height:60px;margin-bottom:8px;">
              ${(() => {
                const maxV = Math.max(...monthlyTrend.map(m => m.completed || 0), 1);
                return monthlyTrend.map(m => {
                  const pct = Math.round(((m.completed || 0) / maxV) * 100);
                  return '<div style="display:flex;flex-direction:column;align-items:center;flex:1;gap:2px;">' +
                    '<span style="font-size:10px;font-weight:600;color:var(--color-text-primary);">' + (m.completed || 0) + '</span>' +
                    '<div style="width:100%;max-width:32px;height:' + Math.max(pct, 4) + '%;background:var(--color-primary);border-radius:4px;"></div>' +
                    '<span style="font-size:9px;color:var(--color-text-hint);">' + escHtml((m.month || '').slice(5)) + '</span>' +
                    '</div>';
                }).join('');
              })()}
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
        <label>기간 유형</label>
        <select id="f-goal-period">
          <option value="monthly" ${goal?.period === 'monthly' ? 'selected' : ''}>월간</option>
          <option value="quarterly" ${goal?.period === 'quarterly' ? 'selected' : ''}>분기</option>
          <option value="yearly" ${goal?.period === 'yearly' ? 'selected' : ''}>연간</option>
          <option value="weekly" ${goal?.period === 'weekly' ? 'selected' : ''}>주간</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>시작일 *</label>
          <input type="date" id="f-goal-start" value="${goal?.start_date?.slice(0,10) || ''}">
        </div>
        <div class="form-group">
          <label>종료일 *</label>
          <input type="date" id="f-goal-end" value="${goal?.end_date?.slice(0,10) || ''}">
        </div>
      </div>
    `;

    App.openPanel(isEdit ? '목표 수정' : '목표 추가', html, async () => {
      const data = {
        title: document.getElementById('f-goal-title').value.trim(),
        target_value: parseInt(document.getElementById('f-goal-target').value) || 0,
        current_value: parseInt(document.getElementById('f-goal-current').value) || 0,
        period: document.getElementById('f-goal-period').value,
        start_date: document.getElementById('f-goal-start').value || null,
        end_date: document.getElementById('f-goal-end').value || null,
      };
      if (!data.title) { App.toast('목표명을 입력해주세요.', 'error'); return false; }
      if (!data.start_date || !data.end_date) { App.toast('시작일과 종료일을 입력해주세요.', 'error'); return false; }
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
    const name = type === 'received' ? (f.from_user_name || '-') : (f.to_user_name || '-');
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

  // ── 성과 스코어 (관리자 전용) ──
  async _renderScores(container) {
    container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>성과 스코어 불러오는 중...</span></div>';
    try {
      const period = this._scorePeriod;
      const res = await API.get(`/performance/scores?period=${period}`);
      this._scoresData = res.data || [];
    } catch {
      this._scoresData = [];
    }

    const scores = this._scoresData;
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:12px;color:var(--color-text-muted);font-weight:600;">기간:</span>
          <button class="filter-btn score-period-btn ${this._scorePeriod === 'month' ? 'active' : ''}" data-sp="month">월간</button>
          <button class="filter-btn score-period-btn ${this._scorePeriod === 'quarter' ? 'active' : ''}" data-sp="quarter">분기별</button>
        </div>
        <button class="btn btn-primary" id="btn-generate-scores">성과 산정</button>
      </div>

      <div class="card" style="padding:0;overflow:hidden;">
        <table class="score-table">
          <thead>
            <tr>
              <th>팀원</th>
              <th>완료</th>
              <th>지연</th>
              <th>완료율</th>
              <th>지연율</th>
              <th>평균소요일</th>
              <th>포인트</th>
              <th>등급</th>
            </tr>
          </thead>
          <tbody>
            ${scores.length === 0
              ? '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--color-text-muted);">데이터가 없습니다</td></tr>'
              : scores.map(s => {
                const gradeClass = (s.grade || 'c').toLowerCase();
                const completionRate = s.completion_rate != null ? Number(s.completion_rate).toFixed(0) : 0;
                const delayRate = s.delay_rate != null ? Number(s.delay_rate).toFixed(0) : 0;
                return `
                  <tr class="score-row" data-user-id="${s.user_id}">
                    <td style="display:flex;align-items:center;gap:8px;">
                      ${App.avatar({ name: s.user_name || '-', avatar_bg: s.avatar_bg, avatar_text: s.avatar_text })}
                      ${escHtml(s.user_name || '-')}
                    </td>
                    <td><span style="color:var(--color-done-text);font-weight:600;">${s.total_completed || 0}</span></td>
                    <td><span style="color:var(--color-warn-text);font-weight:600;">${s.total_delayed || 0}</span></td>
                    <td>${completionRate}%</td>
                    <td>${delayRate}%</td>
                    <td>${s.avg_days != null ? Number(s.avg_days).toFixed(1) : '-'}일</td>
                    <td><span class="points-badge">${s.total_points || 0}pt</span></td>
                    <td><span class="grade-badge grade-badge-${gradeClass}">${(s.grade || '-').toUpperCase()}</span></td>
                  </tr>
                `;
              }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // 기간 전환
    container.querySelectorAll('.score-period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._scorePeriod = btn.dataset.sp;
        this._renderScores(container);
      });
    });

    // 성과 산정 버튼
    container.querySelector('#btn-generate-scores')?.addEventListener('click', async () => {
      try {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        const period = this._scorePeriod === 'quarter' ? 'quarterly' : 'monthly';
        await API.post(`/performance/scores/generate?period=${period}&date=${dateStr}`, {});
        App.toast('성과가 산정되었습니다.', 'success');
        this._renderScores(container);
      } catch {
        App.toast('성과 산정에 실패했습니다.', 'error');
      }
    });

    // 행 클릭 → 트렌드 차트
    container.querySelectorAll('.score-row').forEach(row => {
      row.addEventListener('click', () => this._showTrendChart(row.dataset.userId));
    });
  },

  // 개인 트렌드 차트 모달
  async _showTrendChart(userId) {
    let trendData;
    try {
      const res = await API.get(`/performance/scores/trend/${userId}`);
      // Backend returns flat array of score records; transform to expected structure
      const rawScores = Array.isArray(res.data) ? res.data : [];
      const months = rawScores.map(s => ({
        month: s.period_start ? s.period_start.slice(0, 7) : '',
        completion_rate: parseFloat(s.completion_rate) || 0,
        done_count: parseInt(s.total_completed) || 0,
        overdue_count: parseInt(s.total_delayed) || 0,
      }));
      const currentGrade = rawScores.length > 0 ? (rawScores[rawScores.length - 1].grade || '-') : '-';
      const prevGrade = rawScores.length > 1 ? (rawScores[rawScores.length - 2].grade || '-') : '-';
      const userName = this._scoresData?.find(s => String(s.user_id) === String(userId))?.user_name || '팀원';
      trendData = { months, current_grade: currentGrade, previous_grade: prevGrade, name: userName };
    } catch {
      App.toast('트렌드 데이터를 불러올 수 없습니다.', 'error');
      return;
    }

    const months = trendData.months || [];
    const currentGrade = trendData.current_grade || '-';
    const prevGrade = trendData.previous_grade || '-';
    const gradeClass = (currentGrade || 'c').toLowerCase();

    // 등급 변화 화살표
    const gradeOrder = { A: 4, B: 3, C: 2, D: 1 };
    const cur = gradeOrder[currentGrade.toUpperCase()] || 0;
    const prev = gradeOrder[prevGrade.toUpperCase()] || 0;
    let arrow = '';
    if (cur > prev && prev > 0) arrow = '<span style="color:var(--color-done-text);font-weight:700;margin-left:6px;">&#9650;</span>';
    else if (cur < prev && prev > 0) arrow = '<span style="color:var(--color-warn-text);font-weight:700;margin-left:6px;">&#9660;</span>';
    else arrow = '<span style="color:var(--color-text-muted);margin-left:6px;">&#8211;</span>';

    // SVG 라인 차트 (완료율 트렌드)
    const lineChartSvg = this._buildLineChart(months);
    // SVG 바 차트 (완료 vs 지연)
    const barChartSvg = this._buildBarChart(months);

    const overlay = document.createElement('div');
    overlay.className = 'popover-overlay';
    overlay.innerHTML = `
      <div class="popover" style="max-width:560px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="font-size:16px;font-weight:700;color:var(--color-text-primary);">${escHtml(trendData.name || '팀원')} 트렌드</div>
          <button class="popover-close" id="trend-close">×</button>
        </div>

        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <span style="font-size:13px;color:var(--color-text-muted);">현재 등급:</span>
          <span class="grade-badge grade-badge-${gradeClass}" style="font-size:14px;padding:4px 14px;">${currentGrade.toUpperCase()}</span>
          ${arrow}
        </div>

        <div class="trend-chart">
          <div class="trend-chart-title">완료율 트렌드 (최근 6개월)</div>
          ${lineChartSvg}
        </div>

        <div class="trend-chart">
          <div class="trend-chart-title">완료 vs 지연 (월별)</div>
          ${barChartSvg}
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:16px;">
          <button class="btn" id="trend-close-btn">닫기</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#trend-close')?.addEventListener('click', close);
    overlay.querySelector('#trend-close-btn')?.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  },

  _buildLineChart(months) {
    if (!months.length) return '<div style="padding:20px;text-align:center;color:var(--color-text-muted);font-size:12px;">데이터 없음</div>';
    const w = 480, h = 140, px = 40, py = 20;
    const maxRate = 100;
    const points = months.map((m, i) => {
      const x = px + (i / Math.max(months.length - 1, 1)) * (w - px * 2);
      const rate = m.completion_rate != null ? Number(m.completion_rate) : 0;
      const y = py + (1 - rate / maxRate) * (h - py * 2);
      return { x, y, rate, label: m.month || '' };
    });
    const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" style="overflow:visible;">
      <!-- 그리드 라인 -->
      ${[0, 25, 50, 75, 100].map(v => {
        const y = py + (1 - v / maxRate) * (h - py * 2);
        return `<line x1="${px}" y1="${y}" x2="${w - px}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
                <text x="${px - 6}" y="${y + 4}" text-anchor="end" fill="var(--color-text-hint)" font-size="10">${v}%</text>`;
      }).join('')}
      <!-- 라인 -->
      <polyline points="${polyline}" fill="none" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- 포인트 + 라벨 -->
      ${points.map(p => `
        <circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--color-primary)" stroke="var(--color-bg-secondary)" stroke-width="2"/>
        <text x="${p.x}" y="${h - 2}" text-anchor="middle" fill="var(--color-text-hint)" font-size="10">${escHtml(p.label)}</text>
      `).join('')}
    </svg>`;
  },

  _buildBarChart(months) {
    if (!months.length) return '<div style="padding:20px;text-align:center;color:var(--color-text-muted);font-size:12px;">데이터 없음</div>';
    const w = 480, h = 140, px = 40, py = 20;
    const maxVal = Math.max(...months.map(m => Math.max(m.done_count || 0, m.overdue_count || 0)), 1);
    const barW = Math.max(12, ((w - px * 2) / months.length - 12) / 2);
    const innerH = h - py * 2;

    return `<svg viewBox="0 0 ${w} ${h}" style="overflow:visible;">
      ${months.map((m, i) => {
        const cx = px + (i + 0.5) / months.length * (w - px * 2);
        const doneH = ((m.done_count || 0) / maxVal) * innerH;
        const overdueH = ((m.overdue_count || 0) / maxVal) * innerH;
        return `
          <rect x="${cx - barW - 1}" y="${py + innerH - doneH}" width="${barW}" height="${doneH}" rx="3" fill="var(--color-done-text)" opacity="0.7"/>
          <rect x="${cx + 1}" y="${py + innerH - overdueH}" width="${barW}" height="${overdueH}" rx="3" fill="var(--color-warn-text)" opacity="0.7"/>
          <text x="${cx}" y="${h - 2}" text-anchor="middle" fill="var(--color-text-hint)" font-size="10">${escHtml(m.month || '')}</text>
        `;
      }).join('')}
      <!-- 범례 -->
      <rect x="${w - px - 100}" y="2" width="10" height="10" rx="2" fill="var(--color-done-text)" opacity="0.7"/>
      <text x="${w - px - 86}" y="11" fill="var(--color-text-muted)" font-size="10">완료</text>
      <rect x="${w - px - 50}" y="2" width="10" height="10" rx="2" fill="var(--color-warn-text)" opacity="0.7"/>
      <text x="${w - px - 36}" y="11" fill="var(--color-text-muted)" font-size="10">지연</text>
    </svg>`;
  },

  // ── 면담 기록 (관리자 전용) ──
  async _renderMeetings(container) {
    container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>면담 기록 불러오는 중...</span></div>';
    try {
      // 각 활성 유저별 면담 로드
      const allMeetings = [];
      const userFetches = App.users.filter(u => u.is_active !== false).map(async u => {
        try {
          const res = await API.get(`/meetings/user/${u.id}`);
          (res.data || []).forEach(m => allMeetings.push(m));
        } catch {}
      });
      await Promise.all(userFetches);
      this._meetingsData = allMeetings.sort((a, b) => (b.meeting_date || '').localeCompare(a.meeting_date || ''));
    } catch {
      this._meetingsData = [];
    }

    const meetings = this._meetingsData;
    // 팀원별 그룹화
    const grouped = {};
    meetings.forEach(m => {
      const key = m.user_id || 'unknown';
      if (!grouped[key]) grouped[key] = { name: m.user_name || '-', avatar_bg: null, avatar_text: null, items: [] };
      grouped[key].items.push(m);
    });

    const today = new Date().toISOString().slice(0, 10);

    container.innerHTML = `
      <div style="margin-bottom:14px;">
        <button class="btn btn-primary" id="btn-add-meeting">면담 추가</button>
      </div>

      ${Object.keys(grouped).length === 0
        ? '<div class="empty-state" style="padding:40px;"><div class="empty-state-title">면담 기록이 없습니다</div></div>'
        : Object.entries(grouped).map(([userId, group]) => `
          <div style="margin-bottom:24px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              ${App.avatar({ name: group.name, avatar_bg: group.avatar_bg, avatar_text: group.avatar_text })}
              <span style="font-size:14px;font-weight:600;color:var(--color-text-primary);">${escHtml(group.name)}</span>
              <span style="font-size:12px;color:var(--color-text-muted);">(${group.items.length}건)</span>
            </div>
            ${group.items.map(m => {
              const isUpcoming = m.next_meeting && m.next_meeting >= today;
              return `
                <div class="meeting-card" data-meeting-id="${m.id}">
                  <div class="meeting-card-header">
                    <div class="meeting-card-date">
                      ${escHtml(m.meeting_date ? m.meeting_date.slice(0, 10) : '')}
                      ${isUpcoming ? `<span class="upcoming-badge" style="margin-left:8px;">다음 면담 ${escHtml(m.next_meeting ? m.next_meeting.slice(0, 10) : '')}</span>` : ''}
                    </div>
                    <div class="meeting-card-actions">
                      <button class="btn btn-default meeting-edit-btn" data-id="${m.id}" style="font-size:11px;padding:3px 8px;">수정</button>
                      <button class="btn btn-danger meeting-delete-btn" data-id="${m.id}" style="font-size:11px;padding:3px 8px;">삭제</button>
                    </div>
                  </div>
                  <div class="meeting-card-summary">${escHtml(m.summary || '')}</div>
                  ${m.action_items ? `<div class="meeting-card-actions-list"><strong style="color:var(--color-text-primary);">액션 아이템:</strong> ${escHtml(m.action_items)}</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `).join('')}
    `;

    // 면담 추가
    container.querySelector('#btn-add-meeting')?.addEventListener('click', () => this._openMeetingForm(null));

    // 수정
    container.querySelectorAll('.meeting-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const meeting = meetings.find(m => String(m.id) === btn.dataset.id);
        if (meeting) this._openMeetingForm(meeting);
      });
    });

    // 삭제
    container.querySelectorAll('.meeting-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await App.confirm('이 면담 기록을 삭제하시겠습니까?');
        if (!ok) return;
        try {
          await API.del(`/meetings/${btn.dataset.id}`);
          App.toast('면담 기록이 삭제되었습니다.', 'success');
          this._renderMeetings(container);
        } catch {
          App.toast('삭제 실패', 'error');
        }
      });
    });
  },

  _openMeetingForm(meeting) {
    const isEdit = !!meeting;
    const html = `
      <div class="form-group">
        <label>대상자 <span style="color:var(--color-warn-text)">*</span></label>
        <select id="f-mt-target">${App.userOptions(meeting?.user_id || '')}</select>
      </div>
      <div class="form-group">
        <label>면담일 <span style="color:var(--color-warn-text)">*</span></label>
        <input type="date" id="f-mt-date" value="${meeting?.meeting_date?.slice(0,10) || new Date().toISOString().slice(0, 10)}">
      </div>
      <div class="form-group">
        <label>면담 내용 <span style="color:var(--color-warn-text)">*</span></label>
        <textarea id="f-mt-content" rows="5" placeholder="면담 내용을 입력하세요...">${escHtml(meeting?.summary || '')}</textarea>
      </div>
      <div class="form-group">
        <label>액션 아이템</label>
        <textarea id="f-mt-actions" rows="3" placeholder="액션 아이템을 입력하세요...">${escHtml(meeting?.action_items || '')}</textarea>
      </div>
      <div class="form-group">
        <label>다음 면담일</label>
        <input type="date" id="f-mt-next" value="${meeting?.next_meeting?.slice(0,10) || ''}">
      </div>
    `;

    App.openPanel(isEdit ? '면담 수정' : '면담 추가', html, async () => {
      const data = {
        user_id: document.getElementById('f-mt-target').value,
        meeting_date: document.getElementById('f-mt-date').value,
        summary: document.getElementById('f-mt-content').value.trim(),
        action_items: document.getElementById('f-mt-actions').value.trim(),
        next_meeting: document.getElementById('f-mt-next').value || null,
      };
      if (!data.user_id || !data.meeting_date || !data.summary) {
        App.toast('대상자, 면담일, 면담 내용을 입력해주세요.', 'error');
        return false;
      }
      try {
        if (isEdit) {
          await API.put(`/meetings/${meeting.id}`, data);
          App.toast('면담이 수정되었습니다.', 'success');
        } else {
          await API.post('/meetings', data);
          App.toast('면담이 추가되었습니다.', 'success');
        }
        this._renderActiveTab();
      } catch {
        App.toast('저장 실패', 'error');
        return false;
      }
    });
  },

  // ── 경고 현황 (관리자 전용) ──
  async _renderAlerts(container) {
    container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>경고 현황 불러오는 중...</span></div>';
    try {
      const res = await API.get('/performance/alerts');
      this._alertsData = res.data || [];
    } catch {
      this._alertsData = [];
    }

    const alerts = this._alertsData;
    const active = alerts.filter(a => !a.resolved_at);
    const resolved = alerts.filter(a => a.resolved_at);

    container.innerHTML = `
      ${active.length === 0 && resolved.length === 0
        ? '<div class="empty-state" style="padding:40px;"><div class="empty-state-title">경고가 없습니다</div></div>'
        : `
          ${active.length > 0 ? `
            <div style="font-size:12px;font-weight:600;color:var(--color-text-muted);margin-bottom:10px;">활성 경고 (${active.length})</div>
            ${active.map(a => this._renderAlertItem(a, false)).join('')}
          ` : '<div style="padding:16px 0;color:var(--color-text-muted);font-size:13px;">활성 경고가 없습니다.</div>'}

          ${resolved.length > 0 ? `
            <div class="collapsible-header" id="resolved-toggle" style="margin-top:20px;">
              <span class="collapsible-arrow">&#9654;</span>
              해결된 경고 (${resolved.length})
            </div>
            <div id="resolved-section" style="display:none;">
              ${resolved.map(a => this._renderAlertItem(a, true)).join('')}
            </div>
          ` : ''}
        `}
    `;

    // 해결 버튼
    container.querySelectorAll('.alert-resolve-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await API.patch(`/performance/alerts/${btn.dataset.id}/resolve`, {});
          App.toast('경고가 해결 처리되었습니다.', 'success');
          this._renderAlerts(container);
          // 사이드바 뱃지 갱신
          this._updateAlertBadge();
        } catch {
          App.toast('처리 실패', 'error');
        }
      });
    });

    // 접기/펼치기
    container.querySelector('#resolved-toggle')?.addEventListener('click', () => {
      const section = container.querySelector('#resolved-section');
      const toggle = container.querySelector('#resolved-toggle');
      if (!section) return;
      const isOpen = section.style.display !== 'none';
      section.style.display = isOpen ? 'none' : 'block';
      toggle.classList.toggle('open', !isOpen);
    });
  },

  _renderAlertItem(a, isResolved) {
    return `
      <div class="alert-item ${isResolved ? 'alert-resolved' : ''}">
        ${App.avatar({ name: a.user_name || '-', avatar_bg: a.avatar_bg, avatar_text: a.avatar_text })}
        <div class="alert-item-info">
          <div class="alert-item-type">${escHtml(a.alert_type || '경고')}</div>
          <div class="alert-item-message">${escHtml(a.message || '')}</div>
        </div>
        <div class="alert-item-date">${a.created_at ? new Date(a.created_at).toLocaleDateString('ko-KR') : ''}</div>
        ${!isResolved ? `<button class="btn btn-default alert-resolve-btn" data-id="${a.id}" style="font-size:11px;padding:3px 10px;flex-shrink:0;">해결</button>` : ''}
      </div>
    `;
  },

  // 사이드바 경고 뱃지 갱신
  async _updateAlertBadge() {
    if (App.user?.role !== 'admin') return;
    try {
      const res = await API.get('/performance/alerts');
      const alerts = res.data || [];
      const unresolvedCount = alerts.filter(a => !a.resolved_at).length;
      const navItem = document.querySelector('.nav-item[data-view="performance"]');
      if (!navItem) return;
      let badge = navItem.querySelector('.nav-alert-badge');
      if (unresolvedCount > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'nav-alert-badge';
          navItem.appendChild(badge);
        }
        badge.textContent = unresolvedCount > 99 ? '99+' : unresolvedCount;
      } else if (badge) {
        badge.remove();
      }
    } catch {}
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
