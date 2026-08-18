const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router();

router.use(authMiddleware);

// 현재 활성 버전 ID 조회 헬퍼
async function getCurrentVersionId(client) {
  const q = client
    ? client.query.bind(client)
    : db.query.bind(db);
  const { rows } = await q('SELECT id FROM rrr_versions WHERE is_current = true LIMIT 1');
  return rows.length ? rows[0].id : null;
}

// R&R 전체 목록 (현재 버전의 유저별 그룹)
router.get('/', async (req, res, next) => {
  try {
    const versionId = await getCurrentVersionId();
    if (!versionId) {
      return res.json({ data: [] });
    }

    const { rows } = await db.query(`
      SELECT r.*, u.name AS user_name, u.avatar_bg, u.avatar_text, u.avatar_url
      FROM rrr_items r
      JOIN users u ON u.id = r.user_id
      WHERE r.version_id = $1
      ORDER BY u.id, r.sort_order, r.id
    `, [versionId]);

    // 유저별로 그룹핑
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.user_id]) {
        grouped[row.user_id] = {
          user_id: row.user_id,
          user_name: row.user_name,
          avatar_bg: row.avatar_bg,
          avatar_text: row.avatar_text,
          avatar_url: row.avatar_url,
          items: [],
        };
      }
      grouped[row.user_id].items.push(row);
    }

    res.json({ data: Object.values(grouped) });
  } catch (err) { next(err); }
});

// R&R 항목 순서 저장 (드래그 후 호출) — 현재 버전 항목만
router.post('/reorder', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '관리자만 수정할 수 있습니다.' });
    }
    const { orders } = req.body;
    if (!Array.isArray(orders)) return res.status(400).json({ error: 'orders 배열이 필요합니다.' });

    const versionId = await getCurrentVersionId();
    if (!versionId) return res.status(400).json({ error: '현재 활성 버전이 없습니다.' });

    await Promise.all(orders.map(o =>
      db.query('UPDATE rrr_items SET sort_order=$1 WHERE id=$2 AND version_id=$3', [o.sort_order, o.id, versionId])
    ));
    res.json({ message: '순서가 저장되었습니다.' });
  } catch (err) { next(err); }
});

// 버전 이력 조회 (최신순)
router.get('/versions', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, version, effective_date, title, change_note, is_current, created_by, created_at
       FROM rrr_versions ORDER BY id DESC`
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 특정 버전의 항목 조회 (읽기 전용)
router.get('/versions/:id/items', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT r.*, u.name AS user_name, u.avatar_bg, u.avatar_text, u.avatar_url
      FROM rrr_items r
      JOIN users u ON u.id = r.user_id
      WHERE r.version_id = $1
      ORDER BY u.id, r.sort_order, r.id
    `, [req.params.id]);

    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.user_id]) {
        grouped[row.user_id] = {
          user_id: row.user_id,
          user_name: row.user_name,
          avatar_bg: row.avatar_bg,
          avatar_text: row.avatar_text,
          avatar_url: row.avatar_url,
          items: [],
        };
      }
      grouped[row.user_id].items.push(row);
    }

    res.json({ data: Object.values(grouped) });
  } catch (err) { next(err); }
});

