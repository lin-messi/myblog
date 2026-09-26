/* Exported reader: progressive enhancement only; no storage or admin dependencies. */
(function () {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced && window.initBackgrounds) window.initBackgrounds();
  const audio = document.getElementById('bg-music');
  const music = document.getElementById('music-toggle');
  if (audio && music) music.addEventListener('click', async () => {
    try {
      if (audio.paused) await audio.play(); else audio.pause();
      music.setAttribute('aria-pressed', String(!audio.paused));
      music.title = audio.paused ? '播放背景音乐' : '暂停背景音乐';
    } catch { music.title = '音乐暂时无法播放'; }
  });
  document.querySelectorAll('.code-copy').forEach(button => {
    button.addEventListener('click', async () => {
      const value = button.closest('.code-block').querySelector('code').textContent;
      try {
        if (navigator.clipboard) await navigator.clipboard.writeText(value);
        else {
          const area = document.createElement('textarea'); area.value = value; document.body.append(area); area.select();
          const copied = document.execCommand('copy'); area.remove(); if (!copied) throw new Error();
        }
        button.textContent = '已复制';
      } catch { button.textContent = '请选中代码复制'; }
    });
  });
  const search = document.getElementById('list-search');
  if (!search) return;
  const cards = [...document.querySelectorAll('#post-grid .post-card')];
  const chips = [...document.querySelectorAll('[data-cat]')];
  const indicator = document.getElementById('tag-indicator');
  let cat = 'all', tag = '', keyword = '';
  function readURL() {
    const query = new URLSearchParams(location.search);
    cat = query.get('cat') || 'all'; tag = query.get('tag') || ''; keyword = query.get('q') || ''; search.value = keyword;
    render();
  }
  function render() {
    let count = 0;
    const term = keyword.trim().toLowerCase();
    cards.forEach(card => {
      const tags = JSON.parse(card.dataset.tags);
      const visible = (cat === 'all' || card.dataset.category === cat) && (!tag || tags.some(t => t.toLowerCase() === tag.toLowerCase())) && (!term || card.dataset.search.includes(term));
      card.hidden = !visible; if (visible) count++;
    });
    chips.forEach(chip => { const selected = chip.dataset.cat === cat; chip.classList.toggle('active', selected); chip.setAttribute('aria-pressed', String(selected)); });
    document.getElementById('list-count').textContent = `共 ${count} 篇`;
    document.getElementById('list-empty').hidden = count !== 0;
    indicator.replaceChildren(); indicator.hidden = !tag;
    if (tag) {
      indicator.append(document.createTextNode('标签：' + tag + ' '));
      const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'tag-clear'; clear.textContent = '清除标签';
      clear.onclick = () => { tag = ''; updateURL(); }; indicator.append(clear);
    }
  }
  function updateURL() {
    const url = new URL(location.href); url.search = '';
    if (cat !== 'all') url.searchParams.set('cat', cat);
    if (tag) url.searchParams.set('tag', tag);
    if (keyword) url.searchParams.set('q', keyword);
    try { history.replaceState(null, '', url); } catch { /* file:// preview still filters */ }
    render();
  }
  chips.forEach(chip => chip.addEventListener('click', () => { cat = chip.dataset.cat; updateURL(); }));
  search.addEventListener('input', () => { keyword = search.value; updateURL(); });
  window.addEventListener('popstate', readURL);
  readURL();
})();
