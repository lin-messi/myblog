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

  // ============ 代码高亮，配色对齐 VS Code Dark+ ============
  const LANG_ALIAS = {
    javascript: 'js', jsx: 'js', node: 'js', mjs: 'js', cjs: 'js',
    typescript: 'ts', tsx: 'ts',
    python: 'py', py3: 'py',
    sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', terminal: 'bash', bash: 'bash',
    yml: 'yaml',
    'c++': 'cpp', cc: 'cpp', cxx: 'cpp', h: 'cpp', hpp: 'cpp', hh: 'cpp',
    xml: 'html', svg: 'html', htm: 'html',
  };

  function escapeCode(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function span(cls, text) {
    const body = escapeCode(text);
    return cls ? `<span class="tok-${cls}">${body}</span>` : body;
  }
  function readString(code, i, quote) {
    let j = i + 1;
    while (j < code.length) {
      if (code[j] === '\\') { j += 2; continue; }
      if (code[j] === quote) return j + 1;
      if (quote !== '`' && code[j] === '\n') return j;
      j++;
    }
    return code.length;
  }
  function readNumber(code, i) {
    let j = i;
    if (code.slice(j, j + 2).toLowerCase() === '0x') {
      j += 2;
      while (j < code.length && /[0-9a-fA-F]/.test(code[j])) j++;
      return j;
    }
    while (j < code.length && /[0-9]/.test(code[j])) j++;
    if (code[j] === '.' && /[0-9]/.test(code[j + 1] || '')) {
      j++;
      while (j < code.length && /[0-9]/.test(code[j])) j++;
    }
    return j;
  }

  function mapWords(list, cls) {
    const out = {};
    list.split(/\s+/).forEach(word => { if (word) out[word] = cls; });
    return out;
  }

  const JS_WORDS = Object.assign(
    mapWords('if else for while do switch case break continue return try catch finally throw new typeof instanceof in of import export from default delete yield await', 'key'),
    mapWords('var let const function class extends async static get set void this super true false null undefined', 'type')
  );
  const TS_WORDS = Object.assign({}, JS_WORDS, mapWords('interface type enum implements public private protected readonly namespace abstract declare as is keyof infer never unknown any number string boolean', 'type'));
  const PY_WORDS = Object.assign(
    mapWords('if elif else for while return try except finally raise with yield import from as pass break continue and or not in is lambda global nonlocal async await', 'key'),
    mapWords('def class True False None self cls', 'type')
  );
  const CPP_WORDS = Object.assign(
    mapWords('if else for while do switch case break continue return goto sizeof new delete try catch throw using namespace template typename public private protected virtual operator', 'key'),
    mapWords('const static extern inline volatile typedef struct enum union class int long short char float double void bool auto unsigned signed true false nullptr NULL this include define ifdef ifndef endif pragma once', 'type')
  );
  const SQL_WORDS = Object.assign(
    mapWords('select from where insert into update delete create table drop alter join left right inner outer on group by order limit and or not as set values having union distinct between like is in exists', 'key'),
    mapWords('null true false', 'type')
  );

  function highlightCode(code, words, spec) {
    let i = 0;
    let out = '';
    const n = code.length;
    while (i < n) {
      if (/\s/.test(code[i])) {
        let j = i + 1;
        while (j < n && /\s/.test(code[j])) j++;
        out += code.slice(i, j);
        i = j;
        continue;
      }
      if (spec.line && code.startsWith(spec.line, i)) {
        let j = code.indexOf('\n', i);
        if (j < 0) j = n;
        out += span('comment', code.slice(i, j));
        i = j;
        continue;
      }
      if (spec.block && code.startsWith(spec.block[0], i)) {
        const end = spec.block[1];
        let j = code.indexOf(end, i + spec.block[0].length);
        j = j < 0 ? n : j + end.length;
        out += span('comment', code.slice(i, j));
        i = j;
        continue;
      }
      if (spec.triple && (code.startsWith('"""', i) || code.startsWith("'''", i))) {
        const q = code.slice(i, i + 3);
        let j = code.indexOf(q, i + 3);
        j = j < 0 ? n : j + 3;
        out += span('string', code.slice(i, j));
        i = j;
        continue;
      }
      const q = code[i];
      if (q === '"' || q === "'" || (q === '`' && spec.template)) {
        const j = readString(code, i, q);
        out += span('string', code.slice(i, j));
        i = j;
        continue;
      }
      if (spec.hash && q === '#' && (i === 0 || code[i - 1] === '\n')) {
        let j = i + 1;
        while (j < n && /[A-Za-z_]/.test(code[j])) j++;
        out += span('key', code.slice(i, j));
        i = j;
        continue;
      }
      if (/[0-9]/.test(q) || (q === '.' && /[0-9]/.test(code[i + 1] || ''))) {
        const j = readNumber(code, i);
        out += span('num', code.slice(i, j));
        i = j;
        continue;
      }
      if (/[A-Za-z_$]/.test(q)) {
        let j = i + 1;
        while (j < n && /[\w$]/.test(code[j])) j++;
        const word = code.slice(i, j);
        const known = words[word] || words[word.toLowerCase()];
        let cls = known || '';
        if (!cls) {
          let k = j;
          while (k < n && /\s/.test(code[k])) k++;
          if (code[k] === '(') cls = 'fn';
          else if (/^[A-Z]/.test(word)) cls = 'class';
        }
        out += span(cls, word);
        i = j;
        continue;
      }
      out += escapeCode(q);
      i++;
    }
    return out;
  }

  function highlightShell(code) {
    const keywords = new Set('if then else elif fi for do done while until case esac function return in select time'.split(' '));
    let i = 0;
    let out = '';
    let expectCmd = true;
    const n = code.length;
    while (i < n) {
      const ch = code[i];
      if (ch === '\n' || ch === ';' || ch === '|' || (ch === '&' && code[i + 1] === '&')) {
        expectCmd = true;
        out += escapeCode(ch === '&' ? '&&' : ch);
        i += ch === '&' ? 2 : 1;
        continue;
      }
      if (/\s/.test(ch)) { out += ch; i++; continue; }
      if (ch === '#' && code[i - 1] !== '$') {
        let j = code.indexOf('\n', i);
        if (j < 0) j = n;
        out += span('comment', code.slice(i, j));
        i = j;
        continue;
      }
      if (ch === '"' || ch === "'") {
        const j = readString(code, i, ch);
        out += span('string', code.slice(i, j));
        i = j;
        expectCmd = false;
        continue;
      }
      if (ch === '$') {
        let j = i + 1;
        if (code[j] === '{') {
          const end = code.indexOf('}', j);
          j = end < 0 ? n : end + 1;
        } else if (code[j] === '(') {
          out += span('var', '$');
          i++;
          continue;
        } else {
          while (j < n && /[\w]/.test(code[j])) j++;
          if (j === i + 1) j++;
        }
        out += span('var', code.slice(i, j));
        i = j;
        expectCmd = false;
        continue;
      }
      if (/[0-9]/.test(ch)) {
        const j = readNumber(code, i);
        out += span('num', code.slice(i, j));
        i = j;
        expectCmd = false;
        continue;
      }
      if (/[A-Za-z_./~-]/.test(ch)) {
        let j = i + 1;
        while (j < n && /[\w./:=~+-]/.test(code[j])) j++;
        const word = code.slice(i, j);
        let cls = '';
        if (keywords.has(word)) { cls = 'key'; expectCmd = word === 'do' || word === 'then' || word === 'else'; }
        else if (/^-{1,2}[\w.-]+$/.test(word)) cls = 'attr';
        else if (expectCmd && !word.startsWith('-')) { cls = 'fn'; expectCmd = false; }
        else expectCmd = false;
        out += span(cls, word);
        i = j;
        continue;
      }
      out += escapeCode(ch);
      i++;
    }
    return out;
  }

  function highlightMarkup(code) {
    let i = 0;
    let out = '';
    const n = code.length;
    while (i < n) {
      if (code.startsWith('<!--', i)) {
        let j = code.indexOf('-->', i + 4);
        j = j < 0 ? n : j + 3;
        out += span('comment', code.slice(i, j));
        i = j;
        continue;
      }
      if (code[i] === '<') {
        out += '&lt;';
        i++;
        if (code[i] === '/') { out += '/'; i++; }
        let j = i;
        while (j < n && /[A-Za-z0-9:_-]/.test(code[j])) j++;
        if (j > i) out += span('type', code.slice(i, j));
        i = j;
        while (i < n && code[i] !== '>') {
          if (code[i] === '"' || code[i] === "'") {
            const end = readString(code, i, code[i]);
            out += span('string', code.slice(i, end));
            i = end;
            continue;
          }
          if (/[A-Za-z_:]/.test(code[i])) {
            let k = i + 1;
            while (k < n && /[\w:.-]/.test(code[k])) k++;
            out += span('attr', code.slice(i, k));
            i = k;
            continue;
          }
          out += escapeCode(code[i]);
          i++;
        }
        if (code[i] === '>') { out += '&gt;'; i++; }
        continue;
      }
      let j = code.indexOf('<', i);
      if (j < 0) j = n;
      out += escapeCode(code.slice(i, j));
      i = j;
    }
    return out;
  }

  function highlightCss(code) {
    let i = 0;
    let out = '';
    let inBlock = false;
    const n = code.length;
    while (i < n) {
      if (code.startsWith('/*', i)) {
        let j = code.indexOf('*/', i + 2);
        j = j < 0 ? n : j + 2;
        out += span('comment', code.slice(i, j));
        i = j;
        continue;
      }
      if (code[i] === '"' || code[i] === "'") {
        const j = readString(code, i, code[i]);
        out += span('string', code.slice(i, j));
        i = j;
        continue;
      }
      if (code[i] === '{') { inBlock = true; out += '{'; i++; continue; }
      if (code[i] === '}') { inBlock = false; out += '}'; i++; continue; }
      if (/[0-9]/.test(code[i]) || (code[i] === '.' && inBlock && /[0-9]/.test(code[i + 1] || ''))) {
        const j = readNumber(code, i);
        let k = j;
        while (k < n && /[a-z%]/i.test(code[k])) k++;
        out += span('num', code.slice(i, k));
        i = k;
        continue;
      }
      if (inBlock && /[A-Za-z_-]/.test(code[i])) {
        let j = i + 1;
        while (j < n && /[\w-]/.test(code[j])) j++;
        let k = j;
        while (k < n && /\s/.test(code[k])) k++;
        const word = code.slice(i, j);
        if (code[k] === ':') out += span('attr', word);
        else if (/^(important|inherit|initial|unset|none|auto|solid|bold)$/.test(word)) out += span('key', word);
        else out += span('', word);
        i = j;
        continue;
      }
      if (!inBlock && /[.#@A-Za-z_-]/.test(code[i])) {
        let j = i + 1;
        while (j < n && /[\w-]/.test(code[j])) j++;
        const word = code.slice(i, j);
        const cls = word[0] === '@' ? 'key' : word[0] === '.' ? 'class' : word[0] === '#' ? 'var' : '';
        out += span(cls, word);
        i = j;
        continue;
      }
      out += escapeCode(code[i]);
      i++;
    }
    return out;
  }

  function highlightJson(code) {
    let i = 0;
    let out = '';
    const n = code.length;
    while (i < n) {
      if (code[i] === '"') {
        const j = readString(code, i, '"');
        let k = j;
        while (k < n && /\s/.test(code[k])) k++;
        out += span(code[k] === ':' ? 'attr' : 'string', code.slice(i, j));
        i = j;
        continue;
      }
      if (/[0-9-]/.test(code[i]) && (code[i] !== '-' || /[0-9]/.test(code[i + 1] || ''))) {
        const start = i;
        if (code[i] === '-') i++;
        const j = readNumber(code, i);
        out += span('num', code.slice(start, j));
        i = j;
        continue;
      }
      if (/[A-Za-z]/.test(code[i])) {
        let j = i + 1;
        while (j < n && /[A-Za-z]/.test(code[j])) j++;
        const word = code.slice(i, j);
        out += /^(true|false|null)$/.test(word) ? span('type', word) : escapeCode(word);
        i = j;
        continue;
      }
      out += escapeCode(code[i]);
      i++;
    }
    return out;
  }

  function highlightYaml(code) {
    return code.split('\n').map(line => {
      const commentAt = line.search(/(^|\s)#/);
      const head = commentAt >= 0 ? line.slice(0, commentAt) : line;
      const tail = commentAt >= 0 ? span('comment', line.slice(commentAt)) : '';
      const key = head.match(/^(\s*-?\s*)([^:#\n][^:#]*?)(\s*)(:)(.*)$/);
      if (!key) return highlightCode(head, {}, { line: '#' }) + tail;
      const value = key[5];
      let painted = value;
      if (/^\s*(true|false|null|yes|no)\s*$/i.test(value)) painted = span('type', value);
      else if (/^\s*-?\d+(\.\d+)?\s*$/.test(value)) painted = span('num', value);
      else if (/['"]/.test(value)) painted = highlightCode(value, {}, { line: '#' });
      return escapeCode(key[1]) + span('attr', key[2]) + escapeCode(key[3]) + ':' + painted + tail;
    }).join('\n');
  }

  function highlight(code, lang) {
    const raw = String(lang || '').toLowerCase();
    const name = LANG_ALIAS[raw] || raw;
    if (name === 'bash') return highlightShell(code);
    if (name === 'html') return highlightMarkup(code);
    if (name === 'css') return highlightCss(code);
    if (name === 'json') return highlightJson(code);
    if (name === 'yaml') return highlightYaml(code);
    if (name === 'js') return highlightCode(code, JS_WORDS, { line: '//', block: ['/*', '*/'], template: true });
    if (name === 'ts') return highlightCode(code, TS_WORDS, { line: '//', block: ['/*', '*/'], template: true });
    if (name === 'py') return highlightCode(code, PY_WORDS, { line: '#', triple: true });
    if (name === 'cpp' || name === 'c') return highlightCode(code, CPP_WORDS, { line: '//', block: ['/*', '*/'], hash: true });
    if (name === 'sql') return highlightCode(code, SQL_WORDS, { line: '--', block: ['/*', '*/'] });
    return highlightCode(code, {}, { line: '//', block: ['/*', '*/'] });
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
