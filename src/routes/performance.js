const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

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

// 기간 보고서 생성
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
             END AS completion_rate
      FROM users u
      LEFT JOIN tasks t ON t.assignee_id = u.id
        AND t.archived = false
        AND t.created_at >= ${fromExpr}
        AND t.created_at < ${toExpr}
      WHERE u.is_active = true
      GROUP BY u.id
      ORDER BY total_points DESC
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 보고서 CSV 내보내기
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
      SELECT u.name AS "이름",
             COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS "완료",
             COUNT(t.id) FILTER (WHERE t.status = 'blocked')::int AS "지연",
             COUNT(t.id)::int AS "전체",
             COALESCE(SUM(t.points) FILTER (WHERE t.status = 'done'), 0)::int AS "포인트",
             CASE
               WHEN COUNT(t.id) > 0
               THEN ROUND((COUNT(t.id) FILTER (WHERE t.status = 'done')::numeric / COUNT(t.id)) * 100, 1)
               ELSE 0
             END AS "완료율(%)"
      FROM users u
      LEFT JOIN tasks t ON t.assignee_id = u.id
        AND t.archived = false
        AND t.created_at >= ${fromExpr}
        AND t.created_at < ${toExpr}
      WHERE u.is_active = true
      GROUP BY u.id, u.name
      ORDER BY "포인트" DESC
    `);

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

module.exports = router;
