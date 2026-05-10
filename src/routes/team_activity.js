// 팀 활동 (Team Activity)
// — 사용자 작성 없이 audit_logs / tasks / content_items / comments / task_issues 에서
//   자동 집계하여 팀 매트릭스, 활동 피드, 개인 상세 + (옵션) LLM 요약을 제공
const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// ────────── 유틸 ──────────
function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function toDateStr(d) { return d.toISOString().slice(0, 10); }

function resolvePeriod({ date_from, date_to, period }) {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (date_from && date_to && dateRe.test(date_from) && dateRe.test(date_to)) {
    return { from: date_from, to: date_to };
  }
  const today = new Date();
  if (period === 'month') {
    const s = new Date(today.getFullYear(), today.getMonth(), 1);
    const e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: toDateStr(s), to: toDateStr(e) };
  }
  if (period === 'quarter') {
    const q = Math.floor(today.getMonth() / 3) * 3;
    const s = new Date(today.getFullYear(), q, 1);
    const e = new Date(today.getFullYear(), q + 3, 0);
    return { from: toDateStr(s), to: toDateStr(e) };
  }
  // default: 이번 주
  const ws = getWeekStart();
  const we = new Date(ws); we.setDate(we.getDate() + 6);
  return { from: toDateStr(ws), to: toDateStr(we) };
}

// ────────── 1. GET /team-matrix ──────────
// 팀 전체 메트릭 매트릭스 (admin 전용)
router.get('/team-matrix', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ data: null, message: '권한이 없습니다.' });
    }
    const { from, to } = resolvePeriod(req.query);

    // 사용자별 핵심 메트릭
    const { rows: metrics } = await db.query(`
      SELECT
        u.id, u.name, u.avatar_bg, u.avatar_text,
        COALESCE(d.done_count, 0)::int           AS done_count,
        COALESCE(ip.in_progress_count, 0)::int   AS in_progress_count,
        COALESCE(b.blocked_count, 0)::int        AS blocked_count,
        COALESCE(o.overdue_count, 0)::int        AS overdue_count,
        COALESCE(d.total_points, 0)::int         AS total_points,
        COALESCE(c.content_done, 0)::int         AS content_done,
        COALESCE(c.content_total, 0)::int        AS content_total,
        COALESCE(cm.comment_count, 0)::int       AS comment_count,
        la.last_at                                AS last_activity_at
      FROM users u
      LEFT JOIN (
        SELECT assignee_id,
               COUNT(*) AS done_count,
               COALESCE(SUM(points), 0) AS total_points
        FROM tasks
        WHERE status = 'done' AND archived = false
          AND updated_at::date BETWEEN $1::date AND $2::date
        GROUP BY assignee_id
      ) d ON d.assignee_id = u.id
      LEFT JOIN (
        SELECT assignee_id, COUNT(*) AS in_progress_count
        FROM tasks
        WHERE status = 'in_progress' AND archived = false
        GROUP BY assignee_id
      ) ip ON ip.assignee_id = u.id
      LEFT JOIN (
        SELECT assignee_id, COUNT(*) AS blocked_count
        FROM tasks
        WHERE status = 'blocked' AND archived = false
        GROUP BY assignee_id
      ) b ON b.assignee_id = u.id
      LEFT JOIN (
        SELECT assignee_id, COUNT(*) AS overdue_count
        FROM tasks
        WHERE status != 'done' AND archived = false
          AND due_date IS NOT NULL AND due_date < CURRENT_DATE
        GROUP BY assignee_id
      ) o ON o.assignee_id = u.id
      LEFT JOIN (
        SELECT assignee_id,
               COUNT(*) FILTER (WHERE status = 'done') AS content_done,
               COUNT(*) AS content_total
        FROM content_items
        WHERE publish_date BETWEEN $1::date AND $2::date
        GROUP BY assignee_id
      ) c ON c.assignee_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS comment_count
        FROM comments
        WHERE created_at::date BETWEEN $1::date AND $2::date
        GROUP BY user_id
      ) cm ON cm.user_id = u.id
      LEFT JOIN (
        SELECT user_id, MAX(created_at) AS last_at
        FROM audit_logs
        WHERE created_at::date BETWEEN $1::date AND $2::date
        GROUP BY user_id
      ) la ON la.user_id = u.id
      WHERE u.is_active = true
      ORDER BY done_count DESC, u.name
    `, [from, to]);

    // 일별 완료 추이 (sparkline용)
    const { rows: spark } = await db.query(`
      SELECT assignee_id AS user_id,
             updated_at::date AS date,
             COUNT(*)::int AS count
      FROM tasks
      WHERE status = 'done' AND archived = false
        AND assignee_id IS NOT NULL
        AND updated_at::date BETWEEN $1::date AND $2::date
      GROUP BY assignee_id, updated_at::date
    `, [from, to]);

    // user_id별 sparkline 매핑
    const sparkMap = {};
    spark.forEach(r => {
      const uid = r.user_id;
      if (!sparkMap[uid]) sparkMap[uid] = {};
      const dateStr = (typeof r.date === 'string')
        ? r.date.slice(0, 10)
        : new Date(r.date).toISOString().slice(0, 10);
      sparkMap[uid][dateStr] = r.count;
    });

    // 기간 내 일자 배열
    const dates = [];
    const dt = new Date(from);
    const end = new Date(to);
    while (dt <= end) {
      dates.push(toDateStr(dt));
      dt.setDate(dt.getDate() + 1);
    }

    const enriched = metrics.map(u => ({
      ...u,
      sparkline: dates.map(day => (sparkMap[u.id] || {})[day] || 0),
    }));

    res.json({
      data: enriched,
      meta: { from, to, dates, user_count: enriched.length },
    });
  } catch (err) { next(err); }
});

