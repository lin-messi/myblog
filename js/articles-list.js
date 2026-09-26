/**
 * articles-list.js —— 全部文章列表页（分类筛选 + 搜索 + 置顶）
 */
(function () {
  const S = window.BlogStorage;
  let allPublished = [];
  let curCat = 'all';
  let curTag = '';
  let keyword = '';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function qs(name) { return new URLSearchParams(location.search).get(name); }

  async function init() {
    const data = await S.loadPublic();
    document.getElementById('nav-brand').textContent = data.site.brand || 'MyBlog';

    allPublished = (data.articles || []).filter(a => a.status === 'published');

    // URL 预设：?tag=xxx（精确标签）/ ?cat=xxx（分类）/ ?q=xxx（关键词）
    const tagParam = qs('tag');
    const catParam = qs('cat');
    const qParam = qs('q');
    if (catParam) curCat = catParam;
    if (tagParam) curTag = tagParam;
    if (qParam) keyword = qParam.toLowerCase();

    buildCatChips();
    if (keyword) document.getElementById('list-search').value = qParam;
    updateTagIndicator();

    document.getElementById('list-search').addEventListener('input', (e) => {
      keyword = e.target.value.trim().toLowerCase();
      syncURL();
      renderGrid();
    });

    renderGrid();
  }

  function buildCatChips() {
    const cats = [...new Set(allPublished.map(a => a.category).filter(Boolean))];
    const box = document.getElementById('cat-chips');
    box.innerHTML =
      `<button type="button" class="chip ${curCat === 'all' ? 'active' : ''}" data-cat="all">全部</button>` +
      cats.map(c => `<button type="button" class="chip ${curCat === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    box.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        curCat = chip.dataset.cat;
        box.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        syncURL();
        renderGrid();
      });
    });
  }

  function renderGrid() {
    let list = allPublished.slice();
    if (curCat !== 'all') list = list.filter(a => a.category === curCat);
    if (curTag) {
      const tag = curTag.toLowerCase();
      list = list.filter(a => (a.tags || []).some(t => String(t).toLowerCase() === tag));
    }
    if (keyword) {
      list = list.filter(a =>
        (a.title || '').toLowerCase().includes(keyword) ||
        (a.excerpt || '').toLowerCase().includes(keyword) ||
        (a.tags || []).join(' ').toLowerCase().includes(keyword)
      );
    }
    // 置顶优先，再按发布时间倒序
    list.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.publishedAt) - new Date(a.publishedAt)));

    document.getElementById('list-count').textContent = `共 ${list.length} 篇`;
    const grid = document.getElementById('post-grid');
    if (!list.length) {
      grid.innerHTML = '<div class="list-empty">没有符合条件的文章。</div>';
      return;
    }
    grid.innerHTML = list.map(cardHTML).join('');
  }

  function cardHTML(a) {
    const rt = window.MD.readingTime(a.body);
    const cover = a.cover
      ? `<img class="pc-cover" src="${esc(a.cover)}" alt="" loading="lazy" />`
      : `<div class="pc-cover">✎</div>`;
    return `
    <a class="post-card" href="article.html?id=${a.id}">
      ${a.pinned ? '<span class="pin-flag">置顶</span>' : ''}
      ${cover}
      <div class="pc-body">
        <span class="pc-cat">${esc(a.category || '未分类')}</span>
        <h3 class="pc-title">${esc(a.title)}</h3>
        <p class="pc-excerpt">${esc(a.excerpt || '')}</p>
        <div class="pc-foot">
          <span>${new Date(a.publishedAt).toLocaleDateString('zh-CN')}</span>
          <span>${rt.minutes} 分钟</span>
          <span>👁 ${a.views || 0}</span>
          <span>♥ ${a.likes || 0}</span>
        </div>
      </div>
    </a>`;
  }

  // 显示当前标签筛选，并提供清除入口
  function updateTagIndicator() {
    const el = document.getElementById('tag-indicator');
    if (!el) return;
    if (curTag) {
      el.hidden = false;
      el.innerHTML = `标签：<strong>${esc(curTag)}</strong> <button type="button" class="tag-clear">× 清除</button>`;
      el.querySelector('.tag-clear').addEventListener('click', () => {
        curTag = '';
        updateTagIndicator();
        syncURL();
        renderGrid();
      });
    } else {
      el.hidden = true;
      el.innerHTML = '';
    }
  }

  // 把当前筛选状态同步到地址栏，刷新 / 返回 / 分享都能保留
  function syncURL() {
    const params = new URLSearchParams();
    if (curCat && curCat !== 'all') params.set('cat', curCat);
    if (curTag) params.set('tag', curTag);
    if (keyword) params.set('q', keyword);
    const qsStr = params.toString();
    history.replaceState(null, '', location.pathname + (qsStr ? '?' + qsStr : ''));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
