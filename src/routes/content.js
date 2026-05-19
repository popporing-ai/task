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

// da.gd 무료 API로 단축 URL 생성 — 실패 시 null 반환 (요청 자체는 막지 않음)
// 검증 결과: da.gd는 즉시 301 리다이렉트 + preview 없음 + virnect 도메인 정상 처리 + API 키 불필요.
// (대안들: TinyURL=preview 쿠키 이슈, LRL.KR=v4 deprecated/v5 키 필요, is.gd=virnect 거부)
async function shortenUrl(longUrl) {
  if (!longUrl) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`https://da.gd/s?url=${encodeURIComponent(longUrl)}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'task-app/1.0' },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (!text || /^error/i.test(text) || !/^https?:\/\//.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

// 콘텐츠 ID 자동 생성 (excludeId: UPDATE 시 자기 자신을 제외)
async function generateContentId(publishDate, channel, contentType, excludeId = null) {
  const base = `${publishDate.replace(/-/g, '').slice(0, 8)}_${channel}_${contentType}`;
  const params = [`${base}%`];
  let extra = '';
  if (excludeId) {
    params.push(excludeId);
    extra = ' AND id <> $2';
  }
  const { rows } = await db.query(
    `SELECT content_id FROM content_items WHERE content_id LIKE $1${extra} ORDER BY content_id`,
    params
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

    // short_url 자동 생성 — 클라이언트 미전송 시 da.gd로 단축
    let finalShortUrl = short_url || null;
    if (!finalShortUrl && finalInflowUrl) {
      finalShortUrl = await shortenUrl(finalInflowUrl);
    }

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

    // 2단계: da.gd 단축을 병렬 호출 (채널마다 동시)
    const shortUrls = await Promise.all(
      prepared.map(p => p.inflowUrl ? shortenUrl(p.inflowUrl) : Promise.resolve(null))
    );

    // 3단계: 일괄 INSERT
    const items = [];
    for (let idx = 0; idx < prepared.length; idx++) {
      const p = prepared[idx];
      const sUrl = shortUrls[idx] || null;
      const { rows } = await db.query(`
        INSERT INTO content_items
          (title, topic, product_id, channel, content_type, assignee_id, publish_date,
           content_id, inflow_url, short_url, status, memo, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
      `, [topic.trim(), topic.trim(), product_id || null, p.ch, p.ct, assignee_id || null,
          publish_date || null, p.cid, p.inflowUrl, sUrl, status || 'planned', memo || null, req.user.id]);
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

    // 현재 row 가져오기 — derived 필드 재생성 기준
    const { rows: prevRows } = await db.query('SELECT * FROM content_items WHERE id=$1', [req.params.id]);
    if (prevRows.length === 0) {
      return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });
    }
    const prev = prevRows[0];

    // 최종 source 필드 — 요청에 있으면 그 값, 없으면 prev 유지
    const finalPublishDate = (publish_date !== undefined ? publish_date : prev.publish_date) || null;
    const finalChannel     = channel || prev.channel;
    const finalContentType = content_type || prev.content_type;
    const finalProductId   = (product_id !== undefined ? product_id : prev.product_id) || null;
    const finalTitle       = title !== undefined ? title : prev.title;
    const finalTopic       = topic !== undefined ? topic : prev.topic;
    const finalAssigneeId  = (assignee_id !== undefined ? assignee_id : prev.assignee_id) || null;
    const finalStatus      = status || prev.status;
    const finalMemo        = memo !== undefined ? memo : prev.memo;
    const finalPublishUrl  = publish_url !== undefined ? publish_url : prev.publish_url;

    // content_id — 빈 값이면 source 필드 기준으로 자동 재생성 (자기 자신 제외)
    let finalContentId;
    if (content_id) {
      finalContentId = content_id; // 사용자가 직접 지정
    } else if (finalPublishDate && finalChannel && finalContentType) {
      finalContentId = await generateContentId(
        String(finalPublishDate).slice(0, 10),
        finalChannel,
        finalContentType,
        prev.id,
      );
    } else {
      finalContentId = prev.content_id || null;
    }

    // inflow_url — 빈 값이면 product + content_id 기준으로 재생성
    let finalInflowUrl;
    if (inflow_url) {
      finalInflowUrl = inflow_url;
    } else if (finalContentId) {
      let pName = null;
      if (finalProductId) {
        const { rows: pRows } = await db.query('SELECT name FROM products WHERE id = $1', [finalProductId]);
        pName = pRows[0]?.name || null;
      }
      finalInflowUrl = buildInflowUrl(finalContentId, pName);
    } else {
      finalInflowUrl = null;
    }

    // short_url — 빈 값이면 da.gd로 재단축. inflow_url이 바뀌었어도 재단축.
    let finalShortUrl;
    if (short_url) {
      finalShortUrl = short_url; // 사용자가 직접 채운 값 존중
    } else if (finalInflowUrl && finalInflowUrl !== prev.inflow_url) {
      finalShortUrl = await shortenUrl(finalInflowUrl);
    } else if (short_url === '' || short_url === null) {
      // 명시적으로 비웠으면 재단축
      finalShortUrl = finalInflowUrl ? await shortenUrl(finalInflowUrl) : null;
    } else {
      finalShortUrl = prev.short_url; // 기존 값 유지
    }

    const { rows } = await db.query(`
      UPDATE content_items SET
        title=$1, topic=$2, product_id=$3, channel=$4, content_type=$5, assignee_id=$6,
        publish_date=$7, content_id=$8, inflow_url=$9, short_url=$10, publish_url=$11,
        status=$12, memo=$13, updated_at=NOW()
      WHERE id=$14 RETURNING *
    `, [finalTitle, finalTopic || null, finalProductId, finalChannel, finalContentType, finalAssigneeId,
        finalPublishDate, finalContentId, finalInflowUrl, finalShortUrl,
        finalPublishUrl || null, finalStatus, finalMemo || null, req.params.id]);

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
