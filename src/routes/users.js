const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router();

router.use(authMiddleware);

// 아바타 이미지 업로드 설정
const AVATAR_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, AVATAR_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `user_${req.params.id}_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('이미지 파일만 업로드 가능합니다.'));
  },
});

// 아바타 이미지 업로드
router.post('/:id/avatar', avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });

    // 기존 아바타 파일 삭제
    const prev = await db.query('SELECT avatar_url FROM users WHERE id=$1', [req.params.id]);
    if (prev.rows[0]?.avatar_url) {
      const oldPath = path.join(__dirname, '..', '..', prev.rows[0].avatar_url.replace('/task/uploads/', 'uploads/'));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const avatarUrl = `/task/uploads/avatars/${req.file.filename}`;
    const { rows } = await db.query(
      'UPDATE users SET avatar_url=$1 WHERE id=$2 RETURNING id, name, avatar_url',
      [avatarUrl, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json({ data: rows[0], message: '프로필 이미지가 업데이트되었습니다.' });
  } catch (err) { next(err); }
});

// 아바타 이미지 삭제
router.delete('/:id/avatar', async (req, res, next) => {
  try {
    const prev = await db.query('SELECT avatar_url FROM users WHERE id=$1', [req.params.id]);
    if (prev.rows[0]?.avatar_url) {
      const oldPath = path.join(__dirname, '..', '..', prev.rows[0].avatar_url.replace('/task/uploads/', 'uploads/'));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    const { rows } = await db.query(
      'UPDATE users SET avatar_url=NULL WHERE id=$1 RETURNING id, name',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json({ data: rows[0], message: '프로필 이미지가 삭제되었습니다.' });
  } catch (err) { next(err); }
});

// 유저 목록 (업무 수, 활성 상태 포함)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.email, u.role, u.avatar_bg, u.avatar_text, u.avatar_url, u.is_active, u.created_at,
             COUNT(t.id) FILTER (WHERE t.archived = false)::int AS task_count,
             COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.archived = false)::int AS done_count,
             COUNT(t.id) FILTER (WHERE t.status = 'in_progress' AND t.archived = false)::int AS in_progress_count
      FROM users u
      LEFT JOIN tasks t ON t.assignee_id = u.id
      GROUP BY u.id
      ORDER BY u.name
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 역할 변경 (관리자 전용)
router.patch('/:id/role', auditMiddleware('users'), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }
    const { role } = req.body;
    if (!role || !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: '유효한 역할을 지정해주세요. (admin/user)' });
    }
    const { rows } = await db.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role, is_active',
      [role, req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '역할이 변경되었습니다.' });
  } catch (err) { next(err); }
});

// 활성/비활성 변경 (관리자 전용)
router.patch('/:id/active', auditMiddleware('users'), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }
    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active 값은 boolean이어야 합니다.' });
    }
    const { rows } = await db.query(
      'UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, name, email, role, is_active',
      [is_active, req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: is_active ? '활성화되었습니다.' : '비활성화되었습니다.' });
  } catch (err) { next(err); }
});

// 유저 성과 통계
router.get('/:id/stats', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { rows } = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'done')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'blocked')::int AS delayed,
        COALESCE(SUM(points) FILTER (WHERE status = 'done'), 0)::int AS total_points,
        ROUND(AVG(
          CASE WHEN status = 'done' AND due_date IS NOT NULL
            THEN EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400
          END
        )::numeric, 1) AS avg_completion_days,
        CASE
          WHEN COUNT(*) > 0
          THEN ROUND((COUNT(*) FILTER (WHERE status = 'done')::numeric / COUNT(*)) * 100, 1)
          ELSE 0
        END AS completion_rate
      FROM tasks
      WHERE assignee_id = $1 AND archived = false
    `, [userId]);
    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

// 유저 최근 활동
router.get('/:id/activity', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { rows } = await db.query(`
      SELECT id, action, table_name, record_id, old_value, new_value, created_at
      FROM audit_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 30
    `, [userId]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
