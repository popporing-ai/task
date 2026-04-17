const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router();

router.use(authMiddleware);

// 관리자 전용 접근 제한 헬퍼
function requireAdmin(req, res) {
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: '관리자만 접근할 수 있습니다.' });
    return false;
  }
  return true;
}

// =============================================================
// 월간 정성 평가 (monthly_evaluations)
// =============================================================

// GET /monthly/user/:userId?year=YYYY — 특정 사용자의 연간 월별 평가 목록
router.get('/monthly/user/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    // 본인 데이터이거나 관리자만 접근 가능
    if (String(userId) !== String(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: '본인 데이터만 조회할 수 있습니다.' });
    }
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const { rows } = await db.query(`
      SELECT me.*, a.name AS admin_name
      FROM monthly_evaluations me
      LEFT JOIN users a ON a.id = me.admin_id
      WHERE me.user_id = $1
        AND EXTRACT(YEAR FROM me.eval_month) = $2
      ORDER BY me.eval_month
    `, [userId, year]);

    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /monthly/:id — 단건 조회
router.get('/monthly/:id', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { rows } = await db.query(`
      SELECT me.*, u.name AS user_name, a.name AS admin_name
      FROM monthly_evaluations me
      LEFT JOIN users u ON u.id = me.user_id
      LEFT JOIN users a ON a.id = me.admin_id
      WHERE me.id = $1
    `, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '평가를 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

// POST /monthly — 월간 평가 생성/업데이트 (upsert)
router.post('/monthly', auditMiddleware('monthly_evaluations'), async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const {
      user_id, eval_month,
      score_timeliness, score_quality, score_collaboration,
      score_initiative, score_growth, memo,
    } = req.body;

    if (!user_id || !eval_month) {
      return res.status(400).json({ error: '사용자와 평가 월은 필수입니다.' });
    }

    // eval_month: YYYY-MM 또는 YYYY-MM-DD — 월 첫날로 정규화
    let monthDate = eval_month;
    if (/^\d{4}-\d{2}$/.test(eval_month)) {
      monthDate = `${eval_month}-01`;
    }

    // 점수 검증 (1~5 또는 null)
    const scores = { score_timeliness, score_quality, score_collaboration, score_initiative, score_growth };
    for (const [key, val] of Object.entries(scores)) {
      if (val != null && (val < 1 || val > 5)) {
        return res.status(400).json({ error: `${key}는 1~5 범위여야 합니다.` });
      }
    }

    const { rows } = await db.query(`
      INSERT INTO monthly_evaluations
        (user_id, admin_id, eval_month, score_timeliness, score_quality,
         score_collaboration, score_initiative, score_growth, memo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (user_id, eval_month) DO UPDATE SET
        admin_id = EXCLUDED.admin_id,
        score_timeliness = EXCLUDED.score_timeliness,
        score_quality = EXCLUDED.score_quality,
        score_collaboration = EXCLUDED.score_collaboration,
        score_initiative = EXCLUDED.score_initiative,
        score_growth = EXCLUDED.score_growth,
        memo = EXCLUDED.memo,
        updated_at = NOW()
      RETURNING *
    `, [
      user_id, req.user.id, monthDate,
      score_timeliness || null, score_quality || null,
      score_collaboration || null, score_initiative || null, score_growth || null,
      memo || null,
    ]);

    res.json({ data: rows[0], message: '월간 평가가 저장되었습니다.' });
  } catch (err) { next(err); }
});

// DELETE /monthly/:id
router.delete('/monthly/:id', auditMiddleware('monthly_evaluations'), async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { rows } = await db.query(
      'DELETE FROM monthly_evaluations WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '평가를 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '월간 평가가 삭제되었습니다.' });
  } catch (err) { next(err); }
});

// =============================================================
// 반기 리포트 (semi_annual_reports)
// =============================================================

// 반기 기간 계산 유틸
function getSemiAnnualRange(year, period) {
  if (period === 'H1') {
    return { start: `${year}-01-01`, end: `${year}-06-30`, endExclusive: `${year}-07-01` };
  }
  return { start: `${year}-07-01`, end: `${year}-12-31`, endExclusive: `${year + 1}-01-01` };
}

