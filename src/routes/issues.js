const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');
const { createNotification } = require('./notifications');

const router = express.Router();

router.use(authMiddleware);

// 전체 오픈 이슈 목록 (업무 정보 포함)
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    let where = [];
    let params = [];
    let idx = 1;

    if (status) {
      where.push(`ti.status = $${idx++}`);
      params.push(status);
    } else {
      where.push(`ti.status != 'resolved'`);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT ti.*, t.title AS task_title, t.status AS task_status,
             t.assignee_id, u.name AS reporter_name,
             au.name AS assignee_name
      FROM task_issues ti
      JOIN tasks t ON t.id = ti.task_id
      LEFT JOIN users u ON u.id = ti.reporter_id
      LEFT JOIN users au ON au.id = t.assignee_id
      ${whereClause}
      ORDER BY ti.created_at DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 이슈 통계
router.get('/stats', async (req, res, next) => {
  try {
    const byType = await db.query(`
      SELECT issue_type, COUNT(*)::int AS count
      FROM task_issues
      GROUP BY issue_type
      ORDER BY count DESC
    `);
    const byStatus = await db.query(`
      SELECT status, COUNT(*)::int AS count
      FROM task_issues
      GROUP BY status
      ORDER BY count DESC
    `);
    res.json({
      data: {
        by_type: byType.rows,
        by_status: byStatus.rows,
      }
    });
  } catch (err) { next(err); }
});

// 특정 업무의 이슈 목록
router.get('/task/:taskId', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT ti.*, u.name AS reporter_name
      FROM task_issues ti
      LEFT JOIN users u ON u.id = ti.reporter_id
      WHERE ti.task_id = $1
      ORDER BY ti.created_at DESC
    `, [req.params.taskId]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 이슈 생성
router.post('/', auditMiddleware('task_issues'), async (req, res, next) => {
  try {
    const { task_id, issue_type, description } = req.body;
    if (!task_id || !issue_type || !description) {
      return res.status(400).json({ error: 'task_id, issue_type, description은 필수입니다.' });
    }

    const validTypes = ['delay', 'blocking', 'resource', 'external', 'technical', 'other'];
    if (!validTypes.includes(issue_type)) {
      return res.status(400).json({ error: '유효하지 않은 이슈 유형입니다.' });
    }

    const { rows } = await db.query(`
      INSERT INTO task_issues (task_id, reporter_id, issue_type, description)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [task_id, req.user.id, issue_type, description]);

    const issue = rows[0];

    // 담당자 + 관리자에게 알림
    try {
      const task = (await db.query('SELECT title, assignee_id FROM tasks WHERE id = $1', [task_id])).rows[0];
      if (task) {
        // 담당자 알림
        if (task.assignee_id && task.assignee_id !== req.user.id) {
          createNotification(
            task.assignee_id,
            'issue_created',
            `업무에 이슈가 등록되었습니다: ${task.title} (${issue_type})`,
            'tasks',
            task_id
          );
        }
        // 관리자 알림
        const admins = (await db.query(
          "SELECT id FROM users WHERE role = 'admin' AND id != $1", [req.user.id]
        )).rows;
        for (const admin of admins) {
          createNotification(
            admin.id,
            'issue_created',
            `이슈가 등록되었습니다: ${task.title} (${issue_type})`,
            'tasks',
            task_id
          );
        }
      }
    } catch (notifErr) {
      console.error('이슈 알림 생성 오류:', notifErr);
    }

    res.json({ data: issue, message: '이슈가 등록되었습니다.' });
  } catch (err) { next(err); }
});

// 이슈 상태 변경
router.patch('/:id/status', auditMiddleware('task_issues'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['open', 'in_progress', 'resolved'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: '유효한 상태를 지정해주세요. (open/in_progress/resolved)' });
    }

    const resolvedAt = status === 'resolved' ? 'NOW()' : 'NULL';
    const { rows } = await db.query(`
      UPDATE task_issues
      SET status = $1, resolved_at = ${resolvedAt}
      WHERE id = $2
      RETURNING *
    `, [status, req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ error: '이슈를 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '이슈 상태가 변경되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
