-- migration-006: 성과 스코어카드, 면담, 성과 경고 테이블

-- 25. performance_scores (성과 스코어카드)
CREATE TABLE IF NOT EXISTS performance_scores (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period      VARCHAR(20) NOT NULL,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  completion_rate NUMERIC(5,1) DEFAULT 0,
  delay_rate     NUMERIC(5,1) DEFAULT 0,
  avg_days       NUMERIC(5,1) DEFAULT 0,
  total_points   INTEGER DEFAULT 0,
  total_completed INTEGER DEFAULT 0,
  total_delayed   INTEGER DEFAULT 0,
  grade          VARCHAR(2),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, period, period_start)
);

-- 26. meetings (1:1 면담 기록)
CREATE TABLE IF NOT EXISTS meetings (
  id          SERIAL PRIMARY KEY,
  admin_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meeting_date DATE NOT NULL,
  summary     TEXT NOT NULL,
  action_items TEXT,
  next_meeting DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meetings_user ON meetings(user_id);

-- 27. performance_alerts (성과 경고)
CREATE TABLE IF NOT EXISTS performance_alerts (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_type  VARCHAR(30) NOT NULL,
  message     TEXT NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_perf_alerts_user ON performance_alerts(user_id, is_resolved);
