-- migration-015: content_items.short_url 컬럼 추가
-- 실행일: 2026-05-19
-- 변경 사유: 콘텐츠 생성/수정 시 외부 단축 URL(TinyURL 등)을 함께 저장하여
--             SNS 게시용 짧은 링크를 별도 복사할 수 있게 함

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS short_url TEXT;
