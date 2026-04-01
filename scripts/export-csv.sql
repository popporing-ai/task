\copy (SELECT id, name AS "이름", email AS "이메일", role AS "권한", created_at AS "가입일" FROM users ORDER BY id) TO '/tmp/users.csv' WITH CSV HEADER ENCODING 'UTF8'

\copy (SELECT t.id, t.title AS "업무명", t.description AS "상세", tc.name AS "분류", u.name AS "담당자", t.status AS "상태", t.due_date AS "마감일", t.created_at AS "생성일" FROM tasks t LEFT JOIN task_categories tc ON tc.id=t.category_id LEFT JOIN users u ON u.id=t.assignee_id ORDER BY t.id) TO '/tmp/tasks.csv' WITH CSV HEADER ENCODING 'UTF8'

\copy (SELECT c.id, c.title AS "제목", p.name AS "제품", c.channel AS "채널", c.content_type AS "타입", u.name AS "담당자", c.publish_date AS "배포일", c.content_id AS "콘텐츠ID", c.status AS "상태", c.memo AS "메모" FROM content_items c LEFT JOIN products p ON p.id=c.product_id LEFT JOIN users u ON u.id=c.assignee_id ORDER BY c.id) TO '/tmp/content_items.csv' WITH CSV HEADER ENCODING 'UTF8'

\copy (SELECT t.id, t.title AS "업무명", tc.name AS "분류", t.start_month AS "시작월", t.end_month AS "종료월", t.status AS "상태", t.memo AS "메모" FROM timeline_items t LEFT JOIN task_categories tc ON tc.id=t.category_id ORDER BY t.id) TO '/tmp/timeline_items.csv' WITH CSV HEADER ENCODING 'UTF8'

\copy (SELECT r.id, u.name AS "팀원", r.role_type AS "유형", r.description AS "설명", r.frequency AS "주기" FROM rrr_items r JOIN users u ON u.id=r.user_id ORDER BY u.name, r.id) TO '/tmp/rrr_items.csv' WITH CSV HEADER ENCODING 'UTF8'

\copy (SELECT id, name AS "분류명", color AS "색상" FROM task_categories ORDER BY id) TO '/tmp/task_categories.csv' WITH CSV HEADER ENCODING 'UTF8'

\copy (SELECT id, created_at AS "변경일시", user_name AS "작업자", action AS "작업유형", table_name AS "대상테이블", record_id AS "레코드ID", old_value::text AS "변경전", new_value::text AS "변경후", ip_address AS "IP" FROM audit_logs ORDER BY created_at DESC LIMIT 5000) TO '/tmp/audit_logs.csv' WITH CSV HEADER ENCODING 'UTF8'
