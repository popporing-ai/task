const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// 주의 시작일(월요일) 계산
function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=일, 1=월 ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

// GET /weekly-reports?week=YYYY-MM-DD
// week 파라미터가 없으면 이번 주
router.get('/', async (req, res, next) => {
  try {
    const { week, user_id } = req.query;
    let weekStart;
    if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
      weekStart = getWeekStart(new Date(week));
    } else {
      weekStart = getWeekStart();
    }
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekStartStr = toDateStr(weekStart);
    const weekEndStr = toDateStr(weekEnd);

    // admin은 전체 조회 가능, 일반 사용자는 본인만
    let rows;
    if (req.user.role === 'admin') {
      const targetUserId = user_id ? parseInt(user_id) : null;
      if (targetUserId) {
        ({ rows } = await db.query(`
          SELECT wr.*, u.name AS user_name, u.avatar_bg, u.avatar_text
          FROM weekly_reports wr
          JOIN users u ON u.id = wr.user_id
          WHERE wr.week_start = $1 AND wr.user_id = $2
          ORDER BY u.name
        `, [weekStartStr, targetUserId]));
      } else {
        ({ rows } = await db.query(`
          SELECT wr.*, u.name AS user_name, u.avatar_bg, u.avatar_text
          FROM weekly_reports wr
          JOIN users u ON u.id = wr.user_id
          WHERE wr.week_start = $1
          ORDER BY u.name
        `, [weekStartStr]));
      }
    } else {
      ({ rows } = await db.query(`
        SELECT wr.*, u.name AS user_name, u.avatar_bg, u.avatar_text
        FROM weekly_reports wr
        JOIN users u ON u.id = wr.user_id
        WHERE wr.week_start = $1 AND wr.user_id = $2
      `, [weekStartStr, req.user.id]));
    }

    res.json({ data: rows, meta: { week_start: weekStartStr, week_end: weekEndStr } });
  } catch (err) { next(err); }
});

// GET /weekly-reports/me — 본인 보고서 + 이번 주 태스크 참조
router.get('/me', async (req, res, next) => {
  try {
    const { week } = req.query;
    let weekStart;
    if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
      weekStart = getWeekStart(new Date(week));
    } else {
      weekStart = getWeekStart();
    }
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekStartStr = toDateStr(weekStart);
    const weekEndStr = toDateStr(weekEnd);

    // 내 보고서
    const { rows: reportRows } = await db.query(`
      SELECT * FROM weekly_reports
      WHERE user_id = $1 AND week_start = $2
    `, [req.user.id, weekStartStr]);

    // 이번 주 내 태스크 (완료 + 진행 중) — 작성 참고용
    const { rows: taskRows } = await db.query(`
      SELECT t.id, t.title, t.status, t.due_date, tc.name AS category_name
      FROM tasks t
      LEFT JOIN task_categories tc ON tc.id = t.category_id
      WHERE t.assignee_id = $1
        AND t.due_date >= $2 AND t.due_date <= $3
        AND t.archived = false
      ORDER BY t.status DESC, t.due_date
    `, [req.user.id, weekStartStr, weekEndStr]);

    // 지난주 완료된 태스크도 포함 (이번 주에 완료 처리된 것)
    const { rows: doneThisWeek } = await db.query(`
      SELECT t.id, t.title, t.status, t.due_date, tc.name AS category_name
      FROM tasks t
      LEFT JOIN task_categories tc ON tc.id = t.category_id
      WHERE t.assignee_id = $1
        AND t.status = 'done'
        AND t.updated_at >= $2::timestamptz
        AND t.updated_at < $3::timestamptz + INTERVAL '1 day'
        AND t.archived = false
      ORDER BY t.updated_at DESC
      LIMIT 20
    `, [req.user.id, weekStartStr, weekEndStr]);

    // 중복 제거
    const taskIds = new Set(taskRows.map(t => t.id));
    const extra = doneThisWeek.filter(t => !taskIds.has(t.id));

    res.json({
      data: {
        report: reportRows[0] || null,
        tasks: [...taskRows, ...extra],
      },
      meta: { week_start: weekStartStr, week_end: weekEndStr }
    });
  } catch (err) { next(err); }
});

