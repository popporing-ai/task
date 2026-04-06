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

module.exports = router;
