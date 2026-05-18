// 버전 관리 + 업데이트 팝업
// — my-crm의 ReleaseNotesModal 패턴 포팅 (Vanilla JS)
// — 새 배포 시 CURRENT_VERSION 올리고 RELEASE_NOTES에 항목 추가하면
//   사용자가 다음 접속 시 1회 자동 팝업

// 버전 규칙: SemVer (MAJOR.MINOR.PATCH)
//   MAJOR — 호환성이 깨지는 큰 변경
//   MINOR — 하위 호환되는 기능 추가
//   PATCH — 하위 호환되는 버그 수정 / 소규모 개선
const CURRENT_VERSION = '2.7.1';

const RELEASE_NOTES = [
  {
    version: '2.7.1',
    date: '2026-05-18',
    title: 'AI 대량 삭제 안전 흐름 + 응답 오류 메시지 개선',
    sections: [
      {
        kind: 'feature',
        title: 'AI 어시스턴트 — 대량 삭제 도구 + 2단계 확인',
        items: [
          {
            text: '"전체 삭제", "5월 콘텐츠 다 지워줘" 같은 대량 삭제 요청을 위해 bulk_delete_content / bulk_delete_tasks / bulk_delete_calendar_events 도구 신설. AI가 50건을 한 줄씩 도구 호출하다 타임아웃 나던 문제 해결.',
            demo: '예) "내 5월 콘텐츠 다 삭제해줘"\n  1. AI: bulk_delete_content (dry_run=true) 호출\n     → "본인 데이터 12건 삭제 대상입니다. 정말 진행할까요?"\n  2. 사용자: "응"\n  3. AI: bulk_delete_content (dry_run=false) 호출\n     → "콘텐츠 12건 삭제 완료 (본인 데이터만)"',
          },
          { text: '서버에서 비관리자 요청은 자동으로 본인 담당/작성 데이터로만 좁힘 (LLM 추가 조건 없이도 타인 데이터 절대 안 건드림).' },
          { text: 'dry_run=true가 기본값. 실제 삭제는 반드시 사용자 재확인 후 dry_run=false 재호출이 있어야 발생.' },
        ],
      },
      {
        kind: 'fix',
        title: 'AI 채팅 — 응답 실패 메시지 개선',
        items: [
          {
            text: '게이트웨이(Nginx) 타임아웃이나 LLM 서버 오류로 HTML 에러 페이지가 오던 경우 "Unexpected token \'<\'…" 가 그대로 노출되던 문제 수정.',
            demo: '이전: ⚠ 응답 실패: Unexpected token \'<\', "<html><h"... is not valid JSON\n이후: ⚠ 응답 실패: 서버 또는 게이트웨이에서 비정상 응답(HTML)이 왔습니다. … (HTTP 504)',
          },
        ],
      },
    ],
  },
  {
    version: '2.7.0',
    date: '2026-05-18',
    title: '콘텐츠 캘린더 URL 자동 생성 + AI 어시스턴트 권한 강화 + 릴리즈노트 아코디언',
    sections: [
      {
        kind: 'feature',
        title: '콘텐츠 — 다중 생성 시 유입 URL 자동 생성',
        items: [
          {
            text: '"주제별 다중" 모드로 여러 채널 콘텐츠를 한 번에 만들 때, 각 항목마다 콘텐츠 ID + 유입 URL이 자동으로 들어갑니다.',
            demo: '예) 제품 = "Remote", 배포일 = 2026-05-20\n  IG (S) → https://virnect.com/remote?src=20260520_IG_S\n  FB (I) → https://virnect.com/remote?src=20260520_FB_I\n  BL (A) → https://virnect.com/remote?src=20260520_BL_A',
          },
          { text: '제품을 선택하지 않으면 https://virnect.com 기본 도메인으로 생성됩니다.' },
        ],
      },
      {
        kind: 'feature',
        title: '콘텐츠 — 리스트 빠른 복사 버튼 개선',
        items: [
          { text: '리스트 행의 콘텐츠 ID 옆 버튼이 "복사" 아이콘으로 변경 (기존 ⧉ 글리프 → SVG 카피 아이콘).' },
          {
            text: '클릭 시 콘텐츠 ID가 아니라 유입 URL 전체를 클립보드에 복사합니다. (URL이 없으면 콘텐츠 ID 복사로 폴백)',
            demo: '예) 클릭 → "https://virnect.com/remote?src=20260520_IG_S" 가 복사됨\n     토스트: "URL이(가) 복사되었습니다"',
          },
        ],
      },
      {
        kind: 'feature',
        title: 'AI 어시스턴트 — 타인 데이터 보호',
        items: [
          {
            text: 'AI 채팅으로 업무·콘텐츠·일정의 생성/수정/삭제를 시도할 때, 본인이 작성하거나 담당이 아닌 항목은 모두 차단됩니다. "전부 삭제" 같은 광범위 요청도 본인 항목만 대상으로 좁혀서 처리합니다.',
            demo: '예) "철수 업무 전부 완료처리" → "본인이 담당자 또는 작성자인 업무만 수정할 수 있어요" 안내',
          },
          { text: 'AI를 통해 다른 팀원에게 업무·콘텐츠·일정을 배정하는 것도 차단 (관리자 제외).' },
          { text: '키워드 검색(예: "디자인 가이드 삭제")도 본인 소유 항목 안에서만 찾도록 필터링되어, 동명의 타인 데이터를 실수로 건드릴 일이 없습니다.' },
        ],
      },
      {
        kind: 'design',
        title: '릴리즈 노트 — 버전별 아코디언',
        items: [
          { text: '전체 릴리즈 노트가 버전별로 접힌 상태로 표시됩니다. 최신 버전만 자동으로 펼쳐져 있고, 다른 버전은 헤더만 보입니다.' },
          { text: '헤더 클릭 → 해당 버전만 펼침/접기 (한 번에 하나만 열린 상태 유지 — 비교용으로 여러 개 펼치려면 다시 클릭).' },
          { text: '기능 추가/버그/디자인 카테고리 앞의 🆕/🐛/🎨 이모지 라벨 제거 — 더 깔끔한 텍스트 표기로 정돈.' },
          { text: '릴리즈 노트 GIF 첨부 기능은 보류 — 텍스트 demo 박스로 동작 예시를 충분히 전달하는 방향으로 정리.' },
        ],
      },
    ],
  },
  {
    version: '2.6.0',
    date: '2026-05-18',
    title: '콘텐츠 캘린더 대개편 + AI 채팅 줄바꿈 + 릴리즈노트 구조 개선',
    sections: [
      {
        kind: 'feature',
        title: '콘텐츠 — 주제별 그룹 + 일괄 생성',
        items: [
          { text: '새 콘텐츠 추가 시 "단일 / 주제별 다중" 모드 선택 가능' },
          {
            text: '"주제별 다중" 모드 — 하나의 주제명 입력 → 여러 채널 동시 체크 → 채널마다 타입 지정 → 한 번에 생성',
            demo: '예) 주제 = "2026 신제품 런칭"\n  ☑ IG (S 쇼츠)  ☑ FB (I 이미지)  ☑ BL (A 아티클)\n→ 3개 콘텐츠가 모두 "2026 신제품 런칭" 주제 하위로 생성됨',
          },
          { text: '콘텐츠 ID는 각 채널별로 자동 생성 (배포일 × 채널 × 타입 조합)' },
        ],
      },
      {
        kind: 'feature',
        title: '콘텐츠 — 리스트 뷰 구조 변경',
        items: [
          { text: '주제별로 묶인 카드 형태 — 주제 헤더 클릭으로 펼치기/접기' },
          { text: '주제 헤더에 채널 뱃지 + 완료/전체 카운트 + 발행일 범위 표시' },
          { text: '주제 없는 단일 콘텐츠는 기존처럼 단독 행으로 표시' },
        ],
      },
      {
        kind: 'feature',
        title: '콘텐츠 — 캘린더 뷰 추가',
        items: [
          { text: '상단 토글로 "📋 리스트" ↔ "🗓️ 캘린더" 전환' },
          { text: '월 그리드에 배포 예정일 기준으로 콘텐츠 칩 표시 (채널별 색상)' },
          { text: '캘린더 칩 클릭 → 콘텐츠 수정 폼 바로 열림' },
        ],
      },
      {
        kind: 'feature',
        title: 'AI 어시스턴트 — 줄바꿈 입력',
        items: [
          { text: '채팅 입력창에서 Shift+Enter → 줄바꿈, Enter → 전송' },
          { text: '입력창이 textarea로 변경되어 다중 줄 입력 자연스럽게 가능' },
        ],
      },
      {
        kind: 'design',
        title: '릴리즈 노트 구조 개선',
        items: [
          { text: '이번 노트부터 부제별 그룹화 (🆕 기능 추가 / 🐛 버그 수정 / 🎨 디자인)' },
          { text: '각 항목에 동작 데모 텍스트 + 스크린샷/GIF 첨부 가능 (image 필드 추가 시 자동 표시)' },
          { text: '버그 수정은 텍스트만, 신규 기능은 가능한 한 동작 예시 또는 이미지 동봉' },
        ],
      },
    ],
  },
  {
    version: '2.5.2',
    date: '2026-05-18',
    title: 'AI 어시스턴트 — 불필요한 되묻기 제거 + 기본값 자동 적용',
    changes: [
      'create_task 등 도구의 required 필드만 누락 시 되묻도록 시스템 프롬프트 강화',
      '명시되지 않은 선택 필드는 즉시 기본값 적용 (status=todo, work_type=regular, assignee=본인, all_day=true)',
      '"업무 추가해줘" 같은 짧은 요청 → 곧바로 생성, 카테고리/마감 등 추가 질문 없음',
      'create_task=title만 필수, create_calendar_event=title+start_date만 필수, create_content=title+channel+content_type만 필수 등 명확히 명시',
    ],
  },
  {
    version: '2.5.1',
    date: '2026-05-15',
    title: 'AI 어시스턴트 호출 실패 긴급 수정',
    changes: [
      'systemPrompt 가 const 로 선언되어 도구 가이드 추가 시 "Assignment to constant variable" 에러 → let 으로 수정',
    ],
  },
  {
    version: '2.5.0',
    date: '2026-05-15',
    title: 'AI 어시스턴트 — 대화로 모든 기능 실행',
    changes: [
      '채팅 위젯에서 자연어로 업무·콘텐츠·타임라인·캘린더·R&R CRUD 직접 실행',
      '예) "내일까지 회사소개서 업무 추가해줘" → 업무 생성',
      '예) "5월 1일부터 5월 15일까지 홍길동 업무 보고서 뽑아줘" → 마크다운 리포트 + 다운로드 버튼',
      '예) "AI 컨퍼런스 일정 5/20 종일로 추가" → 캘린더 일정 등록',
      '예) "디자인 가이드 업무 완료 처리해줘" → 키워드로 찾아서 상태 변경',
      '23개 도구(tool) 정의: list/create/update/delete × 업무·콘텐츠·타임라인·캘린더·R&R + 보고서 생성',
      '필수값 누락 시 LLM이 되묻기 (multi-turn), 권한 부족 시 안내',
      '도구 실행 결과를 채팅 메시지에 카드로 표시 (성공/실패 + "열기" 또는 "다운로드" 버튼)',
      '서버 측 권한 가드: 본인 담당/작성 항목만 수정·삭제, R&R은 관리자 only',
      '카테고리·팀원·제품·일정 유형 목록을 시스템 프롬프트로 자동 주입 (이름 → ID 자동 매핑)',
    ],
  },
  {
    version: '2.4.0',
    date: '2026-05-15',
    title: '대시보드 전면 개편 — Linear/Toss 스타일 큐레이션',
    changes: [
      '대시보드 전면 재작성 (위젯 DnD 제거, 큐레이션된 고정 레이아웃)',
      '상단 기간 셀렉터 추가 — 이번 주/지난 주/이번 달/분기/올해 + 커스텀',
      'Hero KPI 4종 — 완료(전기 대비 증감 표시) · 진행 중 · 주의 필요(지연+D-3) · 콘텐츠 발행',
      '내 다음 업무 Top 5 + 다가오는 일정 Top 5 (2-column)',
      '업무 상태 분포 + 카테고리별 도넛 차트 (실데이터 기반)',
      '관리자: 팀 활동 매트릭스 카드 — 완료 막대 + 진행/지연 카운트',
      '액션 필요: 지연(D+ 일수 표시) + 미진행 업무를 한눈에',
      '카드 클릭 시 해당 뷰로 즉시 이동 (drill-down)',
    ],
  },
  {
    version: '2.3.0',
    date: '2026-05-15',
    title: '일정 유형 커스텀 추가 기능',
    changes: [
      '설정에 "일정 유형" 탭 추가 — 관리자가 자유롭게 유형을 추가/이름·색상 수정/삭제 가능',
      '기본 6종(일반·회의·마감·캠페인·행사·휴일)은 색상·이름 수정만 가능, 삭제 불가',
      '커스텀 유형 삭제 시 해당 유형 사용 중인 일정은 자동으로 \'일반\'으로 이동',
      'DB migration 012: calendar_event_types 테이블 + CHECK 제약 제거',
      '캘린더 일정 추가 폼이 동적 유형 목록을 로드 (새로 추가한 유형 즉시 사용 가능)',
    ],
  },
  {
    version: '2.2.0',
    date: '2026-05-15',
    title: 'UX 일괄 개선 (캘린더·콘텐츠·R&R·설정·대시보드)',
    changes: [
      '캘린더 — 유형별 색상 자동 매핑(컬러 픽커 제거), 종일 토글 스위치 디자인 개선, 일정 수정 시 시작/종료일 정상 반영, 시간 표기 정규화(HH:mm)',
      '캘린더 — 수정/삭제 팝오버 클래스 깨짐 수정 (.popover-card → .popover 통일)',
      '콘텐츠 캘린더 — 채널 필터 버튼/기어 드롭다운 제거 (담당자·월 필터만 유지)',
      '콘텐츠 폼 — 채널/타입 코드 옆에 한글 라벨 자동 표시 + hover 툴팁 (예: IG → 인스타그램)',
      'R&R 카드 — 클릭 시 담당자별 상세 모달 (올해 누적 완료/진행/카테고리별 + 최근 완료/진행 업무)',
      'R&R 일반 사용자에게 "추가·수정은 관리자만" 안내 배너 추가',
      '설정 — 분류/제품 추가 버튼을 바디 상단으로 이동 (눈에 바로 들어오도록)',
      '설정 — 분류 추가는 모두 가능, 수정·삭제는 관리자만 (제품은 전체 admin)',
      '탑바 — 알림 벨을 우측으로 이동 (액션 버튼 옆)',
      '대시보드 편집 모드 — 드래그 시 좌/우 삽입 위치 인디케이터 표시, 정밀 드롭',
    ],
  },
  {
    version: '2.1.1',
    date: '2026-05-15',
    title: '좌상단 로고 클릭 → 홈(대시보드) 이동',
    changes: [
      '사이드바 로고 영역(아이콘 + "마케팅 업무 현황" 텍스트) 클릭 시 대시보드로 즉시 이동',
      '호버/액티브 인터랙션 추가 (Toss 톤)',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-05-15',
    title: '보고서 활용 강화 + 개인 상세 탭 오류 수정',
    changes: [
      '팀 활동 개인 상세 탭 안 뜨던 SQL 오류 수정 (이슈 placeholder가 깨져 있었음)',
      '기간 프리셋에 "이번 반기", "올해", "작년" 추가 → 반기·연간 성과 보고용 바로 활용',
      '보고서 다운로드 버튼 추가 — 마크다운(.md) 파일로 카테고리/업무 유형 그룹화된 정형 리포트',
      '"복사" 버튼도 동일한 정형 마크다운 출력 (텍스트 단순 나열 → 보고서 포맷)',
      'AI 정리 도우미가 응답한 내용이 있으면 보고서 맨 앞 "✨ AI 요약" 섹션으로 자동 포함',
      '카테고리별/업무 유형별 표 + 카테고리별 그룹핑된 완료 업무 리스트',
    ],
  },
  {
    version: '2.0.2',
    date: '2026-05-14',
    title: '알림 클릭 → 해당 항목 상세까지 자동 열림',
    changes: [
      '알림 드롭다운/슬랙형 팝업에서 클릭 시, 뷰만 이동하던 동작을 → 해당 업무·콘텐츠·타임라인 상세 패널까지 자동 오픈',
      '댓글/멘션 알림 클릭 시 업무 상세에서 댓글 탭 자동 활성화',
    ],
  },
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

  _renderEntryBody(it) {
    // 새 형식: sections — 부제별로 그룹 + 동작 데모 텍스트 첨부 가능
    if (Array.isArray(it.sections) && it.sections.length) {
      const KIND_META = {
        feature: { label: '기능 추가',  cls: 'feature' },
        fix:     { label: '버그 수정',  cls: 'fix' },
        design:  { label: '디자인 개선', cls: 'design' },
      };
      return it.sections.map(sec => {
        const meta = KIND_META[sec.kind] || { label: sec.kind, cls: '' };
        const items = (sec.items || []).map(itm => {
          const text = typeof itm === 'string' ? itm : itm.text;
          const demo = typeof itm === 'object' ? itm.demo : null;
          return `
            <div class="rn-section-item">
              <div class="rn-section-item-text">${escHtml(text)}</div>
              ${demo ? `<div class="rn-section-item-demo">${escHtml(demo)}</div>` : ''}
            </div>
          `;
        }).join('');
        return `
          <div class="rn-section ${meta.cls}">
            <div class="rn-section-title">${meta.label}${sec.title ? ' — ' + escHtml(sec.title) : ''}</div>
            ${items}
          </div>
        `;
      }).join('');
    }
    // 구형식 호환: changes 배열
    if (Array.isArray(it.changes) && it.changes.length) {
      return `<ul class="rn-changes">
        ${it.changes.map(c => `<li><span class="rn-bullet">•</span><span>${escHtml(c)}</span></li>`).join('')}
      </ul>`;
    }
    return '';
  },

  _renderModal({ all = false } = {}) {
    // 기존 모달 제거
    document.getElementById('release-notes-modal')?.remove();

    const items = all ? RELEASE_NOTES : [RELEASE_NOTES[0]];
    const latest = RELEASE_NOTES[0];
    // 아코디언: 'all' 모드에서는 최신 버전만 펼침. 자동 팝업은 단일 항목이므로 항상 펼침.
    const renderEntry = (it, idx) => {
      const expanded = !all || idx === 0;
      return `
        <div class="rn-entry ${expanded ? 'rn-entry-open' : 'rn-entry-collapsed'}" data-version="${escHtml(it.version)}">
          <button type="button" class="rn-entry-head" data-rn-toggle="${escHtml(it.version)}" aria-expanded="${expanded}">
            <span class="rn-entry-caret" aria-hidden="true">▸</span>
            <span class="rn-version-tag">v${escHtml(it.version)}</span>
            <h3 class="rn-entry-title">${escHtml(it.title)}</h3>
            <span class="rn-entry-date">${escHtml(it.date)}</span>
          </button>
          <div class="rn-entry-body">${this._renderEntryBody(it)}</div>
        </div>
      `;
    };

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
          ${items.map((it, idx) => renderEntry(it, idx)).join('')}
        </div>
        <div class="rn-footer">
          <button class="btn btn-primary" id="rn-confirm">${all ? '닫기' : '확인'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('rn-overlay-open'));

    // 아코디언 토글
    overlay.querySelectorAll('[data-rn-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const entry = btn.closest('.rn-entry');
        if (!entry) return;
        const isOpen = entry.classList.contains('rn-entry-open');
        entry.classList.toggle('rn-entry-open', !isOpen);
        entry.classList.toggle('rn-entry-collapsed', isOpen);
        btn.setAttribute('aria-expanded', String(!isOpen));
      });
    });

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
