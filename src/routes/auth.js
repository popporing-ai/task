const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// 아바타 색상 팔레트
const AVATAR_COLORS = [
  { bg: '#FAEEDA', text: '#854F0B' },
  { bg: '#E1F5EE', text: '#0F6E56' },
  { bg: '#E6F1FB', text: '#185FA5' },
  { bg: '#FAECE7', text: '#993C1D' },
  { bg: '#EEEDFE', text: '#534AB7' },
  { bg: '#FEF3E2', text: '#854F0B' },
  { bg: '#D6E4FF', text: '#2D5CC8' },
  { bg: '#F0E8FF', text: '#6B3FA0' },
];

// 회원가입
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: '모든 필드를 입력해주세요.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
    }

    // 이메일 중복 체크
    const exists = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });
    }

    // 비밀번호 해싱
    const passwordHash = await bcrypt.hash(password, 10);

    // 아바타 색상 배정
    const colorIdx = name.charCodeAt(0) % AVATAR_COLORS.length;
    const avatarColor = AVATAR_COLORS[colorIdx];

    // 사용자 생성
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password_hash, avatar_bg, avatar_text)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, avatar_bg, avatar_text`,
      [name, email, passwordHash, avatarColor.bg, avatarColor.text]
    );

    const user = rows[0];

    // 자동 로그인 (세션 생성)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    res.cookie('task_session', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/task',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({ data: user, message: '회원가입이 완료되었습니다.' });
  } catch (err) { next(err); }
});

// 로그인
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }

    const { rows } = await db.query(
      'SELECT id, name, email, password_hash, avatar_bg, avatar_text FROM users WHERE email = $1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: '이메일 또는 비밀번호를 확인해주세요.' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: '이메일 또는 비밀번호를 확인해주세요.' });
    }

    // 세션 생성
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    res.cookie('task_session', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/task',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const { password_hash, ...userData } = user;
    res.json({ data: userData, message: '로그인 성공' });
  } catch (err) { next(err); }
});

// 로그아웃
router.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.task_session;
    if (token) {
      await db.query('DELETE FROM sessions WHERE token = $1', [token]);
    }
    res.clearCookie('task_session', { path: '/task' });
    res.json({ message: '로그아웃 되었습니다.' });
  } catch (err) { next(err); }
});

// 현재 사용자 정보
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    data: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      avatar_bg: req.user.avatar_bg,
      avatar_text: req.user.avatar_text,
    }
  });
});

module.exports = router;