// GET /semi-annual/user/:userId?year=YYYY&period=H1 — 자동 집계 리포트
router.get('/semi-annual/user/:userId', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { userId } = req.params;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const period = req.query.period === 'H2' ? 'H2' : 'H1';
    const range = getSemiAnnualRange(year, period);

    // 사용자 기본 정보
    const userRes = await db.query(
      'SELECT id, name, email, avatar_bg, avatar_text, avatar_url FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    // 업무 유형별 완료/지연/포인트 집계
    const taskStats = await db.query(`
      SELECT
        COALESCE(work_type, 'regular') AS work_type,
        COUNT(*) FILTER (WHERE status = 'done') AS done_count,
        COUNT(*) FILTER (WHERE status != 'done' AND due_date < CURRENT_DATE) AS delayed_count,
        COUNT(*) AS total_count,
        COALESCE(SUM(points) FILTER (WHERE status = 'done'), 0) AS done_points,
        COALESCE(SUM(points), 0) AS total_points
      FROM tasks
      WHERE assignee_id = $1
        AND created_at >= $2::date
        AND created_at < $3::date
      GROUP BY COALESCE(work_type, 'regular')
    `, [userId, range.start, range.endExclusive]);

    // 이슈 생성/해결 집계
    const issueStats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE ti.reporter_id = $1) AS created,
        COUNT(*) FILTER (WHERE ti.status = 'resolved' AND ti.resolved_at >= $2::date AND ti.resolved_at < $3::date) AS resolved
      FROM task_issues ti
      WHERE (ti.reporter_id = $1 AND ti.created_at >= $2::date AND ti.created_at < $3::date)
         OR (ti.status = 'resolved' AND ti.resolved_at >= $2::date AND ti.resolved_at < $3::date
             AND ti.task_id IN (SELECT id FROM tasks WHERE assignee_id = $1))
    `, [userId, range.start, range.endExclusive]);

    // 월간 평가 평균
    const monthlyEvalsRes = await db.query(`
      SELECT * FROM monthly_evaluations
      WHERE user_id = $1
        AND eval_month >= $2::date
        AND eval_month < $3::date
      ORDER BY eval_month
    `, [userId, range.start, range.endExclusive]);

    const monthlyEvals = monthlyEvalsRes.rows;
    const scoreKeys = ['score_timeliness', 'score_quality', 'score_collaboration', 'score_initiative', 'score_growth'];
    const avgScores = {};
    for (const key of scoreKeys) {
      const vals = monthlyEvals.map(r => r[key]).filter(v => v != null);
      avgScores[key] = vals.length > 0
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
        : null;
    }

    // 미팅 수
    const meetingRes = await db.query(`
      SELECT COUNT(*) AS count FROM meetings
      WHERE user_id = $1
        AND meeting_date >= $2::date
        AND meeting_date < $3::date
    `, [userId, range.start, range.endExclusive]);

    // 전체 완료율 / 지연율
    let totalDone = 0, totalDelayed = 0, totalAll = 0, totalPoints = 0;
    const byWorkType = { regular: null, extra: null, project: null };
    for (const row of taskStats.rows) {
      const done = parseInt(row.done_count) || 0;
      const delayed = parseInt(row.delayed_count) || 0;
      const total = parseInt(row.total_count) || 0;
      totalDone += done;
      totalDelayed += delayed;
      totalAll += total;
      totalPoints += parseInt(row.total_points) || 0;
      byWorkType[row.work_type] = {
        done_count: done,
        delayed_count: delayed,
        total_count: total,
        done_points: parseInt(row.done_points) || 0,
        total_points: parseInt(row.total_points) || 0,
      };
    }
    const completionRate = totalAll > 0 ? Math.round((totalDone / totalAll) * 1000) / 10 : 0;
    const delayRate = totalAll > 0 ? Math.round((totalDelayed / totalAll) * 1000) / 10 : 0;

    // 저장된 반기 리포트 메타 (admin_notes / finalized)
    const metaRes = await db.query(`
      SELECT * FROM semi_annual_reports
      WHERE user_id = $1 AND year = $2 AND period = $3
    `, [userId, year, period]);

    res.json({
      data: {
        user: userRes.rows[0],
        year,
        period,
        range: { start: range.start, end: range.end },
        taskStats: {
          byWorkType,
          totals: {
            done: totalDone,
            delayed: totalDelayed,
            total: totalAll,
            points: totalPoints,
            completionRate,
            delayRate,
          },
        },
        issues: {
          created: parseInt(issueStats.rows[0]?.created) || 0,
          resolved: parseInt(issueStats.rows[0]?.resolved) || 0,
        },
        monthlyEvals,
        avgScores,
        meetingCount: parseInt(meetingRes.rows[0]?.count) || 0,
        meta: metaRes.rows[0] || null,
      },
    });
  } catch (err) { next(err); }
});

// POST /semi-annual — admin_notes 저장 / finalize
router.post('/semi-annual', auditMiddleware('semi_annual_reports'), async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { user_id, year, period, admin_notes, finalized } = req.body;

    if (!user_id || !year || !['H1', 'H2'].includes(period)) {
      return res.status(400).json({ error: '사용자, 연도, 반기(H1/H2)는 필수입니다.' });
    }

    const { rows } = await db.query(`
      INSERT INTO semi_annual_reports (user_id, period, year, admin_notes, finalized, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, period, year) DO UPDATE SET
        admin_notes = EXCLUDED.admin_notes,
        finalized = EXCLUDED.finalized,
        updated_at = NOW()
      RETURNING *
    `, [user_id, period, year, admin_notes || null, !!finalized, req.user.id]);

    res.json({ data: rows[0], message: '반기 리포트가 저장되었습니다.' });
  } catch (err) { next(err); }
});

// GET /semi-annual/export?user_id=...&year=...&period=... — CSV 내보내기
router.get('/semi-annual/export', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const userId = parseInt(req.query.user_id);
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const period = req.query.period === 'H2' ? 'H2' : 'H1';
    if (!userId) {
      return res.status(400).json({ error: 'user_id는 필수입니다.' });
    }
    const range = getSemiAnnualRange(year, period);

    // 사용자
    const userRes = await db.query('SELECT name FROM users WHERE id = $1', [userId]);
    const userName = userRes.rows[0]?.name || '알 수 없음';

    // 업무 유형별 집계
    const taskStats = await db.query(`
      SELECT
        COALESCE(work_type, 'regular') AS work_type,
        COUNT(*) FILTER (WHERE status = 'done') AS done_count,
        COUNT(*) FILTER (WHERE status != 'done' AND due_date < CURRENT_DATE) AS delayed_count,
        COUNT(*) AS total_count,
        COALESCE(SUM(points) FILTER (WHERE status = 'done'), 0) AS done_points,
        COALESCE(SUM(points), 0) AS total_points
      FROM tasks
      WHERE assignee_id = $1
        AND created_at >= $2::date
        AND created_at < $3::date
      GROUP BY COALESCE(work_type, 'regular')
    `, [userId, range.start, range.endExclusive]);

    // 월간 평가
    const monthlyEvals = await db.query(`
      SELECT * FROM monthly_evaluations
      WHERE user_id = $1 AND eval_month >= $2::date AND eval_month < $3::date
      ORDER BY eval_month
    `, [userId, range.start, range.endExclusive]);

    const workTypeLabel = { regular: '정규 업무', extra: '추가 업무', project: '프로젝트' };
    const BOM = '\uFEFF';
    let csv = BOM;
    csv += `반기 리포트,${userName},${year}년 ${period === 'H1' ? '상반기' : '하반기'}\n\n`;

    csv += '업무 유형,완료,지연,전체,완료 포인트,총 포인트\n';
    for (const row of taskStats.rows) {
      csv += `${workTypeLabel[row.work_type] || row.work_type},${row.done_count},${row.delayed_count},${row.total_count},${row.done_points},${row.total_points}\n`;
    }

    csv += '\n월간 평가\n';
    csv += '평가 월,시의성,품질,협업,주도성,성장,메모\n';
    for (const ev of monthlyEvals.rows) {
      const m = ev.eval_month ? new Date(ev.eval_month).toISOString().slice(0, 7) : '';
      const memo = (ev.memo || '').replace(/"/g, '""').replace(/\n/g, ' ');
      csv += `${m},${ev.score_timeliness || ''},${ev.score_quality || ''},${ev.score_collaboration || ''},${ev.score_initiative || ''},${ev.score_growth || ''},"${memo}"\n`;
    }

    const filename = `semi_annual_${userName}_${year}_${period}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(csv);
  } catch (err) { next(err); }
});

