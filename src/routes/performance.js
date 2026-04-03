const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');
const { createNotification } = require('./notifications');

const router = express.Router();

router.use(authMiddleware);

// 관리자 권한 확인 헬퍼
function requireAdmin(req, res) {
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    return false;
  }
  return true;
}

// 팀 전체 성과 요약 (현재 월)
router.get('/team', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.avatar_bg, u.avatar_text,
             COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS completed,
             COUNT(t.id) FILTER (WHERE t.status = 'blocked')::int AS delayed,
             COUNT(t.id)::int AS total,
             COALESCE(SUM(t.points) FILTER (WHERE t.status = 'done'), 0)::int AS total_points,
             CASE
               WHEN COUNT(t.id) > 0
               THEN ROUND((COUNT(t.id) FILTER (WHERE t.status = 'done')::numeric / COUNT(t.id)) * 100, 1)
               ELSE 0
             END AS completion_rate
      FROM users u
      LEFT JOIN tasks t ON t.assignee_id = u.id
        AND t.archived = false
        AND t.created_at >= date_trunc('month', CURRENT_DATE)
        AND t.created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
      WHERE u.is_active = true
      GROUP BY u.id
      ORDER BY total_points DESC, completed DESC
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 개인 성과 상세
router.get('/user/:id', async (req, res, next) => {
  try {
    const userId = req.params.id;

    // 기본 통계
    const stats = (await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'done')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'blocked')::int AS delayed,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'todo')::int AS todo,
        COUNT(*)::int AS total,
        COALESCE(SUM(points) FILTER (WHERE status = 'done'), 0)::int AS total_points,
        ROUND(AVG(
          CASE WHEN status = 'done' AND due_date IS NOT NULL
            THEN EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400
          END
        )::numeric, 1) AS avg_completion_days,
        CASE
          WHEN COUNT(*) > 0
          THEN ROUND((COUNT(*) FILTER (WHERE status = 'done')::numeric / COUNT(*)) * 100, 1)
          ELSE 0
        END AS completion_rate
      FROM tasks
      WHERE assignee_id = $1 AND archived = false
    `, [userId])).rows[0];

    // 월별 완료 추이 (최근 6개월)
    const monthly = (await db.query(`
      SELECT
        to_char(date_trunc('month', updated_at), 'YYYY-MM') AS month,
        COUNT(*)::int AS completed
      FROM tasks
      WHERE assignee_id = $1 AND status = 'done' AND archived = false
        AND updated_at >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY date_trunc('month', updated_at)
      ORDER BY month
    `, [userId])).rows;

    // 카테고리별 분포
    const byCategory = (await db.query(`
      SELECT tc.name AS category_name, COUNT(t.id)::int AS count
      FROM tasks t
      JOIN task_categories tc ON tc.id = t.category_id
      WHERE t.assignee_id = $1 AND t.archived = false
      GROUP BY tc.name
      ORDER BY count DESC
    `, [userId])).rows;

    res.json({
      data: {
        stats,
        monthly_trend: monthly,
        by_category: byCategory,
      }
    });
  } catch (err) { next(err); }
});

// 기간 보고서 생성 (성과 스코어, 이슈, 면담 포함)
router.get('/report', async (req, res, next) => {
  try {
    const { period, date_from, date_to } = req.query;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;

    let fromDate, toDate;
    if (date_from && date_to && dateRe.test(date_from) && dateRe.test(date_to)) {
      fromDate = date_from;
      toDate = date_to;
    } else if (period === 'weekly') {
      fromDate = "date_trunc('week', CURRENT_DATE)";
      toDate = "date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'";
    } else if (period === 'quarterly') {
      fromDate = "date_trunc('quarter', CURRENT_DATE)";
      toDate = "date_trunc('quarter', CURRENT_DATE) + INTERVAL '3 months'";
    } else {
      // 기본: 이번 달
      fromDate = "date_trunc('month', CURRENT_DATE)";
      toDate = "date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'";
    }

    const isLiteral = dateRe.test(fromDate);
    const fromExpr = isLiteral ? `'${fromDate}'::date` : fromDate;
    const toExpr = isLiteral ? `'${toDate}'::date` : toDate;

    const { rows } = await db.query(`
      SELECT u.id, u.name,
             COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS tasks_completed,
             COUNT(t.id) FILTER (WHERE t.status = 'blocked')::int AS tasks_delayed,
             COUNT(t.id)::int AS total_tasks,
             COALESCE(SUM(t.points) FILTER (WHERE t.status = 'done'), 0)::int AS total_points,
             ROUND(AVG(
               CASE WHEN t.status = 'done' AND t.due_date IS NOT NULL
                 THEN EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 86400
               END
             )::numeric, 1) AS avg_completion_days,
             CASE
               WHEN COUNT(t.id) > 0
               THEN ROUND((COUNT(t.id) FILTER (WHERE t.status = 'done')::numeric / COUNT(t.id)) * 100, 1)
               ELSE 0
             END AS completion_rate,
             CASE
               WHEN COUNT(t.id) > 0
               THEN ROUND((COUNT(t.id) FILTER (WHERE t.status = 'blocked')::numeric / COUNT(t.id)) * 100, 1)
               ELSE 0
             END AS delay_rate
      FROM users u
      LEFT JOIN tasks t ON t.assignee_id = u.id
        AND t.archived = false
        AND t.created_at >= ${fromExpr}
        AND t.created_at < ${toExpr}
      WHERE u.is_active = true
      GROUP BY u.id
      ORDER BY total_points DESC
    `);

    // 각 유저별 스코어, 이슈 수, 면담 수 추가
    for (const row of rows) {
      // 최신 성과 스코어
      const scoreRes = await db.query(`
        SELECT grade, completion_rate AS score_completion_rate, delay_rate AS score_delay_rate
        FROM performance_scores
        WHERE user_id = $1
        ORDER BY period_start DESC LIMIT 1
      `, [row.id]);
      row.grade = scoreRes.rows[0]?.grade || null;
      row.score_completion_rate = scoreRes.rows[0]?.score_completion_rate || null;
      row.score_delay_rate = scoreRes.rows[0]?.score_delay_rate || null;

      // 이슈 수 (지연 사유)
      const issueRes = await db.query(`
        SELECT COUNT(*)::int AS issue_count
        FROM task_issues ti
        JOIN tasks t ON t.id = ti.task_id
        WHERE t.assignee_id = $1
          AND ti.created_at >= ${fromExpr}
          AND ti.created_at < ${toExpr}
      `, [row.id]);
      row.issue_count = issueRes.rows[0]?.issue_count || 0;

      // 면담 수
      const meetingRes = await db.query(`
        SELECT COUNT(*)::int AS meeting_count
        FROM meetings
        WHERE user_id = $1
          AND meeting_date >= ${fromExpr}::date
          AND meeting_date < ${toExpr}::date
      `, [row.id]);
      row.meeting_count = meetingRes.rows[0]?.meeting_count || 0;
    }

    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 보고서 CSV 내보내기 (성과 스코어 포함)
router.get('/report/export', async (req, res, next) => {
  try {
    const { period, date_from, date_to } = req.query;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;

    let fromDate, toDate;
    if (date_from && date_to && dateRe.test(date_from) && dateRe.test(date_to)) {
      fromDate = date_from;
      toDate = date_to;
    } else {
      fromDate = "date_trunc('month', CURRENT_DATE)";
      toDate = "date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'";
    }

    const isLiteral = dateRe.test(fromDate);
    const fromExpr = isLiteral ? `'${fromDate}'::date` : fromDate;
    const toExpr = isLiteral ? `'${toDate}'::date` : toDate;

    const { rows } = await db.query(`
      SELECT u.id, u.name AS "이름",
             COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS "완료수",
             COUNT(t.id) FILTER (WHERE t.status = 'blocked')::int AS "지연수",
             CASE
               WHEN COUNT(t.id) > 0
               THEN ROUND((COUNT(t.id) FILTER (WHERE t.status = 'done')::numeric / COUNT(t.id)) * 100, 1)
               ELSE 0
             END AS "완료율",
             CASE
               WHEN COUNT(t.id) > 0
               THEN ROUND((COUNT(t.id) FILTER (WHERE t.status = 'blocked')::numeric / COUNT(t.id)) * 100, 1)
               ELSE 0
             END AS "지연율",
             ROUND(AVG(
               CASE WHEN t.status = 'done' AND t.due_date IS NOT NULL
                 THEN EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 86400
               END
             )::numeric, 1) AS "평균소요일",
             COALESCE(SUM(t.points) FILTER (WHERE t.status = 'done'), 0)::int AS "포인트"
      FROM users u
      LEFT JOIN tasks t ON t.assignee_id = u.id
        AND t.archived = false
        AND t.created_at >= ${fromExpr}
        AND t.created_at < ${toExpr}
      WHERE u.is_active = true
      GROUP BY u.id, u.name
      ORDER BY "포인트" DESC
    `);

    // 각 유저별 등급, 이슈수, 면담수 추가
    for (const row of rows) {
      const scoreRes = await db.query(`
        SELECT grade FROM performance_scores
        WHERE user_id = $1
        ORDER BY period_start DESC LIMIT 1
      `, [row.id]);
      row['등급'] = scoreRes.rows[0]?.grade || '-';

      const issueRes = await db.query(`
        SELECT COUNT(*)::int AS cnt
        FROM task_issues ti
        JOIN tasks t ON t.id = ti.task_id
        WHERE t.assignee_id = $1
          AND ti.created_at >= ${fromExpr}
          AND ti.created_at < ${toExpr}
      `, [row.id]);
      row['이슈수'] = issueRes.rows[0]?.cnt || 0;

      const meetingRes = await db.query(`
        SELECT COUNT(*)::int AS cnt
        FROM meetings
        WHERE user_id = $1
          AND meeting_date >= ${fromExpr}::date
          AND meeting_date < ${toExpr}::date
      `, [row.id]);
      row['면담수'] = meetingRes.rows[0]?.cnt || 0;

      // id 컬럼은 CSV에서 제거
      delete row.id;
    }

    if (rows.length === 0) {
      return res.status(200).send('데이터 없음');
    }

    const BOM = '\uFEFF';
    const headers = Object.keys(rows[0]);
    const csvLines = [headers.join(',')];
    for (const row of rows) {
      csvLines.push(headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="performance-report.csv"');
    res.send(BOM + csvLines.join('\n'));
  } catch (err) { next(err); }
});

// 기여도 분석 (카테고리/제품별)
router.get('/contribution', async (req, res, next) => {
  try {
    const byCategory = (await db.query(`
      SELECT tc.name AS category_name, u.name AS user_name, u.id AS user_id,
             COUNT(t.id)::int AS task_count,
             COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done_count,
             COALESCE(SUM(t.points) FILTER (WHERE t.status = 'done'), 0)::int AS points
      FROM tasks t
      JOIN task_categories tc ON tc.id = t.category_id
      JOIN users u ON u.id = t.assignee_id
      WHERE t.archived = false
      GROUP BY tc.name, u.name, u.id
      ORDER BY tc.name, points DESC
    `)).rows;

    const byProduct = (await db.query(`
      SELECT p.name AS product_name, u.name AS user_name, u.id AS user_id,
             COUNT(ci.id)::int AS content_count,
             COUNT(ci.id) FILTER (WHERE ci.status = 'done')::int AS done_count
      FROM content_items ci
      JOIN products p ON p.id = ci.product_id
      JOIN users u ON u.id = ci.assignee_id
      GROUP BY p.name, u.name, u.id
      ORDER BY p.name, content_count DESC
    `)).rows;

    res.json({
      data: {
        by_category: byCategory,
        by_product: byProduct,
      }
    });
  } catch (err) { next(err); }
});

// ============================================================
// 성과 스코어 API (관리자 전용)
// ============================================================

// 전체 유저의 현재 기간 스코어 조회
router.get('/scores', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { rows } = await db.query(`
      SELECT ps.*, u.name AS user_name, u.avatar_bg, u.avatar_text
      FROM performance_scores ps
      JOIN users u ON u.id = ps.user_id
      WHERE ps.period_start = (
        SELECT MAX(period_start) FROM performance_scores
      )
      ORDER BY ps.grade ASC, ps.completion_rate DESC
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 스코어 생성/갱신
router.post('/scores/generate', auditMiddleware('performance_scores'), async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { period = 'monthly', date } = req.query;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;

    // 기간 계산
    let periodStart, periodEnd;
    const baseDate = (date && dateRe.test(date)) ? date : new Date().toISOString().slice(0, 10);

    if (period === 'weekly') {
      // 해당 주의 월요일~일요일
      periodStart = `date_trunc('week', '${baseDate}'::date)`;
      periodEnd = `date_trunc('week', '${baseDate}'::date) + INTERVAL '7 days' - INTERVAL '1 day'`;
    } else if (period === 'quarterly') {
      periodStart = `date_trunc('quarter', '${baseDate}'::date)`;
      periodEnd = `date_trunc('quarter', '${baseDate}'::date) + INTERVAL '3 months' - INTERVAL '1 day'`;
    } else {
      // 기본: monthly
      periodStart = `date_trunc('month', '${baseDate}'::date)`;
      periodEnd = `date_trunc('month', '${baseDate}'::date) + INTERVAL '1 month' - INTERVAL '1 day'`;
    }

    // 기간 값 조회
    const periodDates = (await db.query(`
      SELECT ${periodStart}::date AS period_start, ${periodEnd}::date AS period_end
    `)).rows[0];

    const pStart = periodDates.period_start;
    const pEnd = periodDates.period_end;

    // 활성 유저 목록
    const users = (await db.query(`
      SELECT id, name FROM users WHERE is_active = true
    `)).rows;

    const results = [];

    for (const user of users) {
      // 완료된 업무
      const completedRes = await db.query(`
        SELECT COUNT(*)::int AS cnt,
               COALESCE(SUM(points), 0)::int AS pts,
               ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)::numeric, 1) AS avg_days
        FROM tasks
        WHERE assignee_id = $1 AND status = 'done' AND archived = false
          AND updated_at >= $2 AND updated_at <= $3
      `, [user.id, pStart, pEnd]);

      // 지연 업무: blocked이면서 due_date < period_end, 또는 delay 이슈가 있는 업무
      const delayedRes = await db.query(`
        SELECT COUNT(DISTINCT t.id)::int AS cnt
        FROM tasks t
        LEFT JOIN task_issues ti ON ti.task_id = t.id AND ti.issue_type = 'delay'
        WHERE t.assignee_id = $1 AND t.archived = false
          AND (
            (t.status = 'blocked' AND t.due_date < $3)
            OR (ti.id IS NOT NULL AND ti.created_at >= $2 AND ti.created_at <= $3)
          )
      `, [user.id, pStart, pEnd]);

      // 진행중 업무
      const inProgressRes = await db.query(`
        SELECT COUNT(*)::int AS cnt
        FROM tasks
        WHERE assignee_id = $1 AND status = 'in_progress' AND archived = false
      `, [user.id]);

      const completed = completedRes.rows[0].cnt;
      const delayed = delayedRes.rows[0].cnt;
      const inProgress = inProgressRes.rows[0].cnt;
      const total = completed + delayed + inProgress;
      const totalPoints = completedRes.rows[0].pts;
      const avgDays = completedRes.rows[0].avg_days || 0;

      const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;
      const delayRate = total > 0 ? Math.round((delayed / total) * 1000) / 10 : 0;

      // 등급 산정
      let grade;
      if (completionRate >= 90 && delayRate <= 5) {
        grade = 'A';
      } else if (completionRate >= 75 && delayRate <= 15) {
        grade = 'B';
      } else if (completionRate >= 50 && delayRate <= 30) {
        grade = 'C';
      } else {
        grade = 'D';
      }

      // UPSERT 스코어
      const upserted = (await db.query(`
        INSERT INTO performance_scores
          (user_id, period, period_start, period_end, completion_rate, delay_rate, avg_days, total_points, total_completed, total_delayed, grade)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (user_id, period, period_start)
        DO UPDATE SET
          period_end = EXCLUDED.period_end,
          completion_rate = EXCLUDED.completion_rate,
          delay_rate = EXCLUDED.delay_rate,
          avg_days = EXCLUDED.avg_days,
          total_points = EXCLUDED.total_points,
          total_completed = EXCLUDED.total_completed,
          total_delayed = EXCLUDED.total_delayed,
          grade = EXCLUDED.grade,
          created_at = NOW()
        RETURNING *
      `, [user.id, period, pStart, pEnd, completionRate, delayRate, avgDays, totalPoints, completed, delayed, grade])).rows[0];

      results.push({ ...upserted, user_name: user.name });

      // 경고 생성: 완료율 50% 미만
      if (completionRate < 50 && total > 0) {
        const existingAlert = (await db.query(`
          SELECT id FROM performance_alerts
          WHERE user_id = $1 AND alert_type = 'low_completion' AND is_resolved = false
        `, [user.id])).rows;
        if (!existingAlert.length) {
          await db.query(`
            INSERT INTO performance_alerts (user_id, alert_type, message)
            VALUES ($1, 'low_completion', $2)
          `, [user.id, `완료율 저조: ${user.name} (${completionRate}%)`]);
          // 관리자에게 알림
          const admins = (await db.query(`SELECT id FROM users WHERE role = 'admin' AND is_active = true`)).rows;
          for (const admin of admins) {
            await createNotification(admin.id, 'performance_alert', `완료율 저조: ${user.name} (${completionRate}%)`, 'performance', user.id);
          }
        }
      }

      // 경고 생성: 3개월 연속 지연율 30% 초과
      const recentScores = (await db.query(`
        SELECT delay_rate FROM performance_scores
        WHERE user_id = $1 AND period = 'monthly'
        ORDER BY period_start DESC LIMIT 3
      `, [user.id])).rows;
      if (recentScores.length >= 3 && recentScores.every(s => parseFloat(s.delay_rate) > 30)) {
        const existingAlert = (await db.query(`
          SELECT id FROM performance_alerts
          WHERE user_id = $1 AND alert_type = 'repeated_delay' AND is_resolved = false
        `, [user.id])).rows;
        if (!existingAlert.length) {
          await db.query(`
            INSERT INTO performance_alerts (user_id, alert_type, message)
            VALUES ($1, 'repeated_delay', $2)
          `, [user.id, `반복 지연 경고: ${user.name}`]);
          const admins = (await db.query(`SELECT id FROM users WHERE role = 'admin' AND is_active = true`)).rows;
          for (const admin of admins) {
            await createNotification(admin.id, 'performance_alert', `반복 지연 경고: ${user.name}`, 'performance', user.id);
          }
        }
      }
    }

    res.json({ data: results, message: `${results.length}명의 성과 스코어가 생성되었습니다.` });
  } catch (err) { next(err); }
});

