const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const errorHandler = require('./middleware/error');

const app = express();
const PORT = process.env.PORT || 3004;

// Nginx 프록시 뒤에서 실제 클라이언트 IP 기록
app.set('trust proxy', 1);

// 미들웨어
app.use(express.json());
app.use(cookieParser());

// 정적 파일 (login.html은 인증 없이 접근)
app.use('/task', express.static(path.join(__dirname, '..', 'public')));

// 업로드 파일 정적 제공
app.use('/task/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// API 라우트
app.use('/task/api/auth', require('./routes/auth'));
app.use('/task/api/tasks', require('./routes/tasks'));
app.use('/task/api/content', require('./routes/content'));
app.use('/task/api/timeline', require('./routes/timeline'));
app.use('/task/api/rrr', require('./routes/rrr'));
app.use('/task/api/audit', require('./routes/audit'));
app.use('/task/api/categories', require('./routes/categories'));
app.use('/task/api/tasks', require('./routes/subtasks'));
app.use('/task/api/tasks', require('./routes/comments'));
app.use('/task/api/tags', require('./routes/tags'));
app.use('/task/api/notifications', require('./routes/notifications'));
app.use('/task/api/attachments', require('./routes/attachments'));
app.use('/task/api/checklists', require('./routes/checklists'));
app.use('/task/api/users', require('./routes/users'));
app.use('/task/api/issues', require('./routes/issues'));
app.use('/task/api/goals', require('./routes/goals'));
app.use('/task/api/feedbacks', require('./routes/feedbacks'));
app.use('/task/api/performance', require('./routes/performance'));

// 메타 API (제품, 대시보드)
const authMiddleware = require('./middleware/auth');
const db = require('./db');

app.get('/task/api/products', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name FROM products ORDER BY id'
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

const auditMiddleware = require('./middleware/audit');

// POST /task/api/products — 제품 생성
app.post('/task/api/products', authMiddleware, auditMiddleware('products'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ data: null, message: '제품 이름은 필수입니다.' });
    }
    const { rows } = await db.query(
      'INSERT INTO products (name) VALUES ($1) RETURNING id, name',
      [name.trim()]
    );
    res.status(201).json({ data: rows[0], message: '제품이 생성되었습니다.' });
  } catch (err) { next(err); }
});

// PUT /task/api/products/:id — 제품 수정
app.put('/task/api/products/:id', authMiddleware, auditMiddleware('products'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ data: null, message: '제품 이름은 필수입니다.' });
    }
    const { rows } = await db.query(
      'UPDATE products SET name = $1 WHERE id = $2 RETURNING id, name',
      [name.trim(), id]
    );
    if (!rows.length) {
      return res.status(404).json({ data: null, message: '제품을 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '제품이 수정되었습니다.' });
  } catch (err) { next(err); }
});

// DELETE /task/api/products/:id — 제품 삭제
app.delete('/task/api/products/:id', authMiddleware, auditMiddleware('products'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      'DELETE FROM products WHERE id = $1 RETURNING id, name',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ data: null, message: '제품을 찾을 수 없습니다.' });
    }
    res.json({ data: rows[0], message: '제품이 삭제되었습니다.' });
  } catch (err) { next(err); }
});

