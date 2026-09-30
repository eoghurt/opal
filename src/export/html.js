// A note as a plain printable page (for PDF export): Arial 11pt, black on
// white, A4 with 2.54 cm margins — an ordinary document, not the note's look.
// Built from the shared note structure (note-structure.js), like the Word
// export; every piece of text is escaped, and the page has no scripts.
//
//   htmlFromNote(title, blocks) → a complete HTML page

function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Only plain colour values make it into the page.
function safeColor(value) {
  return value && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(String(value).trim()) ? String(value).trim() : null;
}

function runsHtml(runs) {
  return (runs || []).map((run) => {
    if (run.br) return '<br>';
    let out = esc(run.text);
    if (run.code) out = `<code>${out}</code>`;
    if (run.bold) out = `<strong>${out}</strong>`;
    if (run.italic) out = `<em>${out}</em>`;
    if (run.underline) out = `<u>${out}</u>`;
    if (run.strike) out = `<s>${out}</s>`;
    if (run.highlight) out = `<mark>${out}</mark>`;
    const color = safeColor(run.color);
    if (run.link) out = `<span class="link">${out}</span>`;
    else if (color) out = `<span style="color: ${color}">${out}</span>`;
    return out;
  }).join('');
}

function tableHtml(rows) {
  const body = rows.map((row) => `<tr>${row.map((cell) => {
    const tag = cell.header ? 'th' : 'td';
    const style = [safeColor(cell.bg) ? `background: ${safeColor(cell.bg)}` : '', ['left', 'center', 'right'].includes(cell.align) ? `text-align: ${cell.align}` : ''].filter(Boolean).join('; ');
    const span = `${cell.colspan > 1 ? ` colspan="${Number(cell.colspan)}"` : ''}${cell.rowspan > 1 ? ` rowspan="${Number(cell.rowspan)}"` : ''}`;
    const content = cell.paragraphs ? cell.paragraphs.map((p) => `<p>${runsHtml(p)}</p>`).join('') : runsHtml(cell.runs);
    return `<${tag}${span}${style ? ` style="${style}"` : ''}>${content}</${tag}>`;
  }).join('')}</tr>`).join('');
  return `<table>${body}</table>`;
}

function listHtml(items) {
  // Nested lists from each item's level.
  let out = '';
  const open = [];
  for (const item of items) {
    while (open.length > item.level + 1) out += `</li></${open.pop()}>`;
    const tag = item.ordered ? 'ol' : 'ul';
    if (open.length === item.level + 1) {
      out += '</li>';
      if (open[open.length - 1] !== tag) {
        out += `</${open.pop()}><${tag}>`;
        open.push(tag);
      }
    } else {
      while (open.length < item.level + 1) {
        out += `<${tag}${item.checked !== undefined && item.checked !== null ? ' class="tasks"' : ''}>`;
        open.push(tag);
      }
    }
    const box = item.checked === true ? '☑ ' : item.checked === false ? '☐ ' : '';
    out += `<li${item.ordered && item.number ? ` value="${Number(item.number)}"` : ''}>${box}${runsHtml(item.runs)}`;
  }
  while (open.length) out += `</li></${open.pop()}>`;
  return out;
}

function blockHtml(block, shift) {
  switch (block.type) {
    case 'heading': {
      const level = Math.min(6, block.level + shift);
      return `<h${level}>${runsHtml(block.runs)}</h${level}>`;
    }
    case 'paragraph':
      return `<p>${runsHtml(block.runs)}</p>`;
    case 'quote':
      return `<blockquote>${runsHtml(block.runs)}</blockquote>`;
    case 'code':
      return `<pre>${esc(block.text)}</pre>`;
    case 'rule':
      return '<hr>';
    case 'image':
      return `<p class="picture">[Picture: ${esc(block.target)}]</p>`;
    case 'table':
      return tableHtml(block.rows);
    case 'list':
      return listHtml(block.items);
    default:
      return '';
  }
}

const PAGE_CSS = `
  @page { size: A4; margin: 2.54cm; }
  html { background: #FFFFFF; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.15; color: #000000; background: #FFFFFF; }
  h1, h2, h3, h4, h5, h6 { font-family: Arial, Helvetica, sans-serif; font-weight: bold; color: #000000; page-break-after: avoid; margin: 12pt 0 4pt; }
  h1 { font-size: 16pt; margin-top: 0; }
  h2 { font-size: 14pt; }
  h3 { font-size: 12pt; }
  h4, h5, h6 { font-size: 11pt; }
  h6 { font-style: italic; }
  p { margin: 0 0 8pt; }
  ul, ol { margin: 0 0 8pt; padding-left: 18pt; }
  li { margin: 0 0 3pt; }
  ul.tasks { list-style: none; padding-left: 4pt; }
  blockquote { margin: 0 18pt 8pt; font-style: italic; color: #404040; }
  pre { font-family: "Courier New", Courier, monospace; font-size: 10pt; white-space: pre-wrap; margin: 0 0 8pt; }
  code { font-family: "Courier New", Courier, monospace; font-size: 10pt; }
  hr { border: 0; border-top: 0.5pt solid #000000; margin: 8pt 0; }
  table { border-collapse: collapse; margin: 0 0 8pt; width: 100%; page-break-inside: auto; }
  th, td { border: 0.5pt solid #000000; padding: 3pt 5pt; vertical-align: top; text-align: left; }
  th { font-weight: bold; }
  td p, th p { margin: 0; }
  tr { page-break-inside: avoid; }
  mark { background: #FFF200; color: inherit; }
  .link { color: #0563C1; text-decoration: underline; }
  .picture { font-style: italic; color: #595959; }
`;

export function htmlFromNote(title, blocks) {
  const rest = blocks.slice();
  const first = rest[0];
  const plain = (runs) => (runs || []).map((r) => (r.br ? ' ' : r.text || '')).join('').trim().toLowerCase();
  if (first && first.type === 'heading' && first.level === 1 && plain(first.runs) === String(title).trim().toLowerCase()) rest.shift();
  const shift = rest.some((b) => b.type === 'heading' && b.level === 1) ? 1 : 0;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${esc(title)}</title><style>${PAGE_CSS}</style></head><body><h1>${esc(title)}</h1>${rest.map((b) => blockHtml(b, shift)).join('\n')}</body></html>`;
}
