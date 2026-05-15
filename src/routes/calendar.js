const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router();

router.use(authMiddleware);

// 일정 목록 조회 (월별 또는 날짜 범위)
router.get('/', async (req, res, next) => {
  try {
    const { month, start, end } = req.query;
    let where = [];
    let params = [];
    let idx = 1;

    if (month) {
      // YYYY-MM 형식 → 해당 월의 시작~끝
      const [y, m] = month.split('-').map(Number);
      const firstDay = new Date(y, m - 1, 1).toISOString().slice(0, 10);
      const lastDay = new Date(y, m, 0).toISOString().slice(0, 10);
      where.push(`(ce.start_date <= $${idx}::date AND (ce.end_date >= $${idx + 1}::date OR (ce.end_date IS NULL AND ce.start_date >= $${idx + 1}::date)))`);
      params.push(lastDay, firstDay);
      idx += 2;
    } else if (start && end) {
      where.push(`(ce.start_date <= $${idx}::date AND (ce.end_date >= $${idx + 1}::date OR (ce.end_date IS NULL AND ce.start_date >= $${idx + 1}::date)))`);
      params.push(end, start);
      idx += 2;
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT ce.*,
             u.name AS assignee_name, u.avatar_bg, u.avatar_text,
             cr.name AS creator_name
      FROM calendar_events ce
      LEFT JOIN users u ON u.id = ce.assignee_id
      LEFT JOIN users cr ON cr.id = ce.created_by
      ${whereClause}
      ORDER BY ce.start_date, ce.start_time NULLS FIRST
    `, params);

    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 다가오는 7일 일정
router.get('/upcoming', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT ce.*,
             u.name AS assignee_name, u.avatar_bg, u.avatar_text
      FROM calendar_events ce
      LEFT JOIN users u ON u.id = ce.assignee_id
      WHERE ce.start_date >= CURRENT_DATE
        AND ce.start_date <= CURRENT_DATE + INTERVAL '7 days'
      ORDER BY ce.start_date, ce.start_time NULLS FIRST
      LIMIT 20
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 일정 생성
router.post('/', auditMiddleware('calendar_events'), async (req, res, next) => {
  try {
    const { title, description, event_type, start_date, end_date,
            start_time, end_time, all_day, color, assignee_id } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ data: null, message: '일정명은 필수입니다.' });
    }
    if (!start_date) {
      return res.status(400).json({ data: null, message: '시작일은 필수입니다.' });
    }

    const { rows } = await db.query(`
      INSERT INTO calendar_events
        (title, description, event_type, start_date, end_date,
         start_time, end_time, all_day, color, assignee_id, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      title.trim(),
      description || null,
      event_type || 'general',
      start_date,
      end_date || null,
      all_day === false ? (start_time || null) : null,
      all_day === false ? (end_time || null) : null,
      all_day !== false,
      color || '#4F6EF7',
      assignee_id || null,
      req.user.id,
    ]);

    res.status(201).json({ data: rows[0], message: '일정이 생성되었습니다.' });
  } catch (err) { next(err); }
});

// 일정 수정
router.put('/:id', auditMiddleware('calendar_events'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, event_type, start_date, end_date,
            start_time, end_time, all_day, color, assignee_id } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ data: null, message: '일정명은 필수입니다.' });
    }
    if (!start_date) {
      return res.status(400).json({ data: null, message: '시작일은 필수입니다.' });
    }

    const { rows } = await db.query(`
      UPDATE calendar_events SET
        title = $1, description = $2, event_type = $3,
        start_date = $4, end_date = $5,
        start_time = $6, end_time = $7,
        all_day = $8, color = $9, assignee_id = $10,
        updated_at = NOW()
      WHERE id = $11
      RETURNING *
    `, [
      title.trim(),
      description || null,
      event_type || 'general',
      start_date,
      end_date || null,
      all_day === false ? (start_time || null) : null,
      all_day === false ? (end_time || null) : null,
      all_day !== false,
      color || '#4F6EF7',
      assignee_id || null,
      id,
    ]);

    if (!rows.length) {
      return res.status(404).json({ data: null, message: '일정을 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '일정이 수정되었습니다.' });
  } catch (err) { next(err); }
});

