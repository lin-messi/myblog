/**
 * storage.js —— 数据持久化层（传统脚本，挂到 window.BlogStorage）
 */
(function () {
  const LS_KEY = 'myblog_v1_data';
  const DRAFTS_KEY = 'myblog_v1_recovery_drafts';

  // 文章状态常量
  const STATUS = { DRAFT: 'draft', PUBLISHED: 'published', UNPUBLISHED: 'unpublished' };
  // 系列连载状态
  const SERIES_STATUS = { ONGOING: 'ongoing', FINISHED: 'finished' };

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
    series: [],
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

  // 章节顺序规范化：0 是有效值，空串/null/非数字按“未填写”处理
  function normalizeOrder(v) {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function genSeriesId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function genGroupId() {
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function normalizeGroup(g) {
    return {
      id: g.id || genGroupId(),
      title: g.title || '未命名分组',
      order: (g.order == null || g.order === '') ? 0 : (Number(g.order) || 0),
    };
  }
  function normalizeSeries(s) {
    return {
      id: s.id || genSeriesId(),
      title: s.title || '未命名系列',
      description: s.description || '',
      cover: s.cover || '',
      order: (s.order == null || s.order === '') ? 0 : (Number(s.order) || 0),
      status: s.status === SERIES_STATUS.FINISHED ? SERIES_STATUS.FINISHED : SERIES_STATUS.ONGOING,
      groups: Array.isArray(s.groups) ? s.groups.map(normalizeGroup).sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id))) : [],
    };
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
      seriesId: a.seriesId || '',
      seriesGroupId: a.seriesGroupId || '',
      seriesOrder: normalizeOrder(a.seriesOrder),
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
    merged.series = Array.isArray(data.series) ? data.series.map(normalizeSeries) : [];
    return merged;
  }

  let _cache = null;

  // 带缓存读取：同一标签页内复用，避免重复解析
  async function loadData() {
    if (_cache) return _cache;
    return loadDataFresh();
  }

  // 强制重新读取最新数据（本地或远端），用于保存前合并与跨标签页冲突检查
  const GITHUB_TOKEN_KEY = 'myblog_github_token';
  const PRIVATE_REPO = 'lin-messi/myblog-data';
  const PUBLIC_REPO = 'lin-messi/myblog';
  const GITHUB_RAW_JSON = 'application/vnd.github.raw+json';
  const GITHUB_FILE_LIMIT = 100000000;
  const GITHUB_TIMEOUT_MS = 30000;
  function isPublicMirror() {
    return /(^|\.)github\.io$/.test(location.hostname);
  }
  function githubToken() {
    try { return localStorage.getItem(GITHUB_TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setGithubToken(token) {
    if (token) localStorage.setItem(GITHUB_TOKEN_KEY, token);
    else localStorage.removeItem(GITHUB_TOKEN_KEY);
  }
  function remoteAdmin() {
    return isPublicMirror() && /admin\.html$/.test(location.pathname) && !!githubToken();
  }
  function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    const chunks = [];
    for (let i = 0; i < bytes.length; i += 0x8000) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
    }
    return btoa(chunks.join(''));
  }
  function cloudError(message, code, retryable = false) {
    const error = new Error(message);
    error.code = code;
    error.retryable = retryable;
    return error;
  }
  async function githubContents(token, repo, file, method, body, accept) {
    const verb = method || 'GET';
    for (let attempt = 0; attempt < (verb === 'GET' ? 2 : 1); attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
      try {
        const res = await fetch('https://api.github.com/repos/' + repo + '/contents/' + file, {
          method: verb,
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
            Accept: accept || 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 404 && verb === 'GET') return null;
        if (!res.ok) {
          const info = await res.json().catch(() => ({}));
          if (res.status === 429 || (res.status === 403 && (res.headers.get('retry-after') || res.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(info.message || '')))) {
            throw cloudError('GitHub 请求次数暂时受限，请稍后重试；登录令牌仍会保留', 'GITHUB_RATE_LIMIT');
          }
          if (res.status === 401) throw cloudError('GitHub 令牌无效或已过期，请重新授权', 'GITHUB_AUTH');
          if (res.status === 413 || /too large|exceeds.*size|larger than.*MB|up to 100 MB/i.test(info.message || '')) {
            throw cloudError('云端数据文件超过 GitHub 容量限制，请先拆分数据或迁移存储', 'GITHUB_SIZE');
          }
          if (res.status === 403 || res.status === 404) throw cloudError('无法访问或写入 GitHub 仓库，请检查令牌权限和仓库是否存在', 'GITHUB_PERMISSION');
          if (res.status === 409) throw cloudError('云端数据已发生变化，本次未覆盖，请刷新核对后重试', 'GITHUB_CONFLICT');
          throw cloudError('GitHub 服务暂时无法完成请求（' + res.status + '），请稍后重试', 'GITHUB_UNAVAILABLE', res.status >= 500);
        }
        try { return await res.json(); }
        catch (error) {
          if (error.name === 'SyntaxError') throw cloudError('云端返回的文件不是有效 JSON，已停止读取和保存，请检查数据文件', 'GITHUB_INVALID_JSON');
          throw error;
        }
      } catch (cause) {
        const error = typeof cause.code === 'string' && cause.code.startsWith('GITHUB_') ? cause : cloudError(
          controller.signal.aborted ? '连接 GitHub 超时，请检查网络后重试' : '无法连接 GitHub，请检查网络后重试',
          controller.signal.aborted ? 'GITHUB_TIMEOUT' : 'GITHUB_NETWORK', true);
        if (verb !== 'GET' || attempt > 0 || !error.retryable) throw error;
      } finally { clearTimeout(timer); }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  function validateCloudData(data, isPrivate) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.articles) ||
        (isPrivate && (typeof data.adminPasswordHash !== 'string' || !data.adminPasswordHash))) {
      throw cloudError('云端数据文件格式不正确，已停止读取和保存，请检查备份', 'GITHUB_INVALID_DATA');
    }
    return data;
  }
  async function readPrivateBlog() {
    // 大小文件统一读取原始 JSON，不再依赖超过 1 MB 就消失的 content 字段。
    const data = await githubContents(githubToken(), PRIVATE_REPO, 'blog.json', 'GET', undefined, GITHUB_RAW_JSON);
    if (data === null) throw cloudError('未找到云端博客数据文件，请检查仓库和令牌权限', 'GITHUB_MISSING');
    return validateCloudData(data, true);
  }
  function publishedPayload(data) {
    const view = shapePublic(data);
    view.articles = view.articles.map(a => ({
      id: a.id, title: a.title || '', slug: a.slug || '', category: a.category || '未分类',
      tags: Array.isArray(a.tags) ? a.tags : [], cover: a.cover || '', excerpt: a.excerpt || '',
      body: a.body || '', status: 'published', pinned: !!a.pinned, featured: !!a.featured,
      publishedAt: a.publishedAt, updatedAt: a.updatedAt, views: a.views || 0, likes: a.likes || 0,
      seriesId: a.seriesId || '', seriesGroupId: a.seriesGroupId || '', seriesOrder: normalizeOrder(a.seriesOrder),
      comments: (a.comments || []).map(c => ({ name: String(c.name || ''), content: String(c.content || ''), time: c.time || '' })),
    }));
    view.messages = (view.messages || []).map(m => ({ id: m.id, name: String(m.name || ''), content: String(m.content || ''), time: m.time || '' }));
    return view;
  }
  function checkGithubSize(serialized) {
    if (new Blob([serialized]).size > GITHUB_FILE_LIMIT) {
      throw cloudError('云端单个数据文件超过 100 MB，已停止保存，请先拆分数据或迁移存储', 'GITHUB_SIZE');
    }
  }
  async function putGithubJson(token, repo, file, serialized, message) {
    const meta = await githubContents(token, repo, file);
    const body = { message, content: utf8ToBase64(serialized), branch: 'main' };
    if (meta && meta.sha) body.sha = meta.sha;
    const saved = await githubContents(token, repo, file, 'PUT', body);
    if (!saved || !saved.content || !saved.content.sha) {
      throw cloudError('GitHub 未返回保存确认，请先核对云端内容后重试', 'GITHUB_WRITE_UNCONFIRMED');
    }
  }
  function shapePublic(data) {
    const site = data.site || {};
    const articles = (data.articles || []).filter(a => a && a.status === 'published');
    const seriesIds = new Set(articles.map(a => a.seriesId).filter(Boolean));
    return {
      site: {
        title: site.title || '', brand: site.brand || '',
        heroTitles: Array.isArray(site.heroTitles) ? site.heroTitles : [],
        heroSubtitle: site.heroSubtitle || '', footer: site.footer || '', musicUrl: site.musicUrl || '',
      },
      articles,
      series: Array.isArray(data.series) ? data.series.filter(s => seriesIds.has(s.id)).map(s => {
        const item = normalizeSeries(s);
        const groupIds = new Set(articles.filter(a => a.seriesId === s.id).map(a => a.seriesGroupId));
        item.groups = item.groups.filter(g => groupIds.has(g.id));
        return item;
      }) : [],
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
      try {
        const data = await githubContents('', PUBLIC_REPO, 'published.json', 'GET', undefined, GITHUB_RAW_JSON);
        if (data) return shapePublic(validateCloudData(data, false));
      } catch (error) { /* API 不可达或限流时，继续读取公开站点中的数据文件。 */ }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
      try {
        const res = await fetch('published.json?t=' + Date.now(), { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return shapePublic(validateCloudData(await res.json(), false));
      } catch (error) {
        throw cloudError('无法读取公开文章，请检查网络后刷新', 'PUBLIC_UNAVAILABLE');
      } finally { clearTimeout(timer); }
    }
    return loadData();
  }

  async function loadDataFresh() {
    if (remoteAdmin()) {
      _cache = mergeDefault(await readPrivateBlog());
      return _cache;
    }
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

  let lastPublishedJson = '';
  let remoteChain = Promise.resolve();
  function enqueueRemoteSave(task) {
    const run = remoteChain.then(task, task);
    remoteChain = run.then(() => {}, () => {});
    return run;
  }

  async function saveData(patch) {
    if (remoteAdmin()) return enqueueRemoteSave(() => persistPatch(patch));
    return persistPatch(patch);
  }

  async function persistPatch(patch) {
    // 以“最新持久化数据”为基准合并补丁，避免用本标签页的陈旧缓存覆盖其它标签页的修改
    const base = await loadDataFresh();
    const next = { ...base, ...patch };

    if (remoteAdmin()) {
      const token = githubToken();
      const published = publishedPayload(next);
      const serialized = JSON.stringify(published);
      const privateJson = JSON.stringify(next);
      // 两份文件都先校验，避免私有数据写入后才发现公开文件超过容量。
      checkGithubSize(privateJson);
      checkGithubSize(serialized);
      await putGithubJson(token, PRIVATE_REPO, 'blog.json', privateJson, 'Save blog data');
      _cache = next;
      if (serialized !== lastPublishedJson) {
        try { await putGithubJson(token, PUBLIC_REPO, 'published.json', serialized, 'Publish articles'); }
        catch (cause) {
          const error = cloudError('文章已保存到云端，但公开网站同步未完成：' + cause.message + '。请重试保存以继续同步', 'GITHUB_PUBLIC_SYNC');
          error.saved = true;
          throw error;
        }
        lastPublishedJson = serialized;
      }
      return next;
    }

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
        item = normalizeArticle({
          ...article,
          slug: article.slug || slugify(article.title),
          publishedAt: article.status === STATUS.PUBLISHED ? now : (article.publishedAt || now),
          updatedAt: now,
        });
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

  // ============ 系列 / 专栏 ============
  async function getSeriesList() {
    const data = await loadDataFresh();
    const series = (data.series || []).slice();
    series.sort((a, b) => (a.order - b.order) || String(a.title).localeCompare(String(b.title)));
    return series;
  }
  async function getSeriesById(id) {
    const list = await getSeriesList();
    return list.find(s => s.id === id) || null;
  }
  // 新建或更新系列；含 id 则更新，否则新建
  async function upsertSeries(series) {
    const data = await loadDataFresh();
    const list = (data.series || []).slice();
    const item = normalizeSeries(series);
    const idx = list.findIndex(s => s.id === item.id);
    if (idx >= 0) list[idx] = item; else list.push(item);
    await saveData({ series: list });
    return item;
  }
  // 删除系列：保留文章正文，仅清除文章上的系列关联
  async function deleteSeries(id) {
    const data = await loadDataFresh();
    const series = (data.series || []).filter(s => s.id !== id);
    const articles = (data.articles || []).map(a =>
      (a.seriesId === id) ? { ...a, seriesId: '', seriesGroupId: '', seriesOrder: null } : a
    );
    await saveData({ series, articles });
    return series;
  }
  // 删除分组：保留文章正文，清除该分组下文章的 group 关联
  async function deleteSeriesGroup(seriesId, groupId) {
    const data = await loadDataFresh();
    const series = (data.series || []).map(s =>
      s.id === seriesId
        ? { ...s, groups: (s.groups || []).filter(g => g.id !== groupId) }
        : s
    );
    const articles = (data.articles || []).map(a =>
      (a.seriesId === seriesId && a.seriesGroupId === groupId) ? { ...a, seriesGroupId: '' } : a
    );
    await saveData({ series, articles });
    return series;
  }
  // 章节排序：分组顺序 → 章节顺序（0 起始、允许留空）→ 稳定备用（updatedAt 倒序 + id）
  function compareSeriesArticles(series, a, b) {
    const groups = ((series && series.groups) || []).slice().sort((a, b) => (a.order - b.order) || String(a.id).localeCompare(String(b.id)));
    const groupIndexOf = (gid) => {
      const i = groups.findIndex(g => g.id === gid);
      return i < 0 ? groups.length : i;
    };
    const ga = groupIndexOf(a && a.seriesGroupId);
    const gb = groupIndexOf(b && b.seriesGroupId);
    if (ga !== gb) return ga - gb;
    const oa = normalizeOrder(a && a.seriesOrder);
    const ob = normalizeOrder(b && b.seriesOrder);
    const aHas = oa != null, bHas = ob != null;
    if (aHas && bHas && oa !== ob) return oa - ob;
    if (aHas !== bHas) return aHas ? -1 : 1;
    const u = String((b && b.updatedAt) || '').localeCompare(String((a && a.updatedAt) || ''));
    return u !== 0 ? u : String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
  }
  // 按系列顺序给一组文章排序（不修改原数组）
  function sortSeriesArticles(series, articles) {
    return (articles || []).slice().sort((a, b) => compareSeriesArticles(series, a, b));
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
    if (remoteAdmin()) {
      const token = githubToken();
      await putGithubJson(token, PRIVATE_REPO, 'blog.json', _cache, 'Import blog data');
      await putGithubJson(token, PUBLIC_REPO, 'published.json', publishedPayload(_cache), 'Publish articles');
    } else {
      let ok = false;
      try { ok = writeLocal(_cache); } catch (e) { ok = false; }
      if (!ok) throw new Error('导入失败：浏览器存储空间不足或不可用');
    }

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

  // 批量导入多篇文章：单次持久化，避免逐篇触发整库写入/公开发布
  async function importArticles(articles) {
    const data = await loadDataFresh();
    const list = data.articles.slice();
    const byId = new Map(list.map(a => [a.id, a]));
    const now = new Date().toISOString();
    const added = [];
    const returned = new Set();
    for (const a of (articles || [])) {
      const item = normalizeArticle({
        ...a,
        id: a.id || genId(),
        slug: a.slug || slugify(a.title),
        publishedAt: a.status === STATUS.PUBLISHED ? now : (a.publishedAt || now),
        updatedAt: now,
      });
      const existing = byId.get(item.id);
      if (existing) {
        // 私有数据写入成功、公开同步失败等情况，重试使用同一标识。
        // 保留已提交版本和阅读统计，绝不重复追加或覆盖后来修改的文章。
        const fields = ['title','slug','category','tags','cover','excerpt','body','status','seriesId','seriesGroupId','seriesOrder'];
        if (fields.some(key => JSON.stringify(existing[key]) !== JSON.stringify(item[key]))) {
          throw new Error('部分文章已保存且内容发生变化，请先在文章管理中核对后重新选择文件');
        }
      } else {
        list.push(item);
        byId.set(item.id, item);
      }
      if (!returned.has(item.id)) { added.push(existing || item); returned.add(item.id); }
    }
    await saveData({ articles: list });
    return added;
  }

  function clearCache() { _cache = null; }

  // 跨标签页同步：其它标签页写入后，让本页缓存失效，下次读写基于最新数据
  window.addEventListener('storage', (e) => {
    if (e.key === LS_KEY) _cache = null;
  });
  window.BlogStorage = {
    STATUS, SERIES_STATUS,
    loadData, loadDataFresh, loadPublic, saveData, sha256, exportJSON, importJSON, clearCache, isPublicMirror, githubToken, setGithubToken, addMessage,
    // 文章
    getArticles, getArticleById, upsertArticle, deleteArticle, setArticleStatus,
    incView, toggleLike, hasLiked, addArticleComment, deleteArticleComment, slugify, genId,
    // 草稿
    saveDraft, getDraft, clearDraft,
    // 修订草稿
    saveRevision, getRevision, clearRevision,
    // 系列
    getSeriesList, getSeriesById, upsertSeries, deleteSeries, deleteSeriesGroup,
    compareSeriesArticles, sortSeriesArticles, normalizeOrder, genSeriesId, genGroupId,
    // markdown 导入导出
    exportArticleMarkdown, importArticleMarkdown, articleToMarkdown, parseMarkdownFile, importArticles,
  };
})();
