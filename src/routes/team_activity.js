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
        0::int AS total_points,
        COALESCE(c.content_done, 0)::int         AS content_done,
        COALESCE(c.content_total, 0)::int        AS content_total,
        COALESCE(cm.comment_count, 0)::int       AS comment_count,
        la.last_at                                AS last_activity_at
      FROM users u
      LEFT JOIN (
        SELECT assignee_id,
               COUNT(*) AS done_count,
               0 AS total_points
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
      WHERE u.is_active = true AND u.role != 'admin'
      ORDER BY done_count DESC, u.name
    `, [from, to]);

    // 일별 완료 추이 (sparkline용) — admin 제외
    const { rows: spark } = await db.query(`
      SELECT t.assignee_id AS user_id,
             t.updated_at::date AS date,
             COUNT(*)::int AS count
      FROM tasks t
      JOIN users u ON u.id = t.assignee_id
      WHERE t.status = 'done' AND t.archived = false
        AND u.role != 'admin'
        AND t.updated_at::date BETWEEN $1::date AND $2::date
      GROUP BY t.assignee_id, t.updated_at::date
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
    // admin 사용자는 자동 제외 (이름 출력은 그대로 두되 활동만 숨김)
    const params = [from, to];
    let userClause = '';
    if (userFilter) {
      params.push(userFilter);
      userClause = `AND al.user_id = $3`;
    }
    const adminFilter = `AND al.user_id NOT IN (SELECT id FROM users WHERE role = 'admin')`;

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
          ${adminFilter}

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
          ${adminFilter}

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
          ${adminFilter}

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
          ${adminFilter}
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
        AND u.role != 'admin'
      ${commentUserClause}
      ORDER BY c.created_at DESC
      LIMIT ${limit}
    `, commentParams);

    // 통합 + 시간 역순 정렬 + limit
    const all = [...auditQ.rows, ...commentQ.rows]
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
      SELECT t.title, 0 AS points, t.work_type,
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

    const issues = [];

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

// ────────── 4. POST /chat ──────────
// LLM 대화형 인터페이스 (개인 활동 정리 도우미 + 업무 현황 Q&A)
// body:
//   - messages: [{role, content}, ...]  대화 history
//   - context_type: 'personal_activity' | 'tasks_overview'
//   - user_id, date_from, date_to   (personal_activity일 때)
const { TOOL_DEFINITIONS, executeTool } = require('../services/assistant_tools');

// LLM 호출 헬퍼 (tool calling 포함)
async function callLLM(apiUrl, model, messages, tools, headers, maxTokens = 1200) {
  const body = {
    model,
    messages,
    temperature: 0.2,
    max_tokens: maxTokens,
  };
  if (tools && tools.length) body.tools = tools;
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LLM ${res.status}: ${errText.slice(0, 200)}`);
  }
  return res.json();
}

// 알려진 도구 이름 (LLM이 망가뜨린 tool name sanitize용)
const KNOWN_TOOL_NAMES = new Set(TOOL_DEFINITIONS.map(t => t.function.name));
function sanitizeToolName(rawName) {
  if (!rawName) return rawName;
  // LLM이 종종 함수명 뒤에 <|channel|>commentary... 같은 토큰을 붙임 — 알려진 이름으로 prefix match
  const head = String(rawName).split(/[^a-zA-Z0-9_]/)[0];
  if (KNOWN_TOOL_NAMES.has(head)) return head;
  return rawName;
}

