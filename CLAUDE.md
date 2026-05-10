# Task — 마케팅 업무 관리 도구

## 프로젝트 개요
VIRNECT 마케팅팀 내부 업무 관리 웹 애플리케이션.
기존 엑셀 기반 관리(업무현황, 콘텐츠 타임테이블, 연간 타임라인, R&R)를 웹 프로그램으로 전환.

- 서비스명: **Task**
- 내부 접속 URL: `http://marketing.virnect.local/task`
- 사내망 접근, 누구나 자체 회원가입 가능 (별도 승인 없음)
- 로그인 상태 30일 자동 유지 (remember-me 쿠키)

## 기술 스택
- **백엔드**: Node.js (Express) + PostgreSQL
- **프론트엔드**: Vanilla JS + HTML/CSS (Single Page Application)
- **배포**: Docker + Nginx (사내 서버)
- **앱 포트**: 3004
- **Nginx 라우팅**: `location /task { proxy_pass http://task:3004; }`
- **인증**: bcrypt 비밀번호 해싱 + HttpOnly 쿠키 세션
- **폰트**: Pretendard
- **주 색상**: #4F6EF7

## 디렉토리 구조
```
task/
├── CLAUDE.md
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── src/
│   ├── server.js
│   ├── db/
│   │   ├── index.js
│   │   └── schema.sql
│   ├── routes/
│   │   ├── auth.js            ← 로그인/회원가입/로그아웃
│   │   ├── tasks.js
│   │   ├── content.js
│   │   ├── timeline.js
│   │   ├── rrr.js
│   │   └── audit.js           ← 변경 이력 조회 + CSV 내보내기
│   └── middleware/
│       ├── auth.js            ← 세션 검증
│       ├── audit.js           ← 자동 audit log 기록
│       └── error.js
├── public/
│   ├── login.html             ← 로그인/회원가입 페이지
│   ├── index.html             ← SPA 진입점 (인증 후)
│   ├── css/main.css
│   └── js/
│       ├── app.js
│       ├── views/
│       │   ├── dashboard.js
│       │   ├── tasks.js
│       │   ├── timeline.js
│       │   ├── content.js
│       │   └── rrr.js
│       └── api.js
└── docs/
```

## 인증 설계
- 회원가입: 이름 + 이메일 + 비밀번호 (자유 가입, 승인 없음)
- 로그인 → sessions 테이블에 토큰 생성 → HttpOnly 쿠키(task_session) 발급
- 쿠키: 만료 30일, Secure:false(HTTP 사내망), SameSite:Lax
- 모든 API: middleware/auth.js로 세션 유효성 검사 → req.user 주입
- 로그아웃: 서버에서 세션 레코드 삭제

## Audit Log 설계
- 모든 POST/PUT/PATCH/DELETE에 middleware/audit.js 자동 적용
- 기록: user_id, user_name, action, table_name, record_id, old_value(JSON), new_value(JSON), ip_address, created_at
- 조회: GET /task/api/audit (필터: table, user_id, 날짜 범위)
- CSV 내보내기: GET /task/api/audit/export.csv
- 영구 보관 (삭제 없음)

## 업무 분류 카테고리 (초기 데이터)
회사소개서, 소개자료, 홈페이지, 콘텐츠 제작, 고도화 자료 제작, 브랜딩, 온라인광고, 전시회, 1층 체험관, 지원사업, 제안서 지원, PR

## 제품 목록 (초기 데이터)
Core, Remote, Bodycam, VisionX, Make&View, Robotics, Inspect, HoloX, Twin, XR, AutoGuide, Workstation

## 콘텐츠 채널 코드
IG, FB, LI, YT, BL, EM, HM

## 콘텐츠 타입 코드
I, C, V, S, Q, A, L, T

