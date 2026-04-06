-- migration-007: calendar_events (마케팅 일정)
CREATE TABLE IF NOT EXISTS calendar_events (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  event_type  VARCHAR(30) NOT NULL DEFAULT 'general'
              CHECK (event_type IN ('general','meeting','deadline','campaign','event','holiday')),
  start_date  DATE NOT NULL,
  end_date    DATE,
  start_time  TIME,
  end_time    TIME,
  all_day     BOOLEAN NOT NULL DEFAULT true,
  color       VARCHAR(20) DEFAULT '#4F6EF7',
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calendar_dates ON calendar_events(start_date, end_date);
