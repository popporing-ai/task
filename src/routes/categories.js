const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

// 모든 라우트에 인증 미들웨어 적용
router.use(authMiddleware);

// GET /task/api/categories — 카테고리 목록 조회
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, color, sort_order FROM task_categories ORDER BY sort_order, id'
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
    // 새 분류는 맨 뒤로 (기존 최대 sort_order + 1)
    const { rows } = await db.query(
      `INSERT INTO task_categories (name, color, sort_order)
       VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM task_categories))
       RETURNING id, name, color, sort_order`,
      [name.trim(), color]
    );
    res.status(201).json({ data: rows[0], message: '카테고리가 생성되었습니다.' });
  } catch (err) { next(err); }
});

// POST /task/api/categories/reorder — 분류 순서 일괄 저장
// body: { orders: [{ id, sort_order }, ...] }
router.post('/reorder', auditMiddleware('task_categories'), async (req, res, next) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders)) {
      return res.status(400).json({ data: null, message: 'orders 배열이 필요합니다.' });
    }
    await Promise.all(orders.map(o =>
      db.query('UPDATE task_categories SET sort_order = $1 WHERE id = $2', [o.sort_order, o.id])
    ));
    res.json({ data: null, message: '순서가 저장되었습니다.' });
  } catch (err) { next(err); }
});

// PUT /task/api/categories/:id — 카테고리 수정
router.put('/:id', auditMiddleware('task_categories'), async (req, res, next) => {
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
router.delete('/:id', auditMiddleware('task_categories'), async (req, res, next) => {
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
