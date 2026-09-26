/**
 * article-view.js —— 文章详情页逻辑
 * 读取 ?id=xxx，渲染正文 / TOC / 上下篇 / 相关文章 / 点赞 / 评论
 */
(function () {
  const S = window.BlogStorage;

  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch (e) { return iso; }
  }

  async function init() {
    const id = qs('id');
    let data = await S.loadPublic();
    let article = (data.articles || []).find(a => a.id === id);
    if (!article && window.BLOG_API_BASE) {
      try {
        const full = await S.loadDataFresh();
        article = (full.articles || []).find(a => a.id === id);
        if (article) data = full;
      } catch (e) { /* 访客看不到草稿 */ }
    }
    document.getElementById('nav-brand').textContent = data.site.brand || 'MyBlog';
    if (!article) {
      document.getElementById('loading').innerHTML =
        '文章不存在或已被删除。<br/><a href="articles.html" style="color:#8fb0ff">← 返回文章列表</a>';
      return;
    }
    if (article.status !== 'published') {
      // 非发布状态：提示但仍允许预览（从后台「查看」过来）
      document.getElementById('loading').innerHTML =
        `此文章当前为「${article.status === 'draft' ? '草稿' : '已下架'}」状态，仅作预览。`;
      setTimeout(() => { document.getElementById('loading').hidden = true; }, 2000);
    } else {
      document.getElementById('loading').hidden = true;
    }

    document.title = `${article.title} · ${data.site.brand || 'MyBlog'}`;
    // 摘要描述 / 分享卡片信息（从文章数据填充）
    const desc = (article.excerpt || window.MD.plain(article.body)).slice(0, 160);
    const setMeta = (sel, val) => { const el = document.querySelector(sel); if (el) el.setAttribute('content', val); };
    setMeta('meta[name="description"]', desc);
    setMeta('meta[property="og:title"]', article.title);
    setMeta('meta[property="og:description"]', desc);
    render(article, data);

    // 阅读计数（每个浏览器对每篇文章只计一次，避免刷新灌水）
    const viewedKey = 'myblog_viewed';
    let viewed = [];
    try { viewed = JSON.parse(localStorage.getItem(viewedKey) || '[]'); } catch (e) {}
    if (!viewed.includes(id)) {
      try {
        const v = await S.incView(id);
        viewed.push(id);
        localStorage.setItem(viewedKey, JSON.stringify(viewed));
        document.getElementById('art-views').textContent = `👁 ${v}`;
      } catch (e) {
        // 阅读计数失败不影响正文阅读（计数属尽力而为）
        console.warn('[article] 阅读计数失败', e);
      }
    }
  }

  function render(article, data) {
    document.getElementById('article-root').hidden = false;

    // 封面
    if (article.cover) {
      const cov = document.getElementById('art-cover');
      cov.src = article.cover; cov.hidden = false;
    }
    document.getElementById('art-title').textContent = article.title;
    document.getElementById('art-cat').textContent = article.category || '未分类';
    document.getElementById('art-date').textContent = fmtDate(article.publishedAt);
    const rt = window.MD.readingTime(article.body);
    document.getElementById('art-rt').textContent = `${rt.words} 字 · 约 ${rt.minutes} 分钟`;
    document.getElementById('art-views').textContent = `👁 ${article.views || 0}`;
    if (article.updatedAt && article.updatedAt !== article.publishedAt) {
      const d = document.createElement('span');
      d.textContent = `更新于 ${fmtDate(article.updatedAt)}`;
      document.getElementById('art-date').after(d);
    }

    document.getElementById('art-tags').innerHTML =
      (article.tags || []).map(t => `<a class="tag" href="articles.html?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('');

    // 正文
    const content = document.getElementById('art-content');
    content.innerHTML = window.MD.render(article.body);
    window.MD.bindCopyButtons(content);

    buildTOC(article.body);
    buildLike(article);
    buildPrevNext(article, data);
    buildRelated(article, data);
    buildComments(article);
  }

  // ====== 目录 ======
  function buildTOC(body) {
    const toc = window.MD.toc(body).filter(h => h.level >= 2 && h.level <= 4);
    if (!toc.length) return;
    const itemsHTML = toc.map(h =>
      `<li class="lvl-${h.level}"><a href="#${h.slug}" data-slug="${h.slug}">${esc(h.text)}</a></li>`
    ).join('');

    // 桌面侧栏
    const side = document.getElementById('toc-side');
    const list = document.getElementById('toc-list');
    side.hidden = false;
    list.innerHTML = itemsHTML;

    // 移动端折叠目录（<details>）
    const mobile = document.getElementById('toc-mobile');
    const mobileList = document.getElementById('toc-list-mobile');
    if (mobile && mobileList) {
      mobile.hidden = false;
      mobileList.innerHTML = itemsHTML;
    }

    // 平滑滚动（两个列表共用）
    const allLinks = Array.from(list.querySelectorAll('a'));
    if (mobileList) allLinks.push(...Array.from(mobileList.querySelectorAll('a')));
    allLinks.forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const el = document.getElementById(a.dataset.slug);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // 滚动高亮当前章节（桌面侧栏）
    const headings = toc.map(h => document.getElementById(h.slug)).filter(Boolean);
    const links = Array.from(list.querySelectorAll('a'));
    function onScroll() {
      let activeIdx = 0;
      headings.forEach((h, i) => { if (h.getBoundingClientRect().top <= 100) activeIdx = i; });
      links.forEach((l, i) => l.classList.toggle('active', i === activeIdx));
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ====== 点赞 ======
  function buildLike(article) {
    const btn = document.getElementById('like-btn');
    const countEl = document.getElementById('like-count');
    const heart = btn.querySelector('.heart');
    countEl.textContent = article.likes || 0;
    if (S.hasLiked(article.id)) { btn.classList.add('liked'); heart.textContent = '♥'; }
    btn.addEventListener('click', async () => {
      const r = await S.toggleLike(article.id);
      countEl.textContent = r.likes;
      btn.classList.toggle('liked', r.liked);
      heart.textContent = r.liked ? '♥' : '♡';
    });
  }

  // ====== 上一篇 / 下一篇（仅在已发布文章间导航） ======
  function buildPrevNext(article, data) {
    const published = (data.articles || [])
      .filter(a => a.status === 'published')
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    const idx = published.findIndex(a => a.id === article.id);
    const box = document.getElementById('prev-next');
    let html = '';
    // 较新的一篇（上一篇）
    if (idx > 0) {
      const p = published[idx - 1];
      html += `<a href="article.html?id=${p.id}"><span class="dir">← 上一篇</span><span class="t">${esc(p.title)}</span></a>`;
    } else { html += '<span></span>'; }
    // 较旧的一篇（下一篇）
    if (idx >= 0 && idx < published.length - 1) {
      const n = published[idx + 1];
      html += `<a href="article.html?id=${n.id}" class="right"><span class="dir">下一篇 →</span><span class="t">${esc(n.title)}</span></a>`;
    } else { html += '<span></span>'; }
    box.innerHTML = html;
  }

  // ====== 相关文章（同分类或共享标签，最多 3 篇） ======
  function buildRelated(article, data) {
    const others = (data.articles || []).filter(a => a.status === 'published' && a.id !== article.id);
    const tags = new Set(article.tags || []);
    const scored = others.map(a => {
      let score = 0;
      if (a.category === article.category) score += 2;
      (a.tags || []).forEach(t => { if (tags.has(t)) score += 1; });
      return { a, score };
    }).filter(x => x.score > 0)
      .sort((x, y) => y.score - x.score || new Date(y.a.publishedAt) - new Date(x.a.publishedAt))
      .slice(0, 3);

    if (!scored.length) return;
    document.getElementById('related-sec').hidden = false;
    document.getElementById('related-grid').innerHTML = scored.map(({ a }) => `
      <a class="related-card" href="article.html?id=${a.id}">
        <span class="rc-cat">${esc(a.category || '未分类')}</span>
        <span class="rc-title">${esc(a.title)}</span>
      </a>`).join('');
  }

  // ====== 评论（本地 + 预留 API） ======
  function buildComments(article) {
    const form = document.getElementById('comment-form');
    const listEl = document.getElementById('comment-list');
    const numEl = document.getElementById('comment-num');
    if (S.isPublicMirror()) form.hidden = true;

    function renderList(comments) {
      numEl.textContent = comments.length ? `(${comments.length})` : '';
      if (!comments.length) {
        listEl.innerHTML = '<p class="no-comment">还没有评论，来抢沙发吧～</p>';
        return;
      }
      listEl.innerHTML = comments.map(c => `
        <div class="comment-item">
          <div class="ch"><span class="cn">${esc(c.name)}</span>
            <span class="ct">${new Date(c.time).toLocaleString('zh-CN', { hour12: false })}</span></div>
          <div class="cc">${esc(c.content)}</div>
        </div>`).join('');
    }
    renderList(article.comments || []);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('c-name').value.trim();
      const content = document.getElementById('c-content').value.trim();
      if (!name || !content) return;
      try {
        await S.addArticleComment(article.id, { name, content });
        const fresh = await S.getArticleById(article.id);
        renderList(fresh.comments || []);
        document.getElementById('c-content').value = '';
      } catch (err) {
        alert('评论提交失败：' + err.message);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
