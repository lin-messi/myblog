/**
 * admin.js —— 后台管理逻辑（传统脚本）
 */
(function () {
  const SESSION_KEY = 'myblog_admin_session';
  const SESSION_TTL = 1000 * 60 * 60 * 4;

  function showToast(msg, isErr = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('err');
    if (isErr) t.classList.add('err');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
  function isLoggedIn() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const { expire } = JSON.parse(raw);
      if (Date.now() > expire) { sessionStorage.removeItem(SESSION_KEY); return false; }
      return true;
    } catch (e) { return false; }
  }
  function setLoggedIn() {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ expire: Date.now() + SESSION_TTL }));
  }

  function bindLogin() {
    const btn = document.getElementById('login-btn');
    const input = document.getElementById('login-password');
    const errEl = document.getElementById('login-error');
    async function tryLogin() {
      const pw = input.value;
      if (!pw) return;
      errEl.textContent = '';
      try {
        if (window.BlogStorage.isPublicMirror()) {
          const tokenInput = document.getElementById('login-token');
          const token = (tokenInput.value || window.BlogStorage.githubToken()).trim();
          if (!token) { errEl.textContent = '请填写 GitHub 令牌'; return; }
          window.BlogStorage.setGithubToken(token);
          window.BlogStorage.clearCache();
          let data;
          try { data = await window.BlogStorage.loadDataFresh(); }
          catch (e) { window.BlogStorage.setGithubToken(''); throw e; }
          const h = await window.BlogStorage.sha256(pw);
          if (h !== data.adminPasswordHash) { errEl.textContent = '密码错误'; input.value = ''; input.focus(); return; }
          setLoggedIn();
          showAdminView();
          return;
        }
        if (window.BLOG_API_BASE) {
          const res = await fetch(window.BLOG_API_BASE + '/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ password: pw }),
          });
          if (!res.ok) { errEl.textContent = '密码错误'; input.value = ''; input.focus(); return; }
          setLoggedIn();
          showAdminView();
          return;
        }
        const data = await window.BlogStorage.loadData();
        const h = await window.BlogStorage.sha256(pw);
        if (h === data.adminPasswordHash) {
          setLoggedIn();
          showAdminView();
        } else {
          errEl.textContent = '密码错误';
          input.value = ''; input.focus();
        }
      } catch (e) {
        errEl.textContent = '登录失败：' + e.message;
      }
    }
    btn.addEventListener('click', tryLogin);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });
  }

  async function showAdminView() {
    document.getElementById('login-view').hidden = true;
    document.getElementById('admin-view').hidden = false;
    const live = document.getElementById('live-publish-note');
    if (live && (window.BLOG_API_BASE || window.BlogStorage.isPublicMirror())) {
      live.hidden = false;
      live.textContent = '在这里点发布后，刷新公开网站就能看到。数据保存在 GitHub，不依赖这台电脑上的文件。';
    }
    await migrateLocalArticles();
    await initAdmin();
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    const done = () => location.reload();
    if (window.BLOG_API_BASE) fetch(window.BLOG_API_BASE + '/logout', { method: 'POST', credentials: 'same-origin' }).finally(done);
    else done();
  }

  async function migrateLocalArticles() {
    if (!window.BLOG_API_BASE || localStorage.getItem('myblog_server_migrated')) return;
    let local = null;
    try { local = JSON.parse(localStorage.getItem('myblog_v1_data') || 'null'); } catch (e) { local = null; }
    const remote = await window.BlogStorage.loadDataFresh();
    const ids = new Set((remote.articles || []).map(a => a.id));
    const extra = ((local && local.articles) || []).filter(a => a && a.id && !ids.has(a.id));
    if (!extra.length) { localStorage.setItem('myblog_server_migrated', '1'); return; }
    await window.BlogStorage.saveData({
      articles: remote.articles.concat(extra),
      drafts: { ...(remote.drafts || {}), ...((local && local.drafts) || {}) },
      revisions: { ...(remote.revisions || {}), ...((local && local.revisions) || {}) },
    });
    localStorage.setItem('myblog_server_migrated', '1');
    showToast('已把这个浏览器里的 ' + extra.length + ' 篇文章带到后台');
  }

  async function initAdmin() {
    const { loadData, saveData, sha256, exportJSON, importJSON, clearCache } = window.BlogStorage;
    const data = await loadData();

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const name = tab.dataset.tab;
        document.querySelectorAll('.panel').forEach(p => p.hidden = p.dataset.panel !== name);
      });
    });

    document.getElementById('site-title').value = data.site.title || '';
    document.getElementById('site-brand').value = data.site.brand || '';
    document.getElementById('site-hero-titles').value = (data.site.heroTitles || []).join('\n');
    document.getElementById('site-hero-subtitle').value = data.site.heroSubtitle || '';
    document.getElementById('site-footer').value = data.site.footer || '';
    document.getElementById('site-music-url').value = data.site.musicUrl || '';

    // ====== 文章管理（列表 + 富编辑器） ======
    let artFilter = 'all';
    let artKeyword = '';
    const STATUS_LABEL = { draft: '草稿', published: '已发布', unpublished: '已下架' };

    document.querySelectorAll('#art-statustabs .stab').forEach(s => {
      s.addEventListener('click', () => {
        document.querySelectorAll('#art-statustabs .stab').forEach(x => x.classList.remove('active'));
        s.classList.add('active');
        artFilter = s.dataset.st;
        renderArticleList();
      });
    });
    document.getElementById('art-search').addEventListener('input', (e) => {
      artKeyword = e.target.value.trim().toLowerCase();
      renderArticleList();
    });

    document.getElementById('add-article').addEventListener('click', () => {
      window.BlogEditor.open(null, async (saved, msg) => {
        await renderArticleList();
        showToast(msg || '已保存');
      });
    });

    document.getElementById('import-md').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const art = await window.BlogStorage.importArticleMarkdown(file);
        await renderArticleList();
        showToast('已从 Markdown 导入为草稿');
        window.BlogEditor.open(art, async () => { await renderArticleList(); });
      } catch (err) {
        showToast('导入失败: ' + err.message, true);
      }
      e.target.value = '';
    });

    await renderArticleList();
    async function renderArticleList() {
      const d = await loadData();
      let list = (d.articles || []).slice();
      if (artFilter !== 'all') list = list.filter(a => a.status === artFilter);
      if (artKeyword) {
        list = list.filter(a =>
          (a.title || '').toLowerCase().includes(artKeyword) ||
          (a.category || '').toLowerCase().includes(artKeyword) ||
          (a.tags || []).join(' ').toLowerCase().includes(artKeyword)
        );
      }
      // 置顶优先，再按更新时间倒序
      list.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.updatedAt) - new Date(a.updatedAt)));

      const box = document.getElementById('art-list');
      if (!list.length) {
        box.innerHTML = '<div class="art-empty">没有符合条件的文章。点击「写文章」开始创作吧。</div>';
        return;
      }
      box.innerHTML = list.map(a => {
        const cover = a.cover
          ? `<img class="thumb" src="${esc(a.cover)}" alt="" />`
          : `<div class="thumb">✎</div>`;
        const date = new Date(a.publishedAt || a.updatedAt).toLocaleDateString('zh-CN');
        const rt = window.MD.readingTime(a.body);
        return `
        <div class="art-item" data-id="${a.id}">
          ${cover}
          <div class="meta">
            <h4>${a.pinned ? '<span class="badge pin">置顶</span>' : ''}${esc(a.title)}</h4>
            <div class="sub">
              <span class="badge ${a.status}">${STATUS_LABEL[a.status] || a.status}</span>
              ${a.status === 'published' && d.revisions && d.revisions[a.id] ? '<span class="badge rev">有修订</span>' : ''}
              <span>${esc(a.category || '未分类')}</span>
              <span>${date}</span>
              <span>${rt.words} 字</span>
              <span>👁 ${a.views || 0}</span>
              <span>♥ ${a.likes || 0}</span>
            </div>
          </div>
          <div class="ops">
            <button data-act="edit">编辑</button>
            ${a.status === 'published'
              ? '<button data-act="unpublish">下架</button>'
              : '<button data-act="publish">发布</button>'}
            <button data-act="pin">${a.pinned ? '取消置顶' : '置顶'}</button>
            <button data-act="export">导出md</button>
            <button data-act="view">查看</button>
            <button data-act="del">删除</button>
          </div>
        </div>`;
      }).join('');

      box.querySelectorAll('.art-item').forEach(item => {
        const id = item.dataset.id;
        item.querySelectorAll('.ops button').forEach(btn => {
          btn.addEventListener('click', async () => {
            const act = btn.dataset.act;
            try {
              const art = await window.BlogStorage.getArticleById(id);
              if (act === 'edit') {
                window.BlogEditor.open(art, async (saved, msg) => { await renderArticleList(); showToast(msg || '已保存'); });
              } else if (act === 'publish') {
                await window.BlogStorage.setArticleStatus(id, 'published');
                await renderArticleList(); showToast(window.BLOG_API_BASE ? '已发布，公开网站即将更新' : '已发布');
              } else if (act === 'unpublish') {
                await window.BlogStorage.setArticleStatus(id, 'unpublished');
                await renderArticleList(); showToast('已下架');
              } else if (act === 'pin') {
                await window.BlogStorage.upsertArticle({ id, pinned: !art.pinned });
                await renderArticleList(); showToast(art.pinned ? '已取消置顶' : '已置顶');
              } else if (act === 'export') {
                await window.BlogStorage.exportArticleMarkdown(id); showToast('已导出 Markdown');
              } else if (act === 'view') {
                window.open(`article.html?id=${id}`, '_blank');
              } else if (act === 'del') {
                if (confirm(`确定删除文章「${art.title}」？此操作不可恢复。`)) {
                  await window.BlogStorage.deleteArticle(id);
                  await renderArticleList(); showToast('已删除');
                }
              }
            } catch (err) {
              showToast('操作失败：' + err.message, true);
            }
          });
        });
      });
    }

    let projects = JSON.parse(JSON.stringify(data.projects || []));
    renderProjects();
    document.getElementById('add-project').addEventListener('click', () => {
      projects.push({ id: 'p' + Date.now(), title: '', excerpt: '', tags: [], link: '#' });
      renderProjects();
    });
    function renderProjects() {
      const box = document.getElementById('project-editor');
      box.innerHTML = projects.map((p, i) => `
        <div class="editor-item" data-i="${i}">
          <div class="item-header">
            <span class="item-title">项目 #${i + 1}</span>
            <button class="btn-mini" data-act="del-project" data-i="${i}">删除</button>
          </div>
          <input data-field="title" placeholder="项目名称" value="${esc(p.title)}" />
          <textarea data-field="excerpt" placeholder="项目简介" rows="3">${esc(p.excerpt || '')}</textarea>
          <input data-field="tags" placeholder="标签，用逗号分隔" value="${esc((p.tags || []).join(', '))}" />
          <input data-field="link" placeholder="项目链接 (https://...)" value="${esc(p.link || '#')}" />
        </div>
      `).join('');
      box.querySelectorAll('.editor-item').forEach(item => {
        const idx = +item.dataset.i;
        item.querySelectorAll('[data-field]').forEach(inp => {
          inp.addEventListener('input', () => {
            const f = inp.dataset.field;
            if (f === 'tags') projects[idx].tags = inp.value.split(',').map(s => s.trim()).filter(Boolean);
            else projects[idx][f] = inp.value;
          });
        });
      });
      box.querySelectorAll('[data-act="del-project"]').forEach(btn => {
        btn.addEventListener('click', () => { projects.splice(+btn.dataset.i, 1); renderProjects(); });
      });
    }

    let contacts = JSON.parse(JSON.stringify(data.contacts || []));
    renderContacts();
    document.getElementById('add-contact').addEventListener('click', () => {
      contacts.push({ ico: '·', label: '', value: '', link: '' });
      renderContacts();
    });
    function renderContacts() {
      const box = document.getElementById('contact-editor');
      box.innerHTML = contacts.map((c, i) => `
        <div class="editor-item" data-i="${i}">
          <div class="item-header">
            <span class="item-title">联系方式 #${i + 1}</span>
            <button class="btn-mini" data-act="del-contact" data-i="${i}">删除</button>
          </div>
          <input data-field="ico" placeholder="图标符号 (如 ✉ ◎ ✦)" value="${esc(c.ico || '')}" maxlength="3" />
          <input data-field="label" placeholder="标签 (如 Email)" value="${esc(c.label || '')}" />
          <input data-field="value" placeholder="显示文本" value="${esc(c.value || '')}" />
          <input data-field="link" placeholder="链接地址" value="${esc(c.link || '')}" />
        </div>
      `).join('');
      box.querySelectorAll('.editor-item').forEach(item => {
        const idx = +item.dataset.i;
        item.querySelectorAll('[data-field]').forEach(inp => {
          inp.addEventListener('input', () => { contacts[idx][inp.dataset.field] = inp.value; });
        });
      });
      box.querySelectorAll('[data-act="del-contact"]').forEach(btn => {
        btn.addEventListener('click', () => { contacts.splice(+btn.dataset.i, 1); renderContacts(); });
      });
    }

    await renderMessages();
    async function renderMessages() {
      const d = await loadData();
      const box = document.getElementById('message-editor');
      if (!d.messages.length) {
        box.innerHTML = '<p style="opacity:.5;font-style:italic;">暂无留言</p>';
        return;
      }
      box.innerHTML = d.messages.map((m, i) => `
        <div class="editor-item">
          <div class="item-header">
            <span class="item-title">${esc(m.name)} · ${new Date(m.time).toLocaleString('zh-CN', { hour12: false })}</span>
            <button class="btn-mini" data-act="del-msg" data-i="${i}">删除</button>
          </div>
          <div style="font-size:13px;line-height:1.6;opacity:.85;">${esc(m.content)}</div>
        </div>
      `).join('');
      box.querySelectorAll('[data-act="del-msg"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            const d2 = await loadData();
            d2.messages.splice(+btn.dataset.i, 1);
            await saveData({ messages: d2.messages });
            await renderMessages();
            showToast('已删除');
          } catch (err) {
            showToast('删除失败：' + err.message, true);
          }
        });
      });
    }

    await renderComments();
    async function renderComments() {
      const box = document.getElementById('comment-editor');
      if (!box) return;
      const d = await loadData();
      const all = [];
      (d.articles || []).forEach(a => {
        (a.comments || []).forEach((c, i) => {
          all.push({ articleId: a.id, articleTitle: a.title, index: i, ...c });
        });
      });
      if (!all.length) {
        box.innerHTML = '<p style="opacity:.5;font-style:italic;">暂无文章评论</p>';
        return;
      }
      box.innerHTML = all.map(c => `
        <div class="editor-item">
          <div class="item-header">
            <span class="item-title">${esc(c.name)} · 《${esc(c.articleTitle)}》 · ${new Date(c.time).toLocaleString('zh-CN', { hour12: false })}</span>
            <button class="btn-mini" data-act="del-comment" data-id="${c.articleId}" data-i="${c.index}">删除</button>
          </div>
          <div style="font-size:13px;line-height:1.6;opacity:.85;">${esc(c.content)}</div>
        </div>
      `).join('');
      box.querySelectorAll('[data-act="del-comment"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await window.BlogStorage.deleteArticleComment(btn.dataset.id, +btn.dataset.i);
            await renderComments();
            showToast('已删除评论');
          } catch (err) {
            showToast('删除失败：' + err.message, true);
          }
        });
      });
    }

    await renderUploads();
    async function renderUploads() {
      const box = document.getElementById('upload-editor');
      if (!box) return;
      let items = [];
      try {
        if (window.BlogUpload && window.BlogUpload.dbAll) items = await window.BlogUpload.dbAll();
      } catch (e) { items = []; }
      items.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
      const fmtSize = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
      if (!items.length) {
        box.innerHTML = '<p style="opacity:.5;font-style:italic;">暂无上传的附件</p>';
        return;
      }
      box.innerHTML = items.map(it => `
        <div class="editor-item">
          <div class="item-header">
            <span class="item-title">${esc(it.name)} <span style="opacity:.55;font-size:12px;">(${fmtSize(it.size)})</span></span>
            <button class="btn-mini" data-act="del-upload" data-id="${esc(it.id)}">删除</button>
          </div>
          <div style="font-size:12px;opacity:.6;">${new Date(it.uploadedAt).toLocaleString('zh-CN', { hour12: false })}</div>
        </div>
      `).join('');
      box.querySelectorAll('[data-act="del-upload"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('确认删除该附件？')) return;
          try {
            await window.BlogUpload.dbDel(btn.dataset.id);
            await renderUploads();
            showToast('已删除附件');
          } catch (err) {
            showToast('删除失败：' + err.message, true);
          }
        });
      });
    }

    document.querySelectorAll('[data-save]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.save;
        try {
          if (type === 'site') {
            const heroTitles = document.getElementById('site-hero-titles').value
              .split('\n').map(s => s.trim()).filter(Boolean);
            await saveData({
              site: {
                ...(await loadData()).site,
                title: document.getElementById('site-title').value || '我的个人博客',
                brand: document.getElementById('site-brand').value || 'MyBlog',
                heroTitles: heroTitles.length ? heroTitles : ['你好！'],
                heroSubtitle: document.getElementById('site-hero-subtitle').value || '',
                footer: document.getElementById('site-footer').value || '',
                musicUrl: document.getElementById('site-music-url').value || '',
              }
            });
          } else if (type === 'projects') { await saveData({ projects }); }
          else if (type === 'contacts') { await saveData({ contacts }); }
          showToast('保存成功');
        } catch (err) {
          showToast('保存失败：' + err.message, true);
        }
      });
    });

    document.getElementById('change-pw-btn').addEventListener('click', async () => {
      const cur = document.getElementById('pw-current').value;
      const nw = document.getElementById('pw-new').value;
      const cf = document.getElementById('pw-confirm').value;
      const msgEl = document.getElementById('pw-msg');
      msgEl.style.color = '#ff6b8b';
      if (!cur || !nw) { msgEl.textContent = '请输入完整信息'; return; }
      if (nw.length < 4) { msgEl.textContent = '新密码至少 4 位'; return; }
      if (nw !== cf) { msgEl.textContent = '两次新密码不一致'; return; }

      const d = await loadData();
      const curHash = await sha256(cur);
      if (curHash !== d.adminPasswordHash) { msgEl.textContent = '当前密码错误'; return; }

      const newHash = await sha256(nw);
      try {
        await saveData({ adminPasswordHash: newHash });
      } catch (err) {
        msgEl.style.color = '#ff6b8b';
        msgEl.textContent = '保存失败：' + err.message;
        return;
      }
      msgEl.style.color = '#4ade80';
      msgEl.textContent = '密码已修改';
      showToast('密码修改成功');
      document.getElementById('pw-current').value = '';
      document.getElementById('pw-new').value = '';
      document.getElementById('pw-confirm').value = '';
    });

    document.getElementById('export-btn').addEventListener('click', async () => {
      await exportJSON(); showToast('已导出完整备份（含附件）');
    });
    document.getElementById('import-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await importJSON(file);
        clearCache();
        showToast('导入成功，即将刷新');
        setTimeout(() => location.reload(), 800);
      } catch (err) {
        showToast('导入失败: ' + err.message, true);
      }
      e.target.value = '';
    });

    document.getElementById('logout-btn').addEventListener('click', logout);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.BlogStorage.isPublicMirror()) {
      document.getElementById('github-login').hidden = false;
      document.getElementById('local-login-hint').hidden = true;
      const saved = document.getElementById('github-token-saved');
      const tokenInput = document.getElementById('login-token');
      if (window.BlogStorage.githubToken()) {
        saved.hidden = false;
        tokenInput.hidden = true;
        tokenInput.previousElementSibling.hidden = true;
      }
      document.getElementById('github-token-reset').addEventListener('click', () => {
        window.BlogStorage.setGithubToken('');
        saved.hidden = true;
        tokenInput.hidden = false;
        tokenInput.previousElementSibling.hidden = false;
        tokenInput.focus();
      });
    }
    if (isLoggedIn()) {
      await showAdminView();
    } else {
      bindLogin();
    }
  });
})();
