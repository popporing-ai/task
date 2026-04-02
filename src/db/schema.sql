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
