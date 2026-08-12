-- migration-019: users.is_marketing_member 플래그 추가
-- 실행일: 2026-08-12
-- 변경 사유: 마케팅본부 소속 여부를 구분하여 담당자 드롭다운 등에서 활용

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_marketing_member BOOLEAN NOT NULL DEFAULT false;

-- 초기 시드: 현재 마케팅본부 소속 팀원 (멱등, 재실행 안전)
UPDATE users SET is_marketing_member = true WHERE name IN ('구지향', '남병진', '안영선');
