/**
 * series-view.js —— 系列列表页与系列详情页（仅展示已发布内容）
 */
(function () {
  const S = window.BlogStorage;

  function qs(name) { return new URLSearchParams(location.search).get(name); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function init() {
    const data = await S.loadPublic();
    document.getElementById('nav-brand').textContent = data.site.brand || 'MyBlog';
    const box = document.getElementById('series-container');
    const id = qs('id');
    if (id) renderDetail(box, data, id);
    else renderList(box, data);
  }

  function publishedChapters(series, articles) {
    return (articles || []).filter(a => a && a.seriesId === series.id && a.status === 'published');
  }

  function statusLabel(s) {
    return s.status === 'finished' ? '已完结' : '连载中';
  }

  function renderList(box, data) {
    const series = (data.series || []).slice()
      .filter(s => publishedChapters(s, data.articles).length > 0)
      .sort((a, b) => (a.order - b.order) || String(a.title).localeCompare(String(b.title)));
    document.title = '系列 · ' + (data.site.brand || 'MyBlog');
    if (!series.length) {
      box.innerHTML = '<div class="list-empty">还没有系列。</div>';
      return;
    }
    box.innerHTML = `
      <div class="list-head"><h1>系列</h1><p>共 ${series.length} 个系列</p></div>
      <div class="series-grid">${series.map(s => {
        const n = publishedChapters(s, data.articles).length;
        return `
        <a class="series-card-link" href="series.html?id=${s.id}">
          ${s.cover ? `<img class="sc-cover" src="${esc(s.cover)}" alt="" loading="lazy" />` : `<div class="sc-cover">📚</div>`}
          <div class="sc-body">
            <div class="sc-title">${esc(s.title)}</div>
            <div class="sc-desc">${esc(s.description || '')}</div>
            <div class="sc-foot">
              <span class="sc-status ${s.status}">${statusLabel(s)}</span>
              <span>${n} 篇</span>
            </div>
          </div>
        </a>`;
      }).join('')}</div>`;
  }

  function chapterHTML(a) {
    return `
      <a class="chapter-link" href="article.html?id=${a.id}">
        <span class="cl-order">${a.seriesOrder == null ? '·' : a.seriesOrder}</span>
        <span class="cl-title">${esc(a.title)}</span>
      </a>`;
  }

  function renderDetail(box, data, id) {
    const series = (data.series || []).find(s => s.id === id);
    if (!series) {
      box.innerHTML = '<div class="list-empty">系列不存在或暂未公开。</div>';
      return;
    }
    const chapters = publishedChapters(series, data.articles);
    if (!chapters.length) {
      box.innerHTML = '<div class="list-empty">该系列还没有已发布的章节。</div>';
      return;
    }
    document.title = series.title + ' · ' + (data.site.brand || 'MyBlog');
    const sorted = S.sortSeriesArticles(series, chapters);
    const groups = series.groups || [];

    let body;
    if (groups.length) {
      const parts = groups.map(g => {
        const items = sorted.filter(a => a.seriesGroupId === g.id);
        if (!items.length) return '';
        return `<div class="series-group"><h3 class="sg-title">${esc(g.title)}</h3><div class="sg-items">${items.map(chapterHTML).join('')}</div></div>`;
      }).join('');
      const ungrouped = sorted.filter(a => !groups.some(g => g.id === a.seriesGroupId));
      const ungroupedHTML = ungrouped.length
        ? `<div class="series-group"><h3 class="sg-title">未分组</h3><div class="sg-items">${ungrouped.map(chapterHTML).join('')}</div></div>`
        : '';
      body = parts + ungroupedHTML;
    } else {
      body = `<div class="sg-items">${sorted.map(chapterHTML).join('')}</div>`;
    }

    box.innerHTML = `
      <div class="series-detail-head">
        ${series.cover ? `<img class="sd-cover" src="${esc(series.cover)}" alt="" />` : ''}
        <h1>${esc(series.title)}</h1>
        <p class="sd-desc">${esc(series.description || '')}</p>
        <div class="sd-meta">
          <span class="sc-status ${series.status}">${statusLabel(series)}</span>
          <span>${sorted.length} 篇</span>
        </div>
      </div>
      <div class="series-chapters-list">${body}</div>`;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
