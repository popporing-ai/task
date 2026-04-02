const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

// 알림 목록 조회 (최신순, 최대 50개)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT id, type, message, link_view, link_id, is_read, created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [req.user.id]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 읽지 않은 알림 수 조회
router.get('/unread-count', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE user_id = $1 AND is_read = false
    `, [req.user.id]);
    res.json({ data: { count: parseInt(rows[0].count, 10) } });
  } catch (err) { next(err); }
});

// 특정 알림 읽음 처리
router.patch('/:id/read', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      UPDATE notifications
      SET is_read = true
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [req.params.id, req.user.id]);
    if (!rows.length) {
      return res.status(404).json({ data: null, error: '알림을 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '읽음 처리되었습니다.' });
  } catch (err) { next(err); }
});

// 전체 알림 읽음 처리
router.patch('/read-all', async (req, res, next) => {
  try {
    await db.query(`
      UPDATE notifications
      SET is_read = true
      WHERE user_id = $1 AND is_read = false
    `, [req.user.id]);
    res.json({ data: null, message: '모든 알림이 읽음 처리되었습니다.' });
  } catch (err) { next(err); }
});

/**
 * 알림 생성 헬퍼 함수 (다른 라우트에서 import하여 사용)
 * @param {number} userId - 수신할 사용자 ID
 * @param {string} type - 알림 유형 (task_assigned, task_updated, comment_added, mention, due_soon)
 * @param {string} message - 알림 메시지
 * @param {string|null} linkView - 연결할 뷰 이름
 * @param {number|null} linkId - 연결할 레코드 ID
 */
async function createNotification(userId, type, message, linkView = null, linkId = null) {
  try {
    await db.query(`
      INSERT INTO notifications (user_id, type, message, link_view, link_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [userId, type, message, linkView, linkId]);
  } catch (err) {
    // 알림 실패는 로그만 남기고 무시 (주요 작업에 영향 없도록)
    console.error('알림 생성 오류:', err);
  }
}

// router를 기본 export로, createNotification을 named export로 함께 제공
module.exports = router;
module.exports.createNotification = createNotification;
