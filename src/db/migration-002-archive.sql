-- Migration 002: tasks 테이블에 archived 컬럼 추가
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived);
