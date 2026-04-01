// 설정 뷰 — 분류(카테고리) 관리
const SettingsView = {
  async render() {
    const container = document.getElementById('content');
    container.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <span>설정 불러오는 중...</span>
      </div>
    `;

    let categories = [];
    try {
      const res = await API.get('/categories');
      categories = res.data;
    } catch (e) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">⚠</span>
          <div class="empty-state-title">카테고리를 불러오지 못했습니다</div>
          <div class="empty-state-desc">잠시 후 다시 시도해주세요</div>
        </div>
      `;
      return;
    }

    // 상단 액션 버튼
    const actions = document.getElementById('topbar-actions');
    actions.innerHTML = `
      <button class="btn btn-primary" id="btn-add-category">+ 분류 추가</button>
    `;
    document.getElementById('btn-add-category').addEventListener('click', () => {
      this.openCategoryPanel(null);
    });

    // 테이블 렌더링
    container.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden">
        <table class="settings-table">
          <thead>
            <tr>
              <th>색상</th>
              <th>분류명</th>
              <th style="width:120px;text-align:right">작업</th>
            </tr>
          </thead>
          <tbody id="category-tbody">
            ${categories.length === 0
              ? `<tr><td colspan="3" style="text-align:center;color:var(--color-text-hint);padding:40px">
                   등록된 분류가 없습니다.<br>
                   <span style="font-size:12px;margin-top:4px;display:block">+ 분류 추가 버튼으로 업무 분류를 만들어보세요</span>
                 </td></tr>`
              : categories.map(c => this.rowHtml(c)).join('')}
          </tbody>
        </table>
      </div>
    `;

    // 이벤트 위임 — 수정/삭제
    document.getElementById('category-tbody').addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.btn-edit-cat');
      const delBtn = e.target.closest('.btn-del-cat');

      if (editBtn) {
        const id = editBtn.dataset.id;
        const cat = categories.find(c => String(c.id) === String(id));
        if (cat) this.openCategoryPanel(cat);
      }

      if (delBtn) {
        const id = delBtn.dataset.id;
        const cat = categories.find(c => String(c.id) === String(id));
        const ok = await App.confirm(`"${cat?.name}" 분류를 삭제하시겠습니까?`);
        if (!ok) return;
        try {
          await API.del(`/categories/${id}`);
          App.toast(`"${cat?.name}" 분류가 삭제되었습니다.`, 'info');
          await App.loadMeta();
          this.render();
        } catch (e) {
          App.toast('삭제에 실패했습니다.', 'error');
        }
      }
    });
  },

  rowHtml(c) {
    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${escHtml(c.color)};flex-shrink:0;box-shadow:0 0 6px ${escHtml(c.color)}55"></span>
            <span style="font-size:13px;color:var(--color-text-muted)">${escHtml(c.color)}</span>
          </div>
        </td>
        <td>${escHtml(c.name)}</td>
        <td style="text-align:right">
          <button class="btn btn-default btn-edit-cat" data-id="${c.id}" style="margin-right:6px">수정</button>
          <button class="btn btn-danger btn-del-cat" data-id="${c.id}">삭제</button>
        </td>
      </tr>
    `;
  },

  openCategoryPanel(category) {
    const isEdit = !!category;
    const title = isEdit ? '분류 수정' : '분류 추가';

    const html = `
      <div class="form-group">
        <label>분류명 <span style="color:var(--color-warn-text)">*</span></label>
        <input type="text" id="f-cat-name" value="${escHtml(category?.name || '')}" placeholder="예: 홈페이지">
      </div>
      <div class="form-group">
        <label>색상</label>
        <div style="display:flex;align-items:center;gap:10px">
          <input type="color" id="f-cat-color" value="${escHtml(category?.color || '#4F6EF7')}" style="width:44px;height:36px;padding:2px;border:0.5px solid rgba(255,255,255,0.12);border-radius:6px;cursor:pointer;background:transparent">
          <span id="f-cat-color-preview" style="font-size:13px;color:var(--color-text-muted)">${escHtml(category?.color || '#4F6EF7')}</span>
        </div>
      </div>
    `;

    App.openPanel(title, html, async () => {
      const name = document.getElementById('f-cat-name').value.trim();
      const color = document.getElementById('f-cat-color').value;
      if (!name) {
        App.toast('분류명을 입력해주세요.', 'error');
        return false;
      }

      try {
        if (isEdit) {
          await API.put(`/categories/${category.id}`, { name, color });
          App.toast('분류가 수정되었습니다.', 'success');
        } else {
          await API.post('/categories', { name, color });
          App.toast('분류가 추가되었습니다.', 'success');
        }
        await App.loadMeta();
        this.render();
      } catch (e) {
        App.toast('저장에 실패했습니다.', 'error');
      }
    });

    // 색상 선택기 변경 시 미리보기 업데이트
    setTimeout(() => {
      const colorInput = document.getElementById('f-cat-color');
      const preview = document.getElementById('f-cat-color-preview');
      if (colorInput && preview) {
        colorInput.addEventListener('input', () => {
          preview.textContent = colorInput.value;
        });
      }
    }, 0);
  },
};
