-- migration-016: 캘린더 일정 외부 공개 토글
-- 다른 부서에 로그인 없이 공유하는 읽기 전용 캘린더용.
-- is_public = true 인 일정만 공개 URL(/task/calendar)에 노출된다.

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- 공개 일정 조회 가속용 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_calendar_public
  ON calendar_events(is_public, start_date)
  WHERE is_public = true;
