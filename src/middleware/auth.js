const db = require('../db');

// 세션 검증 미들웨어
async function authMiddleware(req, res, next) {
  try {
    const token = req.cookies?.task_session;
    if (!token) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    const { rows } = await db.query(
      `SELECT s.id as session_id, s.expires_at, u.id, u.name, u.email, u.role, u.avatar_bg, u.avatar_text, u.avatar_url, u.is_marketing_member
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > NOW() AND u.is_active IS NOT false`,
      [token]
    );

    if (rows.length === 0) {
      res.clearCookie('task_session', { path: '/task' });
      return res.status(401).json({ error: '세션이 만료되었습니다.' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = authMiddleware;
