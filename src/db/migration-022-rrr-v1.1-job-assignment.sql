-- migration-022: R&R v1.1 (2026-08-18) 마케팅본부 업무분장표 반영
-- 변경 사유: 2026.08 인력 3명(안영선, 남병진, 구지향) 기준 R&R 재배분.
--   - rrr_items에 파트/대분류/주요내용/부담당/상태비고 컬럼 추가
--   - frequency를 자유 텍스트로 완화(상시, 주, 분기 등 엑셀 표기 그대로)
--   - 업무분장표(정기 업무분장) + 솔루션별 리드 담당자를 v1.1로 시드

-- 1) 컬럼 확장 (기존 DB 대응, 멱등)
ALTER TABLE rrr_items ADD COLUMN IF NOT EXISTS part         VARCHAR(50);
ALTER TABLE rrr_items ADD COLUMN IF NOT EXISTS category     VARCHAR(50);
ALTER TABLE rrr_items ADD COLUMN IF NOT EXISTS task_detail  TEXT;
ALTER TABLE rrr_items ADD COLUMN IF NOT EXISTS sub_assignee VARCHAR(100);
ALTER TABLE rrr_items ADD COLUMN IF NOT EXISTS status_note  VARCHAR(100);

-- frequency 자유 텍스트화(엑셀의 '상시','주 1~2건' 등 수용)
ALTER TABLE rrr_items DROP CONSTRAINT IF EXISTS rrr_items_frequency_check;
ALTER TABLE rrr_items ALTER COLUMN frequency TYPE VARCHAR(50);

-- 업무명이 길어질 수 있어 여유 확보
ALTER TABLE rrr_items ALTER COLUMN description TYPE VARCHAR(300);

-- 2) v1.1 버전 생성 + 데이터 시드 (v1.1 없을 때 한 번만)
DO $$
DECLARE
  v_id  INTEGER;
  u_ays INTEGER;  -- 안영선
  u_nbj INTEGER;  -- 남병진
  u_gjh INTEGER;  -- 구지향
