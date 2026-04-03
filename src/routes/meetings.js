const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router();

router.use(authMiddleware);

// 관리자 권한 확인 헬퍼
function requireAdmin(req, res) {
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    return false;
  }
  return true;
}

// 특정 유저의 면담 목록 조회
router.get('/user/:userId', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { userId } = req.params;
    const { rows } = await db.query(`
      SELECT m.*, u.name AS user_name, a.name AS admin_name
      FROM meetings m
      JOIN users u ON u.id = m.user_id
      JOIN users a ON a.id = m.admin_id
      WHERE m.user_id = $1
      ORDER BY m.meeting_date DESC
    `, [userId]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 다가오는 면담 (7일 이내)
router.get('/upcoming', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { rows } = await db.query(`
      SELECT m.*, u.name AS user_name, a.name AS admin_name
      FROM meetings m
      JOIN users u ON u.id = m.user_id
      JOIN users a ON a.id = m.admin_id
      WHERE m.next_meeting IS NOT NULL
        AND m.next_meeting >= CURRENT_DATE
        AND m.next_meeting <= CURRENT_DATE + INTERVAL '7 days'
      ORDER BY m.next_meeting ASC
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 면담 생성
router.post('/', auditMiddleware('meetings'), async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { user_id, meeting_date, summary, action_items, next_meeting } = req.body;
    if (!user_id || !meeting_date || !summary) {
      return res.status(400).json({ error: '대상 유저, 면담일, 요약은 필수입니다.' });
    }
    const { rows } = await db.query(`
      INSERT INTO meetings (admin_id, user_id, meeting_date, summary, action_items, next_meeting)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [req.user.id, user_id, meeting_date, summary, action_items || null, next_meeting || null]);
    res.status(201).json({ data: rows[0], message: '면담 기록이 생성되었습니다.' });
  } catch (err) { next(err); }
});

// 면담 수정
router.put('/:id', auditMiddleware('meetings'), async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    const { meeting_date, summary, action_items, next_meeting } = req.body;
    if (!meeting_date || !summary) {
      return res.status(400).json({ error: '면담일과 요약은 필수입니다.' });
    }
    const { rows } = await db.query(`
      UPDATE meetings
      SET meeting_date = $1, summary = $2, action_items = $3, next_meeting = $4, updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [meeting_date, summary, action_items || null, next_meeting || null, id]);
    if (!rows.length) {
      return res.status(404).json({ error: '면담 기록을 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '면담 기록이 수정되었습니다.' });
  } catch (err) { next(err); }
});

// 면담 삭제
router.delete('/:id', auditMiddleware('meetings'), async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    const { rows } = await db.query(
      'DELETE FROM meetings WHERE id = $1 RETURNING *',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: '면담 기록을 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '면담 기록이 삭제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
