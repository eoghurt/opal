// An email's sanitised HTML (see viewers/sanitize.js) as markdown, for saving
// it as a note. Only the tags the sanitiser lets through can appear here.
//
//   toMarkdown(fragment, pictures) → markdown text
//   pictures: Map of data: URL → attachment number; those <img>s become
//   ![[{{opal-attachment:N}}]], which main swaps for the saved file's name.

const INLINE = { strong: '**', b: '**', em: '*', i: '*', s: '~~', u: null, sup: null, sub: null };

function clean(text) {
  return text.replace(/[ \t\r\n ]+/g, ' ');
}

function inline(node, pictures) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += clean(child.textContent).replace(/([*_`[\]])/g, '\\$1');
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName.toLowerCase();
    if (tag === 'br') {
      out += '\n';
    } else if (tag === 'img') {
      const n = pictures.get(child.getAttribute('src'));
      if (n != null) out += `![[{{opal-attachment:${n}}}]]`;
    } else if (tag === 'a') {
      const text = inline(child, pictures).trim();
      const href = child.title || '';
      out += href && text && text !== href ? `[${text}](${href.replace(/\)/g, '%29').replace(/ /g, '%20')})` : (text || href);
    } else if (tag === 'code') {
      out += `\`${child.textContent}\``;
    } else if (tag in INLINE) {
      const inner = inline(child, pictures);
      const mark = INLINE[tag];
      const trimmed = inner.trim();
      out += mark && trimmed ? inner.replace(trimmed, `${mark}${trimmed}${mark}`) : inner;
    } else {
      out += inline(child, pictures);
    }
  }
  return out;
}

function lines(text) {
  return text.split('\n').map((l) => l.trim()).join('\n').trim();
}

function table(el, pictures) {
  const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((cell) => lines(inline(cell, pictures)).replace(/\n/g, ' ').replace(/\|/g, '\\|')));
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (!width) return '';
  // Layout tables (one column, as newsletters use) read better as plain blocks.
  if (width === 1) return rows.map((r) => r[0]).filter(Boolean).join('\n\n');
  const pad = (r) => [...r, ...Array(width - r.length).fill('')];
  const [head, ...rest] = rows.map(pad);
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rest.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

function blocks(node, pictures, depth = 0) {
  const out = [];
  let run = '';
  const flush = () => {
    const text = lines(run);
    if (text) out.push(text);
    run = '';
  };
  for (const child of node.childNodes) {
    const tag = child.nodeType === Node.ELEMENT_NODE ? child.tagName.toLowerCase() : '';
    if (!['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'pre', 'hr', 'table'].includes(tag)) {
      if (child.nodeType === Node.TEXT_NODE) run += clean(child.textContent).replace(/([*_`[\]])/g, '\\$1');
      else if (child.nodeType === Node.ELEMENT_NODE) {
        const wrap = document.createElement('span');
        wrap.append(child.cloneNode(true));
        run += inline(wrap, pictures);
      }
      continue;
    }
    flush();
    if (tag === 'p') out.push(lines(inline(child, pictures)));
    else if (/^h[1-6]$/.test(tag)) out.push(`${'#'.repeat(Number(tag[1]))} ${lines(inline(child, pictures)).replace(/\n/g, ' ')}`);
    else if (tag === 'hr') out.push('---');
    else if (tag === 'pre') out.push(`\`\`\`\n${child.textContent.replace(/\n+$/, '')}\n\`\`\``);
    else if (tag === 'table') out.push(table(child, pictures));
    else if (tag === 'blockquote') out.push(blocks(child, pictures, depth).split('\n').map((l) => `> ${l}`.trimEnd()).join('\n'));
    else {
      const items = [...child.children].filter((li) => li.tagName.toLowerCase() === 'li');
      out.push(items.map((li, i) => {
        const marker = tag === 'ol' ? `${i + 1}.` : '-';
        const nested = [...li.children].filter((c) => /^(ul|ol)$/i.test(c.tagName));
        const own = li.cloneNode(true);
        own.querySelectorAll(':scope > ul, :scope > ol').forEach((c) => c.remove());
        const first = lines(inline(own, pictures)).replace(/\n/g, ' ');
        const sub = nested.map((n) => blocks(wrapList(n), pictures, depth + 1).split('\n').map((l) => `    ${l}`).join('\n'));
        return [`${marker} ${first}`, ...sub].join('\n');
      }).join('\n'));
    }
  }
  flush();
  return out.filter(Boolean).join('\n\n');
}

function wrapList(list) {
  const holder = document.createElement('div');
  holder.append(list.cloneNode(true));
  return holder;
}

export function toMarkdown(fragment, pictures = new Map()) {
  const holder = document.createElement('div');
  holder.append(fragment.cloneNode(true));
  return blocks(holder, pictures).replace(/\n{3,}/g, '\n\n').trim();
}

// A plain-text email as markdown: paragraphs kept, nothing read as formatting by accident.
export function textToMarkdown(text) {
  return String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map((p) => p.replace(/^(\s*)([#>])/gm, '$1\\$2').trim()).filter(Boolean).join('\n\n');
}