BEGIN
  IF EXISTS (SELECT 1 FROM rrr_versions WHERE version = '1.1') THEN
    RETURN;
  END IF;

  SELECT id INTO u_ays FROM users WHERE name = '안영선' ORDER BY id LIMIT 1;
  SELECT id INTO u_nbj FROM users WHERE name = '남병진' ORDER BY id LIMIT 1;
  SELECT id INTO u_gjh FROM users WHERE name = '구지향' ORDER BY id LIMIT 1;

  -- 3인이 모두 있어야 시드 (미존재 시 다음 서버 시작에서 재시도)
  IF u_ays IS NULL OR u_nbj IS NULL OR u_gjh IS NULL THEN
    RETURN;
  END IF;

  UPDATE rrr_versions SET is_current = false WHERE is_current = true;
  INSERT INTO rrr_versions (version, effective_date, title, change_note, is_current)
  VALUES ('1.1', '2026-08-18', '2026.08 인력 3명 기준 R&R 재배분',
          '마케팅본부 업무분장표(260813) 반영. 파트/대분류/주요내용/부담당/주기 표기 추가.', true)
  RETURNING id INTO v_id;

  -- 역할/기능 (정기 업무분장)
  INSERT INTO rrr_items (user_id, role_type, description, task_detail, part, category, frequency, sub_assignee, status_note, sort_order, version_id) VALUES
  (u_ays,'function','마케팅본부 업무 총괄','본부 목표 수립, 업무 배분, 우선순위 결정, 성과 및 품질 관리','본부운영','총괄','상시',NULL,NULL,0,v_id),
  (u_ays,'function','대외 산출물 검토, 승인','소개자료, 콘텐츠, 기사, 제안자료 등 외부 공개물 최종 검토 및 홍보 수위 판단','본부운영','총괄','상시',NULL,NULL,1,v_id),
  (u_ays,'function','주간 보고','주간 업무보고 작성 및 보고','본부운영','총괄','주','각 담당자',NULL,2,v_id),
  (u_ays,'function','인력 운영, 평가, 면담','성과점검 면담, 채용 JD 작성, 결원 발생 시 업무 재배치','본부운영','총괄','반기, 수시',NULL,NULL,3,v_id),
  (u_ays,'function','예산, 비용 집행 관리','마케팅 예산, 과제비 연계 집행, 법인카드 정산, 구독료 관리','본부운영','총괄','월, 수시',NULL,NULL,4,v_id),
  (u_ays,'function','기타 정의되지 않은 본부 운영 업무',NULL,'본부운영','총괄','수시',NULL,NULL,5,v_id),
  (u_ays,'function','브랜드 가이드라인, 슬로건 관리','브랜드와 솔루션 슬로건 제정, 메시지 가이드 배포, 사용 기준 관리','브랜드','브랜드','수시','남병진',NULL,6,v_id),
  (u_nbj,'function','CI, 디자인 자산 관리','로고, 서체, 색상 등 CI 자산 보관과 사용 기준 관리, 사내 배포','브랜드','브랜드','수시','안영선',NULL,0,v_id),
  (u_nbj,'function','마케팅 아이디어 등록','담당 솔루션 관련 계약, 레퍼런스, 개발 결과 등 홍보 소재 등록','브랜드','기획','상시',NULL,NULL,1,v_id),
  (u_gjh,'function','마케팅 아이디어 등록','담당 솔루션 관련 계약, 레퍼런스, 개발 결과 등 홍보 소재 등록','브랜드','기획','상시',NULL,NULL,0,v_id),
  (u_ays,'function','마케팅 아이디어 기획 판단','홍보 포인트, 외부 표현 수위, 공개 수준, 우선순위 결정','브랜드','기획','수시',NULL,NULL,7,v_id),
  (u_ays,'function','기타 정의되지 않은 기획, 브랜드 업무',NULL,'브랜드','기획','수시',NULL,NULL,8,v_id),
  (u_ays,'function','PR 기획, 초안 작성','솔루션 업데이트, 신규 출시, 현장 검증, 수주 및 파트너십 기사 기획과 작성','PR','PR','주 1~2건',NULL,NULL,9,v_id),
  (u_ays,'function','기사 송출, 매체 대응','기자 컨택, 매체 배포, 고객사와 기관 공보 검토 대응','PR','PR','수시',NULL,NULL,10,v_id),
  (u_ays,'function','PR 관리 대장 운영','기사 건별 상태, 송출일, 매체, 링크 관리','PR','PR','상시',NULL,NULL,11,v_id),
  (u_ays,'function','PR 소재 자동 수집 운영','슬랙 채널 기반 기사 주제 자동 수집 및 제안 봇 운영','PR','PR','상시',NULL,NULL,12,v_id),
  (u_ays,'function','방송, 외부 미디어 협업','촬영 협의, 출연과 시연 지원, 방영 내용의 콘텐츠 전환','PR','미디어','수시','남병진',NULL,13,v_id),
  (u_ays,'function','기타 정의되지 않은 PR 업무',NULL,'PR','PR','수시',NULL,NULL,14,v_id),
  (u_nbj,'function','유튜브 영상 기획, 제작, 발행','기획, 촬영, 편집, 자막, 썸네일 이미지 제작','콘텐츠','영상','상시',NULL,NULL,2,v_id),
  (u_nbj,'function','제품 소개 영상 제작','신규 제품 기능별 시퀀스 촬영과 통합 소개 영상 제작','콘텐츠','영상','출시 시','안영선',NULL,3,v_id),
  (u_nbj,'function','고객사 현장 촬영','현장 검증과 납품 사례 촬영, 촬영 허가 및 일정 협의','콘텐츠','영상','수시','안영선',NULL,4,v_id),
  (u_nbj,'function','영상 자산 아카이브 관리','촬영 원본과 편집본에 파일명 규칙 적용, NAS 및 OneDrive 보관','콘텐츠','영상','상시','구지향',NULL,5,v_id),
  (u_gjh,'function','콘텐츠 기획, 주제 선정','승인된 아이디어를 포맷과 시리즈로 기획하고 주간 주제 확정','콘텐츠','콘텐츠기획','주','안영선',NULL,1,v_id),
  (u_nbj,'function','납품사례 포트폴리오 자산화','산업별 대표 사례를 문제, 해결, 효과 구조와 영상 또는 이미지, 문서로 가공','콘텐츠','자산화','연간, 수시','구지향',NULL,6,v_id),
  (u_nbj,'function','영문 콘텐츠 대응','영문 소개자료, 영문 게시물, 영문 자막 대응','콘텐츠','영문','수시',NULL,NULL,7,v_id),
  (u_gjh,'function','영문 콘텐츠 대응','영문 소개자료, 영문 게시물, 영문 자막 대응','콘텐츠','영문','수시',NULL,NULL,2,v_id),
  (u_nbj,'function','기타 정의되지 않은 콘텐츠 업무',NULL,'콘텐츠','콘텐츠','수시','구지향',NULL,8,v_id),
  (u_gjh,'function','홈페이지 개발, 배포, 운영','virnect.com 및 제품 사이트 기능 개발, 배포, 장애 대응, 형상관리','채널','홈페이지','상시','안영선',NULL,3,v_id),
  (u_gjh,'function','홈페이지 콘텐츠 게시, 업데이트','콘텐츠 작성, 뉴스와 자료실 게시, 제품 페이지 분기 갱신','채널','홈페이지','분기, 상시','남병진',NULL,4,v_id),
  (u_gjh,'function','문의, 예약 폼 운영','자체 개발 폼 운영, 접수 알림, 데이터 적재와 유입 코드 유지','채널','홈페이지','상시','안영선',NULL,5,v_id),
  (u_gjh,'function','채널 운영: 네이버 블로그','콘텐츠 제작 및 발행','채널','블로그','주 2회 목표',NULL,NULL,6,v_id),
  (u_gjh,'function','채널 운영: 링크드인','콘텐츠 제작 및 발행','채널','링크드인','일 1회 목표',NULL,NULL,7,v_id),
  (u_gjh,'function','채널 운영: 페이스북','콘텐츠 제작 및 발행','채널','페이스북','일 1회 목표',NULL,NULL,8,v_id),
  (u_nbj,'function','채널 운영: 유튜브','제목과 설명, 태그, 재생목록 관리','채널','유튜브','상시','구지향',NULL,9,v_id),
  (u_gjh,'function','키워드 전략, 검색 노출 관리','홈페이지와 광고, 콘텐츠 키워드 통합 관리, 검색엔진 등록과 색인 점검','채널','SEO/AEO','상시',NULL,NULL,9,v_id),
  (u_gjh,'function','검색광고 집행: 네이버, 구글','키워드 세팅, 예산 집행, 월간 리포트 작성','채널','검색광고','월','안영선',NULL,10,v_id),
  (u_gjh,'function','기타 정의되지 않은 채널, 광고 업무',NULL,'채널','채널','수시','남병진',NULL,11,v_id),
  (u_gjh,'function','이메일마케팅 기획, 발송','솔루션과 산업별 세분화 타겟팅, 발송 툴 운영, 성과 집계','캠페인','이메일','월, 수시','남병진',NULL,12,v_id),
  (u_gjh,'function','발송 대상 DB 관리','전시 수집 DB와 리드 DB 정리, 수신 동의 여부 구분 관리','캠페인','이메일','수시','남병진',NULL,13,v_id),
  (u_ays,'function','전시회, 외부행사 총괄','연간 참가 계획, 참가 신청, 예산, 부스 구성, 설치와 운영, 철수','캠페인','전시운영','수시','남병진',NULL,15,v_id),
  (u_nbj,'function','전시 부스 자료 제작','백월, 판넬, 포스터, 리플렛, 판촉물 제작과 반출 관리','캠페인','전시운영','참가 시','안영선',NULL,10,v_id),
  (u_ays,'function','전시 지원사업 확보','단독 및 공동 부스 지원사업, 해외 전시 지원 공고 조사와 신청','캠페인','전시운영','수시','구지향',NULL,16,v_id),
  (u_ays,'function','수상, 어워드 출품 총괄','출품 아이템 선정, 컨설팅 운영, 제출 서류와 출품 영상 제작 관리','캠페인','수상','상시','남병진',NULL,17,v_id),
  (u_gjh,'function','체험관 관리','1층 체험관 콘텐츠와 장비 업데이트, 운영 점검','캠페인','일반관리','분기','안영선',NULL,14,v_id),
  (u_nbj,'function','회사 연혁 관리','수주, 계약, 인증, 수상 등 연혁 갱신과 사내 공유','캠페인','일반관리','월','안영선',NULL,11,v_id),
  (u_ays,'function','기타 정의되지 않은 캠페인, 전시 업무',NULL,'캠페인','캠페인','수시','남병진',NULL,18,v_id),
  (u_nbj,'function','회사소개서 제작, 업데이트','국문과 영문 회사소개서 리뉴얼, 적용 사례와 재무 수치 갱신','자료','소개서','분기','안영선',NULL,12,v_id),
  (u_nbj,'function','솔루션 소개자료 제작, 업데이트','솔루션별 기본 소개자료 제작과 분기 갱신','자료','소개자료','분기',NULL,NULL,13,v_id),
  (u_gjh,'function','솔루션 소개자료 제작, 업데이트','솔루션별 기본 소개자료 제작과 분기 갱신','자료','소개자료','분기',NULL,NULL,15,v_id),
  (u_nbj,'function','리플렛, 브로슈어 제작','대리점과 고객용 리플렛, 제품별 리플렛, 브로슈어 제작과 인쇄 발주','자료','소개자료','수시','구지향',NULL,14,v_id),
  (u_nbj,'function','마케팅, 영업 제안 자료 제작','이메일 타겟팅 자료, 솔루션과 산업별 제안 자료, 영업 요청 대응','자료','제안자료','수시','구지향',NULL,15,v_id),
  (u_nbj,'function','고도화 자료 제작','구축 가이드, 아키텍처와 보안 설명 자료, 경쟁 제품 비교표','자료','고도화자료','수시','구지향',NULL,16,v_id),
  (u_nbj,'function','디자인 대응','사내 디자인 요청 접수와 대응. AI 우선, 2D디자인팀 요청, 긴급 시 자체 제작','자료','디자인','수시',NULL,NULL,17,v_id),
  (u_nbj,'function','기타 정의되지 않은 자료, 제안 업무',NULL,'자료','자료','수시','구지향',NULL,18,v_id),
  (u_ays,'function','데이터, 성과 분석 및 리포팅','문의, 콘텐츠, PR, 전시, 광고 실적 집계와 월간 보고','데이터','성과','월','구지향',NULL,19,v_id),
  (u_gjh,'function','유입경로 추적 관리','캠페인 코드 체계 운영, GA4 이벤트 설계, 문의와 예약 전환 측정','데이터','데이터','상시','안영선',NULL,16,v_id),
  (u_gjh,'function','리드, 고객 DB 관리','문의, 명함, 전시 수집 DB 등록과 정제, SQL 전환','데이터','데이터','상시','안영선',NULL,17,v_id),
  (u_nbj,'function','납품이력 데이터 취합','사례 자산화와 회사소개서 갱신을 위한 납품 이력 취합','데이터','데이터','수시','구지향',NULL,19,v_id),
  (u_gjh,'function','외주 업체 서칭, 견적','판촉물, 인쇄, 촬영, 번역, 컨설팅 업체 서칭과 견적 비교','데이터','오퍼레이션','건별','남병진',NULL,18,v_id),
  (u_gjh,'function','기타 정의되지 않은 데이터, 오퍼레이션 업무',NULL,'데이터','오퍼레이션','수시','남병진',NULL,19,v_id),
  (u_ays,'function','마케팅 서버, 인프라 운영','사내 마케팅 서버, Docker와 Nginx, 포트 할당, 배포와 백업 관리','시스템','인프라','상시','구지향',NULL,20,v_id),
  (u_ays,'function','마케팅 업무 시스템 운영','업무관리, 고객 데이터, 문의 릴레이, 콘텐츠 자동화, 보도 모니터링 운영','시스템','인프라','상시','구지향',NULL,21,v_id),
  (u_ays,'function','슬랙 봇, 업무 자동화 운영','마케팅 아이디어 수집, PR 주제 선정, 알림 자동화 운영과 개선','시스템','자동화','상시',NULL,NULL,22,v_id),
  (u_ays,'function','NAS, 문서 아카이브 관리','마케팅 자산의 NAS와 OneDrive 폴더 체계, 접근 권한, 백업 관리','시스템','자산관리','상시','남병진',NULL,23,v_id),
  (u_ays,'function','계정, 구독 툴 관리','발송 툴, 광고 계정, SNS 계정, 구독 결제와 갱신 관리','시스템','자산관리','수시','구지향',NULL,24,v_id),
  (u_ays,'function','기타 정의되지 않은 시스템 업무',NULL,'시스템','시스템','수시','구지향',NULL,25,v_id),
  (u_ays,'function','특허 출원 관리','발명 신고 접수, 출원 여부 검토, 대리인 협의, 국내와 해외 출원 진행','지식재산권','특허','수시',NULL,NULL,26,v_id),
  (u_ays,'function','OA(의견제출통지) 대응','거절이유 분석, 의견서와 보정서 검토, 대응 방향 결정 및 보고','지식재산권','특허','수시',NULL,NULL,27,v_id),
  (u_ays,'function','특허 등록, 등록증 관리','등록결정 확인, 등록료 납부, 등록증과 등록특허공보 보관','지식재산권','특허','수시',NULL,NULL,28,v_id),
  (u_ays,'function','특허 유지 검토, 포기 처리','권리 가치와 제품 정합성 검토, 유지 여부 판단, 포기 처리와 비용 정리','지식재산권','특허','정기, 수시',NULL,NULL,29,v_id),
  (u_ays,'function','연차료 관리','연차료 납부 대상 확인, 납부 일정과 이력 관리','지식재산권','특허','정기',NULL,NULL,30,v_id),
  (u_ays,'function','상표, 디자인 출원 및 관리','제품명과 로고 상표 출원, 디자인권 출원 검토와 갱신 관리','지식재산권','상표','수시',NULL,NULL,31,v_id),
  (u_ays,'function','저작권(프로그램) 등록 관리','과제 및 개발 산출물 프로그램 등록, 등록증과 등록원부 관리','지식재산권','저작권','수시',NULL,NULL,32,v_id),
  (u_ays,'function','기술이전, 권리이전 처리','실시계약과 권리이전 서류 검토, 이전 절차 진행','지식재산권','기술이전','수시',NULL,NULL,33,v_id),
  (u_ays,'function','침해 대응, 선행기술 조사','침해 여부 분석, 회피 설계 검토, 선행기술 및 특허 동향 조사','지식재산권','침해대응','수시',NULL,NULL,34,v_id),
  (u_ays,'function','직무발명제도 운영','직무발명 신고와 보상 기준 운영, 발명자 양도증 관리','지식재산권','제도','수시',NULL,NULL,35,v_id),
  (u_ays,'function','기타 정의되지 않은 지식재산권 업무',NULL,'지식재산권','지식재산권','수시',NULL,NULL,36,v_id),
  (u_ays,'function','신원스틸 마케팅 지원 총괄','소통 창구 운영, 요청 접수와 담당 배정','기타','지원','수시',NULL,NULL,37,v_id),
  (u_gjh,'function','신원스틸 홈페이지, 검색광고 운영','홈페이지 제작과 운영, 검색광고 세팅과 주간 및 월간 리포트','기타','지원','상시','안영선',NULL,20,v_id),
  (u_ays,'function','과제, 사업 홍보 지원','국책 및 지자체 과제의 홍보 파트 작성, 행사 기획, 월간보고 대응','기타','지원','수시','남병진',NULL,38,v_id),
  (u_ays,'function','사내 요청 검토 대응','영상, 문구, 자료 검토와 사내 부서 요청 대응','기타','지원','수시','남병진, 구지향',NULL,39,v_id),
  (u_ays,'function','기타 정의되지 않은 업무',NULL,'기타','기타','수시','남병진, 구지향',NULL,40,v_id);

  -- 솔루션별 리드 담당자
  INSERT INTO rrr_items (user_id, role_type, description, task_detail, part, category, frequency, sub_assignee, status_note, sort_order, version_id) VALUES
  (u_ays,'solution_lead','전 솔루션 포괄 관리',NULL,NULL,NULL,NULL,NULL,'리드 구분 없이 전 솔루션 검토 및 총괄',41,v_id),
  (u_nbj,'solution_lead','Make&View',NULL,NULL,NULL,NULL,NULL,NULL,20,v_id),
  (u_nbj,'solution_lead','Workstation&Admin',NULL,NULL,NULL,NULL,NULL,NULL,21,v_id),
  (u_nbj,'solution_lead','AutoGuide',NULL,NULL,NULL,NULL,NULL,NULL,22,v_id),
  (u_nbj,'solution_lead','Checklist',NULL,NULL,NULL,NULL,NULL,'보류',23,v_id),
  (u_nbj,'solution_lead','제품 HW 디자인',NULL,NULL,NULL,NULL,NULL,'Hand Grip 등. 일부 출시',24,v_id),
  (u_nbj,'solution_lead','Remote',NULL,NULL,NULL,NULL,NULL,NULL,25,v_id),
  (u_nbj,'solution_lead','Scout',NULL,NULL,NULL,NULL,NULL,NULL,26,v_id),
  (u_nbj,'solution_lead','Blackbox',NULL,NULL,NULL,NULL,NULL,NULL,27,v_id),
  (u_nbj,'solution_lead','Twin',NULL,NULL,NULL,NULL,NULL,NULL,28,v_id),
  (u_nbj,'solution_lead','Milforce',NULL,NULL,NULL,NULL,NULL,NULL,29,v_id),
  (u_nbj,'solution_lead','HoloX',NULL,NULL,NULL,NULL,NULL,NULL,30,v_id),
  (u_gjh,'solution_lead','Inspect_AR Conformance',NULL,NULL,NULL,NULL,NULL,'보류',21,v_id),
  (u_gjh,'solution_lead','Inspect_Assembly',NULL,NULL,NULL,NULL,NULL,NULL,22,v_id),
  (u_gjh,'solution_lead','Inspect_Defect',NULL,NULL,NULL,NULL,NULL,NULL,23,v_id),
  (u_gjh,'solution_lead','Robotics_Patrol Robot',NULL,NULL,NULL,NULL,NULL,NULL,24,v_id),
  (u_gjh,'solution_lead','Robotics_Robosim',NULL,NULL,NULL,NULL,NULL,NULL,25,v_id),
  (u_gjh,'solution_lead','ChatX',NULL,NULL,NULL,NULL,NULL,'보류',26,v_id),
  (u_gjh,'solution_lead','VisionX',NULL,NULL,NULL,NULL,NULL,NULL,27,v_id),
  (u_gjh,'solution_lead','VisionX Marine',NULL,NULL,NULL,NULL,NULL,'예정',28,v_id),
  (u_gjh,'solution_lead','VisionX Light',NULL,NULL,NULL,NULL,NULL,'예정',29,v_id),
  (u_gjh,'solution_lead','AI Hub',NULL,NULL,NULL,NULL,NULL,NULL,30,v_id);
END $$;
