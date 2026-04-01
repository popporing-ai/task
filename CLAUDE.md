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
