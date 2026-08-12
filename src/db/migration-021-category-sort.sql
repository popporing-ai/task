-- migration-021: task_categories.sort_order 추가
-- 실행일: 2026-08-12
-- 변경 사유: 설정 화면에서 업무 분류의 표시 순서를 직접 변경할 수 있도록 정렬 컬럼 추가

ALTER TABLE task_categories
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 최초 1회 초기화: 아직 어떤 행도 sort_order가 설정되지 않았을 때만 id 순으로 채운다.
-- (이미 순서를 지정한 이후에는 재실행돼도 값을 덮어쓰지 않음)
UPDATE task_categories
SET sort_order = id
WHERE NOT EXISTS (SELECT 1 FROM task_categories WHERE sort_order > 0);
