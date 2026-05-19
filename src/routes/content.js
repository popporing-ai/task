const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router();

router.use(authMiddleware);

// 제품별 유입 URL 매핑 — 각 제품의 실제 contact/inquiry 페이지 (프론트 PRODUCT_URLS와 동기화)
const PRODUCT_URLS = {
  'Core':        'https://virnect.com/support/inquiry',
  'Remote':      'https://remotehome.virnect.com/ko-kr/pages/contact',
  'Scout':       'https://scout.virnect.com/ko-kr/pages/contact-us-1',
  'VisionX':     'https://visionx.virnect.com/ko-kr/pages/contact',
  'Make&View':   'https://makeview.virnect.com/ko-kr/pages/contact',
  'Robotics':    'https://robotics.virnect.com/ko-kr/pages/contact',
  'Inspect':     'https://xr.virnect.com/ko-kr/pages/contact',
  'HoloX':       'https://xr.virnect.com/ko/pages/contact',
  'Twin':        'https://xr.virnect.com/ko/pages/contact',
  'XR':          'https://xr.virnect.com/ko/pages/contact',
  'AutoGuide':   'https://xr.virnect.com/ko/pages/contact',
  'Workstation': 'https://xr.virnect.com/ko/pages/contact',
};

// content_id 기반 유입 URL 생성 — 매핑된 페이지에 ?src= 쿼리 부착
function buildInflowUrl(contentId, productName) {
  if (!contentId) return null;
  const base = (productName && PRODUCT_URLS[productName]) ? PRODUCT_URLS[productName] : 'https://virnect.com';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}src=${contentId}`;
}

// short_url 자동 단축은 제거됨 (TinyURL preview 이슈 등으로 안정적 무료 서비스 없음)
// 사용자가 직접 외부 서비스로 단축한 URL을 폼에 입력하는 방식으로 운영.

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

// 콘텐츠 생성 (단일)
router.post('/', auditMiddleware('content_items'), async (req, res, next) => {
  try {
    const { title, topic, product_id, channel, content_type, assignee_id,
            publish_date, content_id, inflow_url, short_url, publish_url, status, memo } = req.body;

    if (!title || !channel || !content_type) {
      return res.status(400).json({ error: '제목, 채널, 타입을 입력해주세요.' });
    }

    const finalContentId = content_id || (publish_date
      ? await generateContentId(publish_date, channel, content_type)
      : null);

    // inflow_url 자동 보완 — 클라이언트 미전송 시 product + content_id 기반으로 생성
    let finalInflowUrl = inflow_url;
    if (!finalInflowUrl && finalContentId) {
      let pName = null;
      if (product_id) {
        const { rows: pRows } = await db.query('SELECT name FROM products WHERE id = $1', [product_id]);
        pName = pRows[0]?.name || null;
      }
      finalInflowUrl = buildInflowUrl(finalContentId, pName);
    }

    // short_url은 사용자가 외부에서 단축 후 폼에 입력한 값만 저장 (자동 단축 없음)
    const finalShortUrl = short_url || null;

    const { rows } = await db.query(`
      INSERT INTO content_items
        (title, topic, product_id, channel, content_type, assignee_id, publish_date,
         content_id, inflow_url, short_url, publish_url, status, memo, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [title, topic || null, product_id || null, channel, content_type, assignee_id || null,
        publish_date || null, finalContentId, finalInflowUrl || null, finalShortUrl || null,
        publish_url || null, status || 'planned', memo || null, req.user.id]);

    res.json({ data: rows[0], message: '콘텐츠가 추가되었습니다.' });
  } catch (err) { next(err); }
});

// 콘텐츠 일괄 생성 — 하나의 주제로 여러 채널/타입 동시 생성
// body: { topic, channels: [{channel, content_type}, ...], publish_date, product_id, assignee_id, status, memo }
router.post('/batch', auditMiddleware('content_items'), async (req, res, next) => {
  try {
    const { topic, channels, publish_date, product_id, assignee_id, status, memo } = req.body;
    if (!topic || !topic.trim()) {
      return res.status(400).json({ error: '주제(topic)를 입력해주세요.' });
    }
    if (!Array.isArray(channels) || channels.length === 0) {
      return res.status(400).json({ error: '채널/타입 조합을 1개 이상 선택해주세요.' });
    }
    // 제품명 조회 (한 번만 — 모든 batch 항목이 동일 제품)
    let productName = null;
    if (product_id) {
      const { rows: pRows } = await db.query('SELECT name FROM products WHERE id = $1', [product_id]);
      productName = pRows[0]?.name || null;
    }

    // 1단계: content_id + inflow_url 계산 (단축은 병렬로 별도)
    const prepared = [];
    for (const c of channels) {
      const ch = c.channel;
      const ct = c.content_type;
      if (!ch || !ct) continue;
      const cid = publish_date ? await generateContentId(publish_date, ch, ct) : null;
      const inflowUrl = buildInflowUrl(cid, productName);
      prepared.push({ ch, ct, cid, inflowUrl });
    }

    // 2단계: 일괄 INSERT (short_url은 사용자가 나중에 폼에서 입력)
    const items = [];
    for (let idx = 0; idx < prepared.length; idx++) {
      const p = prepared[idx];
      const { rows } = await db.query(`
        INSERT INTO content_items
          (title, topic, product_id, channel, content_type, assignee_id, publish_date,
           content_id, inflow_url, status, memo, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
      `, [topic.trim(), topic.trim(), product_id || null, p.ch, p.ct, assignee_id || null,
          publish_date || null, p.cid, p.inflowUrl, status || 'planned', memo || null, req.user.id]);
      items.push(rows[0]);
    }
    res.json({ data: items, message: `${items.length}개 콘텐츠가 생성되었습니다.` });
  } catch (err) { next(err); }
});

// 콘텐츠 수정
router.put('/:id', auditMiddleware('content_items'), async (req, res, next) => {
  try {
    const { title, topic, product_id, channel, content_type, assignee_id,
            publish_date, content_id, inflow_url, short_url, publish_url, status, memo } = req.body;

    // short_url은 사용자가 폼에 직접 입력한 값만 저장. 클라이언트 미전송 시 기존 값 유지.
    let finalShortUrl;
    if (short_url !== undefined) {
      finalShortUrl = short_url || null;
    } else {
      const { rows: prev } = await db.query('SELECT short_url FROM content_items WHERE id=$1', [req.params.id]);
      if (prev.length === 0) {
        return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });
      }
      finalShortUrl = prev[0].short_url;
    }

    const { rows } = await db.query(`
      UPDATE content_items SET
        title=$1, topic=$2, product_id=$3, channel=$4, content_type=$5, assignee_id=$6,
        publish_date=$7, content_id=$8, inflow_url=$9, short_url=$10, publish_url=$11,
        status=$12, memo=$13, updated_at=NOW()
      WHERE id=$14 RETURNING *
    `, [title, topic || null, product_id || null, channel, content_type, assignee_id || null,
        publish_date || null, content_id || null, inflow_url || null, finalShortUrl,
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
