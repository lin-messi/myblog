/**
 * batch-import.js —— 批量导入 Markdown：多文件预览 + 批量设置系列/分组/章节顺序
 * window.BlogBatchImport.open(files, onDone)
 */
(function () {
  const S = () => window.BlogStorage;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let dialog = null;
  let state = null;

  function filenameTitle(name) {
    return String(name || '').replace(/\.(md|markdown)$/i, '').trim() || String(name || '');
  }
  function numericPrefix(name) {
    const m = String(name || '').match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function buildDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.id = 'batch-import-dialog';
    dialog.className = 'batch-import-dialog';
    dialog.setAttribute('aria-labelledby', 'bi-heading');
    dialog.innerHTML = `
      <div class="bi-head">
        <h2 id="bi-heading">批量导入 Markdown</h2>
        <button type="button" class="btn-ghost" id="bi-cancel">取消</button>
      </div>
      <div class="bi-bulk">
        <div class="bi-bulk-grid">
          <label>所属系列 <select id="bi-series"></select></label>
          <label>所属分组 <select id="bi-group" disabled></select></label>
          <label>分类 <input type="text" id="bi-category" placeholder="留空则保留文件原值" /></label>
          <label>标签 <input type="text" id="bi-tags" placeholder="逗号分隔，留空则保留原值" /></label>
          <label>导入状态
            <select id="bi-status">
              <option value="draft">草稿</option>
              <option value="published">立即发布</option>
            </select>
          </label>
          <button type="button" class="btn-primary" id="bi-apply">应用到勾选文章</button>
        </div>
        <div class="bi-order-row">
          <button type="button" class="btn-ghost" id="bi-order-prefix">按文件名编号排序</button>
          <button type="button" class="btn-ghost" id="bi-order-seq">从起始序号依次编号</button>
        </div>
      </div>
      <div class="bi-table-wrap">
        <table class="bi-table">
          <thead><tr><th></th><th>文件</th><th>标题</th><th>所属系列</th><th>分组</th><th>顺序</th><th>状态</th></tr></thead>
          <tbody id="bi-rows"></tbody>
        </table>
      </div>
      <div class="bi-note">资源说明：正文完整保留；内嵌 data URL 图片与公开图片地址保持不变；相对路径图片/附件不会自动上传，需另行部署或补充。</div>
      <div class="bi-foot">
        <span id="bi-summary"></span>
        <span id="bi-status-text" role="status" aria-live="polite"></span>
        <button type="button" class="btn-primary" id="bi-import">导入</button>
      </div>`;
    document.body.append(dialog);
    bindEvents();
  }

  function bindEvents() {
    dialog.querySelector('#bi-cancel').addEventListener('click', () => { if (!state.busy) dialog.close(); });
    dialog.addEventListener('cancel', e => { if (state && state.busy) e.preventDefault(); });
    dialog.querySelector('#bi-series').addEventListener('change', updateGroupOptions);
    dialog.querySelector('#bi-apply').addEventListener('click', applyBulk);
    dialog.querySelector('#bi-order-prefix').addEventListener('click', autoNumberPrefix);
    dialog.querySelector('#bi-order-seq').addEventListener('click', autoNumberSequential);
    dialog.querySelector('#bi-import').addEventListener('click', doImport);
    const tbody = dialog.querySelector('#bi-rows');
    tbody.addEventListener('input', onRowInput);
    tbody.addEventListener('change', onRowChange);
  }

  function getRow(el) {
    const tr = el.closest('tr');
    return tr ? state.rows[+tr.dataset.i] : null;
  }
  function onRowInput(e) {
    if (state.busy) return;
    const el = e.target;
    const row = getRow(el);
    if (!row) return;
    if (el.classList.contains('bi-title')) row.title = el.value;
    else if (el.classList.contains('bi-order')) row.seriesOrder = el.value.trim();
    updateSummary();
  }
  function onRowChange(e) {
    if (state.busy) return;
    const el = e.target;
    const row = getRow(el);
    if (!row) return;
    if (el.classList.contains('bi-check')) row.checked = el.checked;
    else if (el.classList.contains('bi-row-series')) { row.seriesId = el.value; row.seriesGroupId = ''; refreshRowGroup(row); }
    else if (el.classList.contains('bi-row-group')) row.seriesGroupId = el.value;
    updateSummary();
  }
  function refreshRowGroup(row) {
    const i = state.rows.indexOf(row);
    const tr = dialog.querySelector(`tr[data-i="${i}"]`);
    if (!tr) return;
    const sel = tr.querySelector('.bi-row-group');
    const series = (state.allSeries || []).find(s => s.id === row.seriesId);
    const groups = (series && series.groups) || [];
    sel.innerHTML = '<option value="">无分组</option>' + groups.map(g => `<option value="${g.id}">${esc(g.title)}</option>`).join('');
    sel.disabled = !groups.length;
    row.seriesGroupId = '';
    sel.value = '';
  }

  function updateGroupOptions() {
    const sel = dialog.querySelector('#bi-series');
    const gsel = dialog.querySelector('#bi-group');
    const series = (state.allSeries || []).find(s => s.id === sel.value);
    const groups = (series && series.groups) || [];
    gsel.innerHTML = '<option value="">无分组</option>' + groups.map(g => `<option value="${g.id}">${esc(g.title)}</option>`).join('');
    gsel.disabled = !sel.value || !groups.length;
  }

  function applyBulk() {
    const seriesId = dialog.querySelector('#bi-series').value;
    const groupId = seriesId ? dialog.querySelector('#bi-group').value : '';
    const category = dialog.querySelector('#bi-category').value.trim();
    const tags = dialog.querySelector('#bi-tags').value.trim().split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const status = dialog.querySelector('#bi-status').value;
    state.rows.forEach(r => {
      if (!r.checked) return;
      r.seriesId = seriesId;
      r.seriesGroupId = seriesId ? groupId : '';
      if (!seriesId) r.seriesOrder = null;
      if (category) r.category = category;
      if (tags.length) r.tags = tags;
      r.status = status;
    });
    renderRows();
    updateSummary();
  }

  function autoNumberPrefix() {
    state.rows.sort((a,b) => {
      const left = numericPrefix(a.filename), right = numericPrefix(b.filename);
      if (left != null && right != null && left !== right) return left - right;
      if ((left != null) !== (right != null)) return left != null ? -1 : 1;
      return a.filename.localeCompare(b.filename, undefined, { numeric: true });
    });
    const rows = state.rows.filter(r => r.checked && !r.error);
    const withP = rows.filter(r => numericPrefix(r.filename) != null).sort((a, b) => numericPrefix(a.filename) - numericPrefix(b.filename));
    const noP = rows.filter(r => numericPrefix(r.filename) == null).sort((a, b) => a.filename.localeCompare(b.filename));
    withP.forEach(r => { r.seriesOrder = String(numericPrefix(r.filename)); });
    let next = withP.length ? Math.max(...withP.map(r => numericPrefix(r.filename))) + 1 : 0;
    noP.forEach(r => { r.seriesOrder = String(next++); });
    renderRows();
    updateSummary();
  }

  function autoNumberSequential() {
    const start = parseInt(prompt('起始序号（0 起）：', '0'), 10);
    if (Number.isNaN(start)) return;
    const rows = state.rows.filter(r => r.checked && !r.error);
    rows.forEach((r, i) => { r.seriesOrder = String(start + i); });
    renderRows();
    updateSummary();
  }

  function updateSummary() {
    const total = state.rows.length;
    const checked = state.rows.filter(r => r.checked && !r.error).length;
    const publish = state.rows.filter(r => r.checked && !r.error && r.status === 'published').length;
    dialog.querySelector('#bi-summary').textContent = `共 ${total} 个文件，将导入 ${checked} 篇${publish ? '（其中 ' + publish + ' 篇发布）' : ''}`;
    const btn = dialog.querySelector('#bi-import');
    btn.textContent = `导入 ${checked} 篇${publish ? '（公开 ' + publish + ' 篇）' : ''}`;
    btn.disabled = state.busy || checked === 0;
  }

  function renderRows() {
    const tbody = dialog.querySelector('#bi-rows');
    const seriesOpts = '<option value="">不加入系列</option>' + (state.allSeries || []).map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join('');
    tbody.innerHTML = state.rows.map((r, i) => {
      const series = (state.allSeries || []).find(s => s.id === r.seriesId);
      const groups = (series && series.groups) || [];
      const groupOpts = '<option value="">无分组</option>' + groups.map(g => `<option value="${g.id}">${esc(g.title)}</option>`).join('');
      let status = `<span>${r.status === 'published' ? '将公开发布' : '草稿'}</span> `;
      if (r.error) status = `<span class="bi-err">${esc(r.error)}</span>`;
      else if (r.duplicate) status = `<span class="bi-dup">${esc(r.duplicate)}</span>`;
      return `<tr data-i="${i}">
        <td><input type="checkbox" class="bi-check" aria-label="导入 ${esc(r.filename)}" ${r.checked ? 'checked' : ''} ${r.error ? 'disabled' : ''} /></td>
        <td class="bi-name" title="${esc(r.filename)}">${esc(r.filename)}</td>
        <td data-label="标题"><input type="text" class="bi-title" aria-label="文章标题" value="${esc(r.title)}" /></td>
        <td data-label="所属系列"><select class="bi-row-series" aria-label="所属系列">${seriesOpts}</select></td>
        <td data-label="分组"><select class="bi-row-group" aria-label="所属分组" ${groups.length ? '' : 'disabled'}>${groupOpts}</select></td>
        <td data-label="顺序"><input type="text" class="bi-order" aria-label="章节顺序" value="${esc(r.seriesOrder == null ? '' : r.seriesOrder)}" inputmode="numeric" placeholder="顺序" /></td>
        <td data-label="状态">${status}</td>
      </tr>`;
    }).join('');
    state.rows.forEach((r, i) => {
      const tr = tbody.querySelector(`tr[data-i="${i}"]`);
      tr.querySelector('.bi-row-series').value = r.seriesId || '';
      tr.querySelector('.bi-row-group').value = r.seriesGroupId || '';
    });
  }

  // 检测章节顺序冲突（同批内 + 与已有文章）
  function collectOrderConflicts() {
    const conflicts = [];
    const seen = new Map(); // `${seriesId}:${order}` -> 文件名
    const existing = new Map();
    (state.existingArticles || []).forEach(a => {
      const order = S().normalizeOrder(a.seriesOrder);
      if (a.seriesId && order != null) existing.set(JSON.stringify([a.seriesId, a.seriesGroupId || '', order]), a.title);
    });
    for (const r of state.rows) {
      if (!r.checked || r.error || !r.seriesId) continue;
      if (r.seriesOrder == null || r.seriesOrder === '') continue;
      const key = JSON.stringify([r.seriesId, r.seriesGroupId || '', S().normalizeOrder(r.seriesOrder)]);
      if (seen.has(key)) conflicts.push(`同批「${seen.get(key)}」与「${r.filename}」顺序重复（${r.seriesOrder}）`);
      else if (existing.has(key)) conflicts.push(`与已有文章「${existing.get(key)}」顺序重复（${r.seriesOrder}）`);
      else seen.set(key, r.filename);
    }
    return conflicts;
  }

  async function doImport() {
    if (!state || state.busy) return;
    const statusEl = dialog.querySelector('#bi-status-text');
    const btn = dialog.querySelector('#bi-import');
    const toImport = state.rows.filter(r => r.checked && !r.error);
    if (!toImport.length) return;
    for (const r of toImport) {
      if (!r.title.trim()) { statusEl.textContent = '存在空标题，请补全后重试。'; return; }
      if (r.seriesOrder != null && r.seriesOrder !== '' && S().normalizeOrder(r.seriesOrder) == null) {
        statusEl.textContent = '章节顺序应为数字或留空，请检查「' + r.filename + '」。'; return;
      }
    }
    const conflicts = collectOrderConflicts();
    if (conflicts.length) {
      if (!confirm('检测到章节顺序重复：\n' + conflicts.slice(0, 5).join('\n') + '\n\n是否仍继续导入？')) return;
    }
    const publish = toImport.filter(r => r.status === 'published').length;
    if (publish && !confirm(`将公开发布 ${publish} 篇文章，访客可立即阅读。确认继续？`)) return;
    setBusy(true);
    statusEl.textContent = `正在导入 ${toImport.length} 篇…`;
    try {
      const articles = toImport.map(r => ({
        id: r.id,
        title: r.title.trim(),
        category: r.category || '未分类',
        tags: r.tags || [],
        cover: r.cover || '',
        excerpt: r.excerpt || '',
        body: r.body,
        status: r.status,
        seriesId: r.seriesId || '',
        seriesGroupId: r.seriesId ? (r.seriesGroupId || '') : '',
        seriesOrder: r.seriesId ? (r.seriesOrder == null || r.seriesOrder === '' ? null : r.seriesOrder) : null,
      }));
      const added = await S().importArticles(articles);
      const failed = state.rows.filter(r => r.error).length;
      const skipped = state.rows.filter(r => !r.checked && !r.error).length;
      statusEl.textContent = `完成：导入 ${added.length} 篇，跳过 ${skipped} 篇${failed ? '，失败 ' + failed + ' 篇' : ''}。`;
      const done = state.onDone;
      setBusy(false);
      dialog.close();
      if (done) {
        try { await done(added, { imported: added.length, skipped, failed }); }
        catch (e) { console.warn('[batch-import] 文章已导入，刷新列表失败', e); }
      }
    } catch (err) {
      statusEl.textContent = (err.saved ? '公开同步未完成：' : '导入失败：') + err.message + '（保留此窗口重试，已确认成功的文章不会重复创建）';
      setBusy(false);
      updateSummary();
    }
  }

  function setBusy(busy) {
    state.busy = busy;
    if (busy) {
      state.controls = [...dialog.querySelectorAll('input,select,button')].map(el => [el, el.disabled]);
      state.controls.forEach(([el]) => { el.disabled = true; });
    } else {
      (state.controls || []).forEach(([el, disabled]) => { el.disabled = disabled; });
      state.controls = null;
    }
  }

  async function open(files, onDone) {
    if (state && state.busy) throw new Error('正在导入，请等待完成后再选择文件');
    buildDialog();
    const allSeries = await S().getSeriesList();
    const data = await S().loadData();
    state = { files: [...files], rows: [], onDone, allSeries, existingArticles: data.articles || [], busy: false };
    const existingSlugs = new Set((data.articles || []).map(a => a.slug).filter(Boolean));
    const seenSlug = new Set(), seenName = new Set();

    for (const f of state.files) {
      const row = { id: S().genId(), file: f, checked: true, filename: f.name, title: '', category: '', tags: [], cover: '', excerpt: '', body: '', seriesId: '', seriesGroupId: '', seriesOrder: null, status: 'draft', error: '', duplicate: '' };
      try {
        const text = await f.text();
        if (!text.trim()) { row.error = '空文件'; row.checked = false; }
        else {
          const meta = S().parseMarkdownFile(text);
          row.title = (meta.title && meta.title !== '导入的文章') ? meta.title : filenameTitle(f.name);
          row.category = meta.category || '';
          row.tags = meta.tags || [];
          row.cover = meta.cover || '';
          row.excerpt = meta.excerpt || '';
          row.body = meta.body || '';
        }
      } catch (e) { row.error = '读取失败：' + e.message; row.checked = false; }
      state.rows.push(row);
    }
    for (const r of state.rows) {
      if (r.error) continue;
      const slug = S().slugify(r.title);
      if (seenName.has(r.filename)) { r.duplicate = '同批重复文件'; r.checked = false; }
      else if (seenSlug.has(slug)) { r.duplicate = '同批标题重复'; r.checked = false; }
      else if (existingSlugs.has(slug)) { r.duplicate = '可能已存在'; r.checked = false; }
      seenName.add(r.filename); seenSlug.add(slug);
    }

    dialog.querySelector('#bi-series').innerHTML = '<option value="">不加入系列</option>' + allSeries.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join('');
    dialog.querySelector('#bi-category').value = '';
    dialog.querySelector('#bi-tags').value = '';
    dialog.querySelector('#bi-status').value = 'draft';
    updateGroupOptions();
    autoNumberPrefix();
    dialog.querySelector('#bi-status-text').textContent = '';
    dialog.showModal();
  }

  window.BlogBatchImport = { open };
})();
