// 관리자 전용 라우트 — 대량 삭제 등 (Salesforce 수준)
const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router();

router.use(authMiddleware);

// 관리자 전용 가드
router.use((req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ data: null, error: '관리자만 접근할 수 있습니다.' });
  }
  next();
});

// 엔티티 → DB 테이블 + audit name 매핑
const ENTITY_MAP = {
  tasks:    { table: 'tasks',          audit: 'tasks' },
  content:  { table: 'content_items',  audit: 'content_items' },
  timeline: { table: 'timeline_items', audit: 'timeline_items' },
  calendar: { table: 'calendar_events', audit: 'calendar_events' },
};

// POST /admin/bulk-delete/:entity  body: { ids: [1,2,3,...] }
router.post('/bulk-delete/:entity', async (req, res, next) => {
  try {
    const entityKey = req.params.entity;
    const meta = ENTITY_MAP[entityKey];
    if (!meta) {
      return res.status(400).json({ error: `지원하지 않는 엔티티: ${entityKey}` });
    }
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    if (!ids || ids.length === 0) {
      return res.status(400).json({ error: '삭제할 항목 ID 배열이 필요합니다.' });
    }
    // 안전 상한 — 한 번에 최대 1000건
    if (ids.length > 1000) {
      return res.status(400).json({ error: '한 번에 최대 1000건까지 삭제 가능합니다.' });
    }
    // 정수만 허용
    const cleanIds = ids
      .map(v => parseInt(v, 10))
      .filter(v => Number.isFinite(v) && v > 0);
    if (cleanIds.length === 0) {
      return res.status(400).json({ error: '유효한 ID가 없습니다.' });
    }

    // 삭제 전 old_value 캡처 (audit 용)
    const { rows: oldRows } = await db.query(
      `SELECT * FROM ${meta.table} WHERE id = ANY($1::int[])`,
      [cleanIds]
    );

    const { rows } = await db.query(
      `DELETE FROM ${meta.table} WHERE id = ANY($1::int[]) RETURNING id`,
      [cleanIds]
    );

    // 행 단위 DELETE 감사 로그 (스키마: action VARCHAR(10) CHECK CREATE|UPDATE|DELETE, record_id NOT NULL)
    try {
      for (const row of oldRows) {
        await db.query(
          `INSERT INTO audit_logs (user_id, user_name, action, table_name, record_id, old_value, new_value, ip_address)
           VALUES ($1, $2, 'DELETE', $3, $4, $5::jsonb, NULL, $6)`,
          [
            req.user.id,
            req.user.name,
            meta.audit,
            row.id,
            JSON.stringify(row),
            req.ip || null,
          ]
        );
      }
    } catch (e) {
      console.warn('audit_logs 기록 실패:', e.message);
    }

    res.json({
      data: { deleted: rows.length, ids: rows.map(r => r.id) },
      message: `${rows.length}건 삭제 완료`,
    });
  } catch (err) {
    next(err);
  }
});

// 엔티티 메타 정보 (프론트 필터 옵션 용)
router.get('/entities', (req, res) => {
  res.json({
    data: Object.keys(ENTITY_MAP).map(k => ({ key: k, table: ENTITY_MAP[k].table })),
  });
});

module.exports = router;
