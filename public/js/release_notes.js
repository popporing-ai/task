// 버전 관리 + 업데이트 팝업
// — my-crm의 ReleaseNotesModal 패턴 포팅 (Vanilla JS)
// — 새 배포 시 CURRENT_VERSION 올리고 RELEASE_NOTES에 항목 추가하면
//   사용자가 다음 접속 시 1회 자동 팝업

const CURRENT_VERSION = '2.0.0';

const RELEASE_NOTES = [
  {
    version: '2.0.0',
    date: '2026-05-10',
    title: '팀 활동 + AI 어시스턴트 출시',
    changes: [
      '주간보고를 "팀 활동"으로 전면 개편 — 작성 화면 일체 제거, 자동 집계',
      '팀 매트릭스: 사용자별 완료/진행 중/미진행/지연/콘텐츠 한 화면',
      '활동 피드: 시간순 통합 타임라인 (완료/생성/발행/댓글/이슈)',
      '개인 상세: 요약 카드, 일별 추이 차트, 카테고리/유형 분포',
      '✨ AI 정리 도우미: 대화로 원하는 형태로 활동 정리 (마크다운 표 지원)',
      '🤖 전역 LLM 채팅 위젯: 우측 하단 floating, 단축키 C',
      '실시간 자동 갱신: 업무 추가/수정/삭제 시 새로고침 없이 즉시 반영',
      '관리자 계정은 팀 활동/매트릭스에서 자동 제외',
      '점수 필드 UI 정리, 상태 라벨 통일 (할 일/진행 중/완료/미진행)',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-04-01',
    title: '최초 출시',
    changes: [
      '업무 현황 (칸반 보드)',
      '연간 타임라인',
      '콘텐츠 캘린더',
      '팀 캘린더 / R&R / 성과 관리',
      'Audit log 기반 변경 이력',
    ],
  },
];

const ReleaseNotes = {
  showLatest() {
    const last = localStorage.getItem('task_version');
    if (last === CURRENT_VERSION) return;
    this._renderModal();
  },

  showAll() {
    this._renderModal({ all: true });
  },

  _renderModal({ all = false } = {}) {
    // 기존 모달 제거
    document.getElementById('release-notes-modal')?.remove();

    const items = all ? RELEASE_NOTES : [RELEASE_NOTES[0]];
    const latest = RELEASE_NOTES[0];

    const overlay = document.createElement('div');
    overlay.id = 'release-notes-modal';
    overlay.className = 'rn-overlay';
    overlay.innerHTML = `
      <div class="rn-modal">
        <div class="rn-header">
          <div class="rn-header-l">
            <span class="rn-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4l6 8 6-8" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                <path d="M2 4h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
            </span>
            <span class="rn-title-text">${all ? '릴리즈 노트' : '업데이트 안내'}</span>
            ${!all ? `<span class="rn-version-tag">v${latest.version}</span>` : ''}
          </div>
          <button class="rn-close" id="rn-close" title="닫기">✕</button>
        </div>
        <div class="rn-body">
          ${items.map(it => `
            <div class="rn-entry">
              <div class="rn-entry-head">
                ${all ? `<span class="rn-version-tag">v${it.version}</span>` : ''}
                <h3 class="rn-entry-title">${escHtml(it.title)}</h3>
                <span class="rn-entry-date">${escHtml(it.date)}</span>
              </div>
              <ul class="rn-changes">
                ${it.changes.map(c => `<li><span class="rn-bullet">•</span><span>${escHtml(c)}</span></li>`).join('')}
              </ul>
            </div>
          `).join('')}
        </div>
        <div class="rn-footer">
          <button class="btn btn-primary" id="rn-confirm">${all ? '닫기' : '확인'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('rn-overlay-open'));

    const dismiss = () => {
      // 자동 팝업이면 본 버전 저장
      if (!all) localStorage.setItem('task_version', CURRENT_VERSION);
      overlay.classList.remove('rn-overlay-open');
      setTimeout(() => overlay.remove(), 200);
    };
    document.getElementById('rn-close').addEventListener('click', dismiss);
    document.getElementById('rn-confirm').addEventListener('click', dismiss);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) dismiss();
    });
  },
};
