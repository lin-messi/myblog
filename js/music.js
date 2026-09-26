/**
 * music.js —— 背景音乐控制（传统脚本）
 */
(function () {
  function initMusic(audioSrc) {
    const audio = document.getElementById('bg-music');
    const btn = document.getElementById('music-toggle');
    if (!audio || !btn) return;
    // 未配置背景音乐时隐藏播放按钮
    if (!audioSrc) { btn.hidden = true; return; }
    audio.src = audioSrc;

    btn.addEventListener('click', async () => {
      if (!audio.src) {
        alert('暂未设置背景音乐\n请到后台管理页面填写音乐地址（mp3 链接），或把音乐放在 assets/bg.mp3');
        return;
      }
      if (audio.paused) {
        try { await audio.play(); btn.classList.add('playing'); }
        catch (e) { alert('播放失败：' + e.message); }
      } else {
        audio.pause();
        btn.classList.remove('playing');
      }
    });
  }
  window.initMusic = initMusic;
})();