router.post('/chat', async (req, res, next) => {
  // 대량 작업·LLM 응답이 길어질 수 있어 응답 타임아웃 5분
  req.setTimeout(300000);
  res.setTimeout(300000);
  try {
    const apiUrl = process.env.LLM_API_URL;
    const model  = process.env.LLM_MODEL || 'gpt-3.5-turbo';

    if (!apiUrl) {
      return res.status(503).json({
        data: null,
        message: 'AI 채팅이 설정되지 않았습니다. 서버 환경변수 LLM_API_URL을 설정하세요.'
      });
    }

    const { messages, context_type } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ data: null, message: '메시지가 비어있습니다.' });
    }

    // 마지막 사용자 메시지 길이 제한 (DoS 방지)
    const lastMsg = messages[messages.length - 1];
    if (typeof lastMsg?.content !== 'string' || lastMsg.content.length > 2000) {
      return res.status(400).json({ data: null, message: '메시지가 너무 길거나 형식이 잘못되었습니다.' });
    }

    // ─── 컨텍스트 데이터 수집 ───
    let contextBlock = '';
    if (context_type === 'personal_activity') {
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

      const { rows: completed } = await db.query(`
        SELECT t.title, 0 AS points, t.work_type, t.updated_at::date AS done_date,
               tc.name AS category_name
        FROM tasks t
        LEFT JOIN task_categories tc ON tc.id = t.category_id
        WHERE t.assignee_id = $1
          AND t.status = 'done'
          AND t.updated_at::date BETWEEN $2::date AND $3::date
          AND t.archived = false
        ORDER BY t.updated_at DESC
      `, [targetUserId, from, to]);

      const { rows: inProg } = await db.query(`
        SELECT t.title, t.due_date, t.status, tc.name AS category_name
        FROM tasks t
        LEFT JOIN task_categories tc ON tc.id = t.category_id
        WHERE t.assignee_id = $1
          AND t.status IN ('in_progress', 'todo', 'blocked')
          AND t.archived = false
        ORDER BY t.due_date NULLS LAST
        LIMIT 30
      `, [targetUserId]);

      const { rows: contentRows } = await db.query(`
        SELECT title, channel, publish_date, status
        FROM content_items
        WHERE assignee_id = $1
          AND publish_date BETWEEN $2::date AND $3::date
        ORDER BY publish_date DESC
      `, [targetUserId, from, to]);

      // 이슈 기능 제거 → 빈 결과
      const issueRows = [];

      const { rows: userRows } = await db.query(
        'SELECT name FROM users WHERE id = $1', [targetUserId]
      );
      const userName = userRows[0]?.name || '구성원';

      contextBlock = `
[대상] ${userName} / [기간] ${from} ~ ${to}

[완료한 업무 ${completed.length}건]
${completed.map(t => `- ${t.done_date} [${t.category_name||'미분류'}] ${t.title} (${t.points||0}pt, ${t.work_type})`).join('\n') || '없음'}

[현재 진행/예정/미진행]
${inProg.map(t => `- [${t.category_name||'미분류'}] ${t.title} (${t.status}, 마감 ${t.due_date||'미정'})`).join('\n') || '없음'}

[기간 내 콘텐츠]
${contentRows.map(c => `- [${c.channel}] ${c.title} (${c.publish_date}, ${c.status})`).join('\n') || '없음'}

[보고된 이슈]
${issueRows.map(i => `- ${i.task_title}: ${i.description} (${i.issue_type}, ${i.status})`).join('\n') || '없음'}
`;
    } else if (context_type === 'tasks_overview') {
      // 전체 업무 현황 컨텍스트 (admin은 전체, user는 본인 + 팀)
      const today = new Date().toISOString().slice(0, 10);
      const { rows: tasks } = await db.query(`
        SELECT t.id, t.title, t.status, t.due_date, 0 AS points, t.work_type,
               u.name AS assignee_name, tc.name AS category_name
        FROM tasks t
        LEFT JOIN users u ON u.id = t.assignee_id
        LEFT JOIN task_categories tc ON tc.id = t.category_id
        WHERE t.archived = false
        ORDER BY
          CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
          t.due_date
        LIMIT 200
      `);
      const completedCount = tasks.filter(t => t.status === 'done').length;
      const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
      const todoCount = tasks.filter(t => t.status === 'todo').length;
      const blockedCount = tasks.filter(t => t.status === 'blocked').length;
      const overdueCount = tasks.filter(t => t.due_date && t.due_date.toString().slice(0, 10) < today && t.status !== 'done').length;

      contextBlock = `
[현재 업무 현황 — 오늘 ${today}]
전체 ${tasks.length}건 / 완료 ${completedCount} / 진행중 ${inProgressCount} / 할일 ${todoCount} / 미진행 ${blockedCount} / 지연 ${overdueCount}

[업무 목록 (최대 200건)]
${tasks.map(t => {
  const due = t.due_date ? new Date(t.due_date).toISOString().slice(0,10) : '없음';
  const overdue = t.due_date && due < today && t.status !== 'done' ? ' ⚠지연' : '';
  return `- [${t.category_name||'미분류'}] ${t.title} (${t.status}, 마감 ${due}, ${t.assignee_name||'미배정'}, ${t.points||0}pt)${overdue}`;
}).join('\n')}
`;
    } else {
      contextBlock = '컨텍스트 없음';
    }

    // ─── 시스템 프롬프트 (가드레일 포함) ───
    let systemPrompt = `당신은 VIRNECT 마케팅팀의 업무 현황 조회 보조 AI입니다.

# 절대 규칙
- 한국어로만 답변합니다.
- 아래 [데이터]에 있는 사실만으로 답변합니다. 추측·창작 금지.
- 데이터에 없는 정보를 물으면 "데이터에 없습니다"라고 답합니다.
- 마케팅 업무·콘텐츠·일정·담당자 외의 질문(예: 일반 상식, 잡담, 정치, 코딩 도움 등)은
  정중히 거절하고 "이 화면은 마케팅 업무 현황 조회 전용입니다"라고 안내합니다.
- 답변은 간결하게. 표가 더 명확하면 마크다운 표 사용.
- 외부 링크·이미지·코드 블록은 만들지 않습니다 (단, 마크다운 표는 OK).
- 답변 끝에 사족 붙이지 말고 바로 본론.

# 답변 스타일
- "정리해줘" → 마크다운 불릿 또는 표
- "요약해줘" → 3~5줄 단락
- "누가 ~했어?" / "마감 임박은?" → 핵심만 단답
- 사용자가 형식을 지정하면 그 형식 따름

# 데이터
${contextBlock}
`;

    // ─── 도구 호출 활성화 시 시스템 프롬프트 보강 ───
    const useTools = req.body.use_tools !== false; // 기본 활성화
    if (useTools) {
      // 카테고리·사용자 목록을 컨텍스트로 제공 (이름 → ID 자동 매핑)
      const [catRes, userRes, prodRes, etypeRes] = await Promise.all([
        db.query('SELECT name FROM task_categories ORDER BY id'),
        db.query('SELECT name FROM users WHERE is_active = true ORDER BY name'),
        db.query('SELECT name FROM products ORDER BY id'),
        db.query('SELECT type_key, label FROM calendar_event_types ORDER BY sort_order'),
      ]);
      const cats = catRes.rows.map(r => r.name).join(', ');
      const users = userRes.rows.map(r => r.name).join(', ');
      const prods = prodRes.rows.map(r => r.name).join(', ');
      const etypes = etypeRes.rows.map(r => `${r.type_key}(${r.label})`).join(', ');
      const today = new Date().toISOString().slice(0, 10);
      const isAdminInPrompt = req.user.role === 'admin';
      systemPrompt = `${systemPrompt}

# 도구 사용 가이드
오늘 날짜: ${today}
현재 사용자: **${req.user.name}** (${isAdminInPrompt ? '관리자' : '일반 팀원'})
당신은 사용자의 자연어 요청을 분석해 적절한 도구를 호출하여 데이터를 조회·생성·수정·삭제할 수 있습니다.

## 사용 가능한 분류 (category_name)
${cats}

## 사용 가능한 팀원 (assignee_name / user_name)
${users}

## 사용 가능한 제품 (product_name)
${prods}

## 사용 가능한 일정 유형 (event_type — type_key 값을 사용)
${etypes}

## 동작 규칙 — 필수값/기본값
- **각 도구의 schema에 명시된 required 항목만** 없을 때 짧게 되묻기.
  · create_task → title 하나만 필수
  · create_calendar_event → title, start_date 만 필수
  · create_content → title, channel, content_type 만 필수
  · create_timeline → title, start_month, end_month 만 필수
  · create_rrr → user_name, role_type, description 만 필수
- required가 아닌 필드는 **사용자가 명시하지 않았으면 절대 묻지 말 것**. 비워두거나 합리적 기본값 사용.
- 기본값 가이드:
  · status → todo (업무) / planned (콘텐츠) / planned (타임라인)
  · work_type → regular
  · assignee → 본인 (assignee_name 미지정 시 자동)
  · all_day → true (시간 미지정 시)
  · due_date → 명시 없으면 null (비워둠)
  · description / memo → 명시 없으면 빈 값
- "업무 추가해줘" 같은 짧은 요청 → 곧바로 create_task 호출, title 만 사용, 나머지는 기본값. 카테고리/마감 등은 절대 되묻지 말기.
- 단, 사용자가 분명한 키워드를 줬으면 매핑해줌 (예: "회사소개서 업무" → category_name="회사소개서")

## 권한 규칙 (매우 중요 — AI 도구 한정)
- 도구를 통한 생성·수정·삭제는 **본인이 시스템상 직접 만든(created_by = 본인) 데이터에 한해서만** 시도. 담당자로 지정만 된 항목도 AI 도구로는 못 건드림 — 그건 화면에서 직접 처리하도록 안내.
- 사용자가 "전부 삭제", "모두 정리" 등 광범위한 변경을 요청해도 본인이 직접 만든 항목만 대상으로 좁혀서 처리.
- assignee_name 으로 본인이 아닌 다른 팀원을 지정하는 작업은 시도하지 말 것 (서버에서 차단됨, 관리자 제외).
- 본인이 담당자이지만 다른 사람이 만든 항목을 수정/삭제 요청받으면: "이 항목은 다른 분이 만들어서 AI 도구로 변경할 수 없어요. 화면(업무 카드/콘텐츠 행)에서 직접 열어 수정해주세요." 라고 안내.
- 다른 사람의 데이터 변경이 필요한 경우 "본인이 만든 항목만 AI로 변경할 수 있어요" 라고 안내.

## 엔티티 용어 매핑 (절대 혼동 금지)
- "콘텐츠", "콘텐츠 캘린더" → **content_items** (배포 콘텐츠) → bulk_delete_content / list_content / create_content
- "업무", "할 일", "태스크" → **tasks** → bulk_delete_tasks / list_tasks
- "일정", "캘린더", "팀 캘린더", "스케줄" → **calendar_events** → bulk_delete_calendar_events / list_calendar_events
- "타임라인", "연간 타임라인" → **timeline_items** → list_timeline / delete_timeline
- 헷갈리는 표현: "콘텐츠 캘린더" 는 캘린더가 아니라 콘텐츠 배포 일정표를 뜻함. 무조건 content 도구 사용.

## 본인 이름·"내 데이터" 해석
- 현재 사용자 이름은 시스템이 알고 있음. 사용자가 자기 이름(예: "안영선")을 언급하며 "안영선 이름으로 된 콘텐츠" / "안영선 업무" / "내 이름으로 된 것" 같이 말하면 → 본인 소유 데이터를 가리키는 것이므로 그냥 본인 데이터로 처리 (assignee_me=true 또는 별도 assignee_name 없이 호출).
- 다른 사람 이름을 명시하면 (예: "철수 콘텐츠 삭제") → 비관리자는 항상 권한 없음. "본인 데이터만 변경할 수 있어요" 라고 안내하고 도구 호출하지 말 것.

## 0건 결과 전달 규칙 (중요)
bulk_delete_* 또는 list_* 가 0건을 반환하면 단순히 "데이터가 없습니다" 라고 답하지 말 것. 다음을 명확히 알릴 것:
- 본인 소유 데이터 중 매칭이 없을 뿐, 화면에 보이는 다른 사용자의 데이터는 권한상 검색·삭제할 수 없음
- 예시 응답: "조건에 맞는 본인 콘텐츠가 0건입니다. 화면에 다른 분이 만든 'test'가 보일 수 있지만 권한상 제가 건드릴 수 없어요. 본인이 만든 콘텐츠만 정리 가능합니다."

## 대량 삭제 — 반드시 이 흐름으로
사용자가 "전체 삭제", "모두 삭제", "5월 콘텐츠 다 지워줘", "내 업무 전부 삭제", "콘텐츠 캘린더 다 삭제" 같이 다건 삭제를 요청하면 절대 delete_xxx 를 여러 번 호출하지 말고 **bulk_delete_content / bulk_delete_tasks / bulk_delete_calendar_events 중 적절한 하나만** 사용. 흐름:
1. 사용자 요청에서 조건(채널/기간/상태 등) 추출. "전체"·"모두"·"다"·"전부" 등 광범위 표현이면 **필터 파라미터 전부 생략** (channel/status 등 모두 비워서 호출). 절대 사용자에게 "채널을 알려주세요" 같이 되묻지 말 것 — 빈 필터는 의도된 전체 선택임.
2. **dry_run=true (또는 생략)** 로 bulk_delete_* 1회 호출 → 서버가 "삭제 대상 N건" 만 알려줌 (실제 삭제 안 함)
3. 사용자에게 다시 한 번 명확히 확인: "본인 데이터 N건이 삭제됩니다. 정말 진행할까요?"
4. 사용자가 명확히 "응", "네", "그래", "ㅇㅇ", "삭제" 등 긍정 답변 → **dry_run=false** 로 같은 조건 재호출하여 실제 삭제. 이때 1단계에서 사용한 도구 이름과 완전히 동일한 도구를 사용 (content를 물었으면 content 삭제, calendar를 물었으면 calendar 삭제). **도구 이름을 절대 다른 엔티티로 바꾸지 말 것.**
5. "취소", "아니" 등 부정 답변 → 삭제하지 않고 "취소했습니다" 안내
6. 삭제 후 응답은 매우 짧게: "콘텐츠 N건 삭제 완료." 한 줄. (목록 나열·이모지 남발 금지)
- bulk_delete_* 도구는 비관리자에 대해 서버가 자동으로 본인 데이터로 좁혀서 처리하므로, LLM 쪽에서 추가 필터를 안 걸어도 안전.

## 그 외 규칙
- 권한 부족이면 도구 결과의 error 를 그대로 자연어로 안내
- 파괴적 작업(삭제) 전에 한 번 확인 ("정말 삭제할까요?")
- "내일" → 내일 날짜로 변환, "다음 주 화요일" 등도 실제 날짜로 변환
- "지난 분기", "이번 반기" 같은 표현은 적절한 YYYY-MM-DD 범위로 해석
- 보고서 요청(예: "5월 1일부터 5월 15일까지 홍길동 업무 보고서") → generate_report 도구 호출
- 도구 결과(ok=true)를 받으면 사용자에게 결과를 자연스럽게 요약 안내 (생성/수정/삭제된 항목 제목·핵심 필드 포함)
- 도구 결과(ok=false)면 error 메시지를 친절하게 전달
- 보고서·정리 요청은 마크다운 표/불릿으로 응답`;
    }

    // ─── LLM Multi-turn Tool Loop ───
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.LLM_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.LLM_API_KEY}`;
    }

    const isAdmin = req.user.role === 'admin';
    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-10).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '').slice(0, 2000),
      })),
    ];

    const toolResults = []; // 클라이언트에 전달 (액션 카드 렌더용)
    const MAX_ITER = 5;
    let reply = null;

    try {
      for (let iter = 0; iter < MAX_ITER; iter++) {
        const data = await callLLM(
          apiUrl, model, llmMessages,
          useTools ? TOOL_DEFINITIONS : null, headers
        );
        const msg = data.choices?.[0]?.message;
        if (!msg) {
          reply = '응답을 생성할 수 없습니다.';
          break;
        }

        // tool_calls가 있으면 실행 + 결과를 messages에 추가하고 다시 호출
        const toolCalls = msg.tool_calls;
        if (toolCalls && toolCalls.length) {
          llmMessages.push({
            role: 'assistant',
            content: msg.content || '',
            tool_calls: toolCalls,
          });
          for (const tc of toolCalls) {
            let args = {};
            try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
            const cleanName = sanitizeToolName(tc.function.name);
            const result = await executeTool(cleanName, args, {
              user: req.user, db, isAdmin,
            });
            toolResults.push({ name: cleanName, args, result });
            llmMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(result),
            });
          }
          continue; // 다음 iteration — LLM이 결과를 보고 자연어 응답 또는 추가 도구 호출
        }

        // tool_calls 없으면 최종 응답
        reply = (msg.content || '').trim();
        break;
      }
    } catch (e) {
      console.error('LLM/Tool 호출 실패:', e.message);
      return res.status(502).json({
        data: null,
        message: `AI 호출 실패: ${e.message}`,
      });
    }

    if (!reply) reply = '응답이 비어있습니다.';

    res.json({
      data: { reply, model, tool_results: toolResults },
      message: 'OK'
    });
  } catch (err) {
    console.error('AI 채팅 에러:', err.message);
    next(err);
  }
});

module.exports = router;
