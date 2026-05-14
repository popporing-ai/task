-- 마이그레이션 011: 성과/평가/이슈/포인트 기능 제거 (팀 배포 전 정리)

-- 미사용 테이블 제거
DROP TABLE IF EXISTS monthly_evaluations CASCADE;
DROP TABLE IF EXISTS semi_annual_reports CASCADE;
DROP TABLE IF EXISTS performance_alerts CASCADE;
DROP TABLE IF EXISTS performance_scores CASCADE;
DROP TABLE IF EXISTS kpi_records CASCADE;
DROP TABLE IF EXISTS team_goals CASCADE;
DROP TABLE IF EXISTS feedbacks CASCADE;
DROP TABLE IF EXISTS meetings CASCADE;
DROP TABLE IF EXISTS task_issues CASCADE;
DROP TABLE IF EXISTS task_dependencies CASCADE;

-- tasks.points / subtasks.points 컬럼 제거
ALTER TABLE tasks    DROP COLUMN IF EXISTS points;
ALTER TABLE subtasks DROP COLUMN IF EXISTS points;
