// AI 어시스턴트 도구(tool) 정의 + 실행기
// - OpenAI tool calling 스펙
// - 모든 실행 함수는 (args, user, db) → { ok, summary, data, error } 반환
// - 권한은 서버 측에서 강제 (LLM 안내와 별개)

// ─────────── 도구 스키마 (LLM에 전달) ───────────
const TOOL_DEFINITIONS = [
  // ===== 조회 =====
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: '업무를 검색합니다. status/assignee_name/category_name/keyword/due_from/due_to/archived 필터 가능.',
      parameters: {
        type: 'object',
        properties: {
          status:        { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked'] },
          assignee_name: { type: 'string', description: '담당자 이름 부분 일치' },
          category_name: { type: 'string', description: '분류 이름' },
          keyword:       { type: 'string', description: '제목/설명 키워드' },
          due_from:      { type: 'string', description: '마감 시작 YYYY-MM-DD' },
          due_to:        { type: 'string', description: '마감 종료 YYYY-MM-DD' },
          assignee_me:   { type: 'boolean', description: '본인이 담당자인 것만' },
          limit:         { type: 'integer', description: '최대 건수 (기본 30)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_content',
      description: '콘텐츠를 검색합니다. channel/content_type/status/keyword/publish_from/publish_to 필터 가능.',
      parameters: {
        type: 'object',
        properties: {
          channel:      { type: 'string', enum: ['IG','FB','LI','YT','BL','EM','HM'] },
          content_type: { type: 'string', enum: ['I','C','V','S','Q','A','L','T'] },
          status:       { type: 'string', enum: ['planned','done','skipped'] },
          keyword:      { type: 'string' },
          publish_from: { type: 'string', description: 'YYYY-MM-DD' },
          publish_to:   { type: 'string', description: 'YYYY-MM-DD' },
          assignee_me:  { type: 'boolean' },
          limit:        { type: 'integer' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_timeline',
      description: '연간 타임라인 항목을 조회합니다.',
      parameters: {
        type: 'object',
        properties: {
          year:          { type: 'integer' },
          category_name: { type: 'string' },
          status:        { type: 'string', enum: ['done','in_progress','planned','tbd'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_calendar_events',
      description: '캘린더 일정을 조회합니다. start_from/start_to/event_type 필터 가능.',
      parameters: {
        type: 'object',
        properties: {
          start_from: { type: 'string', description: 'YYYY-MM-DD' },
          start_to:   { type: 'string', description: 'YYYY-MM-DD' },
          event_type: { type: 'string', description: '유형 키 (general/meeting/deadline/campaign/event/holiday 또는 커스텀)' },
          assignee_me: { type: 'boolean' },
          limit:      { type: 'integer' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_rrr',
      description: 'R&R(역할/책임) 항목을 조회합니다.',
      parameters: {
        type: 'object',
        properties: {
          user_name: { type: 'string', description: '특정 팀원 이름' },
          role_type: { type: 'string', enum: ['solution_lead', 'function'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_report',
      description: '특정 사용자의 기간별 활동 보고서를 마크다운으로 생성합니다 (반기/연간 성과 보고용). 카테고리·유형별로 그룹된 정형 리포트.',
      parameters: {
        type: 'object',
        properties: {
          user_name: { type: 'string', description: '대상자 이름 (생략 시 본인)' },
          date_from: { type: 'string', description: 'YYYY-MM-DD' },
          date_to:   { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['date_from', 'date_to'],
      },
    },
  },

  // ===== 업무 (Tasks) =====
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: '새 업무를 생성합니다.',
      parameters: {
        type: 'object',
        properties: {
          title:         { type: 'string', description: '업무명' },
          category_name: { type: 'string', description: '분류 이름 (회사소개서/홈페이지/콘텐츠 제작 등)' },
          assignee_name: { type: 'string', description: '담당자 이름 (생략 시 본인)' },
          due_date:      { type: 'string', description: 'YYYY-MM-DD' },
          work_type:     { type: 'string', enum: ['regular','extra','project'] },
          description:   { type: 'string' },
          status:        { type: 'string', enum: ['todo','in_progress','done','blocked'] },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: '기존 업무를 수정합니다. id 또는 keyword(제목)로 식별.',
      parameters: {
        type: 'object',
        properties: {
          id:           { type: 'integer' },
          keyword:      { type: 'string', description: '제목으로 식별 (id 없을 때)' },
          title:        { type: 'string' },
          category_name:{ type: 'string' },
          assignee_name:{ type: 'string' },
          due_date:     { type: 'string' },
          work_type:    { type: 'string', enum: ['regular','extra','project'] },
          status:       { type: 'string', enum: ['todo','in_progress','done','blocked'] },
          description:  { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: '업무를 삭제합니다 (소유자 또는 관리자만).',
      parameters: {
        type: 'object',
        properties: {
          id:      { type: 'integer' },
          keyword: { type: 'string' },
        },
      },
    },
  },

  // ===== 콘텐츠 =====
  {
    type: 'function',
    function: {
      name: 'create_content',
      description: '새 콘텐츠 항목을 생성합니다.',
      parameters: {
        type: 'object',
        properties: {
          title:        { type: 'string' },
          channel:      { type: 'string', enum: ['IG','FB','LI','YT','BL','EM','HM'] },
          content_type: { type: 'string', enum: ['I','C','V','S','Q','A','L','T'] },
          publish_date: { type: 'string', description: 'YYYY-MM-DD' },
          product_name: { type: 'string' },
          assignee_name:{ type: 'string' },
          status:       { type: 'string', enum: ['planned','done','skipped'] },
          memo:         { type: 'string' },
        },
        required: ['title','channel','content_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_content',
      description: '콘텐츠를 수정합니다.',
      parameters: {
        type: 'object',
        properties: {
          id:           { type: 'integer' },
          keyword:      { type: 'string' },
          title:        { type: 'string' },
          channel:      { type: 'string', enum: ['IG','FB','LI','YT','BL','EM','HM'] },
          content_type: { type: 'string', enum: ['I','C','V','S','Q','A','L','T'] },
          publish_date: { type: 'string' },
          status:       { type: 'string', enum: ['planned','done','skipped'] },
          memo:         { type: 'string' },
          publish_url:  { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_content',
      description: '콘텐츠를 삭제합니다 (소유자 또는 관리자만).',
      parameters: {
        type: 'object',
        properties: { id: { type: 'integer' }, keyword: { type: 'string' } },
      },
    },
  },

  // ===== 타임라인 =====
  {
    type: 'function',
    function: {
      name: 'create_timeline',
      description: '연간 타임라인 항목을 생성합니다.',
      parameters: {
        type: 'object',
        properties: {
          title:         { type: 'string' },
          category_name: { type: 'string' },
          start_month:   { type: 'string', description: 'YYYY-MM-01' },
          end_month:     { type: 'string', description: 'YYYY-MM-01' },
          status:        { type: 'string', enum: ['done','in_progress','planned','tbd'] },
          memo:          { type: 'string' },
        },
        required: ['title','start_month','end_month'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_timeline',
      description: '타임라인 항목을 수정합니다.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          keyword: { type: 'string' },
          title: { type: 'string' },
          category_name: { type: 'string' },
          start_month: { type: 'string' },
          end_month: { type: 'string' },
          status: { type: 'string', enum: ['done','in_progress','planned','tbd'] },
          memo: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_timeline',
      description: '타임라인 항목을 삭제합니다.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'integer' }, keyword: { type: 'string' } },
      },
    },
  },

  // ===== 캘린더 =====
  {
    type: 'function',
    function: {
      name: 'create_calendar_event',
      description: '캘린더 일정을 추가합니다.',
      parameters: {
        type: 'object',
        properties: {
          title:       { type: 'string' },
          start_date:  { type: 'string', description: 'YYYY-MM-DD' },
          end_date:    { type: 'string', description: 'YYYY-MM-DD (생략 가능)' },
          all_day:     { type: 'boolean', description: '종일 여부 (기본 true)' },
          start_time:  { type: 'string', description: 'HH:mm (종일 아닐 때)' },
          end_time:    { type: 'string', description: 'HH:mm' },
          event_type:  { type: 'string', description: '유형 키 (general/meeting/deadline/campaign/event/holiday 또는 커스텀)' },
          description: { type: 'string' },
          assignee_name: { type: 'string' },
        },
        required: ['title','start_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_calendar_event',
      description: '캘린더 일정을 수정합니다.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          keyword: { type: 'string' },
          title: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          all_day: { type: 'boolean' },
          start_time: { type: 'string' },
          end_time: { type: 'string' },
          event_type: { type: 'string' },
          description: { type: 'string' },
          assignee_name: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_calendar_event',
      description: '캘린더 일정을 삭제합니다.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'integer' }, keyword: { type: 'string' } },
      },
    },
  },

  // ===== 대량 삭제 (본인 데이터 자동 좁힘) =====
  {
    type: 'function',
    function: {
      name: 'bulk_delete_content',
      description: '여러 콘텐츠를 한 번에 삭제합니다. 비관리자는 항상 본인이 시스템상 직접 만든 콘텐츠만 자동 좁혀서 삭제 (담당자로 지정만 된 항목은 화면에서 직접 처리해야 함, 다른 사람 데이터는 권한상 검색 불가). 대량 삭제 요청("전체 삭제", "5월 콘텐츠 다 삭제" 등)에 반드시 이 도구를 사용. 1단계: dry_run=true(기본)로 호출 → 대상 개수만 반환됨. 사용자에게 그 개수로 재확인 받은 뒤 2단계: dry_run=false로 다시 호출해야 실제 삭제됨.',
      parameters: {
        type: 'object',
        properties: {
          channel:       { type: 'string', enum: ['IG','FB','LI','YT','BL','EM','HM'] },
          content_type:  { type: 'string', enum: ['I','C','V','S','Q','A','L','T'] },
          status:        { type: 'string', enum: ['planned','done','skipped'] },
          publish_from:  { type: 'string', description: 'YYYY-MM-DD 이상' },
          publish_to:    { type: 'string', description: 'YYYY-MM-DD 이하' },
          keyword:       { type: 'string', description: '제목/주제에 포함된 키워드' },
          assignee_name: { type: 'string', description: '특정 담당자 이름으로 좁힘 (비관리자는 본인 이름만 가능)' },
          dry_run:       { type: 'boolean', description: '기본 true (개수만). 실제 삭제는 false 명시 필요' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bulk_delete_tasks',
      description: '여러 업무를 한 번에 삭제합니다. 비관리자는 항상 본인이 시스템상 직접 만든 업무만 자동 좁힘 (담당자로 지정만 된 항목은 화면에서 직접 처리해야 함, 다른 사람 데이터는 권한상 검색 불가). dry_run=true로 먼저 개수 확인 → 사용자 재확인 → dry_run=false 로 실제 삭제.',
      parameters: {
        type: 'object',
        properties: {
          status:        { type: 'string', enum: ['todo','in_progress','done','blocked'] },
          category_name: { type: 'string' },
          keyword:       { type: 'string', description: '제목/설명 키워드' },
          assignee_name: { type: 'string', description: '특정 담당자 이름으로 좁힘 (비관리자는 본인 이름만 가능)' },
          due_from:      { type: 'string', description: 'YYYY-MM-DD 이상' },
          due_to:        { type: 'string', description: 'YYYY-MM-DD 이하' },
          dry_run:       { type: 'boolean', description: '기본 true (개수만). 실제 삭제는 false 명시 필요' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bulk_delete_calendar_events',
      description: '여러 캘린더 일정을 한 번에 삭제합니다. 비관리자는 항상 본인이 시스템상 직접 만든 일정만 자동 좁힘 (담당자로 지정만 된 항목은 화면에서 직접 처리해야 함, 다른 사람 데이터는 권한상 검색 불가). dry_run=true로 먼저 개수 확인 → 사용자 재확인 → dry_run=false 로 실제 삭제.',
      parameters: {
        type: 'object',
        properties: {
          event_type:    { type: 'string' },
          start_from:    { type: 'string', description: 'YYYY-MM-DD 이상' },
          start_to:      { type: 'string', description: 'YYYY-MM-DD 이하' },
          keyword:       { type: 'string' },
          assignee_name: { type: 'string', description: '특정 담당자 이름으로 좁힘 (비관리자는 본인 이름만 가능)' },
          dry_run:       { type: 'boolean', description: '기본 true (개수만). 실제 삭제는 false 명시 필요' },
        },
      },
    },
  },

  // ===== R&R (admin only) =====
  {
    type: 'function',
    function: {
      name: 'create_rrr',
      description: 'R&R 역할/책임을 추가합니다 (관리자만).',
      parameters: {
        type: 'object',
        properties: {
          user_name:   { type: 'string', description: '대상자 이름' },
          role_type:   { type: 'string', enum: ['solution_lead', 'function'] },
          description: { type: 'string' },
          frequency:   { type: 'string', enum: ['weekly','monthly','quarterly','yearly','irregular'] },
        },
        required: ['user_name','role_type','description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_rrr',
      description: 'R&R을 수정합니다 (관리자만).',
      parameters: {
        type: 'object',
        properties: {
          id:          { type: 'integer' },
          keyword:     { type: 'string' },
          role_type:   { type: 'string', enum: ['solution_lead', 'function'] },
          description: { type: 'string' },
          frequency:   { type: 'string', enum: ['weekly','monthly','quarterly','yearly','irregular'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_rrr',
      description: 'R&R을 삭제합니다 (관리자만).',
      parameters: {
        type: 'object',
        properties: { id: { type: 'integer' }, keyword: { type: 'string' } },
      },
    },
  },
];

// ─────────── 헬퍼: 이름 → ID 해석 ───────────
async function resolveUserId(db, name) {
  if (!name) return null;
  const { rows } = await db.query(
    `SELECT id, name FROM users WHERE name ILIKE $1 AND is_active = true LIMIT 1`,
    [`%${name}%`]
  );
  return rows[0]?.id || null;
}

async function resolveCategoryId(db, name) {
  if (!name) return null;
  const { rows } = await db.query(
    `SELECT id FROM task_categories WHERE name = $1 OR name ILIKE $2 LIMIT 1`,
    [name, `%${name}%`]
  );
  return rows[0]?.id || null;
}

async function resolveProductId(db, name) {
  if (!name) return null;
  const { rows } = await db.query(
    `SELECT id FROM products WHERE name = $1 OR name ILIKE $2 LIMIT 1`,
    [name, `%${name}%`]
  );
  return rows[0]?.id || null;
}

// 키워드 검색 — 비관리자에 대해 본인이 시스템상 직접 생성한 항목(created_by = userId)으로만 좁힘.
// 담당자로만 지정된 항목은 AI 도구로 변경/삭제할 수 없음 — UI에서 직접 처리.
async function findTaskByKeyword(db, keyword, userId, isAdmin) {
  if (!keyword) return null;
  const ownerFilter = isAdmin ? '' : 'AND created_by = $2';
  const params = isAdmin ? [`%${keyword}%`] : [`%${keyword}%`, userId];
  const { rows } = await db.query(`
    SELECT * FROM tasks
    WHERE title ILIKE $1 AND archived = false ${ownerFilter}
    ORDER BY updated_at DESC LIMIT 1
  `, params);
  return rows[0] || null;
}

async function findContentByKeyword(db, keyword, userId, isAdmin) {
  if (!keyword) return null;
  const ownerFilter = isAdmin ? '' : 'AND created_by = $2';
  const params = isAdmin ? [`%${keyword}%`] : [`%${keyword}%`, userId];
  const { rows } = await db.query(`
    SELECT * FROM content_items
    WHERE title ILIKE $1 ${ownerFilter}
    ORDER BY updated_at DESC LIMIT 1
  `, params);
  return rows[0] || null;
}

async function findTimelineByKeyword(db, keyword, userId, isAdmin) {
  if (!keyword) return null;
  const ownerFilter = isAdmin ? '' : 'AND created_by = $2';
  const params = isAdmin ? [`%${keyword}%`] : [`%${keyword}%`, userId];
  const { rows } = await db.query(`
    SELECT * FROM timeline_items
    WHERE title ILIKE $1 ${ownerFilter}
    ORDER BY updated_at DESC LIMIT 1
  `, params);
  return rows[0] || null;
}

async function findCalendarEventByKeyword(db, keyword, userId, isAdmin) {
  if (!keyword) return null;
  const ownerFilter = isAdmin ? '' : 'AND created_by = $2';
  const params = isAdmin ? [`%${keyword}%`] : [`%${keyword}%`, userId];
  const { rows } = await db.query(`
    SELECT * FROM calendar_events
    WHERE title ILIKE $1 ${ownerFilter}
    ORDER BY created_at DESC LIMIT 1
  `, params);
  return rows[0] || null;
}

async function findRrrByKeyword(db, keyword) {
  if (!keyword) return null;
  const { rows } = await db.query(
    `SELECT * FROM rrr_items WHERE description ILIKE $1 ORDER BY id DESC LIMIT 1`,
    [`%${keyword}%`]
  );
  return rows[0] || null;
}

// 보고서 생성 (마크다운)
async function buildMarkdownReport(db, userId, dateFrom, dateTo) {
  const { rows: userRows } = await db.query('SELECT id, name FROM users WHERE id = $1', [userId]);
  const user = userRows[0];
  if (!user) return '_사용자를 찾을 수 없습니다._';

  const [completedR, inProgR, contentR, byCatR, byTypeR] = await Promise.all([
    db.query(`
      SELECT t.title, t.due_date, t.updated_at, t.work_type, tc.name AS category_name
      FROM tasks t LEFT JOIN task_categories tc ON tc.id = t.category_id
      WHERE t.assignee_id = $1 AND t.status = 'done'
        AND t.updated_at::date BETWEEN $2::date AND $3::date
        AND t.archived = false
      ORDER BY t.updated_at DESC
    `, [userId, dateFrom, dateTo]),
    db.query(`
      SELECT t.title, t.due_date, t.status, tc.name AS category_name
      FROM tasks t LEFT JOIN task_categories tc ON tc.id = t.category_id
      WHERE t.assignee_id = $1 AND t.status IN ('todo','in_progress','blocked')
        AND t.archived = false
        AND (
          (t.due_date >= $2::date AND t.due_date <= $3::date)
          OR (t.updated_at::date BETWEEN $2::date AND $3::date)
        )
      ORDER BY t.due_date NULLS LAST
    `, [userId, dateFrom, dateTo]),
    db.query(`
      SELECT title, channel, publish_date, status FROM content_items
      WHERE assignee_id = $1 AND publish_date BETWEEN $2::date AND $3::date
      ORDER BY publish_date DESC
    `, [userId, dateFrom, dateTo]),
    db.query(`
      SELECT COALESCE(tc.name, '미분류') AS name, COUNT(*)::int AS cnt
      FROM tasks t LEFT JOIN task_categories tc ON tc.id = t.category_id
      WHERE t.assignee_id = $1 AND t.status = 'done'
        AND t.updated_at::date BETWEEN $2::date AND $3::date
        AND t.archived = false
      GROUP BY tc.name ORDER BY cnt DESC
    `, [userId, dateFrom, dateTo]),
    db.query(`
      SELECT COALESCE(t.work_type,'regular') AS wt, COUNT(*)::int AS cnt
      FROM tasks t
      WHERE t.assignee_id = $1 AND t.status = 'done'
        AND t.updated_at::date BETWEEN $2::date AND $3::date
        AND t.archived = false
      GROUP BY t.work_type ORDER BY cnt DESC
    `, [userId, dateFrom, dateTo]),
  ]);
  const completed = completedR.rows;
  const inProg    = inProgR.rows;
  const content   = contentR.rows;
  const byCat     = byCatR.rows;
  const byType    = byTypeR.rows;

  const today = new Date().toISOString().slice(0, 10);
  const lines = [];
  lines.push(`# ${user.name} 활동 리포트`);
  lines.push(`**기간**: ${dateFrom} ~ ${dateTo}  ·  **생성일**: ${today}`);
  lines.push('');
  lines.push('## 📊 한눈에 보기');
  lines.push(`- 완료 **${completed.length}건** / 진행·예정·미진행 **${inProg.length}건** / 콘텐츠 **${content.length}건**`);
  lines.push('');
  if (byCat.length) {
    lines.push('## 🗂️ 카테고리별 완료');
    lines.push('| 분류 | 건수 |\n|---|---:|');
    byCat.forEach(c => lines.push(`| ${c.name} | ${c.cnt} |`));
    lines.push('');
  }
  if (byType.length) {
    const wtMap = { regular: '정규 (R&R)', extra: '추가 업무', project: '프로젝트' };
    lines.push('## 🧭 업무 유형별 완료');
    lines.push('| 유형 | 건수 |\n|---|---:|');
    byType.forEach(t => lines.push(`| ${wtMap[t.wt] || t.wt} | ${t.cnt} |`));
    lines.push('');
  }
  if (completed.length) {
    lines.push('## ✅ 완료한 업무');
    const grouped = {};
    completed.forEach(t => {
      const k = t.category_name || '미분류';
      (grouped[k] = grouped[k] || []).push(t);
    });
    Object.keys(grouped).sort().forEach(cat => {
      lines.push(`### ${cat}`);
      grouped[cat].forEach(t => {
        const wt = t.work_type && t.work_type !== 'regular' ? ` _(${t.work_type === 'extra' ? '추가' : '프로젝트'})_` : '';
        lines.push(`- ${t.title}${wt}`);
      });
      lines.push('');
    });
  }
  if (inProg.length) {
    lines.push('## 🔄 진행 중 / 예정 / 미진행');
    inProg.forEach(t => {
      const s = t.status === 'in_progress' ? '진행' : t.status === 'blocked' ? '미진행' : '예정';
      const due = t.due_date ? ` · 마감 ${String(t.due_date).slice(0, 10)}` : '';
      lines.push(`- [${s}] ${t.category_name ? `[${t.category_name}] ` : ''}${t.title}${due}`);
    });
    lines.push('');
  }
  if (content.length) {
    lines.push('## 📢 콘텐츠');
    const chMap = { IG:'인스타', FB:'페북', LI:'링크드인', YT:'유튜브', BL:'블로그', EM:'이메일', HM:'홈페이지' };
    content.forEach(c => {
      const s = c.status === 'done' ? '발행' : c.status === 'skipped' ? '미진행' : '예정';
      lines.push(`- [${chMap[c.channel] || c.channel}] ${c.title} — ${s} · ${String(c.publish_date).slice(0,10)}`);
    });
  }
  return lines.join('\n');
}

// ─────────── 도구 실행기 ───────────
async function executeTool(name, args, ctx) {
  const { user, db, isAdmin } = ctx;
  args = args || {};

  try {
    // ===== 조회 =====
    if (name === 'list_tasks') {
      const where = ['archived = false'];
      const params = [];
      let i = 1;
      if (args.status)        { where.push(`t.status = $${i++}`); params.push(args.status); }
      if (args.category_name) {
        const cid = await resolveCategoryId(db, args.category_name);
        if (cid) { where.push(`t.category_id = $${i++}`); params.push(cid); }
      }
      if (args.assignee_name) {
        const uid = await resolveUserId(db, args.assignee_name);
        if (uid) { where.push(`t.assignee_id = $${i++}`); params.push(uid); }
      }
      if (args.assignee_me)   { where.push(`t.assignee_id = $${i++}`); params.push(user.id); }
      if (args.keyword)       { where.push(`(t.title ILIKE $${i} OR t.description ILIKE $${i})`); params.push(`%${args.keyword}%`); i++; }
      if (args.due_from)      { where.push(`t.due_date >= $${i++}`); params.push(args.due_from); }
      if (args.due_to)        { where.push(`t.due_date <= $${i++}`); params.push(args.due_to); }
      const limit = Math.min(parseInt(args.limit) || 30, 100);
      const { rows } = await db.query(`
        SELECT t.id, t.title, t.status, t.due_date, t.work_type,
               u.name AS assignee_name, tc.name AS category_name
        FROM tasks t
        LEFT JOIN users u ON u.id = t.assignee_id
        LEFT JOIN task_categories tc ON tc.id = t.category_id
        WHERE ${where.join(' AND ')}
        ORDER BY t.due_date NULLS LAST, t.updated_at DESC
        LIMIT ${limit}
      `, params);
      return { ok: true, summary: `${rows.length}건 조회`, data: { tasks: rows } };
    }

    if (name === 'list_content') {
      const where = [];
      const params = [];
      let i = 1;
      if (args.channel)      { where.push(`ci.channel = $${i++}`); params.push(args.channel); }
      if (args.content_type) { where.push(`ci.content_type = $${i++}`); params.push(args.content_type); }
      if (args.status)       { where.push(`ci.status = $${i++}`); params.push(args.status); }
      if (args.assignee_me)  { where.push(`ci.assignee_id = $${i++}`); params.push(user.id); }
      if (args.keyword)      { where.push(`ci.title ILIKE $${i++}`); params.push(`%${args.keyword}%`); }
      if (args.publish_from) { where.push(`ci.publish_date >= $${i++}`); params.push(args.publish_from); }
      if (args.publish_to)   { where.push(`ci.publish_date <= $${i++}`); params.push(args.publish_to); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const limit = Math.min(parseInt(args.limit) || 30, 100);
      const { rows } = await db.query(`
        SELECT ci.id, ci.title, ci.channel, ci.content_type, ci.status, ci.publish_date,
               p.name AS product_name, u.name AS assignee_name
        FROM content_items ci
        LEFT JOIN products p ON p.id = ci.product_id
        LEFT JOIN users u ON u.id = ci.assignee_id
        ${whereSql}
        ORDER BY ci.publish_date DESC NULLS LAST
        LIMIT ${limit}
      `, params);
      return { ok: true, summary: `${rows.length}건 조회`, data: { content_items: rows } };
    }

    if (name === 'list_timeline') {
      const where = [];
      const params = [];
      let i = 1;
      if (args.year) {
        where.push(`EXTRACT(YEAR FROM ti.start_month) = $${i++}`);
        params.push(args.year);
      }
      if (args.category_name) {
        const cid = await resolveCategoryId(db, args.category_name);
        if (cid) { where.push(`ti.category_id = $${i++}`); params.push(cid); }
      }
      if (args.status) { where.push(`ti.status = $${i++}`); params.push(args.status); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const { rows } = await db.query(`
        SELECT ti.id, ti.title, ti.start_month, ti.end_month, ti.status,
               tc.name AS category_name, ti.memo
        FROM timeline_items ti
        LEFT JOIN task_categories tc ON tc.id = ti.category_id
        ${whereSql}
        ORDER BY ti.start_month
        LIMIT 100
      `, params);
      return { ok: true, summary: `${rows.length}건 조회`, data: { timeline: rows } };
    }

    if (name === 'list_calendar_events') {
      const where = [];
      const params = [];
      let i = 1;
      if (args.start_from)  { where.push(`start_date >= $${i++}`); params.push(args.start_from); }
      if (args.start_to)    { where.push(`start_date <= $${i++}`); params.push(args.start_to); }
      if (args.event_type)  { where.push(`event_type = $${i++}`); params.push(args.event_type); }
      if (args.assignee_me) { where.push(`(assignee_id = $${i++} OR created_by = $${i++})`); params.push(user.id, user.id); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const limit = Math.min(parseInt(args.limit) || 30, 100);
      const { rows } = await db.query(`
        SELECT id, title, event_type, start_date, end_date, all_day, start_time, end_time, color, description
        FROM calendar_events
        ${whereSql}
        ORDER BY start_date
        LIMIT ${limit}
      `, params);
      return { ok: true, summary: `${rows.length}건 조회`, data: { events: rows } };
    }

    if (name === 'list_rrr') {
      const where = [];
      const params = [];
      let i = 1;
      if (args.user_name) {
        const uid = await resolveUserId(db, args.user_name);
        if (uid) { where.push(`r.user_id = $${i++}`); params.push(uid); }
      }
      if (args.role_type) { where.push(`r.role_type = $${i++}`); params.push(args.role_type); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const { rows } = await db.query(`
        SELECT r.id, r.role_type, r.description, r.frequency, u.name AS user_name
        FROM rrr_items r
        JOIN users u ON u.id = r.user_id
        ${whereSql}
        ORDER BY u.name, r.role_type, r.sort_order
        LIMIT 200
      `, params);
      return { ok: true, summary: `${rows.length}건 조회`, data: { rrr_items: rows } };
    }

    if (name === 'generate_report') {
      if (!args.date_from || !args.date_to) {
        return { ok: false, error: 'date_from 과 date_to 가 필요합니다.' };
      }
      let targetUserId = user.id;
      let targetName = user.name;
      if (args.user_name) {
        if (!isAdmin && !user.name.includes(args.user_name) && !args.user_name.includes(user.name)) {
          return { ok: false, error: '다른 사용자의 보고서는 관리자만 생성할 수 있습니다.' };
        }
        const uid = await resolveUserId(db, args.user_name);
        if (!uid) return { ok: false, error: `'${args.user_name}' 사용자를 찾을 수 없습니다.` };
        targetUserId = uid;
        targetName = args.user_name;
      }
      const markdown = await buildMarkdownReport(db, targetUserId, args.date_from, args.date_to);
      return {
        ok: true,
        summary: `${targetName} 활동 보고서 (${args.date_from} ~ ${args.date_to})`,
        data: { report: { user_id: targetUserId, user_name: targetName, date_from: args.date_from, date_to: args.date_to, markdown } },
      };
    }

    // ===== 업무 생성/수정/삭제 =====
    if (name === 'create_task') {
      if (!args.title) return { ok: false, error: 'title 이 필요합니다.', need: 'title' };
      const categoryId  = args.category_name ? await resolveCategoryId(db, args.category_name) : null;
      const assigneeId  = args.assignee_name ? await resolveUserId(db, args.assignee_name) : user.id;
      if (args.assignee_name && !assigneeId) return { ok: false, error: `'${args.assignee_name}' 담당자를 찾을 수 없습니다.` };
      if (args.category_name && !categoryId) return { ok: false, error: `'${args.category_name}' 분류를 찾을 수 없습니다.` };
      if (!isAdmin && assigneeId !== user.id) {
        return { ok: false, error: '다른 사용자에게 업무를 배정하려면 관리자 권한이 필요합니다. 본인 업무만 추가할 수 있어요.' };
      }
      const wt = ['regular','extra','project'].includes(args.work_type) ? args.work_type : 'regular';
      const status = ['todo','in_progress','done','blocked'].includes(args.status) ? args.status : 'todo';
      const { rows } = await db.query(`
        INSERT INTO tasks (title, description, category_id, assignee_id, status, due_date, work_type, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id, title, status, due_date
      `, [args.title, args.description || null, categoryId, assigneeId, status, args.due_date || null, wt, user.id]);
      return {
        ok: true,
        summary: `✅ 업무 생성: "${rows[0].title}"`,
        data: { task: rows[0], link_view: 'tasks', link_id: rows[0].id },
      };
    }

    if (name === 'update_task') {
      let task = null;
      if (args.id) {
        const r = await db.query('SELECT * FROM tasks WHERE id = $1', [args.id]);
        task = r.rows[0];
      } else if (args.keyword) {
        task = await findTaskByKeyword(db, args.keyword, user.id, isAdmin);
      }
      if (!task) return { ok: false, error: '수정할 업무를 찾을 수 없습니다 (본인이 직접 만든 업무만 AI로 수정 가능 — 담당자로 지정만 된 항목은 화면에서 처리해주세요).' };
      if (!isAdmin && task.created_by !== user.id) {
        return { ok: false, error: '본인이 만든 업무만 AI 도구로 수정할 수 있습니다. 담당자로 지정만 된 항목은 화면에서 직접 처리해주세요.' };
      }
      const fields = [];
      const params = [];
      let i = 1;
      if (args.title)        { fields.push(`title=$${i++}`); params.push(args.title); }
      if (args.description !== undefined) { fields.push(`description=$${i++}`); params.push(args.description); }
      if (args.due_date)     { fields.push(`due_date=$${i++}`); params.push(args.due_date); }
      if (args.status)       { fields.push(`status=$${i++}`); params.push(args.status); }
      if (args.work_type)    { fields.push(`work_type=$${i++}`); params.push(args.work_type); }
      if (args.category_name) {
        const cid = await resolveCategoryId(db, args.category_name);
        if (cid) { fields.push(`category_id=$${i++}`); params.push(cid); }
      }
      if (args.assignee_name) {
        const uid = await resolveUserId(db, args.assignee_name);
        if (!uid) return { ok: false, error: `'${args.assignee_name}' 담당자를 찾을 수 없습니다.` };
        if (!isAdmin && uid !== user.id) {
          return { ok: false, error: '담당자를 다른 사용자로 변경하려면 관리자 권한이 필요합니다.' };
        }
        fields.push(`assignee_id=$${i++}`); params.push(uid);
      }
      if (!fields.length) return { ok: false, error: '수정할 필드가 없습니다.' };
      fields.push(`updated_at=NOW()`);
      params.push(task.id);
      const { rows } = await db.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id=$${i} RETURNING id, title, status, due_date`, params);
      return {
        ok: true,
        summary: `✏️ 업무 수정: "${rows[0].title}"`,
        data: { task: rows[0], link_view: 'tasks', link_id: rows[0].id },
      };
    }

    if (name === 'delete_task') {
      let task = null;
      if (args.id) {
        const r = await db.query('SELECT * FROM tasks WHERE id = $1', [args.id]);
        task = r.rows[0];
      } else if (args.keyword) {
        task = await findTaskByKeyword(db, args.keyword, user.id, isAdmin);
      }
      if (!task) return { ok: false, error: '삭제할 업무를 찾을 수 없습니다 (본인이 직접 만든 업무만 AI로 삭제 가능).' };
      if (!isAdmin && task.created_by !== user.id) {
        return { ok: false, error: '본인이 만든 업무만 AI 도구로 삭제할 수 있습니다.' };
      }
      await db.query('DELETE FROM tasks WHERE id = $1', [task.id]);
      return { ok: true, summary: `🗑️ 업무 삭제: "${task.title}"`, data: { id: task.id } };
    }

    // ===== 콘텐츠 =====
    if (name === 'create_content') {
      if (!args.title || !args.channel || !args.content_type) {
        const miss = !args.title ? 'title' : !args.channel ? 'channel' : 'content_type';
        return { ok: false, error: `${miss} 가 필요합니다.`, need: miss };
      }
      const productId = args.product_name ? await resolveProductId(db, args.product_name) : null;
      const assigneeId = args.assignee_name ? await resolveUserId(db, args.assignee_name) : user.id;
      if (args.assignee_name && !assigneeId) return { ok: false, error: `'${args.assignee_name}' 담당자를 찾을 수 없습니다.` };
      if (!isAdmin && assigneeId !== user.id) {
        return { ok: false, error: '다른 사용자에게 콘텐츠를 배정하려면 관리자 권한이 필요합니다.' };
      }
      const status = ['planned','done','skipped'].includes(args.status) ? args.status : 'planned';
      const { rows } = await db.query(`
        INSERT INTO content_items (title, product_id, channel, content_type, assignee_id, publish_date, status, memo, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id, title, channel, content_type, status
      `, [args.title, productId, args.channel, args.content_type, assigneeId, args.publish_date || null, status, args.memo || null, user.id]);
      return { ok: true, summary: `✅ 콘텐츠 생성: "${rows[0].title}"`, data: { content: rows[0], link_view: 'content', link_id: rows[0].id } };
    }

    if (name === 'update_content') {
      let item = args.id
        ? (await db.query('SELECT * FROM content_items WHERE id = $1', [args.id])).rows[0]
        : await findContentByKeyword(db, args.keyword, user.id, isAdmin);
      if (!item) return { ok: false, error: '수정할 콘텐츠를 찾을 수 없습니다 (본인이 직접 만든 콘텐츠만 AI로 수정 가능).' };
      if (!isAdmin && item.created_by !== user.id) {
        return { ok: false, error: '본인이 만든 콘텐츠만 AI 도구로 수정할 수 있습니다.' };
      }
      const fields = [];
      const params = [];
      let i = 1;
      ['title','channel','content_type','publish_date','status','memo','publish_url'].forEach(k => {
        if (args[k] !== undefined) { fields.push(`${k}=$${i++}`); params.push(args[k]); }
      });
      if (!fields.length) return { ok: false, error: '수정할 필드가 없습니다.' };
      fields.push(`updated_at=NOW()`);
      params.push(item.id);
      const { rows } = await db.query(`UPDATE content_items SET ${fields.join(', ')} WHERE id=$${i} RETURNING id, title, status`, params);
      return { ok: true, summary: `✏️ 콘텐츠 수정: "${rows[0].title}"`, data: { content: rows[0], link_view: 'content', link_id: rows[0].id } };
    }

    if (name === 'delete_content') {
      let item = args.id
        ? (await db.query('SELECT * FROM content_items WHERE id = $1', [args.id])).rows[0]
        : await findContentByKeyword(db, args.keyword, user.id, isAdmin);
      if (!item) return { ok: false, error: '삭제할 콘텐츠를 찾을 수 없습니다.' };
      if (!isAdmin && item.created_by !== user.id) {
        return { ok: false, error: '본인이 작성한 콘텐츠만 삭제할 수 있습니다.' };
      }
      await db.query('DELETE FROM content_items WHERE id = $1', [item.id]);
      return { ok: true, summary: `🗑️ 콘텐츠 삭제: "${item.title}"` };
    }

    // ===== 타임라인 =====
    if (name === 'create_timeline') {
      if (!args.title || !args.start_month || !args.end_month) {
        return { ok: false, error: 'title, start_month, end_month 가 필요합니다.' };
      }
      const cid = args.category_name ? await resolveCategoryId(db, args.category_name) : null;
      const st = ['done','in_progress','planned','tbd'].includes(args.status) ? args.status : 'planned';
      const { rows } = await db.query(`
        INSERT INTO timeline_items (title, category_id, start_month, end_month, status, memo, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id, title, status
      `, [args.title, cid, args.start_month, args.end_month, st, args.memo || null, user.id]);
      return { ok: true, summary: `✅ 타임라인 추가: "${rows[0].title}"`, data: { item: rows[0], link_view: 'timeline', link_id: rows[0].id } };
    }

    if (name === 'update_timeline') {
      let item = args.id
        ? (await db.query('SELECT * FROM timeline_items WHERE id = $1', [args.id])).rows[0]
        : await findTimelineByKeyword(db, args.keyword, user.id, isAdmin);
      if (!item) return { ok: false, error: '타임라인 항목을 찾을 수 없습니다.' };
      if (!isAdmin && item.created_by !== user.id) {
        return { ok: false, error: '본인이 작성한 타임라인만 수정할 수 있습니다.' };
      }
      const fields = [];
      const params = [];
      let i = 1;
      ['title','start_month','end_month','status','memo'].forEach(k => {
        if (args[k] !== undefined) { fields.push(`${k}=$${i++}`); params.push(args[k]); }
      });
      if (args.category_name) {
        const cid = await resolveCategoryId(db, args.category_name);
        if (cid) { fields.push(`category_id=$${i++}`); params.push(cid); }
      }
      if (!fields.length) return { ok: false, error: '수정할 필드가 없습니다.' };
      fields.push(`updated_at=NOW()`);
      params.push(item.id);
      const { rows } = await db.query(`UPDATE timeline_items SET ${fields.join(', ')} WHERE id=$${i} RETURNING id, title, status`, params);
      return { ok: true, summary: `✏️ 타임라인 수정: "${rows[0].title}"`, data: { item: rows[0], link_view: 'timeline', link_id: rows[0].id } };
    }

    if (name === 'delete_timeline') {
      let item = args.id
        ? (await db.query('SELECT * FROM timeline_items WHERE id = $1', [args.id])).rows[0]
        : await findTimelineByKeyword(db, args.keyword, user.id, isAdmin);
      if (!item) return { ok: false, error: '타임라인 항목을 찾을 수 없습니다.' };
      if (!isAdmin && item.created_by !== user.id) {
        return { ok: false, error: '본인이 작성한 타임라인만 삭제할 수 있습니다.' };
      }
      await db.query('DELETE FROM timeline_items WHERE id = $1', [item.id]);
      return { ok: true, summary: `🗑️ 타임라인 삭제: "${item.title}"` };
    }

    // ===== 캘린더 =====
    if (name === 'create_calendar_event') {
      if (!args.title || !args.start_date) return { ok: false, error: 'title, start_date 가 필요합니다.' };
      // 유형 색상 자동 매핑
      const eventType = args.event_type || 'general';
      let color = '#4F6EF7';
      try {
        const { rows: typeRows } = await db.query(
          'SELECT color FROM calendar_event_types WHERE type_key = $1', [eventType]
        );
        if (typeRows[0]) color = typeRows[0].color;
      } catch {}
      const assigneeId = args.assignee_name ? await resolveUserId(db, args.assignee_name) : user.id;
      if (args.assignee_name && !assigneeId) return { ok: false, error: `'${args.assignee_name}' 담당자를 찾을 수 없습니다.` };
      if (!isAdmin && assigneeId !== user.id) {
        return { ok: false, error: '다른 사용자에게 일정을 배정하려면 관리자 권한이 필요합니다.' };
      }
      const allDay = args.all_day !== false; // 기본 종일
      const { rows } = await db.query(`
        INSERT INTO calendar_events (title, description, event_type, start_date, end_date, all_day, start_time, end_time, color, assignee_id, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING id, title, start_date
      `, [args.title, args.description || null, eventType, args.start_date, args.end_date || null,
          allDay, args.start_time || null, args.end_time || null, color, assigneeId, user.id]);
      return { ok: true, summary: `✅ 일정 추가: "${rows[0].title}" (${String(rows[0].start_date).slice(0,10)})`, data: { event: rows[0], link_view: 'calendar', link_id: rows[0].id } };
    }

    if (name === 'update_calendar_event') {
      let ev = args.id
        ? (await db.query('SELECT * FROM calendar_events WHERE id = $1', [args.id])).rows[0]
        : await findCalendarEventByKeyword(db, args.keyword, user.id, isAdmin);
      if (!ev) return { ok: false, error: '일정을 찾을 수 없습니다 (본인이 직접 만든 일정만 AI로 수정 가능).' };
      if (!isAdmin && ev.created_by !== user.id) {
        return { ok: false, error: '본인이 만든 일정만 AI 도구로 수정할 수 있습니다.' };
      }
      const fields = [];
      const params = [];
      let i = 1;
      ['title','description','event_type','start_date','end_date','all_day','start_time','end_time'].forEach(k => {
        if (args[k] !== undefined) { fields.push(`${k}=$${i++}`); params.push(args[k]); }
      });
      if (args.assignee_name) {
        const uid = await resolveUserId(db, args.assignee_name);
        if (!uid) return { ok: false, error: `'${args.assignee_name}' 담당자를 찾을 수 없습니다.` };
        if (!isAdmin && uid !== user.id) {
          return { ok: false, error: '담당자를 다른 사용자로 변경하려면 관리자 권한이 필요합니다.' };
        }
        fields.push(`assignee_id=$${i++}`); params.push(uid);
      }
      if (args.event_type) {
        try {
          const { rows: tr } = await db.query('SELECT color FROM calendar_event_types WHERE type_key = $1', [args.event_type]);
          if (tr[0]) { fields.push(`color=$${i++}`); params.push(tr[0].color); }
        } catch {}
      }
      if (!fields.length) return { ok: false, error: '수정할 필드가 없습니다.' };
      fields.push(`updated_at=NOW()`);
      params.push(ev.id);
      const { rows } = await db.query(`UPDATE calendar_events SET ${fields.join(', ')} WHERE id=$${i} RETURNING id, title, start_date`, params);
      return { ok: true, summary: `✏️ 일정 수정: "${rows[0].title}"`, data: { event: rows[0], link_view: 'calendar', link_id: rows[0].id } };
    }

    if (name === 'delete_calendar_event') {
      let ev = args.id
        ? (await db.query('SELECT * FROM calendar_events WHERE id = $1', [args.id])).rows[0]
        : await findCalendarEventByKeyword(db, args.keyword, user.id, isAdmin);
      if (!ev) return { ok: false, error: '일정을 찾을 수 없습니다.' };
      if (!isAdmin && ev.created_by !== user.id) {
        return { ok: false, error: '본인이 만든 일정만 삭제할 수 있습니다.' };
      }
      await db.query('DELETE FROM calendar_events WHERE id = $1', [ev.id]);
      return { ok: true, summary: `🗑️ 일정 삭제: "${ev.title}"` };
    }

    // ===== 대량 삭제 =====
    if (name === 'bulk_delete_content') {
      const where = [];
      const params = [];
      let i = 1;
      // 비관리자: 항상 본인 데이터로 자동 좁힘
      if (!isAdmin) {
        // AI 도구 권한 — 본인이 시스템상 직접 만든 데이터만 (담당자로 지정만 된 것은 화면에서 처리)
        where.push(`created_by = $${i}`);
        params.push(user.id);
        i++;
      }
      // assignee_name 명시: 비관리자가 타인 이름 지정 시 차단
      if (args.assignee_name) {
        const targetUid = await resolveUserId(db, args.assignee_name);
        if (!targetUid) return { ok: false, error: `'${args.assignee_name}' 사용자를 찾을 수 없습니다.` };
        if (!isAdmin && targetUid !== user.id) {
          return { ok: false, error: '다른 사용자의 콘텐츠는 삭제할 수 없습니다. 본인 데이터만 삭제 가능합니다.' };
        }
        where.push(`assignee_id = $${i++}`); params.push(targetUid);
      }
      if (args.channel)      { where.push(`channel = $${i++}`); params.push(args.channel); }
      if (args.content_type) { where.push(`content_type = $${i++}`); params.push(args.content_type); }
      if (args.status)       { where.push(`status = $${i++}`); params.push(args.status); }
      if (args.publish_from) { where.push(`publish_date >= $${i++}`); params.push(args.publish_from); }
      if (args.publish_to)   { where.push(`publish_date <= $${i++}`); params.push(args.publish_to); }
      if (args.keyword)      { where.push(`(title ILIKE $${i} OR topic ILIKE $${i})`); params.push(`%${args.keyword}%`); i++; }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const dryRun = args.dry_run !== false; // 기본 true
      const scopeNote = isAdmin ? '' : ' (본인이 직접 만든 콘텐츠 한정 — 담당자로 지정만 된 항목·다른 사람 데이터는 AI로 처리 불가)';
      if (dryRun) {
        const { rows } = await db.query(`SELECT COUNT(*)::int AS cnt FROM content_items ${whereSql}`, params);
        const cnt = rows[0].cnt;
        const summary = cnt === 0
          ? `삭제 대상 콘텐츠 0건${scopeNote}. 조건에 맞는 본인 콘텐츠가 없거나, 화면에 보이는 항목이 다른 사용자 소유라 권한상 검색되지 않았습니다.`
          : `삭제 대상 콘텐츠 ${cnt}건 확인${scopeNote}. 아직 삭제하지 않음 — 진행하려면 같은 조건으로 dry_run=false 재호출.`;
        return {
          ok: true,
          summary,
          data: { count: cnt, dry_run: true, scope: isAdmin ? 'all' : 'self' },
        };
      }
      const { rows } = await db.query(`DELETE FROM content_items ${whereSql} RETURNING id, title`, params);
      return {
        ok: true,
        summary: `🗑️ 콘텐츠 ${rows.length}건 삭제 완료${scopeNote}.`,
        data: { count: rows.length, scope: isAdmin ? 'all' : 'self' },
      };
    }

    if (name === 'bulk_delete_tasks') {
      const where = ['archived = false'];
      const params = [];
      let i = 1;
      if (!isAdmin) {
        // AI 도구 권한 — 본인이 시스템상 직접 만든 데이터만 (담당자로 지정만 된 것은 화면에서 처리)
        where.push(`created_by = $${i}`);
        params.push(user.id);
        i++;
      }
      if (args.assignee_name) {
        const targetUid = await resolveUserId(db, args.assignee_name);
        if (!targetUid) return { ok: false, error: `'${args.assignee_name}' 사용자를 찾을 수 없습니다.` };
        if (!isAdmin && targetUid !== user.id) {
          return { ok: false, error: '다른 사용자의 업무는 삭제할 수 없습니다. 본인 데이터만 삭제 가능합니다.' };
        }
        where.push(`assignee_id = $${i++}`); params.push(targetUid);
      }
      if (args.status)       { where.push(`status = $${i++}`); params.push(args.status); }
      if (args.category_name) {
        const cid = await resolveCategoryId(db, args.category_name);
        if (cid) { where.push(`category_id = $${i++}`); params.push(cid); }
      }
      if (args.keyword)      { where.push(`(title ILIKE $${i} OR description ILIKE $${i})`); params.push(`%${args.keyword}%`); i++; }
      if (args.due_from)     { where.push(`due_date >= $${i++}`); params.push(args.due_from); }
      if (args.due_to)       { where.push(`due_date <= $${i++}`); params.push(args.due_to); }
      const whereSql = `WHERE ${where.join(' AND ')}`;
      const dryRun = args.dry_run !== false;
      const scopeNote = isAdmin ? '' : ' (본인이 직접 만든 업무 한정 — 담당자로 지정만 된 항목·다른 사람 데이터는 AI로 처리 불가)';
      if (dryRun) {
        const { rows } = await db.query(`SELECT COUNT(*)::int AS cnt FROM tasks ${whereSql}`, params);
        const cnt = rows[0].cnt;
        const summary = cnt === 0
          ? `삭제 대상 업무 0건${scopeNote}. 조건에 맞는 본인 업무가 없거나, 화면에 보이는 항목이 다른 사용자 소유라 권한상 검색되지 않았습니다.`
          : `삭제 대상 업무 ${cnt}건 확인${scopeNote}. 아직 삭제하지 않음 — 진행하려면 같은 조건으로 dry_run=false 재호출.`;
        return {
          ok: true,
          summary,
          data: { count: cnt, dry_run: true, scope: isAdmin ? 'all' : 'self' },
        };
      }
      const { rows } = await db.query(`DELETE FROM tasks ${whereSql} RETURNING id, title`, params);
      return {
        ok: true,
        summary: `🗑️ 업무 ${rows.length}건 삭제 완료${scopeNote}.`,
        data: { count: rows.length, scope: isAdmin ? 'all' : 'self' },
      };
    }

    if (name === 'bulk_delete_calendar_events') {
      const where = [];
      const params = [];
      let i = 1;
      if (!isAdmin) {
        // AI 도구 권한 — 본인이 시스템상 직접 만든 데이터만
        where.push(`created_by = $${i}`);
        params.push(user.id);
        i++;
      }
      if (args.assignee_name) {
        const targetUid = await resolveUserId(db, args.assignee_name);
        if (!targetUid) return { ok: false, error: `'${args.assignee_name}' 사용자를 찾을 수 없습니다.` };
        if (!isAdmin && targetUid !== user.id) {
          return { ok: false, error: '다른 사용자의 일정은 삭제할 수 없습니다. 본인 데이터만 삭제 가능합니다.' };
        }
        where.push(`assignee_id = $${i++}`); params.push(targetUid);
      }
      if (args.event_type) { where.push(`event_type = $${i++}`); params.push(args.event_type); }
      if (args.start_from) { where.push(`start_date >= $${i++}`); params.push(args.start_from); }
      if (args.start_to)   { where.push(`start_date <= $${i++}`); params.push(args.start_to); }
      if (args.keyword)    { where.push(`title ILIKE $${i++}`); params.push(`%${args.keyword}%`); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const dryRun = args.dry_run !== false;
      const scopeNote = isAdmin ? '' : ' (본인이 직접 만든 일정 한정 — 담당자로 지정만 된 항목·다른 사람 데이터는 AI로 처리 불가)';
      if (dryRun) {
        const { rows } = await db.query(`SELECT COUNT(*)::int AS cnt FROM calendar_events ${whereSql}`, params);
        const cnt = rows[0].cnt;
        const summary = cnt === 0
          ? `삭제 대상 일정 0건${scopeNote}. 조건에 맞는 본인 일정이 없거나, 화면에 보이는 항목이 다른 사용자 소유라 권한상 검색되지 않았습니다.`
          : `삭제 대상 일정 ${cnt}건 확인${scopeNote}. 아직 삭제하지 않음 — 진행하려면 같은 조건으로 dry_run=false 재호출.`;
        return {
          ok: true,
          summary,
          data: { count: cnt, dry_run: true, scope: isAdmin ? 'all' : 'self' },
        };
      }
      const { rows } = await db.query(`DELETE FROM calendar_events ${whereSql} RETURNING id, title`, params);
      return {
        ok: true,
        summary: `🗑️ 일정 ${rows.length}건 삭제 완료${scopeNote}.`,
        data: { count: rows.length, scope: isAdmin ? 'all' : 'self' },
      };
    }

    // ===== R&R (admin only) =====
    if (name === 'create_rrr') {
      if (!isAdmin) return { ok: false, error: 'R&R 추가는 관리자만 가능합니다.' };
      if (!args.user_name || !args.role_type || !args.description) {
        return { ok: false, error: 'user_name, role_type, description 이 필요합니다.' };
      }
      const uid = await resolveUserId(db, args.user_name);
      if (!uid) return { ok: false, error: `'${args.user_name}' 팀원을 찾을 수 없습니다.` };
      const { rows } = await db.query(`
        INSERT INTO rrr_items (user_id, role_type, description, frequency)
        VALUES ($1,$2,$3,$4)
        RETURNING id, role_type, description
      `, [uid, args.role_type, args.description, args.frequency || null]);
      return { ok: true, summary: `✅ R&R 추가: ${args.user_name} - "${rows[0].description}"`, data: { rrr: rows[0], link_view: 'rrr' } };
    }

    if (name === 'update_rrr') {
      if (!isAdmin) return { ok: false, error: 'R&R 수정은 관리자만 가능합니다.' };
      let item = args.id
        ? (await db.query('SELECT * FROM rrr_items WHERE id = $1', [args.id])).rows[0]
        : await findRrrByKeyword(db, args.keyword);
      if (!item) return { ok: false, error: 'R&R 항목을 찾을 수 없습니다.' };
      const fields = [];
      const params = [];
      let i = 1;
      ['role_type','description','frequency'].forEach(k => {
        if (args[k] !== undefined) { fields.push(`${k}=$${i++}`); params.push(args[k]); }
      });
      if (!fields.length) return { ok: false, error: '수정할 필드가 없습니다.' };
      params.push(item.id);
      const { rows } = await db.query(`UPDATE rrr_items SET ${fields.join(', ')} WHERE id=$${i} RETURNING id, description`, params);
      return { ok: true, summary: `✏️ R&R 수정: "${rows[0].description}"`, data: { rrr: rows[0], link_view: 'rrr' } };
    }

    if (name === 'delete_rrr') {
      if (!isAdmin) return { ok: false, error: 'R&R 삭제는 관리자만 가능합니다.' };
      let item = args.id
        ? (await db.query('SELECT * FROM rrr_items WHERE id = $1', [args.id])).rows[0]
        : await findRrrByKeyword(db, args.keyword);
      if (!item) return { ok: false, error: 'R&R 항목을 찾을 수 없습니다.' };
      await db.query('DELETE FROM rrr_items WHERE id = $1', [item.id]);
      return { ok: true, summary: `🗑️ R&R 삭제: "${item.description}"` };
    }

    return { ok: false, error: `알 수 없는 도구: ${name}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { TOOL_DEFINITIONS, executeTool };
