// 대시보드 뷰
const DashboardView = {
  async render() {
    const content = document.getElementById('content');
    // 로딩 상태
    content.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <span>대시보드 불러오는 중...</span>
      </div>
    `;

    try {
      const res = await API.get('/dashboard');
      const d = res.data;

      const week = d.weekSummary;
      const cont = d.contentSummary;
      const contentPct = cont.total > 0 ? Math.round((cont.done_count / cont.total) * 100) : 0;

      content.innerHTML = `
        <!-- 지표 카드 -->
        <div class="metric-grid">
          <div class="metric-card">
            <div class="metric-label">이번 주 업무</div>
            <div class="metric-value">${week.total || 0}</div>
            <div class="metric-sub">완료 ${week.done_count || 0} · 예정 ${week.pending_count || 0}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">콘텐츠 발행</div>
            <div class="metric-value">${cont.done_count || 0} / ${cont.total || 0}</div>
            <div class="progress-bar"><div class="progress-fill" style="width:${contentPct}%"></div></div>
            <div class="metric-sub">${contentPct}% 완료</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">진행 분류</div>
            <div class="metric-value">${d.activeCategoryCount || 0}개</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">미진행 업무</div>
            <div class="metric-value" style="color:var(--color-warn-text)">${d.blockedCount || 0}</div>
          </div>
        </div>

        <!-- 하단 2열 -->
        <div class="grid-2">
          <div class="card">
            <div style="font-size:14px;font-weight:600;margin-bottom:14px;">이번 주 주요 업무</div>
            ${d.weekTasks.length > 0 ? `
              <table class="data-table">
                <thead><tr><th>업무명</th><th>담당자</th><th>상태</th></tr></thead>
                <tbody>
                  ${d.weekTasks.map(t => `
                    <tr>
                      <td>${t.category_name ? categoryTag(t.category_name) + ' ' : ''}${escHtml(t.title)}</td>
                      <td>${t.assignee_name ? App.avatar({name: t.assignee_name, avatar_bg: t.avatar_bg, avatar_text: t.avatar_text}) + ' ' + escHtml(t.assignee_name) : '-'}</td>
                      <td>${App.statusBadge(t.status)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `
              <div class="empty-state" style="padding:24px 12px">
                <span class="empty-state-icon">📋</span>
                <div class="empty-state-title">이번 주 업무가 없습니다</div>
                <div class="empty-state-desc">업무 현황에서 새 업무를 추가해보세요</div>
              </div>
            `}
          </div>
          <div class="card">
            <div style="font-size:14px;font-weight:600;margin-bottom:14px;">채널별 발행 현황</div>
            ${d.channelStats.length > 0 ? d.channelStats.map(ch => `
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                <span style="width:24px;font-weight:600;font-size:12px;">${ch.channel}</span>
                <span style="font-size:12px;color:var(--color-text-muted);width:30px;">${ch.count}건</span>
                <div style="flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden">
                  <div style="height:100%;background:var(--color-primary);width:${Math.min(ch.count * 10, 100)}%;border-radius:3px;box-shadow:0 0 6px rgba(79,110,247,0.45)"></div>
                </div>
              </div>
            `).join('') : `
              <div class="empty-state" style="padding:24px 12px">
                <span class="empty-state-icon">📊</span>
                <div class="empty-state-title">발행 데이터가 없습니다</div>
                <div class="empty-state-desc">콘텐츠 캘린더에서 발행 완료 항목을 추가해보세요</div>
              </div>
            `}
          </div>
        </div>

        ${d.myTasks.length > 0 ? `
          <div class="card" style="margin-top:16px;">
            <div style="font-size:14px;font-weight:600;margin-bottom:14px;">나의 이번 주 업무</div>
            <table class="data-table">
              <thead><tr><th>업무명</th><th>마감일</th><th>상태</th></tr></thead>
              <tbody>
                ${d.myTasks.map(t => `
                  <tr>
                    <td>${escHtml(t.title)}</td>
                    <td>${escHtml(t.due_date) || '-'}</td>
                    <td>${App.statusBadge(t.status)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      `;
    } catch (e) {
      content.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">⚠</span>
          <div class="empty-state-title">대시보드를 불러올 수 없습니다</div>
          <div class="empty-state-desc">잠시 후 다시 시도해주세요</div>
        </div>
      `;
    }
  }
};
