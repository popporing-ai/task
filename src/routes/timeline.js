const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router();

router.use(authMiddleware);

// 타임라인 목록
router.get('/', async (req, res, next) => {
  try {
    const { year, category_id } = req.query;
    let where = [];
    let params = [];
    let idx = 1;

    if (year) {
      where.push(`EXTRACT(YEAR FROM t.start_month) = $${idx++}`);
      params.push(year);
    }
    if (category_id) {
      where.push(`t.category_id = $${idx++}`);
      params.push(category_id);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT t.*, tc.name AS category_name, tc.color AS category_color,
             u.name AS created_by_name
      FROM timeline_items t
      LEFT JOIN task_categories tc ON tc.id = t.category_id
      LEFT JOIN users u ON u.id = t.created_by
      ${whereClause}
      ORDER BY t.category_id, t.start_month
    `, params);

    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 타임라인 생성
router.post('/', auditMiddleware('timeline_items'), async (req, res, next) => {
  try {
    const { category_id, title, memo, start_month, end_month, status } = req.body;

    if (!title || !start_month || !end_month) {
      return res.status(400).json({ error: '제목, 시작 월, 종료 월을 입력해주세요.' });
    }

    const { rows } = await db.query(`
      INSERT INTO timeline_items (category_id, title, memo, start_month, end_month, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [category_id || null, title, memo || null, start_month, end_month,
        status || 'planned', req.user.id]);

    res.json({ data: rows[0], message: '타임라인 항목이 추가되었습니다.' });
  } catch (err) { next(err); }
});

// 타임라인 수정
router.put('/:id', auditMiddleware('timeline_items'), async (req, res, next) => {
  try {
    const { category_id, title, memo, start_month, end_month, status } = req.body;

    const { rows } = await db.query(`
      UPDATE timeline_items SET
        category_id=$1, title=$2, memo=$3, start_month=$4, end_month=$5,
        status=$6, updated_at=NOW()
      WHERE id=$7 RETURNING *
    `, [category_id || null, title, memo || null, start_month, end_month,
        status, req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });
    }

    res.json({ data: rows[0], message: '항목이 수정되었습니다.' });
  } catch (err) { next(err); }
});

// 타임라인 삭제
router.delete('/:id', auditMiddleware('timeline_items'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM timeline_items WHERE id=$1 RETURNING *', [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });
    }

    res.json({ data: rows[0], message: '항목이 삭제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
