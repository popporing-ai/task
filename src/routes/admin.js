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

    // 트랜잭션 없이 단일 DELETE (CASCADE 또는 FK 무관하게 entity별 단순 삭제)
    const { rows } = await db.query(
      `DELETE FROM ${meta.table} WHERE id = ANY($1::int[]) RETURNING id`,
      [cleanIds]
    );

    // 간단한 audit log — bulk_delete 메타로 기록
    try {
      await db.query(`
        INSERT INTO audit_log (user_id, user_name, action, table_name, record_id, old_value, new_value, ip_address)
        VALUES ($1, $2, 'bulk_delete', $3, NULL, $4::jsonb, NULL, $5)
      `, [
        req.user.id,
        req.user.name,
        meta.audit,
        JSON.stringify({ deleted_ids: rows.map(r => r.id), requested_count: cleanIds.length }),
        req.ip || null,
      ]);
    } catch (e) {
      // audit 실패는 응답에 영향 안 줌
      console.warn('audit_log 기록 실패:', e.message);
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
