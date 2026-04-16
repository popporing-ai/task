// 평가 관리 뷰 (관리자 전용)
// 네 개 탭: 월간 평가 / 반기 리포트 / 지연 체감 / 업무 분포
const EvaluationView = {
  activeTab: 'monthly',
  selectedYear: new Date().getFullYear(),
  selectedPeriod: 'H1', // H1 | H2
  selectedUserId: null,
  _monthlyCache: {},    // { userId_year: [evals] }
  _semiAnnualCache: null,
  _delayData: null,
  _distributionData: null,

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');

    // 관리자 확인
    if (!App.user || App.user.role !== 'admin') {
      content.innerHTML = `<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">관리자만 접근할 수 있습니다</div></div>`;
      actions.innerHTML = '';
      return;
    }

    actions.innerHTML = '';
    content.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>평가 데이터 불러오는 중...</span></div>';

    // 기본 선택 사용자: 첫 번째 활성 사용자
    if (!this.selectedUserId) {
      const u = (App.users || []).find(u => u.is_active !== false);
      if (u) this.selectedUserId = u.id;
    }

    // 반기 기본값: 현재 월에 따라 자동 설정
    const now = new Date();
    this.selectedPeriod = now.getMonth() < 6 ? 'H1' : 'H2';

    this._renderMain();
  },

  _renderMain() {
    const content = document.getElementById('content');
    const tabs = [
      { key: 'monthly',      label: '월간 평가' },
      { key: 'semiAnnual',   label: '반기 리포트' },
      { key: 'delay',        label: '지연 체감' },
      { key: 'distribution', label: '업무 분포' },
    ];

    const tabsHtml = `
      <div class="eval-tabs">
        ${tabs.map(t => `
          <button class="eval-tab ${this.activeTab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>
        `).join('')}
      </div>
    `;

    content.innerHTML = `
      ${tabsHtml}
      <div id="eval-body" class="eval-body"></div>
    `;

    content.querySelectorAll('.eval-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this._renderMain();
      });
    });

    this._renderActiveTab();
  },

  async _renderActiveTab() {
    const body = document.getElementById('eval-body');
    if (!body) return;
    body.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>불러오는 중...</span></div>';

    try {
      if (this.activeTab === 'monthly') await this._renderMonthly(body);
      else if (this.activeTab === 'semiAnnual') await this._renderSemiAnnual(body);
      else if (this.activeTab === 'delay') await this._renderDelay(body);
      else if (this.activeTab === 'distribution') await this._renderDistribution(body);
    } catch (e) {
      body.innerHTML = `<div class="empty-state"><span class="empty-state-icon">⚠</span><div class="empty-state-title">데이터를 불러올 수 없습니다</div><div class="empty-state-sub">${escHtml(e.message || '')}</div></div>`;
    }
  },

  // =============================================================
  // 탭 a: 월간 평가 — 팀원 × 월 그리드
  // =============================================================
  async _renderMonthly(body) {
    const year = this.selectedYear;
    const users = (App.users || []).filter(u => u.is_active !== false);

    // 모든 사용자 월간 평가 병렬 로드
    const evalsPromises = users.map(u =>
      API.get(`/evaluations/monthly/user/${u.id}?year=${year}`)
        .then(r => ({ userId: u.id, rows: r.data || [] }))
        .catch(() => ({ userId: u.id, rows: [] }))
    );
    const allEvals = await Promise.all(evalsPromises);
    const byUser = {};
    for (const e of allEvals) byUser[e.userId] = e.rows;

    // 월 헤더 (1~12)
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    const yearOptions = Array.from({ length: 5 }, (_, i) => year - 2 + i);

    const headerHtml = `
      <div class="eval-toolbar">
        <label style="font-size:12px;color:var(--color-text-muted);">연도:</label>
        <select id="eval-year" style="width:auto;padding:4px 8px;">
          ${yearOptions.map(y => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}년</option>`).join('')}
        </select>
        <div style="margin-left:auto;font-size:12px;color:var(--color-text-muted);">셀 클릭 → 평가 입력/수정</div>
      </div>
    `;

    const scoreKeys = ['score_timeliness', 'score_quality', 'score_collaboration', 'score_initiative', 'score_growth'];

    // 월별 평균 계산 및 그리드 렌더
    const rowsHtml = users.map(u => {
      const evals = byUser[u.id] || [];
      const evalByMonth = {};
      for (const ev of evals) {
        if (!ev.eval_month) continue;
        const m = new Date(ev.eval_month).getMonth() + 1;
        evalByMonth[m] = ev;
      }

      // 연간 평균
      const allScores = [];
      for (const ev of evals) {
        for (const k of scoreKeys) {
          if (ev[k] != null) allScores.push(ev[k]);
        }
      }
      const avg = allScores.length > 0
        ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1)
        : '-';

      const cells = months.map(m => {
        const ev = evalByMonth[m];
        if (!ev) {
          return `<td class="eval-cell eval-cell-empty" data-user-id="${u.id}" data-month="${m}" title="평가 없음"><span class="eval-cell-plus">+</span></td>`;
        }
        const scores = scoreKeys.map(k => ev[k]).filter(s => s != null);
        const monthAvg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        const avgColor = monthAvg == null ? 'var(--color-text-muted)'
          : monthAvg >= 4 ? 'var(--color-done-text)'
          : monthAvg >= 3 ? 'var(--color-primary)'
          : 'var(--color-warn-text)';
        return `<td class="eval-cell eval-cell-filled" data-user-id="${u.id}" data-month="${m}">
          <span class="eval-cell-score" style="color:${avgColor}">${monthAvg != null ? monthAvg.toFixed(1) : '-'}</span>
        </td>`;
      }).join('');

      return `
        <tr>
          <td class="eval-user-cell">
            ${App.avatar({ name: u.name, avatar_bg: u.avatar_bg, avatar_text: u.avatar_text, avatar_url: u.avatar_url })}
            <span>${escHtml(u.name)}</span>
          </td>
          ${cells}
          <td class="eval-avg-cell"><strong>${avg}</strong></td>
        </tr>
      `;
    }).join('');

    body.innerHTML = headerHtml + `
      <div class="eval-grid-wrap">
        <table class="eval-grid">
          <thead>
            <tr>
              <th class="eval-user-header">팀원</th>
              ${months.map(m => `<th>${m}월</th>`).join('')}
              <th>연평균</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div class="eval-legend">
        <span class="eval-legend-item"><span class="eval-legend-dot" style="background:var(--color-done-text)"></span>4.0 이상</span>
        <span class="eval-legend-item"><span class="eval-legend-dot" style="background:var(--color-primary)"></span>3.0~3.9</span>
        <span class="eval-legend-item"><span class="eval-legend-dot" style="background:var(--color-warn-text)"></span>3.0 미만</span>
      </div>
    `;

    document.getElementById('eval-year').addEventListener('change', (e) => {
      this.selectedYear = parseInt(e.target.value);
      this._renderActiveTab();
    });

    body.querySelectorAll('.eval-cell[data-user-id]').forEach(cell => {
      cell.addEventListener('click', () => {
        const userId = parseInt(cell.dataset.userId);
        const month = parseInt(cell.dataset.month);
        const existing = (byUser[userId] || []).find(ev => {
          if (!ev.eval_month) return false;
          return new Date(ev.eval_month).getMonth() + 1 === month;
        });
        this._openMonthlyForm(userId, year, month, existing);
      });
    });
  },

  _openMonthlyForm(userId, year, month, existing) {
    const user = (App.users || []).find(u => u.id === userId);
    const userName = user ? user.name : '';
    const monthLabel = `${year}년 ${month}월`;
    const title = existing ? `월간 평가 수정 — ${userName} (${monthLabel})` : `월간 평가 — ${userName} (${monthLabel})`;

    const criteria = [
      { key: 'score_timeliness', label: '시의성', hint: '기한 내 완료 여부' },
      { key: 'score_quality', label: '품질', hint: '결과물의 완성도' },
      { key: 'score_collaboration', label: '협업', hint: '팀원과의 협력 태도' },
      { key: 'score_initiative', label: '주도성', hint: '자발적 업무 추진' },
      { key: 'score_growth', label: '성장', hint: '역량 향상 속도' },
    ];

    const scoresHtml = criteria.map(c => {
      const val = existing?.[c.key] || 0;
      const stars = [1, 2, 3, 4, 5].map(n => {
        const active = val >= n;
        return `<button type="button" class="eval-star ${active ? 'active' : ''}" data-score-key="${c.key}" data-score-val="${n}">★</button>`;
      }).join('');
      return `
        <div class="form-group">
          <label>${c.label} <span style="font-size:11px;color:var(--color-text-hint);font-weight:400;">— ${c.hint}</span></label>
          <div class="eval-score" data-score-input="${c.key}" data-current="${val}">
            ${stars}
            <button type="button" class="eval-score-clear" data-clear-key="${c.key}" title="지우기">✕</button>
          </div>
        </div>
      `;
    }).join('');

    const html = `
      ${scoresHtml}
      <div class="form-group">
        <label>메모</label>
        <textarea id="f-eval-memo" placeholder="정성 평가 메모, 코칭 포인트, 피드백 등">${escHtml(existing?.memo || '')}</textarea>
      </div>
      ${existing ? `
        <div style="margin-top:12px;padding-top:12px;border-top:0.5px solid var(--color-border);">
          <button class="btn btn-danger" id="btn-delete-eval" style="font-size:12px;">평가 삭제</button>
        </div>
      ` : ''}
    `;

    App.openPanel(title, html, async () => {
      const getScore = (key) => {
        const el = document.querySelector(`[data-score-input="${key}"]`);
        const val = parseInt(el?.dataset.current) || 0;
        return val > 0 ? val : null;
      };
      const data = {
        user_id: userId,
        eval_month: `${year}-${String(month).padStart(2, '0')}-01`,
        score_timeliness: getScore('score_timeliness'),
        score_quality: getScore('score_quality'),
        score_collaboration: getScore('score_collaboration'),
        score_initiative: getScore('score_initiative'),
        score_growth: getScore('score_growth'),
        memo: document.getElementById('f-eval-memo').value,
      };
      try {
        await API.post('/evaluations/monthly', data);
        App.toast('월간 평가가 저장되었습니다.', 'success');
        this._renderActiveTab();
      } catch (e) {
        App.toast('저장 실패: ' + (e.message || ''), 'error');
        return false;
      }
    });

    // 별점 클릭 처리
    document.querySelectorAll('.eval-star').forEach(star => {
      star.addEventListener('click', () => {
        const key = star.dataset.scoreKey;
        const val = parseInt(star.dataset.scoreVal);
        const container = document.querySelector(`[data-score-input="${key}"]`);
        if (!container) return;
        container.dataset.current = val;
        container.querySelectorAll('.eval-star').forEach(s => {
          const v = parseInt(s.dataset.scoreVal);
          s.classList.toggle('active', v <= val);
        });
      });
    });

    // 지우기 버튼
    document.querySelectorAll('.eval-score-clear').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.clearKey;
        const container = document.querySelector(`[data-score-input="${key}"]`);
        if (!container) return;
        container.dataset.current = 0;
        container.querySelectorAll('.eval-star').forEach(s => s.classList.remove('active'));
      });
    });

    // 삭제 버튼
    if (existing) {
      document.getElementById('btn-delete-eval')?.addEventListener('click', async () => {
        const ok = await App.confirm('해당 월간 평가를 삭제하시겠습니까?');
        if (!ok) return;
        try {
          await API.del(`/evaluations/monthly/${existing.id}`);
          App.toast('월간 평가가 삭제되었습니다.', 'success');
          App.closePanel();
          this._renderActiveTab();
        } catch (e) {
          App.toast('삭제 실패', 'error');
        }
      });
    }
  },

  // =============================================================
  // 탭 b: 반기 리포트
  // =============================================================
  async _renderSemiAnnual(body) {
    const users = (App.users || []).filter(u => u.is_active !== false);
    if (!this.selectedUserId && users.length) this.selectedUserId = users[0].id;

    const yearOptions = Array.from({ length: 5 }, (_, i) => this.selectedYear - 2 + i);

    const toolbarHtml = `
      <div class="eval-toolbar">
        <label style="font-size:12px;color:var(--color-text-muted);">팀원:</label>
        <select id="sa-user" style="min-width:140px;">
          ${users.map(u => `<option value="${u.id}" ${u.id === this.selectedUserId ? 'selected' : ''}>${escHtml(u.name)}</option>`).join('')}
        </select>
        <label style="font-size:12px;color:var(--color-text-muted);margin-left:8px;">연도:</label>
        <select id="sa-year" style="width:auto;">
          ${yearOptions.map(y => `<option value="${y}" ${y === this.selectedYear ? 'selected' : ''}>${y}년</option>`).join('')}
        </select>
        <label style="font-size:12px;color:var(--color-text-muted);margin-left:8px;">반기:</label>
        <select id="sa-period" style="width:auto;">
          <option value="H1" ${this.selectedPeriod === 'H1' ? 'selected' : ''}>상반기 (1~6월)</option>
          <option value="H2" ${this.selectedPeriod === 'H2' ? 'selected' : ''}>하반기 (7~12월)</option>
        </select>
        <button class="btn btn-default" id="btn-sa-print" style="margin-left:auto;font-size:12px;">PDF 내보내기</button>
        <button class="btn btn-default" id="btn-sa-csv" style="font-size:12px;">CSV 내보내기</button>
      </div>
      <div id="sa-report-container"></div>
    `;

    body.innerHTML = toolbarHtml;

    document.getElementById('sa-user').addEventListener('change', (e) => {
      this.selectedUserId = parseInt(e.target.value);
      this._loadSemiAnnualReport();
    });
    document.getElementById('sa-year').addEventListener('change', (e) => {
      this.selectedYear = parseInt(e.target.value);
      this._loadSemiAnnualReport();
    });
    document.getElementById('sa-period').addEventListener('change', (e) => {
      this.selectedPeriod = e.target.value;
      this._loadSemiAnnualReport();
    });
    document.getElementById('btn-sa-print').addEventListener('click', () => {
      window.print();
    });
    document.getElementById('btn-sa-csv').addEventListener('click', () => {
      const url = `/task/api/evaluations/semi-annual/export?user_id=${this.selectedUserId}&year=${this.selectedYear}&period=${this.selectedPeriod}`;
      window.location.href = url;
    });

    await this._loadSemiAnnualReport();
  },

  async _loadSemiAnnualReport() {
    const container = document.getElementById('sa-report-container');
    if (!container) return;
    container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>리포트 생성 중...</span></div>';

    try {
      const res = await API.get(`/evaluations/semi-annual/user/${this.selectedUserId}?year=${this.selectedYear}&period=${this.selectedPeriod}`);
      const d = res.data;
      this._semiAnnualCache = d;
      this._renderSemiAnnualReport(container, d);
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-title">리포트를 불러올 수 없습니다</div></div>`;
    }
  },

  _renderSemiAnnualReport(container, d) {
    const periodLabel = d.period === 'H1' ? '상반기' : '하반기';
    const wt = d.taskStats?.byWorkType || {};
    const totals = d.taskStats?.totals || {};
    const workTypeLabels = { regular: '정규 업무 (R&R)', extra: '추가 업무', project: '프로젝트' };

    const workTypeRows = ['regular', 'extra', 'project'].map(k => {
      const w = wt[k] || { done_count: 0, delayed_count: 0, total_count: 0, done_points: 0, total_points: 0 };
      return `
        <tr>
          <td><strong>${workTypeLabels[k]}</strong></td>
          <td>${w.total_count}</td>
          <td style="color:var(--color-done-text);">${w.done_count}</td>
          <td style="color:var(--color-warn-text);">${w.delayed_count}</td>
          <td>${w.done_points} / ${w.total_points}</td>
        </tr>
      `;
    }).join('');

    const avg = d.avgScores || {};
    const criteria = [
      { key: 'score_timeliness', label: '시의성' },
      { key: 'score_quality', label: '품질' },
      { key: 'score_collaboration', label: '협업' },
      { key: 'score_initiative', label: '주도성' },
      { key: 'score_growth', label: '성장' },
    ];
    const overallAvgVals = criteria.map(c => avg[c.key]).filter(v => v != null);
    const overallAvg = overallAvgVals.length > 0
      ? (overallAvgVals.reduce((a, b) => a + b, 0) / overallAvgVals.length).toFixed(2)
      : '-';

    const scoreRows = criteria.map(c => {
      const v = avg[c.key];
      const pct = v != null ? (v / 5 * 100) : 0;
      return `
        <tr>
          <td style="width:100px;">${c.label}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="flex:1;height:6px;background:var(--color-bg-secondary);border-radius:3px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:var(--color-primary);"></div>
              </div>
              <strong style="width:40px;text-align:right;">${v != null ? v.toFixed(1) : '-'}</strong>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const monthlyRows = (d.monthlyEvals || []).map(ev => {
      const m = ev.eval_month ? new Date(ev.eval_month).toISOString().slice(0, 7) : '';
      return `
        <tr>
          <td>${m}</td>
          <td>${ev.score_timeliness ?? '-'}</td>
          <td>${ev.score_quality ?? '-'}</td>
          <td>${ev.score_collaboration ?? '-'}</td>
          <td>${ev.score_initiative ?? '-'}</td>
          <td>${ev.score_growth ?? '-'}</td>
          <td style="font-size:11px;color:var(--color-text-muted);">${escHtml((ev.memo || '').slice(0, 60))}${(ev.memo || '').length > 60 ? '...' : ''}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);padding:16px;">평가 기록 없음</td></tr>';

    const notes = d.meta?.admin_notes || '';
    const finalized = !!d.meta?.finalized;

    container.innerHTML = `
      <div class="semi-annual-report">
        <div class="sa-report-header">
          <div>
            <div class="sa-report-user">${escHtml(d.user.name)}</div>
            <div class="sa-report-period">${d.year}년 ${periodLabel} 리포트 (${d.range.start} ~ ${d.range.end})</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            ${finalized ? '<span class="badge badge-done">확정됨</span>' : '<span class="badge">작성 중</span>'}
          </div>
        </div>

        <div class="sa-metric-grid">
          <div class="sa-metric">
            <div class="sa-metric-label">완료</div>
            <div class="sa-metric-value">${totals.done || 0}</div>
          </div>
          <div class="sa-metric">
            <div class="sa-metric-label">지연</div>
            <div class="sa-metric-value" style="color:var(--color-warn-text);">${totals.delayed || 0}</div>
          </div>
          <div class="sa-metric">
            <div class="sa-metric-label">전체</div>
            <div class="sa-metric-value">${totals.total || 0}</div>
          </div>
          <div class="sa-metric">
            <div class="sa-metric-label">완료율</div>
            <div class="sa-metric-value" style="color:var(--color-primary);">${totals.completionRate || 0}%</div>
          </div>
          <div class="sa-metric">
            <div class="sa-metric-label">총 포인트</div>
            <div class="sa-metric-value">${totals.points || 0}</div>
          </div>
          <div class="sa-metric">
            <div class="sa-metric-label">종합 평균</div>
            <div class="sa-metric-value" style="color:var(--color-primary);">${overallAvg}</div>
          </div>
        </div>

        <h3 class="sa-report-section">업무 유형별 통계</h3>
        <table class="data-table">
          <thead>
            <tr><th>유형</th><th>전체</th><th>완료</th><th>지연</th><th>포인트 (완료/전체)</th></tr>
          </thead>
          <tbody>${workTypeRows}</tbody>
        </table>

        <h3 class="sa-report-section">이슈 & 미팅</h3>
        <div class="sa-metric-grid">
          <div class="sa-metric">
            <div class="sa-metric-label">이슈 발생</div>
            <div class="sa-metric-value">${d.issues?.created || 0}</div>
          </div>
          <div class="sa-metric">
            <div class="sa-metric-label">이슈 해결</div>
            <div class="sa-metric-value" style="color:var(--color-done-text);">${d.issues?.resolved || 0}</div>
          </div>
          <div class="sa-metric">
            <div class="sa-metric-label">1:1 미팅 수</div>
            <div class="sa-metric-value">${d.meetingCount || 0}</div>
          </div>
        </div>

        <h3 class="sa-report-section">월간 평가 평균</h3>
        <table class="data-table">
          <tbody>${scoreRows}</tbody>
        </table>

        <h3 class="sa-report-section">월별 세부 기록</h3>
        <table class="data-table">
          <thead>
            <tr><th>월</th><th>시의성</th><th>품질</th><th>협업</th><th>주도성</th><th>성장</th><th>메모</th></tr>
          </thead>
          <tbody>${monthlyRows}</tbody>
        </table>

        <h3 class="sa-report-section">관리자 메모 / 총평</h3>
        <textarea id="sa-admin-notes" class="sa-notes-area" placeholder="반기 전체 평가 및 피드백 메모">${escHtml(notes)}</textarea>
        <div class="sa-report-actions">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--color-text-muted);">
            <input type="checkbox" id="sa-finalize" ${finalized ? 'checked' : ''} style="accent-color:var(--color-primary);">
            확정 (finalized)
          </label>
          <button class="btn btn-primary" id="btn-sa-save" style="margin-left:auto;">리포트 저장</button>
        </div>
      </div>
    `;

    document.getElementById('btn-sa-save').addEventListener('click', async () => {
      try {
        await API.post('/evaluations/semi-annual', {
          user_id: this.selectedUserId,
          year: this.selectedYear,
          period: this.selectedPeriod,
          admin_notes: document.getElementById('sa-admin-notes').value,
          finalized: document.getElementById('sa-finalize').checked,
        });
        App.toast('반기 리포트가 저장되었습니다.', 'success');
        this._loadSemiAnnualReport();
      } catch (e) {
        App.toast('저장 실패', 'error');
      }
    });
  },

  // =============================================================
  // 탭 c: 지연 체감
  // =============================================================
  async _renderDelay(body) {
    const res = await API.get('/evaluations/delay-overview');
    const d = res.data;
    this._delayData = d;

    const overdue = d.overdue || [];
    const overdueHtml = overdue.length > 0 ? overdue.map(t => {
      const days = parseInt(t.days_overdue) || 0;
      const severity = days >= 7 ? 'critical' : days >= 3 ? 'warn' : 'info';
      const workTypeLabels = { regular: '정규', extra: '추가', project: '프로젝트' };
      return `
        <div class="delay-warning-item delay-sev-${severity}">
          <div class="delay-days">D+${days}</div>
          <div class="delay-info">
            <div class="delay-title">${escHtml(t.title)}</div>
            <div class="delay-meta">
              <span>${escHtml(t.assignee_name || '담당자 없음')}</span>
              <span>·</span>
              <span>마감 ${t.due_date ? t.due_date.slice(0, 10) : '-'}</span>
              ${t.work_type && t.work_type !== 'regular' ? `<span>·</span><span class="work-type-badge work-type-${t.work_type}">${workTypeLabels[t.work_type]}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('') : '<div class="empty-state" style="padding:24px;"><div class="empty-state-title">현재 지연 중인 업무가 없습니다</div></div>';

    // 사용자별 월별 지연 추이
    const monthlyDelays = d.monthlyDelays || [];
    const byUser = {};
    for (const row of monthlyDelays) {
      if (!byUser[row.user_id]) byUser[row.user_id] = { name: row.name, months: {} };
      const mKey = row.month ? new Date(row.month).toISOString().slice(0, 7) : '';
      byUser[row.user_id].months[mKey] = parseInt(row.delayed_count) || 0;
    }
    const userList = Object.values(byUser);

    // 최근 6개월 라벨
    const monthLabels = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthLabels.push(dt.toISOString().slice(0, 7));
    }

    const delayTrendHtml = userList.length > 0 ? `
      <table class="data-table">
        <thead>
          <tr>
            <th>팀원</th>
            ${monthLabels.map(m => `<th>${m.slice(5)}월</th>`).join('')}
            <th>합계</th>
          </tr>
        </thead>
        <tbody>
          ${userList.map(u => {
            const total = monthLabels.reduce((s, m) => s + (u.months[m] || 0), 0);
            return `
              <tr>
                <td>${escHtml(u.name)}</td>
                ${monthLabels.map(m => {
                  const c = u.months[m] || 0;
                  const color = c >= 3 ? 'var(--color-warn-text)' : c >= 1 ? 'var(--color-primary)' : 'var(--color-text-muted)';
                  return `<td style="color:${color};">${c}</td>`;
                }).join('')}
                <td><strong>${total}</strong></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : '<div class="empty-state" style="padding:16px;"><div class="empty-state-title">최근 6개월 지연 기록 없음</div></div>';

    // 반복 지연 경고
    const alerts = d.alerts || [];
    const alertsHtml = alerts.length > 0 ? alerts.map(a => `
      <div class="delay-warning-item delay-sev-warn">
        <div style="font-size:18px;">⚠</div>
        <div class="delay-info">
          <div class="delay-title">${escHtml(a.user_name || '')}</div>
          <div class="delay-meta">${escHtml(a.message || '')}</div>
        </div>
      </div>
    `).join('') : '<div class="empty-state" style="padding:16px;"><div class="empty-state-title">활성 경고 없음</div></div>';

    // 이슈 해결 속도
    const resSpeed = d.resolutionSpeed || [];
    const speedHtml = resSpeed.length > 0 ? `
      <table class="data-table">
        <thead><tr><th>월</th><th>해결 건수</th><th>평균 소요 (일)</th></tr></thead>
        <tbody>
          ${resSpeed.map(r => {
            const m = r.month ? new Date(r.month).toISOString().slice(0, 7) : '';
            return `<tr><td>${m}</td><td>${r.resolved_count}</td><td>${r.avg_days || '-'}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    ` : '<div class="empty-state" style="padding:16px;"><div class="empty-state-title">해결된 이슈 없음</div></div>';

    body.innerHTML = `
      <h3 class="sa-report-section" style="margin-top:0;">현재 지연 중인 업무 (${overdue.length}건)</h3>
      <div class="delay-list">${overdueHtml}</div>

      <h3 class="sa-report-section">팀원별 최근 6개월 지연 건수</h3>
      ${delayTrendHtml}

      <h3 class="sa-report-section">반복 지연 경고</h3>
      <div class="delay-list">${alertsHtml}</div>

      <h3 class="sa-report-section">이슈 해결 속도 추이</h3>
      ${speedHtml}
    `;
  },

  // =============================================================
  // 탭 d: 업무 분포
  // =============================================================
  async _renderDistribution(body) {
    const year = this.selectedYear;
    const res = await API.get(`/evaluations/work-distribution?year=${year}`);
    const users = res.data || [];
    this._distributionData = users;

    const yearOptions = Array.from({ length: 5 }, (_, i) => year - 2 + i);

    const toolbarHtml = `
      <div class="eval-toolbar">
        <label style="font-size:12px;color:var(--color-text-muted);">연도:</label>
        <select id="dist-year" style="width:auto;">
          ${yearOptions.map(y => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}년</option>`).join('')}
        </select>
      </div>
    `;

    if (users.length === 0) {
      body.innerHTML = toolbarHtml + '<div class="empty-state"><div class="empty-state-title">업무 분포 데이터 없음</div></div>';
      return;
    }

    const userCardsHtml = users.map(u => {
      const reg = u.regular || 0;
      const ext = u.extra || 0;
      const proj = u.project || 0;
      const total = reg + ext + proj;
      if (total === 0) {
        return `
          <div class="dist-card">
            <div class="dist-user">
              ${App.avatar({ name: u.name, avatar_bg: u.avatar_bg, avatar_text: u.avatar_text, avatar_url: u.avatar_url })}
              <strong>${escHtml(u.name)}</strong>
            </div>
            <div class="empty-state" style="padding:20px;"><div class="empty-state-title">업무 없음</div></div>
          </div>
        `;
      }

      // 파이 차트 (SVG)
      const pie = this._renderPie([
        { value: reg, color: '#4F6EF7' },
        { value: ext, color: '#F5A623' },
        { value: proj, color: '#9B59B6' },
      ]);

      const pctReg = Math.round(reg / total * 100);
      const pctExt = Math.round(ext / total * 100);
      const pctProj = Math.round(proj / total * 100);

      const extraWarn = pctExt >= 40 ? '<span class="badge badge-warn" style="font-size:10px;">추가 업무 과다</span>' : '';

      return `
        <div class="dist-card">
          <div class="dist-user">
            ${App.avatar({ name: u.name, avatar_bg: u.avatar_bg, avatar_text: u.avatar_text, avatar_url: u.avatar_url })}
            <strong>${escHtml(u.name)}</strong>
            ${extraWarn}
          </div>
          <div class="dist-body">
            <div class="dist-pie">${pie}</div>
            <div class="dist-legend">
              <div class="dist-legend-row"><span class="dist-dot" style="background:#4F6EF7;"></span>정규 <span style="margin-left:auto;"><strong>${reg}</strong> (${pctReg}%)</span></div>
              <div class="dist-legend-row"><span class="dist-dot" style="background:#F5A623;"></span>추가 <span style="margin-left:auto;"><strong>${ext}</strong> (${pctExt}%)</span></div>
              <div class="dist-legend-row"><span class="dist-dot" style="background:#9B59B6;"></span>프로젝트 <span style="margin-left:auto;"><strong>${proj}</strong> (${pctProj}%)</span></div>
              <div class="dist-legend-row" style="border-top:0.5px solid var(--color-border);padding-top:6px;margin-top:2px;">총 업무 수 <span style="margin-left:auto;"><strong>${total}</strong></span></div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    body.innerHTML = toolbarHtml + `<div class="dist-grid">${userCardsHtml}</div>`;

    document.getElementById('dist-year').addEventListener('change', (e) => {
      this.selectedYear = parseInt(e.target.value);
      this._renderActiveTab();
    });
  },

  // SVG 파이 차트
  _renderPie(segments) {
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    if (total === 0) return '';
    const size = 100;
    const r = 45;
    const cx = size / 2;
    const cy = size / 2;

    let accAngle = -Math.PI / 2;
    const paths = segments.map(seg => {
      if (seg.value === 0) return '';
      const angle = (seg.value / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(accAngle);
      const y1 = cy + r * Math.sin(accAngle);
      const x2 = cx + r * Math.cos(accAngle + angle);
      const y2 = cy + r * Math.sin(accAngle + angle);
      const large = angle > Math.PI ? 1 : 0;
      accAngle += angle;
      // 단일 세그먼트(100%)인 경우 원 전체를 그림
      if (seg.value === total) {
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${seg.color}"/>`;
      }
      return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${seg.color}"/>`;
    }).join('');

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}</svg>`;
  },
};
