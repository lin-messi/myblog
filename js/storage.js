/**
 * storage.js —— 数据持久化层（传统脚本，挂到 window.BlogStorage）
 */
(function () {
  const LS_KEY = 'myblog_v1_data';
  const DRAFTS_KEY = 'myblog_v1_recovery_drafts';

  // 文章状态常量
  const STATUS = { DRAFT: 'draft', PUBLISHED: 'published', UNPUBLISHED: 'unpublished' };

  const DEFAULT_DATA = {
    site: {
      title: '我的个人博客',
      brand: 'MyBlog',
      heroTitles: ['你好，我是开发者', '欢迎来到我的小宇宙', '代码 · 旅行 · 思考'],
      heroSubtitle: '记录代码与生活的诗意瞬间',
      footer: '© 2026 MyBlog · Powered by 自己',
      musicUrl: '',
    },
    articles: [
      {
        id: 'a1',
        title: '使用 JavaScript 写一个视差滚动背景',
        slug: 'parallax-scroll-background',
        category: '技术',
        tags: ['前端', 'JavaScript', '动画'],
        cover: '',
        excerpt: '本文记录了我从零开始实现一个多场景视差滚动背景的过程，包括 CSS 图层堆叠、滚轮事件处理以及性能优化思路。',
        body: '# 使用 JavaScript 写一个视差滚动背景\n\n本文记录了我从零开始实现一个多场景视差滚动背景的过程。\n\n## 思路\n\n通过多层 `div` 叠加，监听滚轮事件切换场景。\n\n```js\nwindow.addEventListener("wheel", (e) => {\n  console.log(e.deltaY);\n});\n```\n\n> 性能优化是关键。\n',
        status: 'published',
        pinned: true,
        featured: false,
        publishedAt: '2026-05-10T10:00:00.000Z',
        updatedAt: '2026-05-10T10:00:00.000Z',
        views: 0,
        likes: 0,
        comments: [],
      },
      {
        id: 'a2',
        title: '一个人独立开发者的工作流程',
        slug: 'solo-developer-workflow',
        category: '随笔',
        tags: ['独立开发', '工作流'],
        cover: '',
        excerpt: '从 idea 到上线，记录我作为独立开发者时使用的工具链、时间管理方法以及踩过的坑。',
        body: '# 一个人独立开发者的工作流程\n\n从 idea 到上线的完整记录。\n\n## 工具链\n\n- 编辑器\n- 版本控制\n- 部署\n',
        status: 'published',
        pinned: false,
        featured: true,
        publishedAt: '2026-04-22T10:00:00.000Z',
        updatedAt: '2026-04-22T10:00:00.000Z',
        views: 0,
        likes: 0,
        comments: [],
      },
      {
        id: 'a3',
        title: '夜深人静时听过的几张专辑',
        slug: 'late-night-albums',
        category: '音乐',
        tags: ['音乐', '生活'],
        cover: '',
        excerpt: '深夜适合独自一人写代码或思考的时候，分享几张我常单曲循环的专辑。',
        body: '# 夜深人静时听过的几张专辑\n\n深夜写代码时的好伴侣。\n',
        status: 'published',
        pinned: false,
        featured: false,
        publishedAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        views: 0,
        likes: 0,
        comments: [],
      },
    ],
    drafts: {},
    projects: [
      { id: 'p1', title: 'Parallax Blog',
        excerpt: '一个支持多场景视差滚动的个人博客模板，所见即所得后台。',
        tags: ['HTML', 'CSS', 'JS'], link: '#' },
      { id: 'p2', title: '小工具集合',
        excerpt: '日常使用的命令行 / Web 小工具集合，涵盖文件转换、截图压缩等。',
        tags: ['Node.js', '工具'], link: '#' },
      { id: 'p3', title: 'NotebookSync',
        excerpt: '基于 Markdown 的轻量笔记同步服务，支持多端实时同步。',
        tags: ['全栈', 'Markdown'], link: '#' },
    ],
    contacts: [
      { ico: '✉', label: 'Email', value: 'you@example.com', link: 'mailto:you@example.com' },
      { ico: '◎', label: 'GitHub', value: 'github.com/yourname', link: 'https://github.com/' },
      { ico: '✦', label: 'Twitter', value: '@yourname', link: '#' },
    ],
    messages: [],
    uploads: [],
    revisions: {},
    adminPasswordHash: '',
  };

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeLocal(data) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); return true; }
    catch (e) { return false; }
  }

  // 为旧文章补齐新字段，保证向后兼容
  function normalizeArticle(a) {
    const now = new Date().toISOString();
    return {
      id: a.id || genId(),
      title: a.title || '未命名文章',
      slug: a.slug || '',
      category: a.category || '未分类',
      tags: Array.isArray(a.tags) ? a.tags : (a.tags ? String(a.tags).split(/[,，]/).map(s => s.trim()).filter(Boolean) : []),
      cover: a.cover || '',
      excerpt: a.excerpt || '',
      body: a.body || '',
      status: a.status || STATUS.PUBLISHED,
      pinned: !!a.pinned,
      featured: !!a.featured,
      publishedAt: a.publishedAt || now,
      updatedAt: a.updatedAt || a.publishedAt || now,
      views: a.views || 0,
      likes: a.likes || 0,
      comments: Array.isArray(a.comments) ? a.comments : [],
    };
  }

  function mergeDefault(data) {
    const merged = {
      ...DEFAULT_DATA,
      ...data,
      site: { ...DEFAULT_DATA.site, ...(data.site || {}) },
    };
    merged.articles = Array.isArray(data.articles)
      ? data.articles.map(normalizeArticle)
      : DEFAULT_DATA.articles.map(normalizeArticle);
    merged.drafts = data.drafts || {};
    merged.revisions = data.revisions || {};
    return merged;
  }

  let _cache = null;

  // 带缓存读取：同一标签页内复用，避免重复解析
  async function loadData() {
    if (_cache) return _cache;
    return loadDataFresh();
  }

  // 强制重新读取最新数据（本地或远端），用于保存前合并与跨标签页冲突检查
  function isPublicMirror() {
    return /(^|\.)github\.io$/.test(location.hostname);
  }
  function shapePublic(data) {
    const site = data.site || {};
    return {
      site: {
        title: site.title || '', brand: site.brand || '',
        heroTitles: Array.isArray(site.heroTitles) ? site.heroTitles : [],
        heroSubtitle: site.heroSubtitle || '', footer: site.footer || '', musicUrl: site.musicUrl || '',
      },
      articles: (data.articles || []).filter(a => a && a.status === 'published'),
      projects: data.projects || [],
      contacts: data.contacts || [],
      messages: data.messages || [],
    };
  }
  async function loadPublic() {
    if (window.BLOG_API_BASE) {
      const res = await fetch(`${window.BLOG_API_BASE}/public`, { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) throw new Error('无法读取网站内容');
      return shapePublic(await res.json());
    }
    if (isPublicMirror()) {
      let res = await fetch('https://api.github.com/repos/lin-messi/myblog/contents/published.json', {
        headers: { Accept: 'application/vnd.github.raw' }, cache: 'no-store',
      });
      if (!res.ok) res = await fetch('published.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('无法读取网站内容');
      return shapePublic(await res.json());
    }
    return loadData();
  }

  async function loadDataFresh() {
    if (window.BLOG_API_BASE) {
      try {
        const res = await fetch(`${window.BLOG_API_BASE}/config`, { cache: 'no-store', credentials: 'same-origin' });
        if (res.status === 401 || res.status === 403) throw new Error('需要重新登录');
        if (res.ok) {
          _cache = mergeDefault(await res.json());
          return _cache;
        }
      } catch (e) {
        if (e && e.message === '需要重新登录') throw e;
        /* 网络失败时保留本地编辑 */
      }
    }
    const local = readLocal();
    _cache = mergeDefault(local || {});
    if (!local || !_cache.adminPasswordHash) {
      _cache.adminPasswordHash = await sha256('admin123');
      writeLocal(_cache);
    }
    return _cache;
  }

  async function saveData(patch) {
    // 以“最新持久化数据”为基准合并补丁，避免用本标签页的陈旧缓存覆盖其它标签页的修改
    const base = await loadDataFresh();
    const next = { ...base, ...patch };

    if (window.BLOG_API_BASE) {
      let res;
      try {
        res = await fetch(`${window.BLOG_API_BASE}/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(next),
        });
      } catch (e) {
        throw new Error('保存失败：无法连接服务器（请检查网络）');
      }
      if (!res.ok) throw new Error(`保存失败：服务器返回 ${res.status}`);
      const savedText = await res.text();
      if (savedText) {
        try {
          const saved = JSON.parse(savedText);
          if (saved && saved.syncError) throw new Error('文章已保存在后台，但公开网站更新失败：' + saved.syncError);
        } catch (e) {
          if (e && String(e.message).includes('公开网站更新失败')) throw e;
        }
      }
      writeLocal(next);
      _cache = next;
      return next;
    }

    // 本地模式：只有成功写入本地存储才算保存成功
    let ok = false;
    try { ok = writeLocal(next); } catch (e) { ok = false; }
    if (!ok) throw new Error('保存失败：浏览器存储空间不足或不可用，请先导出备份并清理空间');
    _cache = next;
    return next;
  }

  // ============ 文章专用方法 ============

  function genId() {
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function slugify(title) {
    const base = String(title || '')
      .trim().toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60);
    return base || 'post-' + Date.now().toString(36);
  }

  async function getArticles() {
    const data = await loadDataFresh();
    return data.articles || [];
  }

  async function getArticleById(id) {
    const list = await getArticles();
    return list.find(a => a.id === id) || null;
  }

  // 新建或更新文章；传入对象含 id 则更新，否则新建
  async function upsertArticle(article) {
    const data = await loadDataFresh();
    const list = data.articles.slice();
    const now = new Date().toISOString();
    let item;
    if (article.id) {
      const idx = list.findIndex(a => a.id === article.id);
      if (idx >= 0) {
        item = normalizeArticle({ ...list[idx], ...article, updatedAt: now });
        list[idx] = item;
      } else {
        item = normalizeArticle({ ...article, updatedAt: now });
        list.push(item);
      }
    } else {
      const id = genId();
      item = normalizeArticle({
        ...article,
        id,
        slug: article.slug || slugify(article.title),
        publishedAt: article.status === STATUS.PUBLISHED ? now : (article.publishedAt || now),
        updatedAt: now,
      });
      list.push(item);
    }
    await saveData({ articles: list });
    return item;
  }

  async function deleteArticle(id) {
    const data = await loadDataFresh();
    const list = data.articles.filter(a => a.id !== id);
    await saveData({ articles: list });
    return list;
  }

  // 修改文章状态（草稿 / 发布 / 下架）
  async function setArticleStatus(id, status) {
    const data = await loadDataFresh();
    const list = data.articles.slice();
    const idx = list.findIndex(a => a.id === id);
    if (idx < 0) return null;
    const now = new Date().toISOString();
    const wasPublished = list[idx].status === STATUS.PUBLISHED;
    list[idx] = {
      ...list[idx],
      status,
      updatedAt: now,
      publishedAt: (status === STATUS.PUBLISHED && !wasPublished) ? now : list[idx].publishedAt,
    };
    await saveData({ articles: list });
    return list[idx];
  }

  // 点赞 + 阅读计数（本地）
  async function incView(id) {
    if (window.BLOG_API_BASE) {
      const res = await fetch(`${window.BLOG_API_BASE}/view`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ id }),
      });
      if (!res.ok) return 0;
      return (await res.json()).views || 0;
    }
    if (isPublicMirror()) {
      const data = await loadPublic();
      const article = (data.articles || []).find(a => a.id === id);
      return article ? (article.views || 0) : 0;
    }
    const data = await loadDataFresh();
    const list = data.articles.slice();
    const idx = list.findIndex(a => a.id === id);
    if (idx < 0) return 0;
    list[idx] = { ...list[idx], views: (list[idx].views || 0) + 1 };
    await saveData({ articles: list });
    return list[idx].views;
  }

  async function toggleLike(id) {
    const likedKey = 'myblog_liked';
    let liked = [];
    try { liked = JSON.parse(localStorage.getItem(likedKey) || '[]'); } catch (e) {}
    const has = liked.includes(id);
    if (window.BLOG_API_BASE || isPublicMirror()) {
      let likes = 0;
      if (window.BLOG_API_BASE) {
        const res = await fetch(`${window.BLOG_API_BASE}/like`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ id, liked: !has }),
        });
        if (!res.ok) throw new Error('点赞失败');
        likes = (await res.json()).likes || 0;
      } else {
        const data = await loadPublic();
        const article = (data.articles || []).find(a => a.id === id);
        likes = Math.max(0, ((article && article.likes) || 0) + (has ? -1 : 1));
      }
      liked = has ? liked.filter(x => x !== id) : liked.concat(id);
      localStorage.setItem(likedKey, JSON.stringify(liked));
      return { likes, liked: !has };
    }
    const data = await loadDataFresh();
    const list = data.articles.slice();
    const idx = list.findIndex(a => a.id === id);
    if (idx < 0) return { likes: 0, liked: false };
    if (has) {
      liked = liked.filter(x => x !== id);
      list[idx] = { ...list[idx], likes: Math.max(0, (list[idx].likes || 0) - 1) };
    } else {
      liked.push(id);
      list[idx] = { ...list[idx], likes: (list[idx].likes || 0) + 1 };
    }
    localStorage.setItem(likedKey, JSON.stringify(liked));
    await saveData({ articles: list });
    return { likes: list[idx].likes, liked: !has };
  }

  function hasLiked(id) {
    try { return JSON.parse(localStorage.getItem('myblog_liked') || '[]').includes(id); }
    catch (e) { return false; }
  }

  // 文章评论（本地 + 预留 API）
  async function addArticleComment(id, comment) {
    if (isPublicMirror() && !window.BLOG_API_BASE) throw new Error('公开网页不开放评论，请使用联系方式');
    if (window.BLOG_API_BASE) {
      const res = await fetch(`${window.BLOG_API_BASE}/comment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ id, name: comment.name, content: comment.content }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || '评论提交失败');
      return (body.comments || [])[0] || null;
    }
    const data = await loadDataFresh();
    const list = data.articles.slice();
    const idx = list.findIndex(a => a.id === id);
    if (idx < 0) return null;
    const c = { name: comment.name, content: comment.content, time: new Date().toISOString() };
    list[idx] = { ...list[idx], comments: [c, ...(list[idx].comments || [])] };
    await saveData({ articles: list });
    return c;
  }

  // 删除某篇文章的某条评论（按数组下标）
  async function addMessage(message) {
    if (isPublicMirror() && !window.BLOG_API_BASE) throw new Error('公开网页不开放留言，请使用联系方式');
    if (window.BLOG_API_BASE) {
      const res = await fetch(`${window.BLOG_API_BASE}/message`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify(message),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || '留言发送失败');
      return true;
    }
    const cur = await loadData();
    cur.messages.unshift({ id: Date.now(), name: message.name, content: message.content, time: Date.now() });
    if (cur.messages.length > 50) cur.messages.length = 50;
    await saveData({ messages: cur.messages });
    return true;
  }

  async function deleteArticleComment(articleId, commentIndex) {
    const data = await loadDataFresh();
    const list = data.articles.slice();
    const idx = list.findIndex(a => a.id === articleId);
    if (idx < 0) return false;
    const comments = (list[idx].comments || []).slice();
    if (commentIndex < 0 || commentIndex >= comments.length) return false;
    comments.splice(commentIndex, 1);
    list[idx] = { ...list[idx], comments };
    await saveData({ articles: list });
    return true;
  }

  // ============ 草稿自动保存（编辑中的临时内容，独立于正式文章） ============
  async function saveDraft(key, draft) {
    // 恢复草稿独立保存在本机，断网或刷新远端缓存都不能将其覆盖。
    const drafts = readRecoveryDrafts();
    drafts[key] = { ...draft, savedAt: new Date().toISOString() };
    try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)); }
    catch (e) { throw new Error('浏览器无法保存恢复草稿，请保留编辑器并复制内容备份'); }
    return drafts[key];
  }
  function readRecoveryDrafts() {
    const raw = localStorage.getItem(DRAFTS_KEY);
    return raw ? JSON.parse(raw) : {};
  }
  async function getDraft(key) {
    const local = readRecoveryDrafts()[key];
    if (local) return local;
    const data = await loadDataFresh();
    return (data.drafts || {})[key] || null;
  }
  async function clearDraft(key) {
    const recovery = readRecoveryDrafts();
    delete recovery[key];
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(recovery));
    const data = await loadDataFresh();
    if (!data.drafts || !data.drafts[key]) return;
    const drafts = { ...(data.drafts || {}) };
    delete drafts[key];
    await saveData({ drafts });
  }

  // ============ 修订草稿（已发布文章的暂存修改，不影响线上版本） ============
  async function saveRevision(articleId, revision) {
    const data = await loadDataFresh();
    const revisions = { ...(data.revisions || {}) };
    revisions[articleId] = { ...revision, updatedAt: new Date().toISOString() };
    await saveData({ revisions });
    return revisions[articleId];
  }
  async function getRevision(articleId) {
    const data = await loadData();
    return (data.revisions || {})[articleId] || null;
  }
  async function clearRevision(articleId) {
    const data = await loadDataFresh();
    const revisions = { ...(data.revisions || {}) };
    delete revisions[articleId];
    await saveData({ revisions });
  }

  // ============ 导入 / 导出 ============

  // FileReader 读 Blob 为 base64 dataURL
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  // base64 dataURL 还原为 Blob
  function dataURLToBlob(dataURL) {
    const parts = String(dataURL).split(',');
    const mime = (parts[0].match(/data:(.*?)(;|$)/) || [])[1] || 'application/octet-stream';
    const bin = atob(parts[1] || '');
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  async function exportJSON() {
    const data = await loadDataFresh();
    // 读取附件（IndexedDB），base64 后一起打包，保证备份可完整恢复
    let attachments = [];
    try {
      if (window.BlogUpload && window.BlogUpload.dbAll) {
        const files = await window.BlogUpload.dbAll();
        attachments = await Promise.all(files.map(async (f) => ({
          id: f.id, name: f.name, size: f.size, type: f.type, uploadedAt: f.uploadedAt,
          data: await blobToBase64(f.blob),
        })));
      }
    } catch (e) { console.warn('[backup] 读取附件失败', e); }

    const payload = {
      ...data,
      drafts: { ...(data.drafts || {}), ...readRecoveryDrafts() },
      _meta: { format: 'myblog-backup', version: 1, exportedAt: new Date().toISOString(), attachments: attachments.length },
      _attachments: attachments,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `myblog-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJSON(file) {
    const text = await file.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('备份文件不是有效的 JSON'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('备份文件格式不正确');
    if (!data.site && !data.articles) throw new Error('备份文件缺少必要字段（site / articles）');

    const attachments = Array.isArray(data._attachments) ? data._attachments : [];
    delete data._attachments;
    delete data._meta;

    _cache = mergeDefault(data);
    let ok = false;
    try { ok = writeLocal(_cache); } catch (e) { ok = false; }
    if (!ok) throw new Error('导入失败：浏览器存储空间不足或不可用');

    // 恢复附件到 IndexedDB
    if (attachments.length && window.BlogUpload && window.BlogUpload.dbPut) {
      for (const att of attachments) {
        if (!att || !att.data) continue;
        try {
          const blob = dataURLToBlob(att.data);
          await window.BlogUpload.dbPut({
            id: att.id, name: att.name || 'file', size: att.size || 0,
            type: att.type || 'application/octet-stream', uploadedAt: att.uploadedAt || Date.now(), blob,
          });
        } catch (e) { console.warn('[import] 恢复附件失败', att.name, e); }
      }
    }
    return _cache;
  }

  // 导出单篇文章为 Markdown（含 front-matter）
  function articleToMarkdown(a) {
    const fm = [
      '---',
      `title: ${a.title}`,
      `category: ${a.category}`,
      `tags: ${(a.tags || []).join(', ')}`,
      `cover: ${a.cover || ''}`,
      `date: ${a.publishedAt}`,
      `excerpt: ${(a.excerpt || '').replace(/\n/g, ' ')}`,
      '---',
      '',
    ].join('\n');
    return fm + (a.body || '');
  }

  async function exportArticleMarkdown(id) {
    const a = await getArticleById(id);
    if (!a) return;
    const md = articleToMarkdown(a);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${a.slug || a.id}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // 解析 Markdown 文件（支持可选 front-matter）创建文章
  function parseMarkdownFile(text) {
    const meta = { title: '', category: '未分类', tags: [], cover: '', excerpt: '', body: text };
    const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (fmMatch) {
      const block = fmMatch[1];
      meta.body = text.slice(fmMatch[0].length);
      block.split('\n').forEach(line => {
        const m = line.match(/^(\w+):\s*(.*)$/);
        if (!m) return;
        const [, k, v] = m;
        if (k === 'tags') meta.tags = v.split(/[,，]/).map(s => s.trim()).filter(Boolean);
        else if (k === 'date') meta.publishedAt = v.trim();
        else if (meta.hasOwnProperty(k)) meta[k] = v.trim();
      });
    }
    if (!meta.title) {
      const h1 = meta.body.match(/^#\s+(.+)$/m);
      meta.title = h1 ? h1[1].trim() : '导入的文章';
    }
    if (!meta.excerpt) {
      const plain = meta.body.replace(/^#.*$/gm, '').replace(/[#>*`\-]/g, '').trim();
      meta.excerpt = plain.slice(0, 100);
    }
    return meta;
  }

  async function importArticleMarkdown(file) {
    const text = await file.text();
    const meta = parseMarkdownFile(text);
    return upsertArticle({
      title: meta.title,
      category: meta.category,
      tags: meta.tags,
      cover: meta.cover,
      excerpt: meta.excerpt,
      body: meta.body,
      status: STATUS.DRAFT,
      publishedAt: meta.publishedAt,
    });
  }

  function clearCache() { _cache = null; }

  // 跨标签页同步：其它标签页写入后，让本页缓存失效，下次读写基于最新数据
  window.addEventListener('storage', (e) => {
    if (e.key === LS_KEY) _cache = null;
  });
  if (isPublicMirror()) {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('a[href="admin.html"]').forEach(a => a.remove());
    });
  }

  window.BlogStorage = {
    STATUS,
    loadData, loadDataFresh, loadPublic, saveData, sha256, exportJSON, importJSON, clearCache, isPublicMirror, addMessage,
    // 文章
    getArticles, getArticleById, upsertArticle, deleteArticle, setArticleStatus,
    incView, toggleLike, hasLiked, addArticleComment, deleteArticleComment, slugify, genId,
    // 草稿
    saveDraft, getDraft, clearDraft,
    // 修订草稿
    saveRevision, getRevision, clearRevision,
    // markdown 导入导出
    exportArticleMarkdown, importArticleMarkdown, articleToMarkdown,
  };
})();
