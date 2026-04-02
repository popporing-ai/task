const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

// 업무별 체크리스트 및 항목 목록 조회
router.get('/task/:taskId', async (req, res, next) => {
  try {
    const { rows: checklists } = await db.query(`
      SELECT id, task_id, title, sort_order, created_at
      FROM checklists
      WHERE task_id = $1
      ORDER BY sort_order, created_at
    `, [req.params.taskId]);

    if (!checklists.length) {
      return res.json({ data: [] });
    }

    // 체크리스트 ID 목록으로 항목 일괄 조회
    const checklistIds = checklists.map(c => c.id);
    const { rows: items } = await db.query(`
      SELECT id, checklist_id, content, done, sort_order, created_at
      FROM checklist_items
      WHERE checklist_id = ANY($1::int[])
      ORDER BY sort_order, created_at
    `, [checklistIds]);

    // 체크리스트에 항목 연결
    const result = checklists.map(cl => ({
      ...cl,
      items: items.filter(it => it.checklist_id === cl.id)
    }));

    res.json({ data: result });
  } catch (err) { next(err); }
});

// 체크리스트 생성
router.post('/', async (req, res, next) => {
  try {
    const { task_id, title } = req.body;
    if (!task_id) {
      return res.status(400).json({ data: null, error: 'task_id는 필수입니다.' });
    }

    const { rows } = await db.query(`
      INSERT INTO checklists (task_id, title)
      VALUES ($1, $2)
      RETURNING *
    `, [task_id, title || '체크리스트']);

    res.status(201).json({ data: { ...rows[0], items: [] }, message: '체크리스트가 생성되었습니다.' });
  } catch (err) { next(err); }
});

// 체크리스트 삭제
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM checklists WHERE id = $1 RETURNING *', [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ data: null, error: '체크리스트를 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '체크리스트가 삭제되었습니다.' });
  } catch (err) { next(err); }
});

// 체크리스트 항목 추가
router.post('/:id/items', async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ data: null, error: '항목 내용은 필수입니다.' });
    }

    // 체크리스트 존재 확인
    const { rows: cl } = await db.query(
      'SELECT id FROM checklists WHERE id = $1', [req.params.id]
    );
    if (!cl.length) {
      return res.status(404).json({ data: null, error: '체크리스트를 찾을 수 없습니다.' });
    }

    const { rows } = await db.query(`
      INSERT INTO checklist_items (checklist_id, content)
      VALUES ($1, $2)
      RETURNING *
    `, [req.params.id, content.trim()]);

    res.status(201).json({ data: rows[0], message: '항목이 추가되었습니다.' });
  } catch (err) { next(err); }
});

// 체크리스트 항목 완료 토글
router.patch('/items/:itemId/toggle', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      UPDATE checklist_items
      SET done = NOT done
      WHERE id = $1
      RETURNING *
    `, [req.params.itemId]);

    if (!rows.length) {
      return res.status(404).json({ data: null, error: '항목을 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '항목 상태가 변경되었습니다.' });
  } catch (err) { next(err); }
});

// 체크리스트 항목 삭제
router.delete('/items/:itemId', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM checklist_items WHERE id = $1 RETURNING *', [req.params.itemId]
    );
    if (!rows.length) {
      return res.status(404).json({ data: null, error: '항목을 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '항목이 삭제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
