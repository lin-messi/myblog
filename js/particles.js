/**
 * particles.js —— 鼠标跟随粒子 + 环境粒子（传统脚本）
 */
(function () {
  function initParticles() {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;

    // 尊重系统“减少动态效果”偏好：不启动粒子
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d');

    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;
    window.addEventListener('resize', () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    });

    const particles = [];
    const MAX = 120;
    const COLORS = ['#ff6ec4', '#7873f5', '#4ade80', '#facc15', '#22d3ee'];

    window.addEventListener('mousemove', (e) => {
      for (let i = 0; i < 3; i++) addParticle(e.clientX, e.clientY);
    });

    function addParticle(x, y, ambient = false) {
      if (particles.length >= MAX) particles.shift();
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * (ambient ? 0.6 : 1.5),
        vy: (Math.random() - 0.5) * (ambient ? 0.6 : 1.5) - (ambient ? 0.2 : 0.5),
        size: Math.random() * 3 + 1.5,
        life: 1,
        decay: ambient ? (Math.random() * 0.004 + 0.002) : (Math.random() * 0.015 + 0.008),
        color: COLORS[(Math.random() * COLORS.length) | 0],
      });
    }

    let ambientTimer = null;
    let rafId = null;
    let running = false;

    function loop() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      rafId = requestAnimationFrame(loop);
    }

    function start() {
      if (running) return;
      running = true;
      ambientTimer = setInterval(() => {
        if (particles.length < MAX * 0.6) addParticle(Math.random() * W, Math.random() * H, true);
      }, 180);
      // 初始一批（仅首次）
      if (particles.length === 0) {
        for (let i = 0; i < 30; i++) addParticle(Math.random() * W, Math.random() * H, true);
      }
      rafId = requestAnimationFrame(loop);
    }

    function stop() {
      running = false;
      if (ambientTimer) { clearInterval(ambientTimer); ambientTimer = null; }
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    start();

    // 页面不可见时暂停，回到页面再恢复（省资源）
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else start();
    });
  }

  window.initParticles = initParticles;
})();
