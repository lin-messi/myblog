/* Build a public, pre-rendered site from explicit fields, never a storage snapshot. */
(function () {
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const parser = new DOMParser();
  const MAX_BYTES = 256 * 1024 * 1024;
  function baseURL(value) {
    if (!String(value || '').trim()) return '';
    let url;
    try { url = new URL(String(value).trim()); } catch { throw new Error('请填写完整的网址，例如 https://example.com/blog/'); }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('正式网址须为 http(s) 地址，不能包含密码、查询参数或锚点');
    url.pathname = url.pathname.replace(/\/*$/, '/');
    return url.href;
  }
  async function readResource(source) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(source, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.blob();
    } catch (error) {
      const label = String(source).startsWith('data:') ? '内嵌资源' : String(source).slice(0, 180);
      throw new Error(`无法打包资源「${label}」。请检查文件是否存在；外部图片请先下载后通过编辑器上传。`);
    } finally { clearTimeout(timer); }
  }
  function date(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function displayDate(value) { const d = date(value); return d ? d.toLocaleDateString('zh-CN') : ''; }
  function fileKey(value) {
    const text = String(value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return (text.replace(/[^a-z0-9_-]/gi, '-').slice(0, 48) || 'post') + '-' + (hash >>> 0).toString(16);
  }

  async function build(options = {}) {
    if (!/^https?:$/.test(location.protocol)) throw new Error('请先使用「启动博客.bat」打开后台，再导出网站。');
    const origin = baseURL(options.url);
    const progress = options.onProgress || (() => {});
    const data = await window.BlogStorage.loadDataFresh();
    const site = {
      title: String(data.site.title || '我的个人博客'), brand: String(data.site.brand || 'MyBlog'),
      description: String(data.site.heroSubtitle || ''), footer: String(data.site.footer || ''),
      tagline: String((data.site.heroTitles || [])[0] || ''), music: String(data.site.musicUrl || ''),
    };
    const files = new Map(), resources = new Map();
    let total = 0, serial = 0;
    function add(name, value) {
      const blob = value instanceof Blob ? value : new Blob([value]);
      if (files.has(name)) throw new Error('导出文件名冲突：' + name);
      total += blob.size;
      if (total > MAX_BYTES) throw new Error('导出内容超过 256MB，请减少附件或压缩图片');
      files.set(name, blob);
    }
    const selected = new Set((options.attachmentIds || []).map(String));
    const attachments = [];
    if (selected.size) {
      const all = await window.BlogUpload.dbAll();
      for (const id of selected) {
        const file = all.find(f => String(f.id) === id);
        if (!file || !(file.blob instanceof Blob)) throw new Error('勾选的附件已不存在，请重新打开导出窗口');
        const name = `assets/download-${++serial}.bin`;
        add(name, file.blob);
        attachments.push({ path: name, name: String(file.name || '附件'), size: file.blob.size });
      }
    }
    async function media(source, kind = 'image') {
      if (!source) return '';
      const key = new URL(String(source), document.baseURI).href;
      if (!/^(https?:|data:|blob:)/.test(key)) throw new Error('图片或媒体地址不受支持，请通过编辑器上传本地文件');
      const cacheKey = kind + ':' + key;
      if (resources.has(cacheKey)) return resources.get(cacheKey);
      const blob = await readResource(key);
      const type = blob.type.split(';')[0].toLowerCase();
      const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/bmp': 'bmp', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' };
      if (kind === 'image' && (!type.startsWith('image/') || !extensions[type])) throw new Error('图片格式不受支持，请改用 PNG、JPEG、WebP、GIF、AVIF 或 BMP 后重新导出');
      if (kind === 'audio' && !type.startsWith('audio/')) throw new Error('背景音乐不是有效的音频文件，请检查链接');
      const name = `assets/media-${++serial}.${extensions[type] || 'bin'}`;
      add(name, blob); resources.set(cacheKey, name); return name;
    }
    const articles = (data.articles || []).filter(a => a.status === 'published').map(a => ({
      id: String(a.id), title: String(a.title || '未命名文章'), body: String(a.body || ''),
      excerpt: String(a.excerpt || window.MD.plain(a.body).slice(0, 160)), category: String(a.category || '未分类'),
      tags: (Array.isArray(a.tags) ? a.tags : []).map(String), cover: String(a.cover || ''),
      pinned: !!a.pinned, featured: !!a.featured, publishedAt: a.publishedAt, updatedAt: a.updatedAt,
      page: `post-${fileKey(a.id)}.html`,
    })).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (date(b.publishedAt)?.getTime() || 0) - (date(a.publishedAt)?.getTime() || 0));
    if (new Set(articles.map(a => a.page)).size !== articles.length) throw new Error('文章标识重复，请先修正文章数据');
    const byId = new Map(articles.map(a => [a.id, a]));
    const safeHref = value => {
      try {
        if (!String(value || '').trim() || String(value).startsWith('#')) return '';
        const url = new URL(String(value || ''), document.baseURI);
        if (url.origin === location.origin && url.pathname.endsWith('/admin.html')) return '';
        return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : '';
      } catch { return ''; }
    };
    async function renderBody(markdown) {
      const doc = parser.parseFromString('<main>' + window.MD.render(markdown) + '</main>', 'text/html');
      const box = doc.querySelector('main');
      const allowed = new Set('p br h1 h2 h3 h4 h5 h6 hr blockquote ul ol li div span pre code button table thead tbody tr th td a img strong em del mark'.split(' '));
      for (const node of [...box.querySelectorAll('*')]) {
        if (!allowed.has(node.localName)) { node.remove(); continue; }
        for (const attr of [...node.attributes]) {
          const permitted = ['class', 'id', 'title'].includes(attr.name) ||
            (node.localName === 'a' && attr.name === 'href') || (node.localName === 'img' && ['src', 'alt'].includes(attr.name)) ||
            (node.localName === 'button' && attr.name === 'type');
          if (!permitted) node.removeAttribute(attr.name);
        }
        if (node.localName === 'img') {
          node.setAttribute('src', await media(node.getAttribute('src'))); node.setAttribute('loading', 'lazy');
        }
        if (node.localName === 'a') {
          const value = node.getAttribute('href') || '';
          if (value.startsWith('#')) continue;
          let url;
          try { url = new URL(value, document.baseURI); } catch { node.removeAttribute('href'); continue; }
          if (url.origin === location.origin && url.pathname.endsWith('/article.html')) {
            const target = byId.get(url.searchParams.get('id'));
            if (target) node.setAttribute('href', target.page + url.hash); else node.removeAttribute('href');
          } else if (url.origin === location.origin && /\/(index|articles)\.html$/.test(url.pathname)) {
            node.setAttribute('href', url.pathname.split('/').pop() + url.search + url.hash);
          } else if (url.origin === location.origin && url.pathname.endsWith('/admin.html')) {
            node.removeAttribute('href');
          } else if (url.origin === location.origin && !value.startsWith('http') && !value.startsWith('//')) {
            const target = await media(value, 'file'); node.setAttribute('href', target); node.setAttribute('download', url.pathname.split('/').pop());
          } else {
            const href = safeHref(value);
            if (href) { node.setAttribute('href', href); node.setAttribute('rel', 'noopener noreferrer'); }
            else node.removeAttribute('href');
          }
        }
      }
      const ids = new Set();
      const headings = [...box.querySelectorAll('h2,h3,h4')].map((heading, i) => {
        let id = heading.id || 'section-' + (i + 1);
        while (ids.has(id)) id += '-next'; ids.add(id); heading.id = id;
        return { id, text: heading.textContent, level: heading.tagName.slice(1) };
      });
      return { html: box.innerHTML, headings };
    }
    progress('正在准备页面与样式…');
    const assets = ['css/main.css', 'css/backgrounds.css', 'css/article.css', 'css/editor.css', 'css/public-site.css', 'js/backgrounds.js', 'js/public-site.js'];
    for (const name of assets) add(name, await readResource(name));
    const templates = {};
    for (const name of ['index', 'articles', 'article']) templates[name] = await (await readResource(name + '.html')).text();
    function documentFor(name, title, description, page, image, article) {
      const doc = parser.parseFromString(templates[name], 'text/html');
      doc.querySelectorAll('script, a[href="admin.html"], meta[name="description"], meta[property^="og:"], #particle-canvas').forEach(el => el.remove());
      doc.title = title;
      const meta = (key, value, property = false) => { const el = doc.createElement('meta'); el.setAttribute(property ? 'property' : 'name', key); el.content = value; doc.head.append(el); };
      const link = (rel, href, type) => { const el = doc.createElement('link'); el.rel = rel; el.href = href; if (type) el.type = type; doc.head.append(el); };
      meta('description', description); meta('og:title', title, true); meta('og:description', description, true);
      meta('og:type', article ? 'article' : 'website', true); meta('og:site_name', site.brand, true);
      meta('twitter:card', image ? 'summary_large_image' : 'summary');
      if (origin) {
        link('canonical', new URL(page, origin).href); meta('og:url', new URL(page, origin).href, true);
        if (image) meta('og:image', new URL(image, origin).href, true);
        link('alternate', 'feed.xml', 'application/rss+xml');
      }
      if (article && date(article.publishedAt)) meta('article:published_time', date(article.publishedAt).toISOString(), true);
      link('stylesheet', 'css/public-site.css');
      doc.querySelectorAll('#nav-brand').forEach(el => el.textContent = site.brand);
      const script = doc.createElement('script'); script.src = 'js/public-site.js'; script.defer = true; doc.body.append(script);
      const footer = doc.createElement('footer'); footer.className = 'public-footer'; footer.textContent = site.footer;
      if (origin) { const feed = doc.createElement('a'); feed.href = 'feed.xml'; feed.textContent = ' · RSS 订阅'; footer.append(feed); }
      if (name !== 'index') doc.body.append(footer);
      return doc;
    }
    const html = doc => '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    const tagLinks = a => a.tags.map(t => `<a class="tag" href="articles.html?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('');
    function card(a, homepage = false) {
      const rt = window.MD.readingTime(a.body);
      if (homepage) return `<a class="card article-card" href="${a.page}"><div class="meta">${esc(displayDate(a.publishedAt))} · ${esc(a.category)}</div><h3>${esc(a.title)}</h3><p>${esc(a.excerpt)}</p><div class="tags">${a.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></a>`;
      return `<a class="post-card" href="${a.page}" data-category="${esc(a.category)}" data-tags="${esc(JSON.stringify(a.tags))}" data-search="${esc([a.title, a.excerpt, ...a.tags].join(' ').toLowerCase())}">${a.cover ? `<img class="pc-cover" src="${a.cover}" alt="" loading="lazy">` : '<div class="pc-cover">✎</div>'}<div class="pc-body"><span class="pc-cat">${esc(a.category)}</span><h2 class="pc-title">${esc(a.title)}</h2><p class="pc-excerpt">${esc(a.excerpt)}</p><div class="pc-foot"><span>${esc(displayDate(a.publishedAt))}</span><span>${rt.minutes} 分钟</span></div></div></a>`;
    }
    const chronological = [...articles].sort((a,b) => (date(b.publishedAt)?.getTime() || 0) - (date(a.publishedAt)?.getTime() || 0));
    for (let i = 0; i < articles.length; i++) {
      const a = articles[i]; progress(`正在生成文章 ${i + 1}/${articles.length}：${a.title}`);
      a.cover = await media(a.cover);
      const body = await renderBody(a.body);
      const doc = documentFor('article', a.title + ' · ' + site.brand, a.excerpt, a.page, a.cover, a);
      doc.querySelector('#loading').remove(); doc.querySelector('#article-root').hidden = false;
      doc.querySelector('#art-title').textContent = a.title;
      doc.querySelector('#art-cat').innerHTML = `<a href="articles.html?cat=${encodeURIComponent(a.category)}">${esc(a.category)}</a>`;
      doc.querySelector('#art-date').textContent = displayDate(a.publishedAt);
      const rt = window.MD.readingTime(a.body); doc.querySelector('#art-rt').textContent = `${rt.words} 字 · 约 ${rt.minutes} 分钟`;
      doc.querySelector('#art-views').remove(); doc.querySelector('#art-tags').innerHTML = tagLinks(a);
      doc.querySelector('#art-content').innerHTML = body.html;
      if (a.cover) { const image = doc.querySelector('#art-cover'); image.src = a.cover; image.alt = a.title; image.hidden = false; }
      else doc.querySelector('#art-cover').remove();
      doc.querySelectorAll('.like-bar,.comments,#related-sec').forEach(el => el.remove());
      const note = doc.createElement('p'); note.className = 'public-note'; note.innerHTML = '欢迎阅读与分享。交流请查看<a href="index.html#contact">联系方式</a>。'; doc.querySelector('#article-root').append(note);
      if (body.headings.length) {
        const toc = body.headings.map(h => `<li class="lvl-${h.level}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join('');
        doc.querySelector('#toc-side').hidden = false; doc.querySelector('#toc-mobile').hidden = false;
        doc.querySelector('#toc-list').innerHTML = toc; doc.querySelector('#toc-list-mobile').innerHTML = toc;
      }
      const index = chronological.indexOf(a), prev = chronological[index - 1], next = chronological[index + 1];
      doc.querySelector('#prev-next').innerHTML = [prev ? `<a href="${prev.page}">← 上一篇<span class="t">${esc(prev.title)}</span></a>` : '<span></span>', next ? `<a href="${next.page}" class="right">下一篇 →<span class="t">${esc(next.title)}</span></a>` : '<span></span>'].join('');
      add(a.page, html(doc));
    }
    const list = documentFor('articles', '全部文章 · ' + site.brand, site.description, 'articles.html');
    list.querySelector('#list-count').textContent = `共 ${articles.length} 篇`;
    list.querySelector('#post-grid').innerHTML = articles.map(a => card(a)).join('') + `<p id="list-empty" class="list-empty"${articles.length ? ' hidden' : ''}>没有符合条件的文章。</p>`;
    const cats = [...new Set(articles.map(a => a.category))];
    list.querySelector('#cat-chips').innerHTML = `<button class="chip active" type="button" data-cat="all">全部</button>` + cats.map(c => `<button class="chip" type="button" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    list.querySelector('#list-search').setAttribute('aria-label', '搜索文章');
    add('articles.html', html(list));
    const home = documentFor('index', site.title, site.description, 'index.html');
    home.querySelector('.scene').classList.add('active');
    home.querySelector('#hero-brand').textContent = site.brand; home.querySelector('#hero-subtitle').textContent = site.description;
    home.querySelector('#typewriter').textContent = site.tagline; home.querySelectorAll('.cursor').forEach(el => el.remove());
    home.querySelector('#article-grid').innerHTML = articles.slice(0, 6).map(a => card(a, true)).join('') || '<p>暂时还没有公开文章。</p>';
    home.querySelector('#articles-more').style.display = 'flex';
    const featured = articles.filter(a => a.featured).slice(0, 3);
    home.querySelector('#featured-block').hidden = !featured.length; home.querySelector('#featured-grid').innerHTML = featured.map(a => card(a, true)).join('');
    home.querySelector('#project-grid').innerHTML = (data.projects || []).map(p => `<a class="card" href="${esc(safeHref(p.link) || '#projects')}" rel="noopener noreferrer"><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p></a>`).join('');
    home.querySelector('#contact .section-title').textContent = '联系与资料';
    home.querySelector('.contact-card').innerHTML = '<h3>联系方式</h3><ul class="contact-list">' + (data.contacts || []).map(c => `<li><strong>${esc(c.label)}</strong> ${safeHref(c.link) ? `<a href="${esc(safeHref(c.link))}">${esc(c.value)}</a>` : esc(c.value)}</li>`).join('') + '</ul><p class="public-note">如需交流或发送资料，请使用以上联系方式。</p>';
    home.querySelector('.upload-card').innerHTML = '<h3>公开资料下载</h3>' + (attachments.length ? '<ul class="public-downloads">' + attachments.map(f => `<li><a href="${f.path}" download="${esc(f.name)}">${esc(f.name)}</a> <small>(${Math.ceil(f.size / 1024)} KB)</small></li>`).join('') + '</ul>' : '<p class="public-note">暂时没有公开下载的资料。</p>');
    home.querySelector('#footer-text').textContent = site.footer;
    if (origin) { const a = home.createElement('a'); a.href = 'feed.xml'; a.textContent = 'RSS 订阅'; home.querySelector('.footer').append(a); }
    if (site.music) { home.querySelector('#bg-music').src = await media(site.music, 'audio'); home.querySelector('#music-toggle').setAttribute('aria-pressed', 'false'); }
    else home.querySelectorAll('#music-toggle,#bg-music').forEach(el => el.remove());
    const background = home.createElement('script'); background.src = 'js/backgrounds.js'; home.body.insertBefore(background, home.querySelector('script'));
    add('index.html', html(home));
    if (origin) {
      const entries = [{ page: 'index.html' }, { page: 'articles.html' }, ...articles];
      add('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + entries.map(a => `<url><loc>${esc(new URL(a.page, origin).href)}</loc>${date(a.updatedAt) ? `<lastmod>${date(a.updatedAt).toISOString()}</lastmod>` : ''}</url>`).join('') + '</urlset>');
      add('feed.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>' + esc(site.title) + '</title><link>' + esc(origin) + '</link><description>' + esc(site.description || site.title) + '</description><language>zh-CN</language>' + chronological.map(a => `<item><title>${esc(a.title)}</title><link>${esc(new URL(a.page, origin).href)}</link><guid isPermaLink="true">${esc(new URL(a.page, origin).href)}</guid><description>${esc(a.excerpt)}</description>${date(a.publishedAt) ? `<pubDate>${date(a.publishedAt).toUTCString()}</pubDate>` : ''}</item>`).join('') + '</channel></rss>');
      add('robots.txt', 'User-agent: *\nAllow: /\nSitemap: ' + new URL('sitemap.xml', origin).href + '\n');
    }
    add('DEPLOY.txt', `网站导出说明\n\n已发布文章：${articles.length} 篇\n公开附件：${attachments.length} 个\n${origin ? '正式网址：' + origin : '当前为预览版，未生成站点地图、RSS 和规范链接；确定网址后请重新导出。'}\n\n解压 ZIP，把包内所有文件上传到网站目录。可以先双击 index.html 预览，建议使用静态服务器验收。\n正文已写入 HTML，无需导入 JSON，也不依赖浏览器存储。评论、留言、点赞、上传与后台入口不包含在公开网站中。\n后续修改文章后需重新导出并替换整个旧发布目录；只覆盖文件不会自动删除已经下架的旧文章网页。\n完整 JSON 备份仍保留在本地管理流程，不要上传到公开网站。\n`);
    progress('正在打包下载文件…');
    const blob = await window.BlogZip.create(files);
    return { blob, articles: articles.length, attachments: attachments.length, fileCount: files.size, preview: !origin };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const open = document.getElementById('export-site-btn');
    if (!open) return;
    const dialog = document.getElementById('export-site-dialog'), form = document.getElementById('export-site-form');
    const status = document.getElementById('export-site-status'), submit = document.getElementById('export-site-download');
    const cancel = document.getElementById('export-site-cancel');
    open.addEventListener('click', async () => {
      status.textContent = '正在读取文章与附件…'; dialog.showModal(); submit.disabled = true;
      try {
        const data = await window.BlogStorage.loadDataFresh();
        const attachments = await window.BlogUpload.dbAll();
        document.getElementById('export-site-summary').textContent = `将导出 ${(data.articles || []).filter(a => a.status === 'published').length} 篇已发布文章，并保留首页、分类、标签、搜索与目录。`;
        const list = document.getElementById('export-site-files'); list.replaceChildren();
        if (!attachments.length) list.textContent = '没有可选附件。';
        attachments.forEach(file => {
          const label = document.createElement('label'); label.className = 'export-file';
          const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = String(file.id);
          label.append(checkbox, document.createTextNode(String(file.name) + `（${Math.ceil(file.size / 1024)} KB）`)); list.append(label);
        });
        status.textContent = ''; submit.disabled = false;
      } catch (error) { status.textContent = '读取失败：' + error.message; }
    });
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', event => { if (cancel.disabled) event.preventDefault(); });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (submit.disabled) return;
      submit.disabled = true; cancel.disabled = true;
      try {
        const result = await build({ url: document.getElementById('export-site-url').value, attachmentIds: [...document.querySelectorAll('#export-site-files input:checked')].map(el => el.value), onProgress: value => { status.textContent = value; } });
        const url = URL.createObjectURL(result.blob), a = document.createElement('a');
        a.href = url; a.download = `myblog-site-${new Date().toISOString().slice(0,10)}.zip`; document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        status.textContent = `已导出${result.preview ? '预览版' : '网站'}：${result.articles} 篇文章，${result.attachments} 个公开附件。解压后可预览或上传到网站目录。`;
      } catch (error) { status.textContent = '导出失败：' + error.message; }
      finally { submit.disabled = false; cancel.disabled = false; }
    });
  });
  window.BlogSiteExport = { build };
})();
