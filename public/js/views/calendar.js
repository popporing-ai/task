// 팀 캘린더 뷰
const CalendarView = {
  // 빌트인 폴백 (API 로드 실패 시 사용)
  EVENT_COLORS: {
    general:  '#4F6EF7',
    meeting:  '#7B9BFA',
    deadline: '#F07070',
    campaign: '#5DD984',
    event:    '#F5A623',
    holiday:  '#9A9BA3',
  },
  EVENT_TYPE_LABELS: {
    general:  '일반',
    meeting:  '회의',
    deadline: '마감',
    campaign: '캠페인',
    event:    '행사',
    holiday:  '휴일',
  },

  _eventTypes: [], // [{ id, type_key, label, color, is_builtin, sort_order }]

  _year: new Date().getFullYear(),
  _month: new Date().getMonth(), // 0-based
  _events: [],
  _viewMode: 'month', // 'month' | 'week'
  _weekStart: null, // Date for week view

  async render() {
    const content = document.getElementById('content');
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = `<button class="btn btn-primary" id="btn-add-event">+ 일정 추가</button>`;

    content.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>캘린더 불러오는 중...</span></div>';

    document.getElementById('btn-add-event').addEventListener('click', () => this.openForm());

    await Promise.all([this.loadEventTypes(), this.loadEvents()]);
    this.renderCalendar();
  },

  // 이벤트 유형 동적 로드 + 빌트인 매핑 갱신
  async loadEventTypes() {
    try {
      const res = await API.get('/calendar/event-types');
      this._eventTypes = res.data || [];
      // 매핑 캐시 갱신 (커스텀 유형 색/라벨 반영)
      this.EVENT_COLORS = {};
      this.EVENT_TYPE_LABELS = {};
      this._eventTypes.forEach(t => {
        this.EVENT_COLORS[t.type_key] = t.color;
        this.EVENT_TYPE_LABELS[t.type_key] = t.label;
      });
    } catch {
      this._eventTypes = [];
      // 폴백 매핑 유지
    }
  },

  async loadEvents() {
    try {
      const month = `${this._year}-${String(this._month + 1).padStart(2, '0')}`;
      const res = await API.get(`/calendar?month=${month}`);
      this._events = res.data || [];
    } catch (e) {
      this._events = [];
    }
  },

  renderCalendar() {
    const content = document.getElementById('content');

    const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    // 네비게이션 바
    const navHtml = `
      <div class="calendar-nav">
        <div class="calendar-nav-left">
          <button class="btn btn-default calendar-nav-btn" id="cal-prev">&lt;</button>
          <span class="calendar-nav-title">${this._year}년 ${monthNames[this._month]}</span>
          <button class="btn btn-default calendar-nav-btn" id="cal-next">&gt;</button>
          <button class="btn btn-default calendar-nav-btn" id="cal-today" style="margin-left:8px;">오늘</button>
        </div>
        <div class="calendar-nav-right">
          <div class="calendar-view-toggle">
            <button class="filter-btn ${this._viewMode === 'month' ? 'active' : ''}" data-cal-view="month">월</button>
            <button class="filter-btn ${this._viewMode === 'week' ? 'active' : ''}" data-cal-view="week">주</button>
          </div>
          <div class="calendar-legend">
            ${Object.entries(this.EVENT_TYPE_LABELS).map(([k, v]) =>
              `<span class="calendar-legend-item"><span class="calendar-legend-dot" style="background:${this.EVENT_COLORS[k]}"></span>${v}</span>`
            ).join('')}
          </div>
        </div>
      </div>
    `;

    let bodyHtml = '';
    if (this._viewMode === 'month') {
      bodyHtml = this._renderMonthGrid(dayNames);
    } else {
      bodyHtml = this._renderWeekGrid(dayNames);
    }

    content.innerHTML = navHtml + bodyHtml;
    this._bindNavEvents();
  },

  _renderMonthGrid(dayNames) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 해당 월 첫째 날 / 마지막 날
    const firstDay = new Date(this._year, this._month, 1);
    const lastDay = new Date(this._year, this._month + 1, 0);
    const startDayOfWeek = firstDay.getDay(); // 0=일

    // 이전 월 마지막 날
    const prevLastDay = new Date(this._year, this._month, 0);

    // 그리드 시작: 이전 월 날짜 채움
    const cells = [];
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(this._year, this._month - 1, prevLastDay.getDate() - i);
      cells.push({ date: d, otherMonth: true });
    }
    // 현재 월
    for (let d = 1; d <= lastDay.getDate(); d++) {
      cells.push({ date: new Date(this._year, this._month, d), otherMonth: false });
    }
    // 다음 월 채움 (6주 = 42칸)
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({ date: new Date(this._year, this._month + 1, d), otherMonth: true });
    }

    // 헤더
    let html = `<div class="calendar-grid">`;
    html += `<div class="calendar-header">`;
    dayNames.forEach((name, i) => {
      const cls = i === 0 ? ' sun' : i === 6 ? ' sat' : '';
      html += `<div class="calendar-header-cell${cls}">${name}</div>`;
    });
    html += `</div>`;

    // 주별 행
    html += `<div class="calendar-body">`;
    for (let w = 0; w < 6; w++) {
      html += `<div class="calendar-week">`;
      for (let d = 0; d < 7; d++) {
        const cell = cells[w * 7 + d];
        const dateStr = this._toDateStr(cell.date);
        const isToday = cell.date.getTime() === today.getTime();
        const isSun = d === 0;
        const isSat = d === 6;

        let cls = 'calendar-day';
        if (cell.otherMonth) cls += ' other-month';
        if (isToday) cls += ' today';
        if (isSun) cls += ' sun';
        if (isSat) cls += ' sat';

        // 이 날의 이벤트
        const dayEvents = this._getEventsForDate(dateStr);

        html += `<div class="${cls}" data-date="${dateStr}">`;
        html += `<div class="calendar-day-number">${cell.date.getDate()}</div>`;
        html += `<div class="calendar-day-events">`;
        dayEvents.slice(0, 3).forEach(ev => {
          const color = ev.color || this.EVENT_COLORS[ev.event_type] || this.EVENT_COLORS.general;
          const isMultiDay = ev.end_date && ev.end_date !== ev.start_date;
          const pillCls = isMultiDay ? 'calendar-event multi-day' : 'calendar-event';
          html += `<div class="${pillCls}" data-event-id="${ev.id}" style="--event-color:${color};" title="${escHtml(ev.title)}">${escHtml(ev.title)}</div>`;
        });
        if (dayEvents.length > 3) {
          html += `<div class="calendar-event-more">+${dayEvents.length - 3}개</div>`;
        }
        html += `</div></div>`;
      }
      html += `</div>`;
    }
    html += `</div></div>`;
    return html;
  },

  _renderWeekGrid(dayNames) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 현재 주의 시작 (일요일)
    let weekStart = this._weekStart;
    if (!weekStart) {
      weekStart = new Date(this._year, this._month, 1);
      const dow = weekStart.getDay();
      weekStart.setDate(weekStart.getDate() - dow);
      // 오늘이 현재 월에 있으면 오늘 기준 주
      if (today.getFullYear() === this._year && today.getMonth() === this._month) {
        weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
      }
    }

    const hours = [];
    for (let h = 0; h < 24; h++) {
      hours.push(`${String(h).padStart(2, '0')}:00`);
    }

    let html = `<div class="week-view">`;
    // 헤더
    html += `<div class="week-view-header"><div class="week-view-time-label"></div>`;
    for (let d = 0; d < 7; d++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + d);
      const dateStr = this._toDateStr(date);
      const isToday = date.getTime() === today.getTime();
      const cls = isToday ? 'week-view-day-header today' : 'week-view-day-header';
      html += `<div class="${cls}" data-date="${dateStr}">${dayNames[d]} ${date.getDate()}</div>`;
    }
    html += `</div>`;

    // 시간 행
    html += `<div class="week-view-body">`;
    for (const hour of hours) {
      html += `<div class="week-view-row">`;
      html += `<div class="week-view-time-label">${hour}</div>`;
      for (let d = 0; d < 7; d++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + d);
        const dateStr = this._toDateStr(date);
        const h = parseInt(hour);
        const cellEvents = this._getEventsForDateHour(dateStr, h);
        html += `<div class="week-view-cell" data-date="${dateStr}" data-hour="${h}">`;
        cellEvents.forEach(ev => {
          const color = ev.color || this.EVENT_COLORS[ev.event_type] || this.EVENT_COLORS.general;
          html += `<div class="calendar-event" data-event-id="${ev.id}" style="--event-color:${color};" title="${escHtml(ev.title)}">${escHtml(ev.title)}</div>`;
        });
        html += `</div>`;
      }
      html += `</div>`;
    }
    html += `</div></div>`;
    return html;
  },

  _bindNavEvents() {
    // 월 이동
    document.getElementById('cal-prev')?.addEventListener('click', () => {
      if (this._viewMode === 'month') {
        this._month--;
        if (this._month < 0) { this._month = 11; this._year--; }
      } else {
        if (this._weekStart) {
          this._weekStart.setDate(this._weekStart.getDate() - 7);
          this._month = this._weekStart.getMonth();
          this._year = this._weekStart.getFullYear();
        }
      }
      this.loadEvents().then(() => this.renderCalendar());
    });

    document.getElementById('cal-next')?.addEventListener('click', () => {
      if (this._viewMode === 'month') {
        this._month++;
        if (this._month > 11) { this._month = 0; this._year++; }
      } else {
        if (this._weekStart) {
          this._weekStart.setDate(this._weekStart.getDate() + 7);
          this._month = this._weekStart.getMonth();
          this._year = this._weekStart.getFullYear();
        }
      }
      this.loadEvents().then(() => this.renderCalendar());
    });

    document.getElementById('cal-today')?.addEventListener('click', () => {
      const now = new Date();
      this._year = now.getFullYear();
      this._month = now.getMonth();
      this._weekStart = null;
      this.loadEvents().then(() => this.renderCalendar());
    });

    // 뷰 모드 토글
    document.querySelectorAll('[data-cal-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._viewMode = btn.dataset.calView;
        this._weekStart = null;
        this.renderCalendar();
      });
    });

    // 날짜 셀 클릭 → 일정 추가
    document.querySelectorAll('.calendar-day, .week-view-cell').forEach(cell => {
      cell.addEventListener('click', (e) => {
        if (e.target.closest('.calendar-event') || e.target.closest('.calendar-event-more')) return;
        const date = cell.dataset.date;
        if (date) this.openForm(null, date);
      });
    });

    // 이벤트 pill 클릭 → 상세 팝오버
    document.querySelectorAll('.calendar-event[data-event-id]').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        const evId = parseInt(pill.dataset.eventId);
        const ev = this._events.find(e => e.id === evId);
        if (ev) this._showEventPopover(ev, pill);
      });
    });
  },

  _showEventPopover(ev, anchor) {
    document.querySelector('.popover-overlay')?.remove();

    const typeLabel = this.EVENT_TYPE_LABELS[ev.event_type] || ev.event_type;
    const color = ev.color || this.EVENT_COLORS[ev.event_type] || this.EVENT_COLORS.general;
    const assigneeName = ev.assignee_name || '미지정';
    // 날짜·시간 안전 슬라이스 (DB ISO timestamp 대응)
    const ymd = (v) => v ? String(v).slice(0, 10) : '';
    const hhmm = (v) => v ? String(v).slice(0, 5) : '';
    const sDate = ymd(ev.start_date);
    const eDate = ymd(ev.end_date);
    const dateRange = eDate && eDate !== sDate ? `${sDate} ~ ${eDate}` : sDate;
    const timeRange = !ev.all_day && ev.start_time
      ? `${hhmm(ev.start_time)}${ev.end_time ? ' ~ ' + hhmm(ev.end_time) : ''}`
      : '종일';

    const overlay = document.createElement('div');
    overlay.className = 'popover-overlay';
    overlay.innerHTML = `
      <div class="popover" style="max-width:380px;width:90%;">
        <button class="popover-close" title="닫기">×</button>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-right:24px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;"></span>
          <span style="font-size:17px;font-weight:700;letter-spacing:-0.02em;line-height:1.3;">${escHtml(ev.title)}</span>
        </div>
        <div style="margin-bottom:14px;">
          <span class="badge" style="background:${color}22;color:${color};">${escHtml(typeLabel)}</span>
        </div>
        ${ev.description ? `<div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:14px;line-height:1.55;white-space:pre-wrap;">${escHtml(ev.description)}</div>` : ''}
        <div style="font-size:13px;color:var(--color-text-secondary);display:flex;flex-direction:column;gap:8px;background:var(--color-bg-secondary);padding:12px 14px;border-radius:10px;">
          <div><span style="color:var(--color-text-hint);margin-right:6px;">📅</span> ${escHtml(dateRange || '-')}</div>
          <div><span style="color:var(--color-text-hint);margin-right:6px;">🕐</span> ${escHtml(timeRange)}</div>
          <div><span style="color:var(--color-text-hint);margin-right:6px;">👤</span> ${escHtml(assigneeName)}</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:18px;justify-content:flex-end;">
          <button class="btn btn-default" id="popover-edit-event">수정</button>
          <button class="btn btn-danger" id="popover-delete-event">삭제</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.popover-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.querySelector('#popover-edit-event').addEventListener('click', () => {
      overlay.remove();
      this.openForm(ev);
    });

    overlay.querySelector('#popover-delete-event').addEventListener('click', async () => {
      const ok = await App.confirm('이 일정을 삭제하시겠습니까?');
      if (!ok) return;
      try {
        await API.del(`/calendar/${ev.id}`);
        App.toast('일정이 삭제되었습니다.', 'success');
        overlay.remove();
        await this.loadEvents();
        this.renderCalendar();
      } catch (e) {
        App.toast('삭제에 실패했습니다.', 'error');
      }
    });
  },

  openForm(event = null, prefilledDate = null) {
    const isEdit = !!event;
    const title = isEdit ? '일정 수정' : '일정 추가';

    const typeOptions = Object.entries(this.EVENT_TYPE_LABELS).map(([k, v]) =>
      `<option value="${k}" ${event?.event_type === k ? 'selected' : ''}>${v}</option>`
    ).join('');

    // 날짜는 항상 YYYY-MM-DD 형식으로 강제 (DB가 ISO timestamp 반환할 수 있음)
    const ymd = (v) => v ? String(v).slice(0, 10) : '';
    const defaultDate = prefilledDate || ymd(event?.start_date) || new Date().toISOString().slice(0, 10);
    const defaultEndDate = ymd(event?.end_date) || '';
    const allDay = event ? event.all_day : true;

    const html = `
      <div class="form-group">
        <label>일정명 *</label>
        <input type="text" id="cal-title" value="${escHtml(event?.title || '')}" placeholder="일정명을 입력하세요">
      </div>
      <div class="form-group">
        <label>설명</label>
        <textarea id="cal-desc" rows="3" placeholder="일정 설명">${escHtml(event?.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label>유형</label>
        <select id="cal-type">${typeOptions}</select>
        <div style="font-size:11px;color:var(--color-text-hint);margin-top:4px;">유형에 따라 색상이 자동 적용됩니다.</div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>시작일 *</label>
          <input type="date" id="cal-start-date" value="${defaultDate}">
        </div>
        <div class="form-group">
          <label>종료일</label>
          <input type="date" id="cal-end-date" value="${defaultEndDate}">
        </div>
      </div>
      <div class="form-group">
        <label class="cal-allday-toggle">
          <input type="checkbox" id="cal-allday" ${allDay ? 'checked' : ''}>
          <span class="cal-allday-switch"></span>
          <span class="cal-allday-text">종일</span>
        </label>
      </div>
      <div class="form-row" id="cal-time-row" style="${allDay ? 'display:none' : ''}">
        <div class="form-group">
          <label>시작 시간</label>
          <input type="time" id="cal-start-time" value="${event?.start_time ? String(event.start_time).slice(0, 5) : '09:00'}">
        </div>
        <div class="form-group">
          <label>종료 시간</label>
          <input type="time" id="cal-end-time" value="${event?.end_time ? String(event.end_time).slice(0, 5) : '10:00'}">
        </div>
      </div>
      <div class="form-group">
        <label>담당자</label>
        <select id="cal-assignee">${App.userOptions(event?.assignee_id)}</select>
      </div>
    `;

    App.openPanel(title, html, async () => {
      const eventType = document.getElementById('cal-type').value;
      const data = {
        title: document.getElementById('cal-title').value.trim(),
        description: document.getElementById('cal-desc').value.trim(),
        event_type: eventType,
        start_date: document.getElementById('cal-start-date').value,
        end_date: document.getElementById('cal-end-date').value || null,
        all_day: document.getElementById('cal-allday').checked,
        start_time: document.getElementById('cal-start-time')?.value || null,
        end_time: document.getElementById('cal-end-time')?.value || null,
        // 색상은 유형에서 자동 매핑
        color: this.EVENT_COLORS[eventType] || this.EVENT_COLORS.general,
        assignee_id: document.getElementById('cal-assignee').value || null,
      };

      if (!data.title) {
        App.toast('일정명을 입력해주세요.', 'error');
        return false;
      }
      if (!data.start_date) {
        App.toast('시작일을 입력해주세요.', 'error');
        return false;
      }

      try {
        if (isEdit) {
          await API.put(`/calendar/${event.id}`, data);
          App.toast('일정이 수정되었습니다.', 'success');
        } else {
          await API.post('/calendar', data);
          App.toast('일정이 생성되었습니다.', 'success');
        }
        await this.loadEvents();
        this.renderCalendar();
      } catch (e) {
        App.toast('저장에 실패했습니다.', 'error');
        return false;
      }
    });

    // 종일 토글 → 시간 행 표시/숨김
    document.getElementById('cal-allday')?.addEventListener('change', (e) => {
      document.getElementById('cal-time-row').style.display = e.target.checked ? 'none' : '';
    });
  },

  // 유틸: 특정 날짜의 이벤트 반환
  _getEventsForDate(dateStr) {
    return this._events.filter(ev => {
      const start = ev.start_date?.slice(0, 10);
      const end = ev.end_date?.slice(0, 10) || start;
      return dateStr >= start && dateStr <= end;
    });
  },

  // 유틸: 주간 뷰 — 특정 날짜+시간대의 이벤트
  _getEventsForDateHour(dateStr, hour) {
    return this._events.filter(ev => {
      const start = ev.start_date?.slice(0, 10);
      const end = ev.end_date?.slice(0, 10) || start;
      if (dateStr < start || dateStr > end) return false;
      // 종일 이벤트는 0시에만 표시
      if (ev.all_day) return hour === 0;
      // 시간 있는 이벤트
      if (ev.start_time) {
        const evHour = parseInt(ev.start_time.slice(0, 2));
        return evHour === hour;
      }
      return hour === 0;
    });
  },

  // 유틸: Date → 'YYYY-MM-DD'
  _toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },
};