// 개인 스코어 이력
router.get('/scores/user/:id', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    const { rows } = await db.query(`
      SELECT ps.*, u.name AS user_name
      FROM performance_scores ps
      JOIN users u ON u.id = ps.user_id
      WHERE ps.user_id = $1
      ORDER BY ps.period_start DESC
    `, [id]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 개인 월별 트렌드 (최근 6개월)
router.get('/scores/trend/:id', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    const { rows } = await db.query(`
      SELECT ps.period_start, ps.period_end, ps.completion_rate, ps.delay_rate,
             ps.avg_days, ps.total_points, ps.total_completed, ps.total_delayed, ps.grade
      FROM performance_scores ps
      WHERE ps.user_id = $1 AND ps.period = 'monthly'
        AND ps.period_start >= CURRENT_DATE - INTERVAL '6 months'
      ORDER BY ps.period_start ASC
    `, [id]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 활성 성과 경고 목록
router.get('/alerts', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { rows } = await db.query(`
      SELECT pa.*, u.name AS user_name
      FROM performance_alerts pa
      JOIN users u ON u.id = pa.user_id
      WHERE pa.is_resolved = false
      ORDER BY pa.created_at DESC
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 경고 해제
router.patch('/alerts/:id/resolve', auditMiddleware('performance_alerts'), async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    const { rows } = await db.query(`
      UPDATE performance_alerts
      SET is_resolved = true, resolved_by = $1, resolved_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [req.user.id, id]);
    if (!rows.length) {
      return res.status(404).json({ error: '경고를 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '경고가 해제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
