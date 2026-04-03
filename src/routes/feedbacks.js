const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');
const { createNotification } = require('./notifications');

const router = express.Router();

router.use(authMiddleware);

// 받은 피드백 목록
router.get('/received', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT f.id, f.content, f.is_private, f.created_at,
             u.name AS from_user_name, u.avatar_bg, u.avatar_text
      FROM feedbacks f
      JOIN users u ON u.id = f.from_user_id
      WHERE f.to_user_id = $1
      ORDER BY f.created_at DESC
    `, [req.user.id]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 보낸 피드백 목록
router.get('/sent', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT f.id, f.content, f.is_private, f.created_at,
             u.name AS to_user_name, u.avatar_bg, u.avatar_text
      FROM feedbacks f
      JOIN users u ON u.id = f.to_user_id
      WHERE f.from_user_id = $1
      ORDER BY f.created_at DESC
    `, [req.user.id]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 피드백 전송
router.post('/', auditMiddleware('feedbacks'), async (req, res, next) => {
  try {
    const { to_user_id, content, is_private } = req.body;
    if (!to_user_id || !content) {
      return res.status(400).json({ error: 'to_user_id, content는 필수입니다.' });
    }
    if (to_user_id === req.user.id) {
      return res.status(400).json({ error: '자신에게 피드백을 보낼 수 없습니다.' });
    }

    // 대상 유저 존재 확인
    const target = (await db.query('SELECT id, name FROM users WHERE id = $1', [to_user_id])).rows[0];
    if (!target) {
      return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
    }

    const { rows } = await db.query(`
      INSERT INTO feedbacks (from_user_id, to_user_id, content, is_private)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [req.user.id, to_user_id, content, is_private !== false]);

    // 수신자 알림
    createNotification(
      to_user_id,
      'feedback_received',
      `${req.user.name}님이 피드백을 보냈습니다.`,
      null,
      rows[0].id
    );

    res.json({ data: rows[0], message: '피드백이 전송되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
