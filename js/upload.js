/**
 * upload.js —— 资料上传通道（传统脚本）
 */
(function () {
  const DB_NAME = 'myblog_uploads';
  const STORE = 'files';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPut(item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function dbAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbGet(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbDel(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  async function initUpload() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const statusEl = document.getElementById('upload-status');
    const listEl = document.getElementById('upload-list');
    if (!dropzone || !fileInput || !listEl) return;

    ['dragenter', 'dragover'].forEach(ev =>
      dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); })
    );
    ['dragleave', 'drop'].forEach(ev =>
      dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); })
    );
    dropzone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });

    async function handleFiles(fileList) {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      for (const file of files) {
        if (file.size > 200 * 1024 * 1024) {
          statusEl.textContent = `「${file.name}」超过 200MB，已跳过`;
          continue;
        }
        const id = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        statusEl.textContent = `正在保存「${file.name}」...`;
        try {
          await dbPut({
            id, name: file.name, size: file.size,
            type: file.type || 'application/octet-stream',
            uploadedAt: Date.now(),
            blob: file,
          });
        } catch (e) {
          statusEl.textContent = `保存失败：${e.message}`;
          continue;
        }
        if (window.BLOG_API_BASE) {
          try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('id', id);
            fetch(`${window.BLOG_API_BASE}/upload`, { method: 'POST', body: fd })
              .catch(err => console.warn('[upload] 后端上传失败', err));
          } catch (e) { /* ignore */ }
        }
        statusEl.textContent = `「${file.name}」已保存`;
      }
      await renderList();
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }

    async function renderList() {
      const items = await dbAll();
      items.sort((a, b) => b.uploadedAt - a.uploadedAt);
      if (!items.length) {
        listEl.innerHTML = '<li style="opacity:.5;font-style:italic;">还没有文件，传一个试试吧</li>';
        return;
      }
      listEl.innerHTML = items.map(it => `
        <li data-id="${it.id}">
          <div class="file-info">
            <span class="file-name" title="${it.name}">${it.name}</span>
            <span class="file-size">${fmtSize(it.size)}</span>
          </div>
          <div class="file-actions">
            <button data-act="download">下载</button>
            <button data-act="delete">删除</button>
          </div>
        </li>
      `).join('');
      listEl.querySelectorAll('li').forEach(li => {
        const id = li.dataset.id;
        li.querySelector('[data-act="download"]').addEventListener('click', async () => {
          const rec = await dbGet(id);
          if (!rec) return;
          const url = URL.createObjectURL(rec.blob);
          const a = document.createElement('a');
          a.href = url; a.download = rec.name; a.click();
          URL.revokeObjectURL(url);
        });
        li.querySelector('[data-act="delete"]').addEventListener('click', async () => {
          if (!confirm('确认删除该文件？')) return;
          await dbDel(id);
          await renderList();
        });
      });
    }

    await renderList();
  }

  window.initUpload = initUpload;
  // 供备份/恢复使用（导出附件、导入还原附件）
  window.BlogUpload = { dbPut, dbAll, dbGet, dbDel };
})();