// ────────── 2. GET /activity-feed ──────────
// 시간순 활동 피드 (audit_logs + comments + content + issues 통합)
router.get('/activity-feed', async (req, res, next) => {
  try {
    const { from, to } = resolvePeriod(req.query);
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);

    // 본인이 아닌 다른 사람 조회는 admin만 가능
    let userFilter = null;
    if (req.query.user_id) {
      const reqUid = parseInt(req.query.user_id);
      if (Number.isFinite(reqUid)) {
        if (req.user.role === 'admin' || reqUid === req.user.id) {
          userFilter = reqUid;
        } else {
          return res.status(403).json({ data: null, message: '권한이 없습니다.' });
        }
      }
    }

    // audit_logs 기반 — task 완료 / 생성, 콘텐츠 발행
    const params = [from, to];
    let userClause = '';
    if (userFilter) {
      params.push(userFilter);
      userClause = `AND user_id = $3`;
    }

    const auditQ = await db.query(`
      WITH events AS (
        -- task 완료 이벤트 (status: ?→done)
        SELECT
          'task_completed' AS event_type,
          al.user_id, al.user_name, al.created_at,
          al.record_id  AS link_id,
          'tasks'       AS link_view,
          (al.new_value->>'title') AS title,
          NULL          AS extra_text,
          NULL          AS extra_meta
        FROM audit_logs al
        WHERE al.table_name = 'tasks'
          AND al.action = 'UPDATE'
          AND al.new_value->>'status' = 'done'
          AND COALESCE(al.old_value->>'status','') != 'done'
          AND al.created_at::date BETWEEN $1::date AND $2::date
          ${userClause}

        UNION ALL

        -- task 생성
        SELECT
          'task_created', al.user_id, al.user_name, al.created_at,
          al.record_id, 'tasks',
          al.new_value->>'title', NULL, NULL
        FROM audit_logs al
        WHERE al.table_name = 'tasks'
          AND al.action = 'CREATE'
          AND al.created_at::date BETWEEN $1::date AND $2::date
          ${userClause}

        UNION ALL

        -- 콘텐츠 발행 (status: ?→done)
        SELECT
          'content_published', al.user_id, al.user_name, al.created_at,
          al.record_id, 'content',
          al.new_value->>'title', al.new_value->>'channel', al.new_value->>'publish_url'
        FROM audit_logs al
        WHERE al.table_name = 'content_items'
          AND al.new_value->>'status' = 'done'
          AND COALESCE(al.old_value->>'status','') != 'done'
          AND al.created_at::date BETWEEN $1::date AND $2::date
          ${userClause}

        UNION ALL

        -- 콘텐츠 생성
        SELECT
          'content_created', al.user_id, al.user_name, al.created_at,
          al.record_id, 'content',
          al.new_value->>'title', al.new_value->>'channel', NULL
        FROM audit_logs al
        WHERE al.table_name = 'content_items'
          AND al.action = 'CREATE'
          AND al.created_at::date BETWEEN $1::date AND $2::date
          ${userClause}
      )
      SELECT * FROM events
      ORDER BY created_at DESC
      LIMIT ${limit}
    `, params);

    // 댓글 작성 (audit_logs에 안 잡히는 경우 직접)
    const commentParams = [from, to];
    let commentUserClause = '';
    if (userFilter) {
      commentParams.push(userFilter);
      commentUserClause = `AND c.user_id = $3`;
    }
    const commentQ = await db.query(`
      SELECT
        'comment_added' AS event_type,
        c.user_id,
        u.name AS user_name,
        c.created_at,
        c.task_id AS link_id,
        'tasks'   AS link_view,
        t.title   AS title,
        LEFT(c.content, 200) AS extra_text,
        NULL AS extra_meta
      FROM comments c
      JOIN users u ON u.id = c.user_id
      JOIN tasks t ON t.id = c.task_id
      WHERE c.created_at::date BETWEEN $1::date AND $2::date
      ${commentUserClause}
      ORDER BY c.created_at DESC
      LIMIT ${limit}
    `, commentParams);

    // 이슈 보고
    const issueParams = [from, to];
    let issueUserClause = '';
    if (userFilter) {
      issueParams.push(userFilter);
      issueUserClause = `AND ti.reporter_id = $3`;
    }
    const issueQ = await db.query(`
      SELECT
        'issue_reported' AS event_type,
        ti.reporter_id   AS user_id,
        u.name           AS user_name,
        ti.created_at,
        ti.task_id       AS link_id,
        'tasks'          AS link_view,
        t.title          AS title,
        ti.description   AS extra_text,
        ti.issue_type    AS extra_meta
      FROM task_issues ti
      JOIN users u ON u.id = ti.reporter_id
      JOIN tasks t ON t.id = ti.task_id
      WHERE ti.created_at::date BETWEEN $1::date AND $2::date
      ${issueUserClause}
      ORDER BY ti.created_at DESC
      LIMIT ${limit}
    `, issueParams);

    // 통합 + 시간 역순 정렬 + limit
    const all = [...auditQ.rows, ...commentQ.rows, ...issueQ.rows]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);

    // 사용자 아바타 정보 조인
    const uids = [...new Set(all.map(e => e.user_id).filter(Boolean))];
    let avatarMap = {};
    if (uids.length) {
      const { rows: aRows } = await db.query(
        'SELECT id, avatar_bg, avatar_text FROM users WHERE id = ANY($1)', [uids]
      );
      aRows.forEach(u => { avatarMap[u.id] = u; });
    }
    const enriched = all.map(e => ({
      ...e,
      avatar_bg:   avatarMap[e.user_id]?.avatar_bg || '#EEF1FD',
      avatar_text: avatarMap[e.user_id]?.avatar_text || '#4F6EF7',
    }));

    res.json({ data: enriched, meta: { from, to, count: enriched.length } });
  } catch (err) { next(err); }
});