// =============================================================
// 팀 전체 지연 체감 / 업무 분포 분석
// =============================================================

// GET /delay-overview — 팀 지연 모니터링 데이터
router.get('/delay-overview', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    // 현재 지연 중인 업무 (오래된 순)
    const overdue = await db.query(`
      SELECT t.id, t.title, t.status, t.due_date, t.work_type,
             u.id AS assignee_id, u.name AS assignee_name,
             u.avatar_bg, u.avatar_text, u.avatar_url,
             CURRENT_DATE - t.due_date AS days_overdue
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.due_date < CURRENT_DATE
        AND t.status != 'done'
        AND t.archived = false
      ORDER BY t.due_date ASC
      LIMIT 50
    `);

    // 사용자별 최근 6개월 지연 추이
    const monthlyDelays = await db.query(`
      SELECT
        u.id AS user_id, u.name,
        date_trunc('month', t.due_date) AS month,
        COUNT(*) AS delayed_count
      FROM tasks t
      JOIN users u ON u.id = t.assignee_id
      WHERE t.due_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
        AND t.due_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
        AND t.due_date < CURRENT_DATE
        AND t.status != 'done'
      GROUP BY u.id, u.name, date_trunc('month', t.due_date)
      ORDER BY u.name, month
    `);

    // 반복 지연 경고 (performance_alerts)
    const alerts = await db.query(`
      SELECT pa.*, u.name AS user_name
      FROM performance_alerts pa
      LEFT JOIN users u ON u.id = pa.user_id
      WHERE pa.is_resolved = false
      ORDER BY pa.created_at DESC
      LIMIT 20
    `);

    // 이슈 해결 속도 추이 (해결된 이슈의 평균 소요 시간, 월별)
    const resolutionSpeed = await db.query(`
      SELECT
        date_trunc('month', ti.resolved_at) AS month,
        COUNT(*) AS resolved_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (ti.resolved_at - ti.created_at)) / 86400)::numeric, 1) AS avg_days
      FROM task_issues ti
      WHERE ti.status = 'resolved'
        AND ti.resolved_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
      GROUP BY date_trunc('month', ti.resolved_at)
      ORDER BY month
    `);

    res.json({
      data: {
        overdue: overdue.rows,
        monthlyDelays: monthlyDelays.rows,
        alerts: alerts.rows,
        resolutionSpeed: resolutionSpeed.rows,
      },
    });
  } catch (err) { next(err); }
});

