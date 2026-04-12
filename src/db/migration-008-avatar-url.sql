-- users: avatar_url 컬럼 추가 (커스텀 프로필 이미지)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='avatar_url'
  ) THEN
    ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL;
  END IF;
END $$;
