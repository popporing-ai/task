-- migration-017: 캘린더 유형 정비 — '마감'·'캠페인' 제거, '출장' 추가
-- 마감/캠페인은 빌트인이라 UI에서 삭제 불가 → DB 레벨에서 정리한다.
-- migration-012가 매 부팅마다 마감/캠페인을 재시드하지만, 017이 그 뒤에
-- 실행되므로(파일명 정렬 012 < 017) 최종 상태는 항상 '제거됨'으로 수렴한다.

-- 1) 제거 대상 유형을 쓰던 기존 일정은 '일반'으로 이동 (orphan 방지)
UPDATE calendar_events SET event_type = 'general'
  WHERE event_type IN ('deadline', 'campaign');

-- 2) 유형 삭제
DELETE FROM calendar_event_types WHERE type_key IN ('deadline', 'campaign');

-- 3) '출장' 유형 추가 (빌트인, 회의 다음 순서)
INSERT INTO calendar_event_types (type_key, label, color, is_builtin, sort_order)
VALUES ('business_trip', '출장', '#14B8A6', true, 2)
ON CONFLICT (type_key) DO NOTHING;
