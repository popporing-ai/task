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