// ────────── 3. POST /ai-summary ──────────
// 로컬 LLM(OpenAI 호환) 호출하여 활동 요약 생성
// env: LLM_API_URL, LLM_MODEL, LLM_API_KEY(옵션)
router.post('/ai-summary', async (req, res, next) => {
  try {
    const apiUrl = process.env.LLM_API_URL;
    const model  = process.env.LLM_MODEL || 'gpt-3.5-turbo';

    if (!apiUrl) {
      return res.status(503).json({
        data: null,
        message: 'AI 요약 기능이 설정되지 않았습니다. 서버 환경변수 LLM_API_URL을 설정하세요.'
      });
    }

    const { user_id, date_from, date_to } = req.body;
    let targetUserId = req.user.id;
    if (user_id) {
      const reqUid = parseInt(user_id);
      if (Number.isFinite(reqUid)) {
        if (req.user.role === 'admin' || reqUid === req.user.id) {
          targetUserId = reqUid;
        } else {
          return res.status(403).json({ data: null, message: '권한이 없습니다.' });
        }
      }
    }

    const { from, to } = resolvePeriod({ date_from, date_to });

    // 활동 데이터 수집 (요약 입력용)
    const { rows: completed } = await db.query(`
      SELECT t.title, t.points, t.work_type,
             tc.name AS category_name
      FROM tasks t
      LEFT JOIN task_categories tc ON tc.id = t.category_id
      WHERE t.assignee_id = $1
        AND t.status = 'done'
        AND t.updated_at::date BETWEEN $2::date AND $3::date
        AND t.archived = false
      ORDER BY t.updated_at DESC
    `, [targetUserId, from, to]);

    const { rows: inProgress } = await db.query(`
      SELECT t.title, t.due_date, t.status, tc.name AS category_name
      FROM tasks t
      LEFT JOIN task_categories tc ON tc.id = t.category_id
      WHERE t.assignee_id = $1
        AND t.status IN ('in_progress', 'blocked')
        AND t.archived = false
      ORDER BY t.due_date NULLS LAST
      LIMIT 20
    `, [targetUserId]);

    const { rows: contentItems } = await db.query(`
      SELECT title, channel, publish_date, status
      FROM content_items
      WHERE assignee_id = $1
        AND publish_date BETWEEN $2::date AND $3::date
      ORDER BY publish_date DESC
    `, [targetUserId, from, to]);

    const { rows: issues } = await db.query(`
      SELECT ti.issue_type, ti.description, ti.status,
             t.title AS task_title
      FROM task_issues ti
      JOIN tasks t ON t.id = ti.task_id
      WHERE ti.reporter_id = $1
        AND ti.created_at::date BETWEEN $2::date AND $3::date
      ORDER BY ti.created_at DESC
    `, [targetUserId, from, to]);

    const { rows: userRows } = await db.query(
      'SELECT name FROM users WHERE id = $1', [targetUserId]
    );
    const userName = userRows[0]?.name || '구성원';

    // LLM 프롬프트 생성
    const prompt = `당신은 마케팅팀의 활동 리포트를 작성하는 보조 AI입니다.
아래 데이터를 바탕으로 ${userName}님의 ${from} ~ ${to} 활동을 한국어로 4~6줄로 요약해주세요.

요구사항:
- "이번 기간 핵심 성과"를 1줄
- "진행 중인 주요 업무" 1~2줄
- "주의/이슈 사항"이 있으면 1줄
- "다음 액션 제안" 1줄
- 객관적이고 간결한 어투, 마케팅 실무자가 읽기 쉽게
- 불릿이 아닌 자연어 단락으로

데이터:
[완료한 업무 ${completed.length}건]
${completed.map(t => `- [${t.category_name || '미분류'}] ${t.title} (${t.points || 0}pt)`).join('\n') || '없음'}

[진행 중 / 미진행 업무]
${inProgress.map(t => `- [${t.category_name || '미분류'}] ${t.title} (${t.status}, 마감 ${t.due_date || '미정'})`).join('\n') || '없음'}

[발행/예정 콘텐츠 ${contentItems.length}건]
${contentItems.map(c => `- [${c.channel}] ${c.title} (${c.status})`).join('\n') || '없음'}

[보고된 이슈]
${issues.map(i => `- ${i.task_title}: ${i.description} (${i.issue_type}, ${i.status})`).join('\n') || '없음'}
`;

    // LLM 호출 (OpenAI 호환)
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.LLM_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.LLM_API_KEY}`;
    }
    const llmRes = await fetch(`${apiUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '당신은 정확하고 간결한 한국어 활동 리포트 작성 보조 AI입니다.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 600,
      }),
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text().catch(() => '');
      console.error('LLM 호출 실패:', llmRes.status, errText);
      return res.status(502).json({
        data: null,
        message: `LLM 호출 실패 (${llmRes.status}): ${errText.slice(0, 200)}`
      });
    }

    const llmData = await llmRes.json();
    const summary = llmData.choices?.[0]?.message?.content?.trim() || '요약을 생성할 수 없습니다.';

    res.json({
      data: { summary, model, period: { from, to } },
      message: 'AI 요약을 생성했습니다.'
    });
  } catch (err) {
    console.error('AI 요약 에러:', err.message);
    next(err);
  }
});

module.exports = router;
