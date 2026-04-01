const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

// 테이블명 한글 매핑
const TABLE_LABELS = {
  tasks: '업무 현황',
  content_items: '콘텐츠 캘린더',
  timeline_items: '연간 타임라인',
  rrr_items: 'R&R',
};

// 변경 이력 조회
router.get('/', async (req, res, next) => {
  try {
    const { table_name, user_id, date_from, date_to, page } = req.query;
    let where = [];
    let params = [];
    let idx = 1;

    if (table_name) { where.push(`al.table_name = $${idx++}`); params.push(table_name); }
    if (user_id) { where.push(`al.user_id = $${idx++}`); params.push(user_id); }
    if (date_from) { where.push(`al.created_at >= $${idx++}`); params.push(date_from); }
    if (date_to) { where.push(`al.created_at < ($${idx++})::date + INTERVAL '1 day'`); params.push(date_to); }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const limit = 50;
    const offset = ((parseInt(page) || 1) - 1) * limit;

    // 총 개수
    const countResult = await db.query(
      `SELECT COUNT(*) AS total FROM audit_logs al ${whereClause}`, params
    );

    // 데이터 조회
    params.push(limit);
    params.push(offset);
    const { rows } = await db.query(`
      SELECT al.*, u.avatar_bg, u.avatar_text
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, params);

    res.json({
      data: rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page) || 1,
      pageSize: limit,
      tableLabels: TABLE_LABELS,
    });
  } catch (err) { next(err); }
});

// CSV 내보내기
router.get('/export.csv', async (req, res, next) => {
  try {
    const { table_name, user_id, date_from, date_to } = req.query;
    let where = [];
    let params = [];
    let idx = 1;

    if (table_name) { where.push(`al.table_name = $${idx++}`); params.push(table_name); }
    if (user_id) { where.push(`al.user_id = $${idx++}`); params.push(user_id); }
    if (date_from) { where.push(`al.created_at >= $${idx++}`); params.push(date_from); }
    if (date_to) { where.push(`al.created_at < ($${idx++})::date + INTERVAL '1 day'`); params.push(date_to); }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT
        al.id,
        al.created_at AT TIME ZONE 'Asia/Seoul' AS "변경일시",
        al.user_name AS "작업자",
        al.action AS "작업유형",
        al.table_name AS "대상테이블",
        al.record_id AS "레코드ID",
        al.old_value::text AS "변경전",
        al.new_value::text AS "변경후",
        al.ip_address AS "IP주소"
      FROM audit_logs al
      ${whereClause}
      ORDER BY al.created_at DESC
    `, params);

    // UTF-8 BOM + CSV
    const BOM = '\uFEFF';
    const headers = ['변경일시', '작업자', '작업유형', '대상테이블', '레코드ID', '변경전', '변경후', 'IP주소'];
    let csv = BOM + headers.join(',') + '\n';

    for (const row of rows) {
      const line = [
        row['변경일시'],
        row['작업자'],
        row['작업유형'],
        TABLE_LABELS[row['대상테이블']] || row['대상테이블'],
        row['레코드ID'],
        `"${(row['변경전'] || '').replace(/"/g, '""')}"`,
        `"${(row['변경후'] || '').replace(/"/g, '""')}"`,
        row['IP주소'] || '',
      ].join(',');
      csv += line + '\n';
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="task_audit_${dateStr}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

module.exports = router;
