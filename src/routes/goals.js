const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router();

router.use(authMiddleware);

// 목표 목록
router.get('/', async (req, res, next) => {
  try {
    const { status, period } = req.query;
    let where = [];
    let params = [];
    let idx = 1;

    if (status) { where.push(`g.status = $${idx++}`); params.push(status); }
    if (period) { where.push(`g.period = $${idx++}`); params.push(period); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT g.*, u.name AS created_by_name
      FROM team_goals g
      LEFT JOIN users u ON u.id = g.created_by
      ${whereClause}
      ORDER BY g.end_date DESC, g.created_at DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 목표 생성 (관리자 전용)
router.post('/', auditMiddleware('team_goals'), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }
    const { title, description, target_value, period, start_date, end_date } = req.body;
    if (!title || !period || !start_date || !end_date) {
      return res.status(400).json({ error: 'title, period, start_date, end_date는 필수입니다.' });
    }

    const validPeriods = ['weekly', 'monthly', 'quarterly', 'yearly'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: '유효하지 않은 기간입니다.' });
    }

    const { rows } = await db.query(`
      INSERT INTO team_goals (title, description, target_value, period, start_date, end_date, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [title, description || null, target_value || 100, period, start_date, end_date, req.user.id]);

    res.json({ data: rows[0], message: '목표가 생성되었습니다.' });
  } catch (err) { next(err); }
});

// 목표 수정
router.put('/:id', auditMiddleware('team_goals'), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '관리자만 수정할 수 있습니다.' });
    }
    const { title, description, target_value, period, start_date, end_date, status } = req.body;
    const { rows } = await db.query(`
      UPDATE team_goals
      SET title = $1, description = $2, target_value = $3, period = $4,
          start_date = $5, end_date = $6, status = COALESCE($7, status), updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [title, description || null, target_value, period, start_date, end_date, status || null, req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ error: '목표를 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '목표가 수정되었습니다.' });
  } catch (err) { next(err); }
});

// 목표 진행률 업데이트
router.patch('/:id/progress', auditMiddleware('team_goals'), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '관리자만 수정할 수 있습니다.' });
    }
    const { current_value } = req.body;
    if (current_value === undefined || current_value === null) {
      return res.status(400).json({ error: 'current_value는 필수입니다.' });
    }
    const { rows } = await db.query(`
      UPDATE team_goals
      SET current_value = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [current_value, req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ error: '목표를 찾을 수 없습니다.' });
    }

    // 목표 달성 시 자동으로 completed 처리
    const goal = rows[0];
    if (goal.current_value >= goal.target_value && goal.status === 'active') {
      const updated = await db.query(
        "UPDATE team_goals SET status = 'completed', updated_at = NOW() WHERE id = $1 RETURNING *",
        [req.params.id]
      );
      return res.json({ data: updated.rows[0], message: '목표가 달성되었습니다!' });
    }

    res.json({ data: goal, message: '진행률이 업데이트되었습니다.' });
  } catch (err) { next(err); }
});

// 목표 삭제 (관리자 전용)
router.delete('/:id', auditMiddleware('team_goals'), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }
    const { rows } = await db.query(
      'DELETE FROM team_goals WHERE id = $1 RETURNING *', [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: '목표를 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '목표가 삭제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
