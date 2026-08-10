-- migration-018: brand_guide_versions 테이블 생성
-- 실행일: 2026-08-10
-- 변경 사유: 브랜드 메시지 가이드 버전 관리 -- 슬로건, 메시지 방향, 대외 커뮤니케이션 규칙,
--             AI 지침 원문을 버전별로 저장하고 현재 활성 버전 1개를 관리

CREATE TABLE IF NOT EXISTS brand_guide_versions (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL,
  effective_date DATE,
  title TEXT,
  slogan TEXT,
  message_direction TEXT,
  comms_rules TEXT,
  ai_instructions TEXT,
  change_note TEXT,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 현재 활성 버전은 항상 1개만 허용
CREATE UNIQUE INDEX IF NOT EXISTS brand_guide_one_current
  ON brand_guide_versions (is_current) WHERE is_current = true;

-- 초기 플레이스홀더 데이터 (테이블이 비어 있을 때만)
INSERT INTO brand_guide_versions (version, effective_date, title, slogan, message_direction, comms_rules, ai_instructions, change_note, is_current)
SELECT '1.0.0', CURRENT_DATE, '브랜드 메시지 가이드 초안', '내용을 입력해주세요', '내용을 입력해주세요', '내용을 입력해주세요', '내용을 입력해주세요', '초기 생성', true
WHERE NOT EXISTS (SELECT 1 FROM brand_guide_versions);
