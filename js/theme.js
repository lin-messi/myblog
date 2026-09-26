/**
 * 白天 / 黑夜切换。选择记在本浏览器；没选过时跟着系统。
 */
(function () {
  var KEY = 'myblog_theme';

  function current() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    var toLight = theme !== 'light';
    var icon = btn.querySelector('.theme-icon');
    if (icon) icon.textContent = toLight ? '☀' : '☾';
    var label = toLight ? '切换到白天模式' : '切换到黑夜模式';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }

  function init() {
    apply(current());
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = current() === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(KEY, next); } catch (e) {}
      apply(next);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: light)');
    var onChange = function () {
      try { if (localStorage.getItem(KEY)) return; } catch (e) { return; }
      apply(mq.matches ? 'light' : 'dark');
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();
