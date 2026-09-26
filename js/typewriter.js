/**
 * typewriter.js —— 打字机效果（传统脚本）
 */
(function () {
  function initTypewriter(targetEl, texts, opts) {
    opts = opts || {};
    if (!targetEl || !texts || !texts.length) return;
    const typeSpeed = opts.typeSpeed != null ? opts.typeSpeed : 100;
    const eraseSpeed = opts.eraseSpeed != null ? opts.eraseSpeed : 50;
    const pauseFull = opts.pauseFull != null ? opts.pauseFull : 1800;
    const pauseEmpty = opts.pauseEmpty != null ? opts.pauseEmpty : 400;

    let i = 0, j = 0, deleting = false;
    function tick() {
      const full = texts[i];
      if (!deleting) {
        j++;
        targetEl.textContent = full.slice(0, j);
        if (j >= full.length) { deleting = true; setTimeout(tick, pauseFull); return; }
        setTimeout(tick, typeSpeed);
      } else {
        j--;
        targetEl.textContent = full.slice(0, j);
        if (j <= 0) {
          deleting = false;
          i = (i + 1) % texts.length;
          setTimeout(tick, pauseEmpty);
          return;
        }
        setTimeout(tick, eraseSpeed);
      }
    }
    tick();
  }

  window.initTypewriter = initTypewriter;
})();
