const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

// 모든 라우트에 인증 미들웨어 적용
router.use(authMiddleware);

// 관리자 전용 가드 (수정/삭제용)
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ data: null, message: '분류 수정·삭제는 관리자만 가능합니다.' });
  }
  next();
}

// GET /task/api/categories — 카테고리 목록 조회
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, color FROM task_categories ORDER BY id'
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /task/api/categories — 카테고리 생성
router.post('/', auditMiddleware('task_categories'), async (req, res, next) => {
  try {
    const { name, color = '#EEF1FD' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ data: null, message: '카테고리 이름은 필수입니다.' });
    }
    const { rows } = await db.query(
      'INSERT INTO task_categories (name, color) VALUES ($1, $2) RETURNING id, name, color',
      [name.trim(), color]
    );
    res.status(201).json({ data: rows[0], message: '카테고리가 생성되었습니다.' });
  } catch (err) { next(err); }
});

// PUT /task/api/categories/:id — 카테고리 수정
router.put('/:id', adminOnly, auditMiddleware('task_categories'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ data: null, message: '카테고리 이름은 필수입니다.' });
    }
    const { rows } = await db.query(
      `UPDATE task_categories
       SET name = $1, color = COALESCE($2, color)
       WHERE id = $3
       RETURNING id, name, color`,
      [name.trim(), color || null, id]
    );
    if (!rows.length) {
      return res.status(404).json({ data: null, message: '카테고리를 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '카테고리가 수정되었습니다.' });
  } catch (err) { next(err); }
});

// DELETE /task/api/categories/:id — 카테고리 삭제
router.delete('/:id', adminOnly, auditMiddleware('task_categories'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      'DELETE FROM task_categories WHERE id = $1 RETURNING id, name, color',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ data: null, message: '카테고리를 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '카테고리가 삭제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
