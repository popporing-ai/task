-- 마이그레이션 013: 콘텐츠 주제(topic) 컬럼 추가
-- 같은 주제로 여러 채널·타입을 한 번에 생성하고, 리스트에서 주제별로 묶어 보기 위한 그룹핑 키

ALTER TABLE content_items ADD COLUMN IF NOT EXISTS topic VARCHAR(300);
CREATE INDEX IF NOT EXISTS idx_content_topic ON content_items(topic);
