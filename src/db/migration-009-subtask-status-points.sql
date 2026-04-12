DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subtasks' AND column_name='status') THEN
    ALTER TABLE subtasks ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subtasks' AND column_name='points') THEN
    ALTER TABLE subtasks ADD COLUMN points INTEGER DEFAULT NULL;
  END IF;
END $$;
-- 기존 done=true 항목은 status='done'으로 마이그레이션
UPDATE subtasks SET status='done' WHERE done=true AND status='todo';