// 새 버전으로 아카이브 (관리자 전용) — 현재 R&R 복제 후 새 버전 시작
router.post('/versions/archive', auditMiddleware('rrr_versions'), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '관리자만 버전을 관리할 수 있습니다.' });
    }

    const { version, effective_date, title, change_note } = req.body;

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // 현재 버전 조회
      const { rows: curRows } = await client.query(
        'SELECT id, version FROM rrr_versions WHERE is_current = true LIMIT 1'
      );
      const oldVersion = curRows[0] || null;

      // 새 버전 번호 결정 (미입력 시 이전 patch 자동 증가)
      let newVersion = version;
      if (!newVersion || !newVersion.trim()) {
        if (oldVersion && oldVersion.version) {
          const parts = oldVersion.version.split('.').map(Number);
          if (parts.length === 3) {
            parts[2] += 1;
            newVersion = parts.join('.');
          } else {
            newVersion = '1.0.1';
          }
        } else {
          newVersion = '1.0.0';
        }
      }

      // 기존 활성 해제
      await client.query('UPDATE rrr_versions SET is_current = false WHERE is_current = true');

      // 새 버전 삽입
      const { rows: newRows } = await client.query(
        `INSERT INTO rrr_versions (version, effective_date, title, change_note, is_current, created_by)
         VALUES ($1, $2, $3, $4, true, $5)
         RETURNING *`,
        [
          newVersion.trim(),
          effective_date || null,
          title || null,
          change_note || null,
          req.user.id,
        ]
      );
      const newVersionRow = newRows[0];

      // 이전 버전의 항목을 새 버전으로 복제
      if (oldVersion) {
        await client.query(
          `INSERT INTO rrr_items (user_id, role_type, description, task_detail, part, category, frequency, sub_assignee, status_note, sort_order, version_id)
           SELECT user_id, role_type, description, task_detail, part, category, frequency, sub_assignee, status_note, sort_order, $1
           FROM rrr_items
           WHERE version_id = $2
           ORDER BY id`,
          [newVersionRow.id, oldVersion.id]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ data: newVersionRow, message: '새 R&R 버전이 생성되었습니다.' });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// R&R 항목 추가 — 현재 버전에만
router.post('/', auditMiddleware('rrr_items'), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '관리자만 수정할 수 있습니다.' });
    }
    const { user_id, role_type, description, task_detail, part, category, frequency, sub_assignee, status_note, sort_order } = req.body;

    if (!user_id || !role_type || !description) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요.' });
    }

    const versionId = await getCurrentVersionId();
    if (!versionId) {
      return res.status(400).json({ error: '현재 활성 버전이 없습니다.' });
    }

    const { rows } = await db.query(`
      INSERT INTO rrr_items (user_id, role_type, description, task_detail, part, category, frequency, sub_assignee, status_note, sort_order, version_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [user_id, role_type, description, task_detail || null, part || null, category || null, frequency || null, sub_assignee || null, status_note || null, sort_order || 0, versionId]);

    res.json({ data: rows[0], message: 'R&R 항목이 추가되었습니다.' });
  } catch (err) { next(err); }
});

// R&R 항목 수정 — 현재 버전 항목만
router.put('/:id', auditMiddleware('rrr_items'), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '관리자만 수정할 수 있습니다.' });
    }
    const { role_type, description, task_detail, part, category, frequency, sub_assignee, status_note, sort_order } = req.body;

    const versionId = await getCurrentVersionId();
    if (!versionId) {
      return res.status(400).json({ error: '현재 활성 버전이 없습니다.' });
    }

    const { rows } = await db.query(`
      UPDATE rrr_items SET role_type=$1, description=$2, task_detail=$3, part=$4, category=$5, frequency=$6, sub_assignee=$7, status_note=$8, sort_order=$9
      WHERE id=$10 AND version_id=$11 RETURNING *
    `, [role_type, description, task_detail || null, part || null, category || null, frequency || null, sub_assignee || null, status_note || null, sort_order || 0, req.params.id, versionId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: '항목을 찾을 수 없거나 현재 버전이 아닙니다.' });
    }

    res.json({ data: rows[0], message: '항목이 수정되었습니다.' });
  } catch (err) { next(err); }
});

// R&R 항목 삭제 — 현재 버전 항목만
router.delete('/:id', auditMiddleware('rrr_items'), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '관리자만 수정할 수 있습니다.' });
    }

    const versionId = await getCurrentVersionId();
    if (!versionId) {
      return res.status(400).json({ error: '현재 활성 버전이 없습니다.' });
    }

    const { rows } = await db.query(
      'DELETE FROM rrr_items WHERE id=$1 AND version_id=$2 RETURNING *', [req.params.id, versionId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '항목을 찾을 수 없거나 현재 버전이 아닙니다.' });
    }

    res.json({ data: rows[0], message: '항목이 삭제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