// GET /weekly-reports/team-summary?week=YYYY-MM-DD — 팀 전체 제출 현황
router.get('/team-summary', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ data: null, message: '권한이 없습니다.' });
    }
    const { week } = req.query;
    let weekStart;
    if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
      weekStart = getWeekStart(new Date(week));
    } else {
      weekStart = getWeekStart();
    }
    const weekStartStr = toDateStr(weekStart);

    // 전체 활성 사용자 + 보고서 제출 여부
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.avatar_bg, u.avatar_text,
             wr.id AS report_id,
             wr.updated_at AS submitted_at
      FROM users u
      LEFT JOIN weekly_reports wr
        ON wr.user_id = u.id AND wr.week_start = $1
      WHERE u.is_active = true
      ORDER BY u.name
    `, [weekStartStr]);

    res.json({ data: rows, meta: { week_start: weekStartStr } });
  } catch (err) { next(err); }
});

// POST /weekly-reports — 작성 or 수정 (upsert)
router.post('/', async (req, res, next) => {
  try {
    const { week_start, this_week, next_week, issues } = req.body;
    if (!week_start || !/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
      return res.status(400).json({ data: null, message: '주차 날짜가 올바르지 않습니다.' });
    }

    const weekStart = getWeekStart(new Date(week_start));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const { rows } = await db.query(`
      INSERT INTO weekly_reports (user_id, week_start, week_end, this_week, next_week, issues, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id, week_start)
      DO UPDATE SET
        this_week  = EXCLUDED.this_week,
        next_week  = EXCLUDED.next_week,
        issues     = EXCLUDED.issues,
        updated_at = NOW()
      RETURNING *
    `, [req.user.id, toDateStr(weekStart), toDateStr(weekEnd), this_week || '', next_week || '', issues || '']);

    res.json({ data: rows[0], message: '주간보고가 저장되었습니다.' });
  } catch (err) { next(err); }
});

// GET /weekly-reports/activity?user_id=&date_from=&date_to=
// 자동 활동 리포트: 기간 내 완료/진행/콘텐츠/댓글/이슈를 집계하여 반환
router.get('/activity', async (req, res, next) => {
  try {
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    let { user_id, date_from, date_to } = req.query;

    // 기본 기간: 이번 주(월~일)
    if (!date_from || !dateRe.test(date_from)) {
      date_from = toDateStr(getWeekStart());
    }
    if (!date_to || !dateRe.test(date_to)) {
      const we = getWeekStart();
      we.setDate(we.getDate() + 6);
      date_to = toDateStr(we);
    }

    // 권한: admin은 모든 user 가능, 일반 유저는 본인만
    let targetUserId = req.user.id;
    if (user_id) {
      const reqUid = parseInt(user_id);
      if (Number.isFinite(reqUid)) {
        if (req.user.role === 'admin' || reqUid === req.user.id) {
          targetUserId = reqUid;
        } else {
          return res.status(403).json({ data: null, message: '다른 사용자의 활동을 조회할 권한이 없습니다.' });
        }
      }
    }

    // 대상 사용자 정보
    const { rows: userRows } = await db.query(
      `SELECT id, name, email, avatar_bg, avatar_text
       FROM users WHERE id = $1`,
      [targetUserId]
    );
    if (!userRows.length) {
      return res.status(404).json({ data: null, message: '사용자를 찾을 수 없습니다.' });
    }
    const user = userRows[0];

    // 1. 기간 내 완료된 업무 (updated_at::date 기준)
    const { rows: completed } = await db.query(`
      SELECT t.id, t.title, t.due_date, t.updated_at, 0 AS points, t.work_type, t.status,
             tc.name AS category_name, tc.color AS category_color
      FROM tasks t
      LEFT JOIN task_categories tc ON tc.id = t.category_id
      WHERE t.assignee_id = $1
        AND t.status = 'done'
        AND t.updated_at::date >= $2::date
        AND t.updated_at::date <= $3::date
        AND t.archived = false
      ORDER BY t.updated_at DESC
    `, [targetUserId, date_from, date_to]);

    // 2. 기간 내 진행 중 / 미진행 업무 (마감일이 기간과 겹치거나 기간 내 업데이트된 것)
    const { rows: inProgress } = await db.query(`
      SELECT t.id, t.title, t.due_date, t.updated_at, 0 AS points, t.work_type, t.status,
             tc.name AS category_name, tc.color AS category_color
      FROM tasks t
      LEFT JOIN task_categories tc ON tc.id = t.category_id
      WHERE t.assignee_id = $1
        AND t.status IN ('todo', 'in_progress', 'blocked')
        AND t.archived = false
        AND (
          (t.due_date >= $2::date AND t.due_date <= $3::date)
          OR (t.updated_at::date >= $2::date AND t.updated_at::date <= $3::date)
        )
      ORDER BY
        CASE t.status WHEN 'in_progress' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
        t.due_date NULLS LAST
    `, [targetUserId, date_from, date_to]);

    // 3. 기간 내 발행/예정 콘텐츠
    const { rows: contentItems } = await db.query(`
      SELECT ci.id, ci.title, ci.channel, ci.content_type,
             ci.publish_date, ci.status, ci.publish_url, ci.inflow_url,
             p.name AS product_name
      FROM content_items ci
      LEFT JOIN products p ON p.id = ci.product_id
      WHERE ci.assignee_id = $1
        AND ci.publish_date >= $2::date
        AND ci.publish_date <= $3::date
      ORDER BY ci.publish_date DESC
    `, [targetUserId, date_from, date_to]);

    // 4. 기간 내 작성한 댓글 (커뮤니케이션 활동량)
    const { rows: comments } = await db.query(`
      SELECT c.id, c.content, c.created_at, c.task_id,
             t.title AS task_title
      FROM comments c
      JOIN tasks t ON t.id = c.task_id
      WHERE c.user_id = $1
        AND c.created_at::date >= $2::date
        AND c.created_at::date <= $3::date
      ORDER BY c.created_at DESC
      LIMIT 30
    `, [targetUserId, date_from, date_to]);

    // 5. 기간 내 보고한 이슈 — 이슈 기능 제거됨, 빈 배열
    const issuesReported = [];

    // 6. 카테고리별 완료 집계
    const { rows: byCategory } = await db.query(`
      SELECT COALESCE(tc.name, '미분류') AS name,
             COALESCE(tc.color, '#9A9BA3') AS color,
             COUNT(*)::int AS count,
             0::int AS points
      FROM tasks t
      LEFT JOIN task_categories tc ON tc.id = t.category_id
      WHERE t.assignee_id = $1
        AND t.status = 'done'
        AND t.updated_at::date >= $2::date
        AND t.updated_at::date <= $3::date
        AND t.archived = false
      GROUP BY tc.name, tc.color
      ORDER BY count DESC
    `, [targetUserId, date_from, date_to]);

    // 7. work_type별 완료 집계
    const { rows: byWorkType } = await db.query(`
      SELECT COALESCE(t.work_type, 'regular') AS work_type,
             COUNT(*)::int AS count,
             0::int AS points
      FROM tasks t
      WHERE t.assignee_id = $1
        AND t.status = 'done'
        AND t.updated_at::date >= $2::date
        AND t.updated_at::date <= $3::date
        AND t.archived = false
      GROUP BY t.work_type
    `, [targetUserId, date_from, date_to]);

    // 8. 일별 완료 추이
    const { rows: daily } = await db.query(`
      SELECT t.updated_at::date AS date, COUNT(*)::int AS count
      FROM tasks t
      WHERE t.assignee_id = $1
        AND t.status = 'done'
        AND t.updated_at::date >= $2::date
        AND t.updated_at::date <= $3::date
        AND t.archived = false
      GROUP BY t.updated_at::date
      ORDER BY date
    `, [targetUserId, date_from, date_to]);

    // 9. 다음 7일 예정 업무 (다음 주 계획용)
    const { rows: upcoming } = await db.query(`
      SELECT t.id, t.title, t.due_date, 0 AS points, t.status,
             tc.name AS category_name, tc.color AS category_color
      FROM tasks t
      LEFT JOIN task_categories tc ON tc.id = t.category_id
      WHERE t.assignee_id = $1
        AND t.status != 'done'
        AND t.archived = false
        AND t.due_date > $2::date
        AND t.due_date <= $2::date + INTERVAL '7 days'
      ORDER BY t.due_date
      LIMIT 20
    `, [targetUserId, date_to]);

    // 10. 본인이 작성한 동기간 메모 (특이사항 — 선택적으로 사용)
    const { rows: memoRows } = await db.query(`
      SELECT id, week_start, this_week, next_week, issues, updated_at
      FROM weekly_reports
      WHERE user_id = $1
        AND week_start >= $2::date
        AND week_start <= $3::date
      ORDER BY week_start DESC
      LIMIT 1
    `, [targetUserId, date_from, date_to]);

    const totalPoints = completed.reduce((s, t) => s + (t.points || 0), 0);

    res.json({
      data: {
        user,
        period: { from: date_from, to: date_to },
        summary: {
          tasks_completed: completed.length,
          tasks_in_progress: inProgress.filter(t => t.status === 'in_progress').length,
          tasks_pending:    inProgress.filter(t => t.status === 'todo').length,
          tasks_blocked:    inProgress.filter(t => t.status === 'blocked').length,
          content_published: contentItems.filter(c => c.status === 'done').length,
          content_planned:   contentItems.filter(c => c.status !== 'done').length,
          comments_added:    comments.length,
          issues_raised:     issuesReported.length,
          total_points:      totalPoints,
        },
        completed_tasks:   completed,
        in_progress_tasks: inProgress,
        content_items:     contentItems,
        comments,
        issues:            issuesReported,
        by_category:       byCategory,
        by_work_type:      byWorkType,
        daily_activity:    daily,
        upcoming_tasks:    upcoming,
        memo:              memoRows[0] || null,
      }
    });
  } catch (err) { next(err); }
});

// GET /weekly-reports/history — 본인 과거 보고서 목록
router.get('/history', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT id, week_start, week_end, updated_at,
             LEFT(this_week, 100) AS this_week_preview
      FROM weekly_reports
      WHERE user_id = $1
      ORDER BY week_start DESC
      LIMIT 20
    `, [req.user.id]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
