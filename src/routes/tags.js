const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router({ mergeParams: true });

router.use(authMiddleware);

// 태그 전체 목록
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM tags ORDER BY name');
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 태그 생성
router.post('/', auditMiddleware('tags'), async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ data: null, error: '태그 이름은 필수입니다.' });
    }
    const { rows } = await db.query(
      'INSERT INTO tags (name, color) VALUES ($1, $2) RETURNING *',
      [name.trim(), color || '#4F6EF7']
    );
    res.status(201).json({ data: rows[0], message: '태그가 생성되었습니다.' });
  } catch (err) { next(err); }
});

// 태그 수정
router.put('/:id', auditMiddleware('tags'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ data: null, error: '태그 이름은 필수입니다.' });
    }
    const { rows } = await db.query(
      'UPDATE tags SET name=$1, color=$2 WHERE id=$3 RETURNING *',
      [name.trim(), color || '#4F6EF7', id]
    );
    if (!rows.length) return res.status(404).json({ data: null, error: '태그를 찾을 수 없습니다.' });
    res.json({ data: rows[0], message: '태그가 수정되었습니다.' });
  } catch (err) { next(err); }
});

// 태그 삭제
router.delete('/:id', auditMiddleware('tags'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      'DELETE FROM tags WHERE id=$1 RETURNING *', [id]
    );
    if (!rows.length) return res.status(404).json({ data: null, error: '태그를 찾을 수 없습니다.' });
    res.json({ data: rows[0], message: '태그가 삭제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
