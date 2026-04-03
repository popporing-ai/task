-- migration-005: 이슈, 의존성, 성과관리, 팀 목표, 피드백, KPI
-- 실행일: 2026-04-01

-- users: is_active 컬럼 추가
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='is_active'
  ) THEN
    ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- tasks: points 컬럼 추가
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='tasks' AND column_name='points'
  ) THEN
    ALTER TABLE tasks ADD COLUMN points INTEGER DEFAULT 0;
  END IF;
END $$;

-- 19. task_issues (업무 이슈/문제 리포트)
CREATE TABLE IF NOT EXISTS task_issues (
  id          SERIAL PRIMARY KEY,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  issue_type  VARCHAR(30) NOT NULL CHECK (issue_type IN ('delay','blocking','resource','external','technical','other')),
  description TEXT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_issues_task ON task_issues(task_id);

-- 20. task_dependencies (업무 의존성)
CREATE TABLE IF NOT EXISTS task_dependencies (
  id              SERIAL PRIMARY KEY,
  task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, depends_on_id)
);

-- 22. team_goals (팀 목표)
CREATE TABLE IF NOT EXISTS team_goals (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  target_value INTEGER DEFAULT 100,
  current_value INTEGER DEFAULT 0,
  period      VARCHAR(20) NOT NULL CHECK (period IN ('weekly','monthly','quarterly','yearly')),
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 23. feedbacks (1:1 피드백)
CREATE TABLE IF NOT EXISTS feedbacks (
  id          SERIAL PRIMARY KEY,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_private  BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedbacks_to ON feedbacks(to_user_id);

-- 24. kpi_records (KPI 기록)
CREATE TABLE IF NOT EXISTS kpi_records (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period      VARCHAR(20) NOT NULL,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  tasks_completed INTEGER DEFAULT 0,
  tasks_delayed   INTEGER DEFAULT 0,
  total_points    INTEGER DEFAULT 0,
  avg_completion_days NUMERIC(5,1) DEFAULT 0,
  completion_rate NUMERIC(5,1) DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, period, period_start)
);
