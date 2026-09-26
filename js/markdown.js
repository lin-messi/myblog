/**
 * markdown.js —— 自包含 Markdown 解析器 + 轻量代码高亮
 * 不依赖任何 CDN，支持 file:// 离线直接打开。
 * 挂到 window.MD：{ render(md), toc(md), plain(md), readingTime(md) }
 */
(function () {
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ============ 轻量代码高亮（关键字 / 字符串 / 注释 / 数字） ============
  const KEYWORDS = {
    js: 'var let const function return if else for while do switch case break continue new class extends super this typeof instanceof try catch finally throw async await yield import export default from null undefined true false void delete in of',
    ts: 'var let const function return if else for while interface type enum class extends implements public private protected readonly async await import export default from null undefined true false void number string boolean any',
    py: 'def class return if elif else for while import from as try except finally raise with lambda yield global nonlocal pass break continue True False None and or not in is async await',
    html: '',
    css: '',
    json: 'true false null',
    bash: 'if then else fi for do done while case esac function return echo cd ls export source',
    sql: 'SELECT FROM WHERE INSERT INTO UPDATE DELETE CREATE TABLE DROP ALTER JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER LIMIT AND OR NOT NULL VALUES SET',
  };

  // 代码块专用转义：只处理 & < >，保留引号，便于字符串高亮正则匹配
  function escapeCode(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function highlight(code, lang) {
    lang = (lang || '').toLowerCase();
    const escaped = escapeCode(code);
    const kwStr = KEYWORDS[lang];
    // 未指定语言、未知语言（如 c++/text）以及无需深度高亮的语言，都按普通代码返回
    if (!kwStr) return escaped;

    const tokens = [];
    let out = escaped;
    // 占位符索引用字母 a-j 编码，避免被「数字高亮」正则误伤
    const enc = (n) => String(n).replace(/[0-9]/g, d => 'abcdefghij'[+d]);
    const dec = (s) => +s.replace(/[a-j]/g, c => 'abcdefghij'.indexOf(c));

    // 用占位符保护字符串和注释，避免被关键字规则破坏
    function stash(re, cls) {
      out = out.replace(re, (m) => {
        const i = tokens.length;
        tokens.push(`<span class="tok-${cls}">${m}</span>`);
        return `\u0000${enc(i)}\u0000`;
      });
    }
    // 注释
    if (lang === 'py' || lang === 'bash') stash(/#[^\n]*/g, 'comment');
    else if (lang === 'sql') stash(/--[^\n]*/g, 'comment');
    else { stash(/\/\/[^\n]*/g, 'comment'); stash(/\/\*[\s\S]*?\*\//g, 'comment'); }
    // 字符串
    stash(/"(?:[^"\\]|\\.)*"/g, 'string');
    stash(/'(?:[^'\\]|\\.)*'/g, 'string');
    stash(/`(?:[^`\\]|\\.)*`/g, 'string');

    // 关键字
    const kws = kwStr.split(/\s+/).filter(Boolean);
    if (kws.length) {
      const re = new RegExp('\\b(' + kws.join('|') + ')\\b', 'g');
      out = out.replace(re, '<span class="tok-key">$1</span>');
    }
    // 数字
    out = out.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$1</span>');

    // 还原占位符
    out = out.replace(/\u0000([a-j]+)\u0000/g, (m, i) => tokens[dec(i)]);
    return out;
  }

  // ============ 内联解析 ============
  function inline(text) {
    let t = escapeHtml(text);
    const stash = [];
    const protect = (html) => { stash.push(html); return `\u0000${stash.length - 1}\u0000`; };

    // 先用占位符保护已生成的 HTML（行内代码 / 图片 / 链接），
    // 避免后面的强调（斜体下划线等）破坏标签内部或 URL 中的下划线
    t = t.replace(/`([^`]+)`/g, (m, c) => protect(`<code class="inline-code">${c}</code>`));
    // 图片 ![alt](url)
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (m, alt, url, title) => protect(`<img src="${url}" alt="${alt}" title="${title || alt}" loading="lazy" />`));
    // 链接 [text](url)
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (m, txt, url, title) => protect(`<a href="${url}" title="${title || ''}" target="_blank" rel="noopener">${txt}</a>`));
    // 粗体
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // 斜体
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    t = t.replace(/_([^_]+)_/g, '<em>$1</em>');
    // 删除线
    t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    // ==高亮==
    t = t.replace(/==([^=]+)==/g, '<mark>$1</mark>');
    // 颜色 {color:#xxx}text{/color}
    t = t.replace(/\{color:([^}]+)\}([\s\S]*?)\{\/color\}/g,
      (m, color, txt) => `<span style="color:${color}">${txt}</span>`);

    // 还原占位符
    t = t.replace(/\u0000(\d+)\u0000/g, (m, i) => stash[+i]);
    return t;
  }

  function slugifyHeading(text) {
    return text.trim().toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
      .replace(/\s+/g, '-').slice(0, 60);
  }

  // ============ 块级解析 ============
  function render(md) {
    if (!md) return '';
    const lines = String(md).replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let i = 0;
    const usedSlugs = {};

    function uniqueSlug(text) {
      let s = slugifyHeading(text) || 'h';
      let base = s, n = 1;
      while (usedSlugs[s]) { s = base + '-' + (n++); }
      usedSlugs[s] = true;
      return s;
    }

    while (i < lines.length) {
      let line = lines[i];

      // 代码块 ```
      const fence = line.match(/^```\s*([^\s]*)\s*$/);
      if (fence) {
        const lang = fence[1] || '';
        const buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // 跳过结束 ```
        const code = buf.join('\n');
        const hl = highlight(code, lang);
        html.push(
          `<div class="code-block" data-lang="${lang || 'text'}">` +
          `<div class="code-head"><span class="code-lang">${lang || 'text'}</span>` +
          `<button class="code-copy" type="button">复制</button></div>` +
          `<pre><code class="lang-${lang}">${hl}</code></pre></div>`
        );
        continue;
      }

      // 标题
      const h = line.match(/^(#{1,6})\s+(.+)$/);
      if (h) {
        const level = h[1].length;
        const txt = inline(h[2]);
        const slug = uniqueSlug(h[2]);
        html.push(`<h${level} id="${slug}">${txt}</h${level}>`);
        i++; continue;
      }

      // 水平分割线
      if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) { html.push('<hr />'); i++; continue; }

      // 引用块
      if (/^>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
        html.push(`<blockquote>${render(buf.join('\n'))}</blockquote>`);
        continue;
      }

      // 表格
      if (/^\|(.+)\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[i + 1])) {
        const header = line.split('|').slice(1, -1).map(s => s.trim());
        const aligns = lines[i + 1].split('|').slice(1, -1).map(s => {
          const t = s.trim();
          if (t.startsWith(':') && t.endsWith(':')) return 'center';
          if (t.endsWith(':')) return 'right';
          if (t.startsWith(':')) return 'left';
          return '';
        });
        i += 2;
        const rows = [];
        while (i < lines.length && /^\|(.+)\|\s*$/.test(lines[i])) {
          rows.push(lines[i].split('|').slice(1, -1).map(s => s.trim()));
          i++;
        }
        let tbl = '<div class="table-wrap"><table><thead><tr>';
        header.forEach((c, idx) => { tbl += `<th${aligns[idx] ? ` style="text-align:${aligns[idx]}"` : ''}>${inline(c)}</th>`; });
        tbl += '</tr></thead><tbody>';
        rows.forEach(r => {
          tbl += '<tr>';
          r.forEach((c, idx) => { tbl += `<td${aligns[idx] ? ` style="text-align:${aligns[idx]}"` : ''}>${inline(c)}</td>`; });
          tbl += '</tr>';
        });
        tbl += '</tbody></table></div>';
        html.push(tbl);
        continue;
      }

      // 无序列表
      if (/^\s*[-*+]\s+/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          buf.push(`<li>${inline(lines[i].replace(/^\s*[-*+]\s+/, ''))}</li>`);
          i++;
        }
        html.push(`<ul>${buf.join('')}</ul>`);
        continue;
      }

      // 有序列表
      if (/^\s*\d+\.\s+/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          buf.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
          i++;
        }
        html.push(`<ol>${buf.join('')}</ol>`);
        continue;
      }

      // 空行
      if (/^\s*$/.test(line)) { i++; continue; }

      // 段落（合并连续非空行）
      const buf = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
             !/^(#{1,6})\s/.test(lines[i]) && !/^```/.test(lines[i]) &&
             !/^>\s?/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i]) &&
             !/^\s*\d+\.\s+/.test(lines[i]) && !/^(\*{3,}|-{3,}|_{3,})\s*$/.test(lines[i])) {
        buf.push(lines[i]); i++;
      }
      if (buf.length === 0) {
        // 兜底：无法归类的行（如 ```c++ 等异常输入）也要推进，避免死循环
        html.push(`<p>${inline(lines[i])}</p>`);
        i++;
      } else {
        html.push(`<p>${inline(buf.join('\n')).replace(/\n/g, '<br />')}</p>`);
      }
    }

    return html.join('\n');
  }

  // 生成目录树
  function toc(md) {
    const out = [];
    const used = {};
    let inFence = false;
    String(md).replace(/\r\n/g, '\n').split('\n').forEach(line => {
      // 跳过代码块内的内容，避免把代码里的 # 误判为标题
      if (/^```/.test(line)) { inFence = !inFence; return; }
      if (inFence) return;
      const h = line.match(/^(#{1,6})\s+(.+)$/);
      if (!h) return;
      // 与 render 使用同一份 slug 算法：基于原始标题文本（不剥离下划线）
      const raw = h[2];
      let s = slugifyHeading(raw) || 'h';
      let base = s, n = 1;
      while (used[s]) { s = base + '-' + (n++); }
      used[s] = true;
      const text = raw.replace(/[*_`~]/g, '').replace(/<[^>]+>/g, '').trim();
      out.push({ level: h[1].length, text, slug: s });
    });
    return out;
  }

  function plain(md) {
    return String(md || '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]*`/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_~`=-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function readingTime(md) {
    const text = plain(md);
    // 中文按字符、英文按单词混合估算，约 300 字/分钟
    const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const words = (text.replace(/[\u4e00-\u9fa5]/g, '').match(/\b\w+\b/g) || []).length;
    const total = chinese + words;
    return { words: total, minutes: Math.max(1, Math.round(total / 300)) };
  }

  // 给已渲染容器内的「复制」按钮绑定事件
  function bindCopyButtons(container) {
    container.querySelectorAll('.code-copy').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', () => {
        const code = btn.closest('.code-block').querySelector('code');
        const text = code ? code.innerText : '';
        navigator.clipboard?.writeText(text).then(() => {
          const old = btn.textContent;
          btn.textContent = '已复制!';
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); }, 1500);
        }).catch(() => {});
      });
    });
  }

  window.MD = { render, toc, plain, readingTime, bindCopyButtons, escapeHtml };
})();