// 일정 삭제
router.delete('/:id', auditMiddleware('calendar_events'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      'DELETE FROM calendar_events WHERE id = $1 RETURNING *',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ data: null, message: '일정을 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '일정이 삭제되었습니다.' });
  } catch (err) { next(err); }
});

// ───────── 이벤트 유형 (CRUD) ─────────
// 관리자만 추가/수정/삭제, 빌트인은 삭제 불가
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ data: null, message: '일정 유형 관리는 관리자만 가능합니다.' });
  }
  next();
}

// GET /event-types — 전체 유형 목록 (모든 사용자)
router.get('/event-types', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, type_key, label, color, is_builtin, sort_order
       FROM calendar_event_types ORDER BY sort_order, id`
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /event-types — 신규 유형 추가 (관리자)
router.post('/event-types', adminOnly, auditMiddleware('calendar_event_types'), async (req, res, next) => {
  try {
    const { label, color = '#4F6EF7' } = req.body;
    if (!label || !label.trim()) {
      return res.status(400).json({ data: null, message: '유형 이름은 필수입니다.' });
    }
    // type_key 자동 생성 (label 영문 변환 또는 timestamp)
    const baseKey = String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
    const typeKey = baseKey && /[a-z0-9]/.test(baseKey)
      ? `${baseKey}_${Date.now().toString(36).slice(-4)}`
      : `type_${Date.now().toString(36)}`;
    // sort_order: 마지막에 추가
    const { rows: maxRow } = await db.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM calendar_event_types'
    );
    const { rows } = await db.query(`
      INSERT INTO calendar_event_types (type_key, label, color, is_builtin, sort_order)
      VALUES ($1, $2, $3, false, $4)
      RETURNING id, type_key, label, color, is_builtin, sort_order
    `, [typeKey, label.trim(), color, maxRow[0].next]);
    res.status(201).json({ data: rows[0], message: '유형이 추가되었습니다.' });
  } catch (err) { next(err); }
});

// PUT /event-types/:id — 유형 수정 (관리자) — label/color만 변경 가능
router.put('/event-types/:id', adminOnly, auditMiddleware('calendar_event_types'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { label, color } = req.body;
    if (!label || !label.trim()) {
      return res.status(400).json({ data: null, message: '유형 이름은 필수입니다.' });
    }
    const { rows } = await db.query(`
      UPDATE calendar_event_types
      SET label = $1, color = COALESCE($2, color)
      WHERE id = $3
      RETURNING id, type_key, label, color, is_builtin, sort_order
    `, [label.trim(), color || null, id]);
    if (!rows.length) {
      return res.status(404).json({ data: null, message: '유형을 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '유형이 수정되었습니다.' });
  } catch (err) { next(err); }
});

// DELETE /event-types/:id — 유형 삭제 (관리자) — 빌트인 삭제 불가
router.delete('/event-types/:id', adminOnly, auditMiddleware('calendar_event_types'), async (req, res, next) => {
  try {
    const { id } = req.params;
    // 빌트인 체크
    const { rows: existing } = await db.query(
      'SELECT is_builtin, type_key FROM calendar_event_types WHERE id = $1', [id]
    );
    if (!existing.length) {
      return res.status(404).json({ data: null, message: '유형을 찾을 수 없습니다.' });
    }
    if (existing[0].is_builtin) {
      return res.status(400).json({ data: null, message: '기본 제공 유형은 삭제할 수 없습니다.' });
    }
    // 사용 중인 일정이 있으면 'general'로 이동
    await db.query(
      "UPDATE calendar_events SET event_type = 'general' WHERE event_type = $1",
      [existing[0].type_key]
    );
    const { rows } = await db.query(
      'DELETE FROM calendar_event_types WHERE id = $1 RETURNING id, type_key, label',
      [id]
    );
    res.json({ data: rows[0], message: '유형이 삭제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
