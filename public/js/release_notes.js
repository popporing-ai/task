// 버전 관리 + 업데이트 팝업
// — my-crm의 ReleaseNotesModal 패턴 포팅 (Vanilla JS)
// — 새 배포 시 CURRENT_VERSION 올리고 RELEASE_NOTES에 항목 추가하면
//   사용자가 다음 접속 시 1회 자동 팝업

// 버전 규칙: SemVer (MAJOR.MINOR.PATCH)
//   MAJOR — 호환성이 깨지는 큰 변경
//   MINOR — 하위 호환되는 기능 추가
//   PATCH — 하위 호환되는 버그 수정 / 소규모 개선
const CURRENT_VERSION = '2.0.1';

const RELEASE_NOTES = [
  {
    version: '2.0.1',
    date: '2026-05-14',
    title: 'v2.0.0 회복 — 깨진 위젯 CSS 복구 + 카드 대비 강화',
    changes: [
      '주간보고/팀 활동/채팅 위젯/릴리즈 노트 모달 CSS 1,850줄 복구',
      '카드·위젯·칸반·테이블·R&R에 1px 보더 추가 — 흰 배경 대비 가독성 ↑',
      '메인 배경 #F9FAFB → #F2F4F6 으로 살짝 진하게',
      '그림자 강도 ↑ — 카드/패널 경계 명확',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-05-14',
    title: '팀 배포 정비 — 핵심만 남기고 디자인 전면 개편',
    changes: [
      '성과/평가/포인트/이슈/의존성/팀 목표/피드백/면담 기능 일괄 제거 (DB 테이블 10종 + tasks/subtasks.points 컬럼 drop, migration-011 자동 실행)',
      'UI/UX 전면 개편 — Toss 톤(라이트 뉴트럴, 둥근 모서리, 부드러운 그림자, 마이크로 인터랙션)',
      '사이드바·버튼·카드·입력·다이얼로그·칸반 카드 모두 재정의',
      '대시보드: 활성 이슈·팀 KPI·업무 분포 위젯 제거 (성과 기능 의존)',
      '주간보고/팀 활동/글로벌 AI 채팅 위젯/SemVer 기능은 그대로 유지',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-05-10',
    title: '버전 관리 정책 + 릴리즈 노트 진입점',
    changes: [
      'SemVer(MAJOR.MINOR.PATCH) 정책 도입',
      '사이드바 하단 버전 라벨 추가 — 클릭 시 전체 릴리즈 노트 모달',
      '깃 태그로 모든 릴리즈 마킹 → 잘못 배포 시 git checkout v1.x.x 로 즉시 롤백',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-05-10',
    title: 'UX 정리 패치',
    changes: [
      '관리자(안영선) 계정을 팀 매트릭스 / 활동 피드 / 개인 상세 셀렉트에서 자동 제외',
      '댓글·이슈 등에서 사용자 이름 표시는 그대로 유지 (DB 보존)',
      '"점수" 필드 UI 일괄 제거 (매트릭스 카드/컬럼, 개인 상세 카드, 텍스트 복사)',
      '상태 라벨 통일 — "진행" → "진행 중", 칸반과 일관',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-05-10',
    title: '팀 활동 + AI 어시스턴트',
    changes: [
      '주간보고를 "팀 활동"으로 전면 개편 — 작성 화면 일체 제거, 자동 집계',
      '팀 매트릭스: 사용자별 완료/진행 중/미진행/지연/콘텐츠 한 화면',
      '활동 피드: 시간순 통합 타임라인 (완료/생성/발행/댓글/이슈)',
      '개인 상세: 요약 카드, 일별 추이 차트, 카테고리/유형 분포',
      '✨ AI 정리 도우미: 대화로 원하는 형태로 활동 정리 (마크다운 표 지원)',
      '🤖 전역 LLM 채팅 위젯: 우측 하단 floating, 단축키 C',
      '실시간 자동 갱신: 업무 추가/수정/삭제 시 새로고침 없이 즉시 반영',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-05-09',
    title: '주간보고 자동 활동 리포트',
    changes: [
      '주간보고를 자동 집계 리포트로 개편',
      '사용자별·기간별 활동을 한 화면에서 조회',
      '텍스트 복사 / 인쇄(PDF 저장) 지원',
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