// GET /work-distribution — 담당자별 업무 유형 분포
router.get('/work-distribution', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const period = req.query.period; // 'H1' / 'H2' / undefined(전체)

    let dateClause = `EXTRACT(YEAR FROM t.created_at) = ${year}`;
    if (period === 'H1') {
      dateClause += ` AND EXTRACT(MONTH FROM t.created_at) BETWEEN 1 AND 6`;
    } else if (period === 'H2') {
      dateClause += ` AND EXTRACT(MONTH FROM t.created_at) BETWEEN 7 AND 12`;
    }

    const { rows } = await db.query(`
      SELECT
        u.id AS user_id, u.name, u.avatar_bg, u.avatar_text, u.avatar_url,
        COALESCE(t.work_type, 'regular') AS work_type,
        COUNT(t.id) AS task_count,
        COALESCE(SUM(t.points), 0) AS total_points
      FROM users u
      LEFT JOIN tasks t ON t.assignee_id = u.id AND t.archived = false AND ${dateClause}
      WHERE u.is_active = true
      GROUP BY u.id, u.name, u.avatar_bg, u.avatar_text, u.avatar_url, COALESCE(t.work_type, 'regular')
      ORDER BY u.name
    `);

    // 사용자별로 그룹화
    const byUser = {};
    for (const row of rows) {
      const uid = row.user_id;
      if (!byUser[uid]) {
        byUser[uid] = {
          user_id: uid,
          name: row.name,
          avatar_bg: row.avatar_bg,
          avatar_text: row.avatar_text,
          avatar_url: row.avatar_url,
          regular: 0,
          extra: 0,
          project: 0,
          regular_points: 0,
          extra_points: 0,
          project_points: 0,
        };
      }
      const count = parseInt(row.task_count) || 0;
      const points = parseInt(row.total_points) || 0;
      if (count > 0) {
        byUser[uid][row.work_type] = count;
        byUser[uid][`${row.work_type}_points`] = points;
      }
    }

    res.json({ data: Object.values(byUser) });
  } catch (err) { next(err); }
});

module.exports = router;
