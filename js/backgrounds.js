/**
 * backgrounds.js —— 多场景视差背景控制（传统脚本）
 */
(function () {
  function initBackgrounds() {
    const stage = document.getElementById('bg-stage');
    if (!stage) return;

    const sceneEls = Array.from(stage.querySelectorAll('.scene'));
    const sections = ['hero', 'articles', 'projects', 'contact'].map(id => document.getElementById(id));
    const navLinks = document.querySelectorAll('.nav-links a[data-nav]');

    let currentIdx = -1;
    setActive(0);

    function setActive(idx) {
      if (idx === currentIdx) return;
      currentIdx = idx;
      sceneEls.forEach((el, i) => el.classList.toggle('active', i === idx));
      navLinks.forEach((a, i) => a.classList.toggle('active', i === idx));
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        handleScroll();
        ticking = false;
      });
    }

    function handleScroll() {
      const mid = window.innerHeight / 2;
      let activeIdx = 0;
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        if (!s) continue;
        const rect = s.getBoundingClientRect();
        if (rect.top <= mid && rect.bottom > mid) { activeIdx = i; break; }
        if (rect.top > mid && i === 0) { activeIdx = 0; break; }
        if (rect.bottom <= 0 && i === sections.length - 1) activeIdx = i;
      }
      setActive(activeIdx);

      const scroll = window.scrollY;
      const activeScene = sceneEls[activeIdx];
      if (activeScene) {
        const layers = activeScene.querySelectorAll('.layer');
        layers.forEach((layer, i) => {
          const depth = (i + 1) / layers.length;
          const offset = (scroll % window.innerHeight) * depth * 0.25;
          layer.style.transform = `translateY(${-offset}px)`;
        });
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    handleScroll();

    window.addEventListener('mousemove', (e) => {
      const mx = (e.clientX / window.innerWidth - 0.5) * 2;
      const active = sceneEls[currentIdx];
      if (!active) return;
      const layers = active.querySelectorAll('.layer');
      layers.forEach((layer, i) => {
        const depth = (i + 1) / layers.length;
        const baseTransform = layer.style.transform.replace(/ translateX\([^)]*\)/, '');
        layer.style.transform = `${baseTransform} translateX(${mx * depth * 12}px)`;
      });
    }, { passive: true });
  }

  window.initBackgrounds = initBackgrounds;
})();
