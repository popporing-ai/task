const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router();

router.use(authMiddleware);

// R&R 전체 목록 (유저별 그룹)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT r.*, u.name AS user_name, u.avatar_bg, u.avatar_text, u.avatar_url
      FROM rrr_items r
      JOIN users u ON u.id = r.user_id
      ORDER BY u.id, r.sort_order, r.id
    `);

    // 유저별로 그룹핑
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.user_id]) {
        grouped[row.user_id] = {
          user_id: row.user_id,
          user_name: row.user_name,
          avatar_bg: row.avatar_bg,
          avatar_text: row.avatar_text,
          avatar_url: row.avatar_url,
          items: [],
        };
      }
      grouped[row.user_id].items.push(row);
    }

    res.json({ data: Object.values(grouped) });
  } catch (err) { next(err); }
});

// R&R 항목 순서 저장 (드래그 후 호출)
router.post('/reorder', async (req, res, next) => {
  try {
    // orders: [{id, sort_order}, ...]
    const { orders } = req.body;
    if (!Array.isArray(orders)) return res.status(400).json({ error: 'orders 배열이 필요합니다.' });
    await Promise.all(orders.map(o =>
      db.query('UPDATE rrr_items SET sort_order=$1 WHERE id=$2', [o.sort_order, o.id])
    ));
    res.json({ message: '순서가 저장되었습니다.' });
  } catch (err) { next(err); }
});

// R&R 항목 추가
router.post('/', auditMiddleware('rrr_items'), async (req, res, next) => {
  try {
    const { user_id, role_type, description, frequency, sort_order } = req.body;

    if (!user_id || !role_type || !description) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요.' });
    }

    const { rows } = await db.query(`
      INSERT INTO rrr_items (user_id, role_type, description, frequency, sort_order)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [user_id, role_type, description, frequency || null, sort_order || 0]);

    res.json({ data: rows[0], message: 'R&R 항목이 추가되었습니다.' });
  } catch (err) { next(err); }
});

// R&R 항목 수정
router.put('/:id', auditMiddleware('rrr_items'), async (req, res, next) => {
  try {
    const { role_type, description, frequency, sort_order } = req.body;

    const { rows } = await db.query(`
      UPDATE rrr_items SET role_type=$1, description=$2, frequency=$3, sort_order=$4
      WHERE id=$5 RETURNING *
    `, [role_type, description, frequency || null, sort_order || 0, req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });
    }

    res.json({ data: rows[0], message: '항목이 수정되었습니다.' });
  } catch (err) { next(err); }
});

// R&R 항목 삭제
router.delete('/:id', auditMiddleware('rrr_items'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM rrr_items WHERE id=$1 RETURNING *', [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });
    }

    res.json({ data: rows[0], message: '항목이 삭제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
