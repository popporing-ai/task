const express = require('express');
const db = require('../db');

// 외부 공개 라우트 — 인증 불필요, 읽기 전용.
// 다른 부서가 로그인 없이 팀 캘린더의 '외부 공개' 일정만 볼 수 있게 한다.
// 데이터는 마케팅팀이 쓰는 calendar_events 테이블 그대로 → 실시간 연동.
const router = express.Router();

// GET /task/api/public/calendar — 공개 일정 목록 (월별 또는 날짜 범위)
// is_public = true 인 일정만, 외부에 보여도 되는 필드만 반환한다.
router.get('/calendar', async (req, res, next) => {
  try {
    const { month, start, end } = req.query;
    let where = ['ce.is_public = true'];
    let params = [];
    let idx = 1;

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      // YYYY-MM 형식 → 해당 월의 시작~끝
      const [y, m] = month.split('-').map(Number);
      const firstDay = new Date(y, m - 1, 1).toISOString().slice(0, 10);
      const lastDay = new Date(y, m, 0).toISOString().slice(0, 10);
      where.push(`(ce.start_date <= $${idx}::date AND (ce.end_date >= $${idx + 1}::date OR (ce.end_date IS NULL AND ce.start_date >= $${idx + 1}::date)))`);
      params.push(lastDay, firstDay);
      idx += 2;
    } else if (start && end) {
      where.push(`(ce.start_date <= $${idx}::date AND (ce.end_date >= $${idx + 1}::date OR (ce.end_date IS NULL AND ce.start_date >= $${idx + 1}::date)))`);
      params.push(end, start);
      idx += 2;
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    // 안전 필드만 SELECT — 이메일/세션/생성자ID 등 민감정보는 제외.
    // 담당자는 표시 이름·아바타만 노출 (사용자 요청: 담당자 포함).
    const { rows } = await db.query(`
      SELECT ce.id, ce.title, ce.description, ce.event_type,
             ce.start_date, ce.end_date, ce.start_time, ce.end_time,
             ce.all_day, ce.color,
             u.name AS assignee_name, u.avatar_bg, u.avatar_text
      FROM calendar_events ce
      LEFT JOIN users u ON u.id = ce.assignee_id
      ${whereClause}
      ORDER BY ce.start_date, ce.start_time NULLS FIRST
    `, params);

    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /task/api/public/event-types — 유형 라벨/색 (범례용)
router.get('/event-types', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT type_key, label, color, sort_order
       FROM calendar_event_types ORDER BY sort_order, id`
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
