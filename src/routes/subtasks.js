const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router({ mergeParams: true });

router.use(authMiddleware);

// 하위 업무 목록 조회
router.get('/:taskId/subtasks', async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { rows } = await db.query(`
      SELECT s.*, u.name AS assignee_name, u.avatar_bg, u.avatar_text
      FROM subtasks s
      LEFT JOIN users u ON u.id = s.assignee_id
      WHERE s.task_id = $1
      ORDER BY s.sort_order, s.created_at
    `, [taskId]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 하위 업무 생성
router.post('/:taskId/subtasks', auditMiddleware('subtasks'), async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { title, assignee_id, due_date, sort_order, status, points } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ data: null, error: '하위 업무 제목은 필수입니다.' });
    }
    const { rows } = await db.query(`
      INSERT INTO subtasks (task_id, title, assignee_id, due_date, sort_order, status, points)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [taskId, title.trim(), assignee_id || null, due_date || null, sort_order || 0,
        status || 'todo', points || null]);
    res.status(201).json({ data: rows[0], message: '하위 업무가 추가되었습니다.' });
  } catch (err) { next(err); }
});

// 하위 업무 수정
router.put('/:taskId/subtasks/:id', auditMiddleware('subtasks'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, assignee_id, due_date, sort_order, status, points } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ data: null, error: '하위 업무 제목은 필수입니다.' });
    }
    const { rows } = await db.query(`
      UPDATE subtasks SET title=$1, assignee_id=$2, due_date=$3, sort_order=$4, status=$5, points=$6
      WHERE id=$7 RETURNING *
    `, [title.trim(), assignee_id || null, due_date || null, sort_order ?? 0,
        status || 'todo', points || null, id]);
    if (!rows.length) return res.status(404).json({ data: null, error: '하위 업무를 찾을 수 없습니다.' });
    res.json({ data: rows[0], message: '하위 업무가 수정되었습니다.' });
  } catch (err) { next(err); }
});

// 하위 업무 완료 토글
router.patch('/:taskId/subtasks/:id/toggle', auditMiddleware('subtasks'), async (req, res, next) => {
  try {
    const { id, taskId } = req.params;
    const { rows } = await db.query(`
      UPDATE subtasks
      SET done = NOT done,
          status = CASE WHEN done THEN 'todo' ELSE 'done' END
      WHERE id=$1 AND task_id=$2 RETURNING *
    `, [id, taskId]);
    if (!rows.length) return res.status(404).json({ data: null, error: '하위 업무를 찾을 수 없습니다.' });
    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

// 하위 업무 삭제
router.delete('/:taskId/subtasks/:id', auditMiddleware('subtasks'), async (req, res, next) => {
  try {
    const { id, taskId } = req.params;
    const { rows } = await db.query(
      'DELETE FROM subtasks WHERE id=$1 AND task_id=$2 RETURNING *', [id, taskId]
    );
    if (!rows.length) return res.status(404).json({ data: null, error: '하위 업무를 찾을 수 없습니다.' });
    res.json({ data: rows[0], message: '하위 업무가 삭제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
