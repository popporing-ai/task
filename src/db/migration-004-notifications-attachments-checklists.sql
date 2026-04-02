-- Migration 004: notifications, attachments, checklists 테이블 추가

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
