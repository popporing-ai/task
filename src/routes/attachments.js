const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

const router = express.Router();

// 업로드 디렉토리 설정
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// multer 스토리지 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // 고유 파일명 생성: timestamp-random-originalname
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB 제한
});

router.use(authMiddleware);

// 파일 업로드
router.post('/upload', auditMiddleware('attachments'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ data: null, error: '파일이 없습니다.' });
    }

    const { task_id, content_id } = req.body;
    if (!task_id && !content_id) {
      // 업로드된 파일 삭제 후 에러 반환
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ data: null, error: 'task_id 또는 content_id가 필요합니다.' });
    }

    const { rows } = await db.query(`
      INSERT INTO attachments (task_id, content_id, user_id, filename, filepath, filesize, mimetype)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      task_id || null,
      content_id || null,
      req.user.id,
      req.file.originalname,
      req.file.filename,
      req.file.size,
      req.file.mimetype
    ]);

    res.status(201).json({ data: rows[0], message: '파일이 업로드되었습니다.' });
  } catch (err) {
    // 에러 시 업로드된 파일 정리
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
});

// 업무별 첨부파일 목록
router.get('/task/:taskId', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT a.id, a.task_id, a.content_id, a.filename, a.filesize, a.mimetype, a.created_at,
             u.name AS uploaded_by_name
      FROM attachments a
      JOIN users u ON u.id = a.user_id
      WHERE a.task_id = $1
      ORDER BY a.created_at DESC
    `, [req.params.taskId]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 콘텐츠별 첨부파일 목록
router.get('/content/:contentId', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT a.id, a.task_id, a.content_id, a.filename, a.filesize, a.mimetype, a.created_at,
             u.name AS uploaded_by_name
      FROM attachments a
      JOIN users u ON u.id = a.user_id
      WHERE a.content_id = $1
      ORDER BY a.created_at DESC
    `, [req.params.contentId]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// 파일 다운로드
router.get('/download/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM attachments WHERE id = $1', [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ data: null, error: '파일을 찾을 수 없습니다.' });
    }

    const attachment = rows[0];
    const filePath = path.join(UPLOAD_DIR, attachment.filepath);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ data: null, error: '파일이 서버에 존재하지 않습니다.' });
    }

    res.download(filePath, attachment.filename);
  } catch (err) { next(err); }
});

// 첨부파일 삭제
router.delete('/:id', auditMiddleware('attachments'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM attachments WHERE id = $1', [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ data: null, error: '파일을 찾을 수 없습니다.' });
    }

    const attachment = rows[0];
    const filePath = path.join(UPLOAD_DIR, attachment.filepath);

    // DB 레코드 삭제
    await db.query('DELETE FROM attachments WHERE id = $1', [req.params.id]);

    // 실제 파일 삭제 (없어도 에러 무시)
    fs.unlink(filePath, () => {});

    res.json({ data: attachment, message: '파일이 삭제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
