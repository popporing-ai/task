# DB 설계

## 사용 DB: PostgreSQL 16

---

## 테이블 목록

### 1. users (계정)
```sql
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(50)  NOT NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,           -- bcrypt hash
  avatar_bg     VARCHAR(20)  DEFAULT '#EEF1FD',
  avatar_text   VARCHAR(20)  DEFAULT '#4F6EF7',
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);
```
- 회원가입 시 자동 생성, 관리자 승인 없음
- avatar_bg/text는 가입 시 이름 기준으로 색상 자동 배정

---

### 2. sessions (로그인 세션)
```sql
CREATE TABLE sessions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(64) NOT NULL UNIQUE,        -- crypto.randomBytes(32).toString('hex')
  expires_at TIMESTAMPTZ NOT NULL,               -- NOW() + 30 days
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sessions_token ON sessions(token);
```
- 로그인 시 생성, 로그아웃 시 삭제
- 만료된 세션은 주기적으로 정리 (또는 조회 시 필터)

---

### 3. task_categories (업무 분류)
```sql
CREATE TABLE task_categories (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(100) NOT NULL UNIQUE,
  color VARCHAR(20)  DEFAULT '#EEF1FD'
);
```

초기 데이터: 회사소개서, 소개자료, 홈페이지, 콘텐츠 제작, 고도화 자료 제작, 브랜딩, 온라인광고, 전시회, 1층 체험관, 지원사업, 제안서 지원, PR

---