app.get('/task/api/dashboard', authMiddleware, async (req, res, next) => {
  try {
    // 날짜 범위: 커스텀 파라미터 또는 기본값(이번 주 / 이번 달)
    const { date_from, date_to } = req.query;
    // YYYY-MM-DD 형식 검증 (SQL 인젝션 방지)
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const hasCustomRange = date_from && date_to &&
      dateRe.test(date_from) && dateRe.test(date_to);

    // 업무 날짜 범위
    const taskDateFrom = hasCustomRange
      ? `'${date_from}'::date`
      : `date_trunc('week', CURRENT_DATE)`;
    const taskDateTo = hasCustomRange
      ? `'${date_to}'::date + INTERVAL '1 day'`
      : `date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'`;

    // 콘텐츠 날짜 범위
    const contentDateFrom = hasCustomRange
      ? `'${date_from}'::date`
      : `date_trunc('month', CURRENT_DATE)`;
    const contentDateTo = hasCustomRange
      ? `'${date_to}'::date + INTERVAL '1 day'`
      : `date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`;

    // 이번 주 업무 수
    const weekTasks = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'done') AS done_count,
        COUNT(*) FILTER (WHERE status != 'done') AS pending_count,
        COUNT(*) AS total
      FROM tasks
      WHERE due_date >= ${taskDateFrom}
        AND due_date < ${taskDateTo}
    `);

    // 콘텐츠 발행 현황
    const contentStats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'done') AS done_count,
        COUNT(*) AS total
      FROM content_items
      WHERE publish_date >= ${contentDateFrom}
        AND publish_date < ${contentDateTo}
    `);

    // 진행 중 카테고리 수
    const activeCategories = await db.query(`
      SELECT COUNT(DISTINCT category_id) AS count
      FROM tasks WHERE status = 'in_progress'
    `);

    // 미진행 업무 수
    const blockedTasks = await db.query(`
      SELECT COUNT(*) AS count FROM tasks WHERE status = 'blocked'
    `);

    // 기간 내 주요 업무
    const weekTaskList = await db.query(`
      SELECT t.id, t.title, t.status, t.due_date,
             u.name AS assignee_name, u.avatar_bg, u.avatar_text,
             tc.name AS category_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assignee_id
      LEFT JOIN task_categories tc ON tc.id = t.category_id
      WHERE t.due_date >= ${taskDateFrom}
        AND t.due_date < ${taskDateTo}
      ORDER BY t.due_date
      LIMIT 10
    `);

    // 채널별 발행 현황
    const channelStats = await db.query(`
      SELECT channel, COUNT(*) AS count
      FROM content_items
      WHERE publish_date >= ${contentDateFrom}
        AND publish_date < ${contentDateTo}
      GROUP BY channel
      ORDER BY count DESC
    `);

    // 나의 기간 내 업무
    const myTasks = await db.query(`
      SELECT t.id, t.title, t.status, t.due_date,
             tc.name AS category_name
      FROM tasks t
      LEFT JOIN task_categories tc ON tc.id = t.category_id
      WHERE t.assignee_id = $1
        AND t.due_date >= ${taskDateFrom}
        AND t.due_date < ${taskDateTo}
      ORDER BY t.due_date
      LIMIT 5
    `, [req.user.id]);

    res.json({
      data: {
        weekSummary: weekTasks.rows[0],
        contentSummary: contentStats.rows[0],
        activeCategoryCount: activeCategories.rows[0].count,
        blockedCount: blockedTasks.rows[0].count,
        weekTasks: weekTaskList.rows,
        channelStats: channelStats.rows,
        myTasks: myTasks.rows,
      }
    });
  } catch (err) { next(err); }
});

// 글로벌 검색
app.get('/task/api/search', authMiddleware, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.json({ data: { tasks: [], content_items: [], timeline_items: [], comments: [] } });
    }
    const keyword = `%${q.trim()}%`;

    const [tasks, contentItems, timelineItems, comments] = await Promise.all([
      db.query(`
        SELECT t.id, t.title, t.description, t.status, t.due_date,
               u.name AS assignee_name, tc.name AS category_name
        FROM tasks t
        LEFT JOIN users u ON u.id = t.assignee_id
        LEFT JOIN task_categories tc ON tc.id = t.category_id
        WHERE (t.title ILIKE $1 OR t.description ILIKE $1)
          AND t.archived = false
        ORDER BY t.updated_at DESC LIMIT 20
      `, [keyword]),
      db.query(`
        SELECT ci.id, ci.title, ci.memo, ci.status, ci.publish_date,
               ci.channel, ci.content_type,
               u.name AS assignee_name
        FROM content_items ci
        LEFT JOIN users u ON u.id = ci.assignee_id
        WHERE ci.title ILIKE $1 OR ci.memo ILIKE $1
        ORDER BY ci.updated_at DESC LIMIT 20
      `, [keyword]),
      db.query(`
        SELECT ti.id, ti.title, ti.memo, ti.status, ti.start_month, ti.end_month,
               tc.name AS category_name
        FROM timeline_items ti
        LEFT JOIN task_categories tc ON tc.id = ti.category_id
        WHERE ti.title ILIKE $1 OR ti.memo ILIKE $1
        ORDER BY ti.updated_at DESC LIMIT 20
      `, [keyword]),
      db.query(`
        SELECT c.id, c.task_id, c.content, c.created_at,
               u.name AS user_name,
               t.title AS task_title
        FROM comments c
        JOIN users u ON u.id = c.user_id
        JOIN tasks t ON t.id = c.task_id
        WHERE c.content ILIKE $1
        ORDER BY c.created_at DESC LIMIT 20
      `, [keyword]),
    ]);

    res.json({
      data: {
        tasks: tasks.rows,
        content_items: contentItems.rows,
        timeline_items: timelineItems.rows,
        comments: comments.rows,
      }
    });
  } catch (err) { next(err); }
});

// SPA 폴백: /task로 접근 시 index.html
app.get('/task', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.get('/task/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.get('/task/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 에러 핸들러
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Task 서버 실행 중: http://localhost:${PORT}/task`);
});
