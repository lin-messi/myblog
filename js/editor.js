/**
 * editor.js —— 后台文章编辑器（工具栏 + Markdown + 实时预览 + 模板 + 自动保存）
 * window.BlogEditor.open(article|null, onDone)
 */
(function () {
  const S = () => window.BlogStorage;
  const STATUS = { DRAFT: 'draft', PUBLISHED: 'published', UNPUBLISHED: 'unpublished' };

  // ====== 文章模板 ======
  const TEMPLATES = {
    tech: {
      name: '技术文章',
      category: '技术',
      body: `# 标题：一个技术问题的解决

> 一句话概括本文要解决的问题。

## 背景

描述遇到的问题场景。

## 原因分析

\`\`\`js
// 关键代码
function demo() {
  return 42;
}
\`\`\`

## 解决方案

1. 第一步
2. 第二步

## 总结

- 收获一
- 收获二
`,
    },
    life: {
      name: '生活随笔',
      category: '随笔',
      body: `# 标题：某个普通的一天

今天发生了一件让我想记录下来的小事……

## 那一刻

描述当时的场景与感受。

## 一点感想

> 引用一句打动我的话。

写下你的思考。
`,
    },
    review: {
      name: '项目复盘',
      category: '复盘',
      body: `# 项目复盘：XXX 项目

## 项目概述

| 项目 | 内容 |
| --- | --- |
| 周期 | 2026.xx - 2026.xx |
| 角色 | 独立开发 |
| 技术栈 | - |

## 做得好的地方

-

## 待改进

-

## 关键决策回顾

## 下一步行动
`,
    },
    book: {
      name: '读书影评',
      category: '读书',
      body: `# 《作品名》—— 一句话短评

- **作者/导演**：
- **类型**：
- **评分**：⭐⭐⭐⭐☆

## 内容简介

不剧透的整体介绍。

## 印象最深的部分

> 摘抄一段原文或台词。

## 我的思考

写下它带给你的启发。
`,
    },
  };

  let state = null; // { article, onDone, autosaveTimer, draftKey, dirty }
  let dom = {};

  function buildModal() {
    if (dom.modal) return;
    const modal = document.createElement('div');
    modal.className = 'editor-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="editor-top">
        <h3 id="ed-heading">写文章</h3>
        <span class="autosave-tip" id="ed-autosave"></span>
      </div>
      <div class="tpl-bar">
        <span style="font-size:12px;color:#9aa6c0;align-self:center;margin-right:4px;">套用模板：</span>
        <button class="tpl-btn" data-tpl="tech">技术文章</button>
        <button class="tpl-btn" data-tpl="life">生活随笔</button>
        <button class="tpl-btn" data-tpl="review">项目复盘</button>
        <button class="tpl-btn" data-tpl="book">读书影评</button>
      </div>
      <div class="editor-meta">
        <div class="fld" style="grid-column:1/-1;">
          <label>标题</label>
          <input type="text" id="ed-title" placeholder="文章标题" maxlength="120" />
        </div>
        <div class="fld">
          <label>分类（单选）</label>
          <input type="text" id="ed-category" placeholder="如：技术 / 随笔" list="cat-list" />
          <datalist id="cat-list"></datalist>
        </div>
        <div class="fld">
          <label>标签（逗号分隔，可多个）</label>
          <input type="text" id="ed-tags" placeholder="前端, JavaScript" />
        </div>
        <div class="fld" style="grid-column:1/-1;">
          <label>摘要（列表页展示，可留空自动截取）</label>
          <textarea id="ed-excerpt" rows="2" placeholder="一两句话概括文章"></textarea>
        </div>
        <div class="fld" style="grid-column:1/-1;">
          <label>封面图（URL 或本地上传）</label>
          <div class="cover-row">
            <input type="text" id="ed-cover" placeholder="https://... 留空则用渐变占位" />
            <button class="md-toolbar" id="ed-cover-upload" style="padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#d8def0;cursor:pointer;">本地图片</button>
            <input type="file" id="ed-cover-file" accept="image/*" hidden />
          </div>
          <img id="ed-cover-preview" class="cover-preview" hidden />
        </div>
      </div>
      <div class="md-toolbar" id="ed-toolbar">
        <div class="tb-group">
          <button data-md="h2" title="标题">H</button>
          <button data-md="bold" title="粗体"><b>B</b></button>
          <button data-md="italic" title="斜体"><i>I</i></button>
          <button data-md="strike" title="删除线"><s>S</s></button>
          <button data-md="quote" title="引用">❝</button>
          <button data-md="ul" title="无序列表">•</button>
          <button data-md="ol" title="有序列表">1.</button>
        </div>
        <div class="tb-group">
          <button data-md="icode" title="行内代码">&lt;/&gt;</button>
          <button data-md="code" title="代码块">{ }</button>
          <button data-md="table" title="表格">▦</button>
          <button data-md="hr" title="分割线">―</button>
        </div>
        <div class="tb-group">
          <button data-md="link" title="链接">🔗</button>
          <button data-md="img" title="图片URL">🖼</button>
          <button data-md="imglocal" title="本地图片">⬆</button>
        </div>
        <div class="tb-group">
          <input type="color" id="ed-color" title="文字颜色" value="#6d8bff" />
          <button data-md="color" title="应用颜色">A</button>
          <button data-md="mark" title="高亮">🖍</button>
        </div>
        <input type="file" id="ed-img-file" accept="image/*" hidden />
      </div>
      <div class="editor-body">
        <div class="editor-pane">
          <textarea id="md-input" placeholder="在这里用 Markdown 写作，右侧实时预览…"></textarea>
        </div>
        <div class="preview-pane">
          <div class="md-body" id="md-preview"></div>
        </div>
      </div>
      <div class="editor-foot">
        <span class="count" id="ed-count">0 字 · 预计阅读 1 分钟</span>
        <select id="ed-status" style="padding:8px;border-radius:8px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.14);color:#eef;">
          <option value="draft">保存为草稿</option>
          <option value="published">立即发布</option>
          <option value="unpublished">下架（不显示）</option>
        </select>
        <button class="btn-cancel" id="ed-cancel">取消</button>
        <button class="btn-save-draft" id="ed-savedraft">仅存草稿</button>
        <button class="btn-publish" id="ed-save">保存</button>
      </div>
    `;
    document.body.appendChild(modal);
    dom = {
      modal,
      heading: modal.querySelector('#ed-heading'),
      autosave: modal.querySelector('#ed-autosave'),
      title: modal.querySelector('#ed-title'),
      category: modal.querySelector('#ed-category'),
      catList: modal.querySelector('#cat-list'),
      tags: modal.querySelector('#ed-tags'),
      excerpt: modal.querySelector('#ed-excerpt'),
      cover: modal.querySelector('#ed-cover'),
      coverPreview: modal.querySelector('#ed-cover-preview'),
      coverFile: modal.querySelector('#ed-cover-file'),
      coverUpload: modal.querySelector('#ed-cover-upload'),
      toolbar: modal.querySelector('#ed-toolbar'),
      input: modal.querySelector('#md-input'),
      preview: modal.querySelector('#md-preview'),
      count: modal.querySelector('#ed-count'),
      status: modal.querySelector('#ed-status'),
      color: modal.querySelector('#ed-color'),
      imgFile: modal.querySelector('#ed-img-file'),
    };
    bindEvents();
  }

  function bindEvents() {
    // 模板
    dom.modal.querySelectorAll('.tpl-btn').forEach(b => {
      b.addEventListener('click', () => {
        const tpl = TEMPLATES[b.dataset.tpl];
        if (!tpl) return;
        if (dom.input.value.trim() && !confirm('套用模板会替换当前正文内容，确定？')) return;
        dom.input.value = tpl.body;
        if (!dom.category.value) dom.category.value = tpl.category;
        if (!dom.title.value) {
          const h = tpl.body.match(/^#\s+(.+)$/m);
          if (h) dom.title.value = h[1].trim();
        }
        renderPreview(); markDirty(); autoResize();
      });
    });

    // 工具栏
    dom.toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-md]');
      if (!btn) return;
      applyToolbar(btn.dataset.md);
    });

    // 实时预览 + 字数 + 自动保存
    dom.input.addEventListener('input', () => { renderPreview(); updateCount(); markDirty(); autoResize(); });
    dom.title.addEventListener('input', markDirty);
    dom.excerpt.addEventListener('input', markDirty);
    // 分类与标签的修改同样触发自动保存（此前未监听，只改这两项会丢稿）
    dom.category.addEventListener('input', markDirty);
    dom.tags.addEventListener('input', markDirty);

    // 封面
    dom.cover.addEventListener('input', () => { updateCoverPreview(); markDirty(); });
    dom.coverUpload.addEventListener('click', () => dom.coverFile.click());
    dom.coverFile.addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const url = await fileToDataURL(f);
      dom.cover.value = url; updateCoverPreview(); markDirty();
    });

    // 本地图片插入 / 粘贴
    dom.imgFile.addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const url = await fileToDataURL(f);
      insertAtCursor(`![${f.name}](${url})\n`);
      dom.imgFile.value = '';
    });
    dom.input.addEventListener('paste', async (e) => {
      const items = e.clipboardData?.items || [];
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          e.preventDefault();
          const file = it.getAsFile();
          const url = await fileToDataURL(file);
          insertAtCursor(`![粘贴的图片](${url})\n`);
          return;
        }
      }
    });

    // 底部按钮
    dom.modal.querySelector('#ed-cancel').addEventListener('click', () => close());
    dom.modal.querySelector('#ed-savedraft').addEventListener('click', () => {
      // 已发布文章：存为修订（线上版本不变）；否则：存为草稿
      if (state.article && state.article.status === STATUS.PUBLISHED) doSaveRevision();
      else doSave(STATUS.DRAFT);
    });
    dom.modal.querySelector('#ed-save').addEventListener('click', () => doSave(dom.status.value));

    // Esc 关闭
    document.addEventListener('keydown', (e) => {
      if (!dom.modal.hidden && e.key === 'Escape') close();
      // Ctrl+S 保存
      if (!dom.modal.hidden && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); doSave(dom.status.value);
      }
    });
  }

  function fileToDataURL(file) {
    return new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(file);
    });
  }

  // 在光标处插入文本
  function insertAtCursor(text, wrap) {
    const ta = dom.input;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel = ta.value.slice(start, end);
    let insert, cursorPos;
    if (wrap) {
      insert = wrap[0] + (sel || wrap[2] || '') + wrap[1];
      cursorPos = start + wrap[0].length + (sel || wrap[2] || '').length;
    } else {
      insert = text;
      cursorPos = start + text.length;
    }
    ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
    ta.focus();
    ta.setSelectionRange(cursorPos, cursorPos);
    renderPreview(); updateCount(); markDirty(); autoResize();
  }

  function applyToolbar(type) {
    switch (type) {
      case 'h2': insertAtCursor(null, ['## ', '', '标题']); break;
      case 'bold': insertAtCursor(null, ['**', '**', '粗体']); break;
      case 'italic': insertAtCursor(null, ['*', '*', '斜体']); break;
      case 'strike': insertAtCursor(null, ['~~', '~~', '删除线']); break;
      case 'quote': insertAtCursor('\n> 引用内容\n'); break;
      case 'ul': insertAtCursor('\n- 列表项\n- 列表项\n'); break;
      case 'ol': insertAtCursor('\n1. 第一项\n2. 第二项\n'); break;
      case 'icode': insertAtCursor(null, ['`', '`', 'code']); break;
      case 'code': insertAtCursor('\n```js\n// 代码\n```\n'); break;
      case 'table': insertAtCursor('\n| 列1 | 列2 |\n| --- | --- |\n| 内容 | 内容 |\n'); break;
      case 'hr': insertAtCursor('\n---\n'); break;
      case 'link': {
        const url = prompt('链接地址：', 'https://'); if (url == null) return;
        insertAtCursor(null, ['[', `](${url})`, '链接文字']); break;
      }
      case 'img': {
        const url = prompt('图片地址：', 'https://'); if (!url) return;
        insertAtCursor(`![图片](${url})\n`); break;
      }
      case 'imglocal': dom.imgFile.click(); break;
      case 'video': {
        const url = prompt('视频地址（mp4 链接）：', 'https://'); if (!url) return;
        insertAtCursor(`\n<video src="${url}" controls style="max-width:100%;border-radius:10px"></video>\n`); break;
      }
      case 'color': insertAtCursor(null, [`{color:${dom.color.value}}`, '{/color}', '彩色文字']); break;
      case 'mark': insertAtCursor(null, ['==', '==', '高亮']); break;
      case 'center': insertAtCursor(null, ['<center>', '</center>', '居中内容']); break;
    }
  }

  function renderPreview() {
    const html = window.MD.render(dom.input.value);
    dom.preview.innerHTML = html;
    window.MD.bindCopyButtons(dom.preview);
  }

  // 让写作区高度随内容自动增长，使整个弹窗整体滚动（CSS 的 min-height 兜底）
  function autoResize() {
    const ta = dom.input;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  function updateCount() {
    const rt = window.MD.readingTime(dom.input.value);
    dom.count.textContent = `${rt.words} 字 · 预计阅读 ${rt.minutes} 分钟`;
  }

  function updateCoverPreview() {
    const v = dom.cover.value.trim();
    if (v) { dom.coverPreview.src = v; dom.coverPreview.hidden = false; }
    else { dom.coverPreview.hidden = true; }
  }

  // ====== 自动保存草稿 ======
  function markDirty() {
    state.dirty = true;
    scheduleAutosave();
  }
  function scheduleAutosave() {
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(autosave, 3000);
  }
  async function autosave() {
    if (!state || !state.dirty) return;
    const snap = collect();
    if (!snap.title && !snap.body.trim()) return;
    try {
      await S().saveDraft(state.draftKey, snap);
      state.dirty = false;
      const t = new Date();
      dom.autosave.textContent = `已自动保存草稿 ${t.toLocaleTimeString()}`;
    } catch (e) {
      dom.autosave.textContent = `⚠ 自动保存失败：${e.message}`;
    }
  }

  function collect() {
    return {
      id: state.article ? state.article.id : undefined,
      title: dom.title.value.trim(),
      category: dom.category.value.trim() || '未分类',
      tags: dom.tags.value.split(/[,，]/).map(s => s.trim()).filter(Boolean),
      excerpt: dom.excerpt.value.trim(),
      cover: dom.cover.value.trim(),
      body: dom.input.value,
    };
  }

  function setSaveState(status, msg) {
    if (!dom.autosave) return;
    if (status === 'saving') dom.autosave.textContent = '保存中…';
    else if (status === 'saved') dom.autosave.textContent = '已保存 ✓';
    else if (status === 'error') dom.autosave.textContent = '⚠ ' + (msg || '保存失败');
  }

  async function doSave(status) {
    const snap = collect();
    if (!snap.title) { alert('请填写文章标题'); dom.title.focus(); return; }
    if (!snap.excerpt) snap.excerpt = window.MD.plain(snap.body).slice(0, 100);
    snap.status = status;

    // 并发编辑冲突检查：文章已在其它标签页被修改时提醒，避免覆盖对方改动
    if (state.article) {
      try {
        const freshData = await S().loadDataFresh();
        const fresh = (freshData.articles || []).find(a => a.id === state.article.id);
        if (fresh && fresh.updatedAt !== state.article.updatedAt) {
          const go = confirm('该文章已在其它标签页被修改，继续保存将覆盖对方的最新修改。是否仍要保存？');
          if (!go) return;
        }
      } catch (e) { /* 冲突检查失败不阻断保存 */ }
    }

    setSaveState('saving');
    try {
      // 正式写入前先保存恢复快照，失败后刷新页面也能找回本次修改。
      await S().saveDraft(state.draftKey, snap);
      const saved = await S().upsertArticle(snap);
      clearTimeout(state.autosaveTimer);
      state.dirty = false;
      // 确认文章保存成功后再清理草稿；草稿/修订清理失败不影响“已保存”结果
      try {
        await S().clearDraft(state.draftKey);
        if (state.article) await S().clearRevision(state.article.id);
      } catch (e) {
        console.warn('[editor] 清理草稿/修订失败（文章已保存）', e);
      }
      setSaveState('saved');
      const msg = status === STATUS.PUBLISHED ? '文章已发布！' : status === STATUS.DRAFT ? '草稿已保存' : '文章已下架';
      const done = state.onDone;
      close(true);
      if (done) done(saved, msg);
    } catch (err) {
      setSaveState('error', err.message);
      alert('保存失败：' + err.message);
    }
  }

  // 已发布文章：把修改存为“修订草稿”，线上版本保持不变
  async function doSaveRevision() {
    const snap = collect();
    if (!snap.title) { alert('请填写文章标题'); dom.title.focus(); return; }
    if (!snap.excerpt) snap.excerpt = window.MD.plain(snap.body).slice(0, 100);
    setSaveState('saving');
    try {
      await S().saveDraft(state.draftKey, snap);
      await S().saveRevision(state.article.id, snap);
      try { await S().clearDraft(state.draftKey); } catch (e) { /* 保留恢复副本 */ }
      clearTimeout(state.autosaveTimer);
      state.dirty = false;
      setSaveState('saved');
      const done = state.onDone;
      close(true);
      if (done) done(null, '修订已暂存，线上版本保持不变');
    } catch (err) {
      setSaveState('error', err.message);
      alert('修订保存失败：' + err.message);
    }
  }

  // 根据文章状态调整状态下拉与“仅存草稿/存修订”按钮
  function setupStatusUI() {
    const isPublished = state.article && state.article.status === STATUS.PUBLISHED;
    const saveDraftBtn = dom.modal.querySelector('#ed-savedraft');
    if (isPublished) {
      dom.status.innerHTML =
        '<option value="published">更新发布</option>' +
        '<option value="unpublished">下架（不显示）</option>';
      saveDraftBtn.textContent = '存修订';
      saveDraftBtn.title = '保存为修订草稿，线上版本保持不变';
    } else {
      dom.status.innerHTML =
        '<option value="draft">保存为草稿</option>' +
        '<option value="published">立即发布</option>' +
        '<option value="unpublished">下架（不显示）</option>';
      saveDraftBtn.textContent = '仅存草稿';
      saveDraftBtn.title = '';
    }
  }

  async function fillForm(article, draft) {
    const data = await S().loadData();
    // 分类候选
    const cats = [...new Set((data.articles || []).map(a => a.category).filter(Boolean))];
    dom.catList.innerHTML = cats.map(c => `<option value="${c}">`).join('');

    const src = draft || article || {};
    dom.title.value = src.title || '';
    dom.category.value = src.category || '';
    dom.tags.value = Array.isArray(src.tags) ? src.tags.join(', ') : (src.tags || '');
    dom.excerpt.value = src.excerpt || '';
    dom.cover.value = src.cover || '';
    dom.input.value = src.body || '';
    dom.status.value = (article && article.status) || STATUS.DRAFT;
    updateCoverPreview();
    renderPreview();
    updateCount();
  }

  async function open(article, onDone) {
    buildModal();
    state = {
      article: article || null,
      onDone,
      autosaveTimer: null,
      draftKey: article ? `edit_${article.id}` : 'new_article',
      dirty: false,
    };
    dom.heading.textContent = article ? '编辑文章' : '写文章';
    dom.autosave.textContent = '';
    setupStatusUI();

    // 已发布文章：检测未发布的修订草稿（线上版本不受影响）
    let useRevision = null;
    if (article && article.status === STATUS.PUBLISHED) {
      const rev = await S().getRevision(article.id);
      if (rev && confirm('检测到该文章的未发布修订（线上版本不受影响），是否恢复修订内容？')) {
        useRevision = rev;
      }
    }

    // 检查是否有未提交的自动保存草稿
    const draft = await S().getDraft(state.draftKey);
    let useDraft = null;
    if (draft && (!article || draft.savedAt)) {
      if (confirm(`检测到未保存的草稿（${draft.savedAt ? new Date(draft.savedAt).toLocaleString() : ''}），是否恢复？`)) {
        useDraft = draft;
      } else {
        await S().clearDraft(state.draftKey);
      }
    }
    await fillForm(article, useRevision || useDraft);
    dom.modal.hidden = false;
    document.body.style.overflow = 'hidden';
    // 显示后再调整写作区高度（隐藏时 scrollHeight 为 0）
    requestAnimationFrame(() => { autoResize(); dom.modal.scrollTop = 0; });
    dom.title.focus();
  }

  // 关闭前补存最后修改（防止丢失停止输入后 3 秒内的内容）
  async function flushDraft() {
    if (!state) return;
    const snap = collect();
    if (!snap.title && !snap.body.trim()) return;
    try {
      await S().saveDraft(state.draftKey, snap);
      state.dirty = false;
    } catch (e) {
      console.warn('[editor] 关闭前补存草稿失败', e);
      if (dom.autosave) dom.autosave.textContent = '⚠ 草稿补存失败：' + e.message;
    }
  }

  function close(saved) {
    if (state) {
      if (!saved && state.dirty) flushDraft();
      clearTimeout(state.autosaveTimer);
    }
    if (dom.modal) dom.modal.hidden = true;
    document.body.style.overflow = '';
  }

  window.BlogEditor = { open, TEMPLATES };
})();
