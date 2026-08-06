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

// 공개 단축 URL 서비스 목록 — 순서대로 시도해서 첫 성공을 채택.
// 1순위는 da.gd — 클릭 시 중간 페이지 없이 곧바로 302 리다이렉트만 한다.
// tinyurl은 방문자가 미리보기 모드를 켜 두면 리다이렉트 전에 tinyurl 미리보기
// 페이지를 노출하는데, 이건 생성자 쪽에서 막을 수 없어 폴백으로만 둔다.
// (da.gd는 개인 운영이라 간헐적으로 불안정 -> da.gd 생성 실패 시에만 tinyurl 사용)
// is.gd / v.gd는 확인 시점 "database insert failed" 상태라 목록에서 제외.
// 두 서비스 모두 성공 시 순수 단축 URL 문자열을, 실패 시 "Error…" 텍스트를 반환.
const SHORTENERS = [
  (u) => `https://da.gd/s?url=${encodeURIComponent(u)}`,
  (u) => `https://tinyurl.com/api-create.php?url=${encodeURIComponent(u)}`,
];

// 단일 단축 서비스 호출 — 성공 시 단축 URL, 실패 시 null.
// 두 단계 안전장치:
//   ① AbortController로 fetch 헤더 단계 타임아웃
//   ② Promise.race로 wall-clock 하드 타임아웃 (body 단계 hang 방어)
// 일부 서비스가 응답 body를 늦게 흘려서 AbortController 신호가 res.text()까지
// 전파되지 않는 케이스가 있어 ②가 필요.
async function fetchShort(endpoint, timeoutMs) {
  const ctrl = new AbortController();
  const abortTimer = setTimeout(() => ctrl.abort(), timeoutMs);
  const doFetch = (async () => {
    try {
      const res = await fetch(endpoint, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'task-app/1.0' },
      });
      if (!res.ok) return null;
      const text = (await res.text()).trim();
      // "Error", "Error, database insert failed" 등 실패 응답을 걸러냄
      if (!text || /^error/i.test(text) || !/^https?:\/\//.test(text)) return null;
      return text;
    } catch {
      return null;
    }
  })();
  const guard = new Promise(resolve => setTimeout(() => resolve(null), timeoutMs + 500));
  try {
    return await Promise.race([doFetch, guard]);
  } finally {
    clearTimeout(abortTimer);
  }
}

// 단축 URL 생성 — 서비스들을 순서대로 시도하고 첫 성공을 반환. 전체 실패 시 null
// (요청 자체는 막지 않음). 남은 예산을 서비스 간에 나눠 써서 전체 wall-clock을
// timeoutMs로 제한 — 외부 서비스가 전부 hang 해도 콘텐츠 등록을 막지 못한다.
async function shortenUrl(longUrl, timeoutMs = 2500) {
  if (!longUrl) return null;
  const started = Date.now();
  for (const endpoint of SHORTENERS) {
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining < 400) break;
    const short = await fetchShort(endpoint(longUrl), remaining);
    if (short) return short;
  }
  return null;
}

// 백그라운드 단축 — INSERT 직후 짧게 다시 시도해서 short_url 컬럼만 채움.
// 요청-응답 사이클을 지연시키지 않는다. 실패해도 사용자 영향 없음.
function scheduleBgShorten(itemId, inflowUrl) {
  if (!itemId || !inflowUrl) return;
  setImmediate(async () => {
    try {
      const sUrl = await shortenUrl(inflowUrl, 4000);
      if (!sUrl) return;
      await db.query(
        `UPDATE content_items
            SET short_url = $1
          WHERE id = $2 AND (short_url IS NULL OR short_url = '')`,
        [sUrl, itemId]
      );
    } catch (e) {
      console.error(`[bg-shorten] id=${itemId} url=${inflowUrl} failed:`, e.message);
    }
  });
}

// 콘텐츠 ID 자동 생성 (excludeId: UPDATE 시 자기 자신을 제외)
// 단순히 rows.length+1로 접미사를 붙이면 중간에 삭제된 케이스에서 충돌하므로
// 실제 비어 있는 가장 작은 번호를 찾는다.
async function generateContentId(publishDate, channel, contentType, excludeId = null) {
  const base = `${publishDate.replace(/-/g, '').slice(0, 8)}_${channel}_${contentType}`;
  const params = [`${base}%`];
  let extra = '';
  if (excludeId) {
    params.push(excludeId);
    extra = ' AND id <> $2';
  }
  const { rows } = await db.query(
    `SELECT content_id FROM content_items WHERE content_id LIKE $1${extra}`,
    params
  );
  const taken = new Set(rows.map(r => r.content_id));
  if (!taken.has(base)) return base;
  for (let n = 2; n <= taken.size + 2; n++) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  // 이론상 도달하지 않음 — 최후 폴백
  return `${base}_${Date.now()}`;
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

    // short_url 자동 생성 — 클라이언트 미전송 시 da.gd로 단축.
    // 동기 호출은 짧은 wall-clock cap을 적용. 시간 내 실패하면 등록은 그대로
    // 진행하고(short_url=null), INSERT 후 백그라운드에서 재시도해 컬럼만 채운다.
    // → 외부 단축 서비스 hang 때문에 콘텐츠 등록 자체가 막히는 문제를 차단.
    let finalShortUrl = short_url || null;
    if (!finalShortUrl && finalInflowUrl) {
      finalShortUrl = await shortenUrl(finalInflowUrl, 2500);
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

    // 동기 단축이 실패했으면 백그라운드 재시도 (요청 응답을 막지 않음)
    if (!finalShortUrl && finalInflowUrl) {
      scheduleBgShorten(rows[0].id, finalInflowUrl);
    }

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

    // 2단계: da.gd 단축을 병렬 호출 (채널마다 동시, 짧은 cap)
    const shortUrls = await Promise.all(
      prepared.map(p => p.inflowUrl ? shortenUrl(p.inflowUrl, 2500) : Promise.resolve(null))
    );

    // 3단계: 일괄 INSERT + 실패분은 백그라운드 재시도
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
      if (!sUrl && p.inflowUrl) scheduleBgShorten(rows[0].id, p.inflowUrl);
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
    // 짧은 wall-clock cap 적용. 실패하면 일단 null로 저장하고 백그라운드 재시도.
    let finalShortUrl;
    let needBgShorten = false;
    if (short_url) {
      finalShortUrl = short_url; // 사용자가 직접 채운 값 존중
    } else if (finalInflowUrl && finalInflowUrl !== prev.inflow_url) {
      finalShortUrl = await shortenUrl(finalInflowUrl, 2500);
      if (!finalShortUrl) needBgShorten = true;
    } else if (short_url === '' || short_url === null) {
      // 명시적으로 비웠으면 재단축
      if (finalInflowUrl) {
        finalShortUrl = await shortenUrl(finalInflowUrl, 2500);
        if (!finalShortUrl) needBgShorten = true;
      } else {
        finalShortUrl = null;
      }
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

    // 동기 단축이 실패했으면 백그라운드 재시도
    if (needBgShorten && finalInflowUrl) {
      scheduleBgShorten(rows[0].id, finalInflowUrl);
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
