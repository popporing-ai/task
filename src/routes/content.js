const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router();

router.use(authMiddleware);

// 콘텐츠 ID 자동 생성
async function generateContentId(publishDate, channel, contentType) {
  const base = `${publishDate.replace(/-/g, '').slice(0, 8)}_${channel}_${contentType}`;
  const { rows } = await db.query(
    `SELECT content_id FROM content_items WHERE content_id LIKE $1 ORDER BY content_id`,
    [`${base}%`]
  );
  if (rows.length === 0) return base;
  return `${base}_${rows.length + 1}`;
}

// 콘텐츠 목록
router.get('/', async (req, res, next) => {
  try {
    const { channel, assignee_id, product_id, status, month } = req.query;
    let where = [];
    let params = [];
    let idx = 1;

    if (channel) { where.push(`c.channel = $${idx++}`); params.push(channel); }
    if (assignee_id) { where.push(`c.assignee_id = $${idx++}`); params.push(assignee_id); }
    if (product_id) { where.push(`c.product_id = $${idx++}`); params.push(product_id); }
    if (status) { where.push(`c.status = $${idx++}`); params.push(status); }
    if (month) {
      where.push(`TO_CHAR(c.publish_date, 'YYYY-MM') = $${idx++}`);
      params.push(month);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT c.*, u.name AS assignee_name, u.avatar_bg, u.avatar_text,
             p.name AS product_name
      FROM content_items c
      LEFT JOIN users u ON u.id = c.assignee_id
      LEFT JOIN products p ON p.id = c.product_id
      ${whereClause}
      ORDER BY c.publish_date DESC, c.created_at DESC
    `, params);

    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 콘텐츠 ID 미리보기
router.get('/preview-id', async (req, res, next) => {
  try {
    const { publish_date, channel, content_type } = req.query;
    if (!publish_date || !channel || !content_type) {
      return res.status(400).json({ error: '배포일, 채널, 타입이 필요합니다.' });
    }
    const contentId = await generateContentId(publish_date, channel, content_type);
    res.json({ data: { content_id: contentId } });
  } catch (err) { next(err); }
});

// 콘텐츠 생성
router.post('/', auditMiddleware('content_items'), async (req, res, next) => {
  try {
    const { title, product_id, channel, content_type, assignee_id,
            publish_date, content_id, inflow_url, publish_url, status, memo } = req.body;

    if (!title || !channel || !content_type) {
      return res.status(400).json({ error: '제목, 채널, 타입을 입력해주세요.' });
    }

    // content_id 자동 생성 또는 수동 입력 사용
    const finalContentId = content_id || (publish_date
      ? await generateContentId(publish_date, channel, content_type)
      : null);

    const { rows } = await db.query(`
      INSERT INTO content_items
        (title, product_id, channel, content_type, assignee_id, publish_date,
         content_id, inflow_url, publish_url, status, memo, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [title, product_id || null, channel, content_type, assignee_id || null,
        publish_date || null, finalContentId, inflow_url || null,
        publish_url || null, status || 'planned', memo || null, req.user.id]);

    res.json({ data: rows[0], message: '콘텐츠가 추가되었습니다.' });
  } catch (err) { next(err); }
});

// 콘텐츠 수정
router.put('/:id', auditMiddleware('content_items'), async (req, res, next) => {
  try {
    const { title, product_id, channel, content_type, assignee_id,
            publish_date, content_id, inflow_url, publish_url, status, memo } = req.body;

    const { rows } = await db.query(`
      UPDATE content_items SET
        title=$1, product_id=$2, channel=$3, content_type=$4, assignee_id=$5,
        publish_date=$6, content_id=$7, inflow_url=$8, publish_url=$9,
        status=$10, memo=$11, updated_at=NOW()
      WHERE id=$12 RETURNING *
    `, [title, product_id || null, channel, content_type, assignee_id || null,
        publish_date || null, content_id || null, inflow_url || null,
        publish_url || null, status, memo || null, req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });
    }

    res.json({ data: rows[0], message: '콘텐츠가 수정되었습니다.' });
  } catch (err) { next(err); }
});

// 콘텐츠 삭제
router.delete('/:id', auditMiddleware('content_items'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM content_items WHERE id=$1 RETURNING *', [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });
    }

    res.json({ data: rows[0], message: '콘텐츠가 삭제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
