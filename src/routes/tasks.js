const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router();

router.use(authMiddleware);

// 업무 목록
router.get('/', async (req, res, next) => {
  try {
    const { status, category_id, assignee_id } = req.query;
    let where = [];
    let params = [];
    let idx = 1;

    if (status) { where.push(`t.status = $${idx++}`); params.push(status); }
    if (category_id) { where.push(`t.category_id = $${idx++}`); params.push(category_id); }
    if (assignee_id) { where.push(`t.assignee_id = $${idx++}`); params.push(assignee_id); }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT t.*, u.name AS assignee_name, u.avatar_bg, u.avatar_text,
             tc.name AS category_name, tc.color AS category_color,
             cu.name AS created_by_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assignee_id
      LEFT JOIN task_categories tc ON tc.id = t.category_id
      LEFT JOIN users cu ON cu.id = t.created_by
      ${whereClause}
      ORDER BY t.sort_order, t.created_at DESC
    `, params);

    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 업무 생성
router.post('/', auditMiddleware('tasks'), async (req, res, next) => {
  try {
    const { title, description, category_id, assignee_id, status, due_date } = req.body;

    if (!title) {
      return res.status(400).json({ error: '업무명을 입력해주세요.' });
    }

    const { rows } = await db.query(`
      INSERT INTO tasks (title, description, category_id, assignee_id, status, due_date, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [title, description || null, category_id || null, assignee_id || null,
        status || 'todo', due_date || null, req.user.id]);

    res.json({ data: rows[0], message: '업무가 추가되었습니다.' });
  } catch (err) { next(err); }
});

// 업무 수정
router.put('/:id', auditMiddleware('tasks'), async (req, res, next) => {
  try {
    const { title, description, category_id, assignee_id, status, due_date } = req.body;

    const { rows } = await db.query(`
      UPDATE tasks SET title=$1, description=$2, category_id=$3, assignee_id=$4,
             status=$5, due_date=$6, updated_at=NOW()
      WHERE id=$7 RETURNING *
    `, [title, description || null, category_id || null, assignee_id || null,
        status, due_date || null, req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: '업무를 찾을 수 없습니다.' });
    }

    res.json({ data: rows[0], message: '업무가 수정되었습니다.' });
  } catch (err) { next(err); }
});

// 업무 삭제
router.delete('/:id', auditMiddleware('tasks'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM tasks WHERE id=$1 RETURNING *', [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '업무를 찾을 수 없습니다.' });
    }

    res.json({ data: rows[0], message: '업무가 삭제되었습니다.' });
  } catch (err) { next(err); }
});

// 칸반 상태 변경
router.patch('/:id/status', auditMiddleware('tasks'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const { rows } = await db.query(
      'UPDATE tasks SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '업무를 찾을 수 없습니다.' });
    }

    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

// 카드 순서 변경
router.patch('/:id/order', auditMiddleware('tasks'), async (req, res, next) => {
  try {
    const { sort_order } = req.body;
    const { rows } = await db.query(
      'UPDATE tasks SET sort_order=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [sort_order, req.params.id]
    );

    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