### 4. tasks (업무 현황 - 칸반)
```sql
CREATE TABLE tasks (
  id          SERIAL  PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  category_id INTEGER REFERENCES task_categories(id) ON DELETE SET NULL,
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'todo'
              CHECK (status IN ('todo','in_progress','done','blocked')),
  due_date    DATE,
  sort_order  INTEGER DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 5. timeline_items (연간 타임라인)
```sql
CREATE TABLE timeline_items (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES task_categories(id) ON DELETE SET NULL,
  title       VARCHAR(200) NOT NULL,
  memo        TEXT,
  start_month DATE NOT NULL,   -- 해당 월의 1일로 저장 (예: 2026-03-01)
  end_month   DATE NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'planned'
              CHECK (status IN ('done','in_progress','planned','tbd')),
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 6. products (제품 목록)
```sql
CREATE TABLE products (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);
```

초기 데이터: Core, Remote, Bodycam, VisionX, Make&View, Robotics, Inspect, HoloX, Twin, XR, AutoGuide, Workstation

---

### 7. content_items (콘텐츠 캘린더)
```sql
CREATE TABLE content_items (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(300) NOT NULL,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  channel      VARCHAR(10) NOT NULL
               CHECK (channel IN ('IG','FB','LI','YT','BL','EM','HM')),
  content_type VARCHAR(5)  NOT NULL
               CHECK (content_type IN ('I','C','V','S','Q','A','L','T')),
  assignee_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  publish_date DATE,
  content_id   VARCHAR(60) UNIQUE,    -- 자동생성: YYYYMMDD_CH_TYPE
  inflow_url   TEXT,                  -- 유입 추적 URL
  publish_url  TEXT,                  -- 실제 발행 URL
  status       VARCHAR(20) NOT NULL DEFAULT 'planned'
               CHECK (status IN ('planned','done','skipped')),
  memo         TEXT,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
```

**콘텐츠 ID 자동 생성 로직** (서버 사이드):
```javascript
// YYYYMMDD_채널_타입, 동일 조합 시 suffix 붙임
// 예: 20260401_BL_A, 20260401_BL_A_2
async function generateContentId(db, publishDate, channel, type) {
  const base = `${publishDate.replace(/-/g,''}.slice(0,8)}_${channel}_${type}`;
  const { rows } = await db.query(
    `SELECT content_id FROM content_items WHERE content_id LIKE $1 ORDER BY content_id`,
    [`${base}%`]
  );
  if (rows.length === 0) return base;
  return `${base}_${rows.length + 1}`;
}
```

---

### 8. rrr_items (R&R)
```sql
CREATE TABLE rrr_items (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_type   VARCHAR(20) NOT NULL
              CHECK (role_type IN ('solution_lead','function')),
  description VARCHAR(200) NOT NULL,
  frequency   VARCHAR(20)
              CHECK (frequency IN ('weekly','monthly','quarterly','yearly','irregular') OR frequency IS NULL),
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 9. audit_logs (변경 이력) ★ 핵심
```sql
CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  user_name   VARCHAR(50) NOT NULL,              -- 삭제돼도 이름 보존
  action      VARCHAR(10) NOT NULL
              CHECK (action IN ('CREATE','UPDATE','DELETE')),
  table_name  VARCHAR(50) NOT NULL,              -- 변경된 테이블 이름
  record_id   INTEGER     NOT NULL,              -- 변경된 레코드 ID
  old_value   JSONB,                             -- 변경 전 값 (UPDATE/DELETE)
  new_value   JSONB,                             -- 변경 후 값 (CREATE/UPDATE)
  ip_address  VARCHAR(45),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_created  ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_table    ON audit_logs(table_name);
CREATE INDEX idx_audit_user     ON audit_logs(user_id);
CREATE INDEX idx_audit_record   ON audit_logs(table_name, record_id);
```

#### Audit Log 미들웨어 동작 방식
```javascript
// src/middleware/audit.js
// 라우트 핸들러 실행 전 old_value 조회, 실행 후 new_value 기록
async function auditMiddleware(tableName) {
  return async (req, res, next) => {
    const recordId = req.params.id;
    let oldValue = null;

    // UPDATE / DELETE → 변경 전 값 조회
    if (['PUT','PATCH','DELETE'].includes(req.method) && recordId) {
      const { rows } = await db.query(
        `SELECT * FROM ${tableName} WHERE id = $1`, [recordId]
      );
      oldValue = rows[0] || null;
    }

    // 원래 res.json를 가로채서 new_value 캡처
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      const newValue = body?.data || null;
      const action = req.method === 'POST' ? 'CREATE'
                   : req.method === 'DELETE' ? 'DELETE' : 'UPDATE';

      await db.query(
        `INSERT INTO audit_logs
         (user_id, user_name, action, table_name, record_id, old_value, new_value, ip_address)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          req.user.id, req.user.name, action, tableName,
          recordId || newValue?.id,
          oldValue ? JSON.stringify(oldValue) : null,
          newValue  ? JSON.stringify(newValue)  : null,
          req.ip
        ]
      );
      return originalJson(body);
    };
    next();
  };
}
```

#### CSV 내보내기 쿼리 예시
```sql
SELECT
  al.id,
  al.created_at AT TIME ZONE 'Asia/Seoul' AS "변경일시",
  al.user_name                             AS "작업자",
  al.action                                AS "작업유형",
  al.table_name                            AS "대상테이블",
  al.record_id                             AS "레코드ID",
  al.old_value::text                       AS "변경전",
  al.new_value::text                       AS "변경후",
  al.ip_address                            AS "IP주소"
FROM audit_logs al
WHERE ($1::date IS NULL OR al.created_at >= $1)
  AND ($2::date IS NULL OR al.created_at <  $2 + INTERVAL '1 day')
  AND ($3::int  IS NULL OR al.user_id = $3)
  AND ($4::text IS NULL OR al.table_name = $4)
ORDER BY al.created_at DESC;
```

---

## API 엔드포인트 목록

### Auth
| Method | Path | 설명 |
|--------|------|------|
| POST | /task/api/auth/register | 회원가입 (name, email, password) |
| POST | /task/api/auth/login | 로그인 → task_session 쿠키 발급 |
| POST | /task/api/auth/logout | 로그아웃 → 세션 삭제 |
| GET  | /task/api/auth/me | 현재 로그인 사용자 정보 |

### Tasks
| Method | Path | 설명 |
|--------|------|------|
| GET    | /task/api/tasks | 목록 (필터: status, category_id, assignee_id) |
| POST   | /task/api/tasks | 생성 |
| PUT    | /task/api/tasks/:id | 수정 |
| DELETE | /task/api/tasks/:id | 삭제 |
| PATCH  | /task/api/tasks/:id/status | 칸반 상태 변경 |
| PATCH  | /task/api/tasks/:id/order | 카드 순서 변경 |

### Timeline
| Method | Path | 설명 |
|--------|------|------|
| GET    | /task/api/timeline | 목록 (필터: year, category_id) |
| POST   | /task/api/timeline | 생성 |
| PUT    | /task/api/timeline/:id | 수정 |
| DELETE | /task/api/timeline/:id | 삭제 |

### Content
| Method | Path | 설명 |
|--------|------|------|
| GET    | /task/api/content | 목록 (필터: channel, assignee_id, product_id, status, month) |
| POST   | /task/api/content | 생성 (content_id 자동 생성) |
| PUT    | /task/api/content/:id | 수정 |
| DELETE | /task/api/content/:id | 삭제 |
| GET    | /task/api/content/preview-id | content_id 미리보기 |

### R&R
| Method | Path | 설명 |
|--------|------|------|
| GET    | /task/api/rrr | 전체 (user별 그룹) |
| POST   | /task/api/rrr | 항목 추가 |
| PUT    | /task/api/rrr/:id | 수정 |
| DELETE | /task/api/rrr/:id | 삭제 |

### Audit Log
| Method | Path | 설명 |
|--------|------|------|
| GET    | /task/api/audit | 변경 이력 조회 (필터: table_name, user_id, date_from, date_to) |
| GET    | /task/api/audit/export.csv | 전체 또는 필터된 이력 CSV 다운로드 |

### Meta
| Method | Path | 설명 |
|--------|------|------|
| GET    | /task/api/users | 팀원 목록 |
| GET    | /task/api/categories | 업무 분류 목록 |
| GET    | /task/api/products | 제품 목록 |
| GET    | /task/api/dashboard | 대시보드 집계 |
