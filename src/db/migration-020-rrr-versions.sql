-- migration-020: rrr_versions 테이블 생성 + rrr_items.version_id 추가
-- 실행일: 2026-08-12
-- 변경 사유: R&R 버전 관리 -- 인원 변동 시 현재 R&R을 아카이브하고
--             새 버전을 복제하여 편집. 과거 버전은 읽기 전용 보존.

CREATE TABLE IF NOT EXISTS rrr_versions (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL,
  effective_date DATE,
  title TEXT,
  change_note TEXT,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 현재 활성 버전은 항상 1개만 허용
CREATE UNIQUE INDEX IF NOT EXISTS rrr_one_current
  ON rrr_versions (is_current) WHERE is_current = true;

-- rrr_items에 버전 참조 컬럼 추가
ALTER TABLE rrr_items ADD COLUMN IF NOT EXISTS version_id INTEGER REFERENCES rrr_versions(id) ON DELETE CASCADE;

-- 초기 시드: 기존 rrr_items가 있지만 rrr_versions가 비어 있으면 v1.0.0 생성
INSERT INTO rrr_versions (version, effective_date, title, change_note, is_current)
SELECT '1.0.0', CURRENT_DATE, '초기 R&R', '기존 데이터 마이그레이션', true
WHERE NOT EXISTS (SELECT 1 FROM rrr_versions);

-- 기존 rrr_items에 version_id 연결 (NULL인 것만)
UPDATE rrr_items
SET version_id = (SELECT id FROM rrr_versions WHERE is_current = true LIMIT 1)
WHERE version_id IS NULL;
