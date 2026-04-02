const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');
const { createNotification } = require('./notifications');

const router = express.Router({ mergeParams: true });

router.use(authMiddleware);

// 댓글 목록 조회
router.get('/:taskId/comments', async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { rows } = await db.query(`
      SELECT c.id, c.task_id, c.user_id, c.content, c.created_at, c.updated_at,
             u.name AS user_name, u.avatar_bg, u.avatar_text
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.task_id = $1
      ORDER BY c.created_at
    `, [taskId]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 댓글 작성
router.post('/:taskId/comments', auditMiddleware('comments'), async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ data: null, error: '댓글 내용은 필수입니다.' });
    }
    const { rows } = await db.query(`
      INSERT INTO comments (task_id, user_id, content)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [taskId, req.user.id, content.trim()]);
    // 작성자 정보 포함하여 반환
    const { rows: full } = await db.query(`
      SELECT c.id, c.task_id, c.user_id, c.content, c.created_at, c.updated_at,
             u.name AS user_name, u.avatar_bg, u.avatar_text
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.id = $1
    `, [rows[0].id]);
    // 업무 담당자에게 댓글 알림 발송 (본인 제외)
    const comment = full[0];
    const { rows: taskRows } = await db.query(
      'SELECT assignee_id, title FROM tasks WHERE id = $1', [taskId]
    );
    if (taskRows.length && taskRows[0].assignee_id && taskRows[0].assignee_id !== req.user.id) {
      const preview = content.trim().length > 50
        ? content.trim().slice(0, 50) + '...'
        : content.trim();
      createNotification(
        taskRows[0].assignee_id,
        'comment_added',
        `새 댓글이 달렸습니다: ${preview}`,
        'tasks',
        parseInt(taskId, 10)
      );
    }

    res.status(201).json({ data: comment, message: '댓글이 등록되었습니다.' });
  } catch (err) { next(err); }
});

// 댓글 수정 (본인만)
router.put('/:taskId/comments/:id', auditMiddleware('comments'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ data: null, error: '댓글 내용은 필수입니다.' });
    }
    // 본인 댓글인지 확인
    const { rows: existing } = await db.query(
      'SELECT user_id FROM comments WHERE id=$1', [id]
    );
    if (!existing.length) return res.status(404).json({ data: null, error: '댓글을 찾을 수 없습니다.' });
    if (existing[0].user_id !== req.user.id) {
      return res.status(403).json({ data: null, error: '본인 댓글만 수정할 수 있습니다.' });
    }
    const { rows } = await db.query(`
      UPDATE comments SET content=$1, updated_at=NOW() WHERE id=$2 RETURNING *
    `, [content.trim(), id]);
    res.json({ data: rows[0], message: '댓글이 수정되었습니다.' });
  } catch (err) { next(err); }
});

// 댓글 삭제 (본인만)
router.delete('/:taskId/comments/:id', auditMiddleware('comments'), async (req, res, next) => {
  try {
    const { id } = req.params;
    // 본인 댓글인지 확인
    const { rows: existing } = await db.query(
      'SELECT user_id FROM comments WHERE id=$1', [id]
    );
    if (!existing.length) return res.status(404).json({ data: null, error: '댓글을 찾을 수 없습니다.' });
    if (existing[0].user_id !== req.user.id) {
      return res.status(403).json({ data: null, error: '본인 댓글만 삭제할 수 있습니다.' });
    }
    const { rows } = await db.query(
      'DELETE FROM comments WHERE id=$1 RETURNING *', [id]
    );
    res.json({ data: rows[0], message: '댓글이 삭제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
