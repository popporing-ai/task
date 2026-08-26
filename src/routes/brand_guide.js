const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router();

// 모든 엔드포인트에 인증 필수
router.use(authMiddleware);

// 현재 활성 버전 조회
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM brand_guide_versions WHERE is_current = true LIMIT 1'
    );
    res.json({ data: rows[0] || null });
  } catch (err) { next(err); }
});

// 전체 버전 이력 (최신순)
router.get('/history', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, version, effective_date, title, change_note, is_current, created_at
       FROM brand_guide_versions ORDER BY id DESC`
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 특정 버전 조회
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM brand_guide_versions WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ data: null, message: '해당 버전을 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

// 새 버전 발행 (관리자 전용)
router.post('/', auditMiddleware('brand_guide_versions'), async (req, res, next) => {
  try {
    // 관리자 권한 확인
    if (req.user.role !== 'admin') {
      return res.status(403).json({ data: null, message: '브랜드 가이드 발행은 관리자만 가능합니다.' });
    }

    const { version, effective_date, title, slogan, message_direction, comms_rules, notation, ai_instructions, change_note } = req.body;

    if (!version || !version.trim()) {
      return res.status(400).json({ data: null, message: '버전 번호는 필수입니다.' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      // 기존 활성 버전 해제
      await client.query('UPDATE brand_guide_versions SET is_current = false WHERE is_current = true');
      // 새 버전 삽입
      const { rows } = await client.query(
        `INSERT INTO brand_guide_versions
         (version, effective_date, title, slogan, message_direction, comms_rules, notation, ai_instructions, change_note, is_current, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)
         RETURNING *`,
        [
          version.trim(),
          effective_date || null,
          title || null,
          slogan || null,
          message_direction || null,
          comms_rules || null,
          notation || null,
          ai_instructions || null,
          change_note || null,
          req.user.id,
        ]
      );
      await client.query('COMMIT');
      res.status(201).json({ data: rows[0], message: '새 브랜드 가이드 버전이 발행되었습니다.' });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

module.exports = router;
