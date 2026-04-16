-- migration-010-evaluation-system.sql
-- 평가 시스템: tasks.work_type 컬럼 추가, monthly_evaluations / semi_annual_reports 테이블 생성

-- 29. tasks.work_type 컬럼 추가 (R&R 정규 / 추가 업무 / 프로젝트)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='tasks' AND column_name='work_type'
  ) THEN
    ALTER TABLE tasks ADD COLUMN work_type VARCHAR(20) NOT NULL DEFAULT 'regular'
      CHECK (work_type IN ('regular','extra','project'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_tasks_work_type ON tasks(work_type);

-- 30. monthly_evaluations (관리자 월간 정성 평가)
CREATE TABLE IF NOT EXISTS monthly_evaluations (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  eval_month  DATE NOT NULL,
  score_timeliness    INTEGER CHECK (score_timeliness BETWEEN 1 AND 5),
  score_quality       INTEGER CHECK (score_quality BETWEEN 1 AND 5),
  score_collaboration INTEGER CHECK (score_collaboration BETWEEN 1 AND 5),
  score_initiative    INTEGER CHECK (score_initiative BETWEEN 1 AND 5),
  score_growth        INTEGER CHECK (score_growth BETWEEN 1 AND 5),
  memo        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, eval_month)
);
CREATE INDEX IF NOT EXISTS idx_monthly_eval_user ON monthly_evaluations(user_id, eval_month DESC);

-- 31. semi_annual_reports (반기 리포트 메타)
CREATE TABLE IF NOT EXISTS semi_annual_reports (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period      VARCHAR(20) NOT NULL CHECK (period IN ('H1','H2')),
  year        INTEGER NOT NULL,
  admin_notes TEXT,
  finalized   BOOLEAN NOT NULL DEFAULT false,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, period, year)
);
CREATE INDEX IF NOT EXISTS idx_semi_annual_user ON semi_annual_reports(user_id, year DESC, period);
