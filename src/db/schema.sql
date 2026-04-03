-- Task 마케팅 업무 관리 도구 DB 스키마

-- 1. users (계정)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(50)  NOT NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'user'
                CHECK (role IN ('admin','user')),
  avatar_bg     VARCHAR(20)  DEFAULT '#EEF1FD',
  avatar_text   VARCHAR(20)  DEFAULT '#4F6EF7',
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- 2. sessions (로그인 세션)
CREATE TABLE IF NOT EXISTS sessions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

-- 3. task_categories (업무 분류)
CREATE TABLE IF NOT EXISTS task_categories (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(100) NOT NULL UNIQUE,
  color VARCHAR(20)  DEFAULT '#EEF1FD'
);

-- 4. tasks (업무 현황 - 칸반)
CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  category_id INTEGER REFERENCES task_categories(id) ON DELETE SET NULL,
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'todo'
              CHECK (status IN ('todo','in_progress','done','blocked')),
  due_date    DATE,
  points      INTEGER DEFAULT 0,
  sort_order  INTEGER DEFAULT 0,
  archived    BOOLEAN NOT NULL DEFAULT false,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 5. timeline_items (연간 타임라인)
CREATE TABLE IF NOT EXISTS timeline_items (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES task_categories(id) ON DELETE SET NULL,
  title       VARCHAR(200) NOT NULL,
  memo        TEXT,
  start_month DATE NOT NULL,
  end_month   DATE NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'planned'
              CHECK (status IN ('done','in_progress','planned','tbd')),
  sort_order  INTEGER DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
-- sort_order 컬럼 마이그레이션 (기존 DB 대응)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='timeline_items' AND column_name='sort_order'
  ) THEN
    ALTER TABLE timeline_items ADD COLUMN sort_order INTEGER DEFAULT 0;
  END IF;
END $$;

-- 6. products (제품 목록)
CREATE TABLE IF NOT EXISTS products (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

-- 7. content_items (콘텐츠 캘린더)
CREATE TABLE IF NOT EXISTS content_items (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(300) NOT NULL,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  channel      VARCHAR(10) NOT NULL
               CHECK (channel IN ('IG','FB','LI','YT','BL','EM','HM')),
  content_type VARCHAR(5)  NOT NULL
               CHECK (content_type IN ('I','C','V','S','Q','A','L','T')),
  assignee_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  publish_date DATE,
  content_id   VARCHAR(60) UNIQUE,
  inflow_url   TEXT,
  publish_url  TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'planned'
               CHECK (status IN ('planned','done','skipped')),
  memo         TEXT,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 8. rrr_items (R&R)
CREATE TABLE IF NOT EXISTS rrr_items (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_type   VARCHAR(20) NOT NULL
              CHECK (role_type IN ('solution_lead','function')),
  description VARCHAR(200) NOT NULL,
  frequency   VARCHAR(20)
              CHECK (frequency IN ('weekly','monthly','quarterly','yearly','irregular') OR frequency IS NULL),
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 9. audit_logs (변경 이력)
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  user_name   VARCHAR(50) NOT NULL,
  action      VARCHAR(10) NOT NULL
              CHECK (action IN ('CREATE','UPDATE','DELETE')),
  table_name  VARCHAR(50) NOT NULL,
  record_id   INTEGER     NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table   ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_record  ON audit_logs(table_name, record_id);

-- 10. subtasks (하위 업무)
CREATE TABLE IF NOT EXISTS subtasks (
  id          SERIAL PRIMARY KEY,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date    DATE,
  done        BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);

-- 11. comments (댓글)
CREATE TABLE IF NOT EXISTS comments (
  id          SERIAL PRIMARY KEY,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);

-- 12. tags (태그)
CREATE TABLE IF NOT EXISTS tags (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(50) NOT NULL UNIQUE,
  color VARCHAR(20) DEFAULT '#4F6EF7'
);

-- 13. task_tags (업무-태그 연결)
CREATE TABLE IF NOT EXISTS task_tags (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

-- 14. notifications (알림)
CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(30) NOT NULL,
  message     TEXT NOT NULL,
  link_view   VARCHAR(30),
  link_id     INTEGER,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- 15. attachments (첨부파일)
CREATE TABLE IF NOT EXISTS attachments (
  id          SERIAL PRIMARY KEY,
  task_id     INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  content_id  INTEGER REFERENCES content_items(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  filename    VARCHAR(300) NOT NULL,
  filepath    VARCHAR(500) NOT NULL,
  filesize    INTEGER,
  mimetype    VARCHAR(100),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_attachments_content ON attachments(content_id);

-- 16. checklists (체크리스트)
CREATE TABLE IF NOT EXISTS checklists (
  id          SERIAL PRIMARY KEY,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL DEFAULT '체크리스트',
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 17. checklist_items (체크리스트 항목)
CREATE TABLE IF NOT EXISTS checklist_items (
  id            SERIAL PRIMARY KEY,
  checklist_id  INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  content       VARCHAR(300) NOT NULL,
  done          BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checklist_items ON checklist_items(checklist_id);

-- 18. users: is_active 컬럼 (마이그레이션 대응)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='is_active'
  ) THEN
    ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- tasks: points 컬럼 (마이그레이션 대응)
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

-- 초기 데이터: 업무 분류 카테고리
INSERT INTO task_categories (name, color) VALUES
  ('회사소개서', '#FEF3E2'),
  ('소개자료',   '#FEF3E2'),
  ('홈페이지',   '#E6F1FB'),
  ('콘텐츠 제작','#D6E4FF'),
  ('고도화 자료 제작','#FFF0E0'),
  ('브랜딩',     '#E8E9ED'),
  ('온라인광고', '#E2F4EC'),
  ('전시회',     '#F0E8FF'),
  ('1층 체험관', '#EEEDFE'),
  ('지원사업',   '#F2F3F7'),
  ('제안서 지원','#F2F3F7'),
  ('PR',         '#FCE8EE')
ON CONFLICT (name) DO NOTHING;

-- 초기 데이터: 제품 목록
INSERT INTO products (name) VALUES
  ('Core'), ('Remote'), ('Bodycam'), ('VisionX'),
  ('Make&View'), ('Robotics'), ('Inspect'), ('HoloX'),
  ('Twin'), ('XR'), ('AutoGuide'), ('Workstation')
ON CONFLICT (name) DO NOTHING;