## 디자인 레퍼런스
Taskworld 스타일 — docs/디자인가이드.md 참조
- 사이드바: 다크(#1C1E26), 카테고리 컬러 도트
- 메인: 연회색 배경(#F2F3F7) + 흰 카드
- 칸반: 진행중=파란 좌측 보더, 미진행=빨간 좌측 보더, 완료=투명도 75%

## 주요 기능
- [ ] 로그인 / 회원가입
- [ ] 대시보드
- [ ] 업무 현황 (칸반 보드)
- [ ] 연간 타임라인
- [ ] 콘텐츠 캘린더
- [ ] R&R 현황
- [ ] 변경 이력 (Audit Log + CSV 내보내기)

## 참조 문서
- 기능 상세: docs/기능정의.md
- 화면 구성: docs/화면정의.md
- DB 스키마: docs/DB설계.md
- 디자인 규칙: docs/디자인가이드.md

## 코딩 규칙
- 변수명/함수명: 영어 camelCase
- 주석: 한국어
- API 응답: JSON { data, error, message }
- 에러 처리: 모든 async에 try/catch
- 포트: 3004
- base path: /task (모든 경로에 prefix)
  - HTML: <base href="/task/">
  - Express: app.use('/task', router)
- 비밀번호: bcrypt rounds 10
- 세션 토큰: crypto.randomBytes(32).toString('hex')

## 버전 관리 정책 (Semantic Versioning)

이 프로젝트는 **MAJOR.MINOR.PATCH** SemVer 규칙을 따른다.
- **MAJOR** — 호환성이 깨지는 큰 변경 (DB 스키마 breaking change, API 응답 형식 변경 등)
- **MINOR** — 하위 호환되는 기능 추가
- **PATCH** — 버그 수정, 소규모 개선, 리팩토링

### 단일 진실의 출처
- 현재 버전: `public/js/release_notes.js` 의 `CURRENT_VERSION` 상수
- 변경 이력: 같은 파일의 `RELEASE_NOTES` 배열 (최신이 맨 위)
- localStorage `task_version` 키로 사용자별 "마지막 본 버전" 추적
- 새 버전이면 로그인 후 1회 자동 팝업 + 사이드바 하단 라벨 클릭 시 전체 노트

### 릴리즈 워크플로 (Claude는 새 기능/수정 PR마다 이 절차 자동 수행)
1. 코드 변경
2. `release_notes.js` 의 `CURRENT_VERSION` 을 SemVer 규칙에 맞춰 올림
3. `RELEASE_NOTES` 배열 맨 위에 새 항목 추가 (`{ version, date(YYYY-MM-DD), title, changes[] }`)
4. `git commit` (메시지에 변경 내용 명시)
5. `git push origin master`
6. `git tag -a v1.x.x <commit-sha> -m "한 줄 요약"`
7. `git push origin --tags`
8. (사용자 안내) 서버 배포: `git pull && docker compose up -d --build task`

### 롤백 절차
- **안전 롤백 (권장)**: `git revert HEAD --no-edit` 또는 `git revert v1.x.x..HEAD --no-edit` 후 push
- **강제 롤백**: `git reset --hard v1.x.x && git push --force` (혼자 작업 시만, 위험)
- **서버만 이전 버전으로**: `git checkout v1.x.x && docker compose up -d --build task`

### 금지 사항
- `release_notes.js` 의 `RELEASE_NOTES` 기존 항목을 수정·삭제하지 말 것 (이력은 영구 보존)
- 태그를 강제로 옮기지 말 것 (`git tag -f` 금지). 잘못 박았으면 새 patch 버전으로 정정
- MAJOR 올림은 사용자 명시적 승인 필요 (호환성 깨짐 = 사용자 영향 큼)

## 배포 표준 명령
```powershell
cd D:\apps\task
git pull origin master
docker compose up -d --build task    # ← --build 필수, 빠지면 코드 미반영
docker compose logs --tail=30 task
```

## LLM 연동 (옵션)
- 서버 `.env` 에 `LLM_API_URL`, `LLM_MODEL`, `LLM_API_KEY(옵션)` 설정
- OpenAI 호환 API 엔드포인트 (Ollama / LM Studio / vLLM)
- 미설정 시 AI 채팅·요약 버튼만 비활성, 다른 기능에는 영향 없음
