const db = require('../db');

// 허용된 테이블 화이트리스트 (SQL 인젝션 방지)
const ALLOWED_TABLES = ['tasks', 'timeline_items', 'content_items', 'rrr_items', 'task_categories', 'products', 'subtasks', 'comments', 'tags', 'task_tags', 'attachments', 'checklists', 'checklist_items', 'task_issues', 'task_dependencies', 'team_goals', 'feedbacks', 'kpi_records', 'users', 'performance_scores', 'meetings', 'performance_alerts', 'calendar_events', 'monthly_evaluations', 'semi_annual_reports'];

// 감사 로그 자동 기록 미들웨어
function auditMiddleware(tableName) {
  if (!ALLOWED_TABLES.includes(tableName)) {
    throw new Error(`Audit: 허용되지 않은 테이블 "${tableName}"`);
  }

  return async (req, res, next) => {
    // GET 요청은 기록하지 않음
    if (req.method === 'GET') return next();

    const recordId = req.params.id;
    let oldValue = null;

    try {
      // UPDATE / DELETE → 변경 전 값 조회
      if (['PUT', 'PATCH', 'DELETE'].includes(req.method) && recordId) {
        const { rows } = await db.query(
          `SELECT * FROM ${tableName} WHERE id = $1`, [recordId]
        );
        oldValue = rows[0] || null;
      }

      // res.json을 가로채서 new_value 캡처
      const originalJson = res.json.bind(res);
      res.json = function (body) {
        // 비동기로 감사 로그 기록 (응답 지연 방지)
        const newValue = body?.data || null;
        const action = req.method === 'POST' ? 'CREATE'
                     : req.method === 'DELETE' ? 'DELETE' : 'UPDATE';

        const rid = recordId || newValue?.id;
        if (rid && req.user) {
          db.query(
            `INSERT INTO audit_logs
             (user_id, user_name, action, table_name, record_id, old_value, new_value, ip_address)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              req.user.id, req.user.name, action, tableName,
              rid,
              oldValue ? JSON.stringify(oldValue) : null,
              newValue ? JSON.stringify(newValue) : null,
              req.ip
            ]
          ).catch(err => console.error('Audit log error:', err));
        }

        return originalJson(body);
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = auditMiddleware;
