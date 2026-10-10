// Markdown (as written in Opal's editor) to simple HTML, for the HTML half of
// an email Opal sends. The plain-text half is the markdown itself.
//
//   mdToHtml(markdown) → '<p>…</p>…'
//
// Covers what people write in emails: paragraphs and line breaks, # headings,
// **bold**, *italic*, ~~strike~~, `code`, [links](https://…), bare https://
// links, - and 1. lists (nested by indent), > quotes, ``` code blocks, ---.
// Everything is escaped first, so nothing typed can become live HTML.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_, label, href) => `<a href="${href}">${label}</a>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (_, lead, href) => `${lead}<a href="${href}">${href}</a>`);
  s = s.replace(/\*\*([^*]+?)\*\*|__([^_]+?)__/g, (_, a, b) => `<strong>${a || b}</strong>`);
  s = s.replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)|(^|[^_\w])_(?!\s)([^_]+?)_(?!\w)/g, (_, l1, a, l2, b) => `${l1 ?? l2}<em>${a || b}</em>`);
  s = s.replace(/~~([^~]+?)~~/g, '<s>$1</s>');
  s = s.replace(/==([^=]+?)==/g, '<mark>$1</mark>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;

function list(lines, start) {
  const base = LIST.exec(lines[start])[1].length;
  const ordered = /\d/.test(LIST.exec(lines[start])[2]);
  const items = [];
  let i = start;
  while (i < lines.length) {
    const m = LIST.exec(lines[i]);
    if (!m || m[1].length < base) break;
    if (m[1].length > base) {
      const [html, next] = list(lines, i);
      if (items.length) items[items.length - 1] += html;
      i = next;
      continue;
    }
    const box = m[3] ? (m[3].trim() ? '☑ ' : '☐ ') : '';
    items.push(`${box}${inline(m[4])}`);
    i++;
  }
  const tag = ordered ? 'ol' : 'ul';
  return [`<${tag}>${items.map((x) => `<li>${x}</li>`).join('')}</${tag}>`, i];
}

function mdToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^```/.test(line)) {
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${mdToHtml(body.join('\n'))}</blockquote>`);
      continue;
    }
    if (LIST.test(line)) {
      const [html, next] = list(lines, i);
      out.push(html);
      i = next;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,6}\s|\s*>)/.test(lines[i]) && !LIST.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${para.map(inline).join('<br>\n')}</p>`);
  }
  return out.join('\n');
}

// The whole HTML part of an email: a plain wrapper so mail apps use a readable font.
function emailHtml(markdown) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.5;color:#16140F">\n${mdToHtml(markdown)}\n</body></html>`;
}

module.exports = { mdToHtml, emailHtml };
