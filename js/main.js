/**
 * main.js —— 首页入口（传统脚本，依赖前面已加载的全局函数）
 */
(function () {
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
  function fmtTime(ts) {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false });
  }

  async function renderMessages() {
    const data = await window.BlogStorage.loadPublic();
    const box = document.getElementById('message-list');
    if (!data.messages.length) {
      box.innerHTML = '<div style="opacity:.5;font-size:13px;font-style:italic;padding:8px;">还没有留言，快来沙发吧～</div>';
      return;
    }
    box.innerHTML = data.messages.slice(0, 20).map(m => `
      <div class="message-item">
        <span class="author">${esc(m.name)}</span>
        <span class="time">${fmtTime(m.time)}</span>
        <div>${esc(m.content)}</div>
      </div>
    `).join('');
  }

  function cardHTML(a) {
    const date = new Date(a.publishedAt).toLocaleDateString('zh-CN');
    const badge = a.pinned
      ? '<span class="pin-badge">置顶</span>'
      : (a.featured ? '<span class="pin-badge featured">精选</span>' : '');
    return `
    <a class="card article-card" href="article.html?id=${a.id}">
      ${badge}
      <div class="meta">${date} · ${esc(a.category || '未分类')}</div>
      <h3>${esc(a.title)}</h3>
      <p>${esc(a.excerpt || '')}</p>
      <div class="tags">${(a.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    </a>`;
  }

  function renderHomeArticles(data) {
    const published = (data.articles || [])
      .filter(a => a.status === 'published')
      .sort((a, b) => (b.pinned - a.pinned) || (new Date(b.publishedAt) - new Date(a.publishedAt)));
    const latest = published.slice(0, 6);
    const grid = document.getElementById('article-grid');

    if (!latest.length) {
      grid.innerHTML = '<p style="opacity:.6;grid-column:1/-1;text-align:center;">还没有发布文章，去后台写第一篇吧。</p>';
    } else {
      grid.innerHTML = latest.map(cardHTML).join('');
    }

    // “查看更多”按钮
    const moreWrap = document.getElementById('articles-more');
    if (moreWrap) {
      moreWrap.style.display = published.length > 6 ? 'flex' : (published.length ? 'flex' : 'none');
    }
  }

  function renderFeatured(data) {
    const block = document.getElementById('featured-block');
    const grid = document.getElementById('featured-grid');
    if (!block || !grid) return;
    const featured = (data.articles || [])
      .filter(a => a.status === 'published' && a.featured)
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    if (!featured.length) { block.hidden = true; return; }
    block.hidden = false;
    grid.innerHTML = featured.map(cardHTML).join('');
  }

  async function main() {
    const data = await window.BlogStorage.loadPublic();

    document.getElementById('page-title').textContent = data.site.title;
    document.getElementById('nav-brand').textContent = data.site.brand;
    const brandEl = document.getElementById('hero-brand');
    if (brandEl) brandEl.textContent = data.site.brand || 'MyBlog';
    document.getElementById('hero-subtitle').textContent = data.site.heroSubtitle;
    document.getElementById('footer-text').textContent = data.site.footer;

    window.initTypewriter(document.getElementById('typewriter'), data.site.heroTitles, {
      typeSpeed: 110, eraseSpeed: 50, pauseFull: 1800, pauseEmpty: 350,
    });

    renderFeatured(data);
    renderHomeArticles(data);

    document.getElementById('project-grid').innerHTML = (data.projects || []).map(p => `
      <a class="card" href="${esc(p.link || '#')}" target="_blank" rel="noopener">
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.excerpt || '')}</p>
        <div class="tags">${(p.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      </a>
    `).join('');

    document.getElementById('contact-list').innerHTML = (data.contacts || []).map(c => `
      <li>
        <span class="ico">${esc(c.ico || '·')}</span>
        <strong>${esc(c.label)}:</strong>
        <a href="${esc(c.link || '#')}" target="_blank" rel="noopener">${esc(c.value)}</a>
      </li>
    `).join('');

    await renderMessages();

    document.getElementById('message-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('msg-name').value.trim();
      const content = document.getElementById('msg-content').value.trim();
      if (!name || !content) return;
      try {
        await window.BlogStorage.addMessage({ name, content });
        document.getElementById('msg-content').value = '';
        await renderMessages();
      } catch (err) {
        alert('留言发送失败：' + err.message);
      }
    });

    window.initBackgrounds();
    window.initParticles();
    window.initMusic(data.site.musicUrl);
    window.initUpload();
  }

  document.addEventListener('DOMContentLoaded', () => {
    main().catch(err => {
      console.error(err);
      const errDiv = document.createElement('div');
      errDiv.style.cssText = 'position:fixed;top:80px;left:20px;right:20px;padding:20px;background:#ff6ec4;color:#fff;border-radius:8px;font-family:monospace;font-size:13px;z-index:9999;';
      errDiv.textContent = '初始化失败：' + err.message;
      document.body.appendChild(errDiv);
    });
  });
})();
