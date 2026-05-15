-- 마이그레이션 012: 캘린더 이벤트 유형 동적 관리
-- 빌트인 유형 6종 시드 + 커스텀 유형 추가 가능

CREATE TABLE IF NOT EXISTS calendar_event_types (
  id          SERIAL PRIMARY KEY,
  type_key    VARCHAR(40) NOT NULL UNIQUE,
  label       VARCHAR(60) NOT NULL,
  color       VARCHAR(20) NOT NULL DEFAULT '#4F6EF7',
  is_builtin  BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 빌트인 시드
INSERT INTO calendar_event_types (type_key, label, color, is_builtin, sort_order) VALUES
  ('general',  '일반',    '#4F6EF7', true, 0),
  ('meeting',  '회의',    '#7B9BFA', true, 1),
  ('deadline', '마감',    '#F07070', true, 2),
  ('campaign', '캠페인',  '#5DD984', true, 3),
  ('event',    '행사',    '#F5A623', true, 4),
  ('holiday',  '휴일',    '#9A9BA3', true, 5)
ON CONFLICT (type_key) DO NOTHING;

-- 커스텀 유형 허용을 위해 CHECK 제약 제거
ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;
