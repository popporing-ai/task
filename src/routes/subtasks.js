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
    const { title, assignee_id, due_date, sort_order } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ data: null, error: '하위 업무 제목은 필수입니다.' });
    }
    const { rows } = await db.query(`
      INSERT INTO subtasks (task_id, title, assignee_id, due_date, sort_order)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [taskId, title.trim(), assignee_id || null, due_date || null, sort_order || 0]);
    res.status(201).json({ data: rows[0], message: '하위 업무가 추가되었습니다.' });
  } catch (err) { next(err); }
});

// 하위 업무 수정
router.put('/:taskId/subtasks/:id', auditMiddleware('subtasks'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, assignee_id, due_date, sort_order } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ data: null, error: '하위 업무 제목은 필수입니다.' });
    }
    const { rows } = await db.query(`
      UPDATE subtasks SET title=$1, assignee_id=$2, due_date=$3, sort_order=$4
      WHERE id=$5 RETURNING *
    `, [title.trim(), assignee_id || null, due_date || null, sort_order ?? 0, id]);
    if (!rows.length) return res.status(404).json({ data: null, error: '하위 업무를 찾을 수 없습니다.' });
    res.json({ data: rows[0], message: '하위 업무가 수정되었습니다.' });
  } catch (err) { next(err); }
});

// 하위 업무 완료 토글
router.patch('/:taskId/subtasks/:id/toggle', auditMiddleware('subtasks'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(`
      UPDATE subtasks SET done = NOT done WHERE id=$1 RETURNING *
    `, [id]);
    if (!rows.length) return res.status(404).json({ data: null, error: '하위 업무를 찾을 수 없습니다.' });
    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

// 하위 업무 삭제
router.delete('/:taskId/subtasks/:id', auditMiddleware('subtasks'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      'DELETE FROM subtasks WHERE id=$1 RETURNING *', [id]
    );
    if (!rows.length) return res.status(404).json({ data: null, error: '하위 업무를 찾을 수 없습니다.' });
    res.json({ data: rows[0], message: '하위 업무가 삭제되었습니다.' });
  } catch (err) { next(err); }
});

// 업무에 태그 연결
router.post('/:taskId/tags', auditMiddleware('task_tags'), async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { tag_id } = req.body;
    if (!tag_id) {
      return res.status(400).json({ data: null, error: 'tag_id는 필수입니다.' });
    }
    await db.query(
      'INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [taskId, tag_id]
    );
    res.status(201).json({ data: { task_id: Number(taskId), tag_id }, message: '태그가 연결되었습니다.' });
  } catch (err) { next(err); }
});

// 업무에서 태그 해제
router.delete('/:taskId/tags/:tagId', auditMiddleware('task_tags'), async (req, res, next) => {
  try {
    const { taskId, tagId } = req.params;
    await db.query(
      'DELETE FROM task_tags WHERE task_id=$1 AND tag_id=$2',
      [taskId, tagId]
    );
    res.json({ data: { task_id: Number(taskId), tag_id: Number(tagId) }, message: '태그 연결이 해제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
