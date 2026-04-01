-- 기존 users 테이블에 role 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

-- ys@virnect.com을 관리자로 지정
UPDATE users SET role = 'admin' WHERE email = 'ys@virnect.com';
