// The shared note structure every export uses (manuscript compile, flow
// sheets, and anything that turns notes into another format later).
//
//   noteStructure(text) → [block]
//   block: { type: 'heading', level, runs }
//        | { type: 'paragraph', runs }          (runs may contain { br: true })
//        | { type: 'list', items: [{ runs, level, ordered, number, checked }] }
//        | { type: 'quote', runs }
//        | { type: 'code', text }
//        | { type: 'rule' }
//        | { type: 'table', rows: [[{ runs, header, bg, align, colspan, rowspan }]] }
//        | { type: 'image', target }
//   run:   { text, bold, italic, underline, strike, highlight, code, color, link }
//
// Properties, sticky notes and comments (%% … %% and <!-- … -->) are left out.

import { stripFrontmatter } from '../../shared/frontmatter.js';
import { stripStickies } from '../../shared/stickies.js';

export function cleanNote(text) {
  return stripStickies(stripFrontmatter(String(text || '')))
    .replace(/%%[\s\S]*?%%/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

// ---------- Inline text → runs ----------

const MARKS = [
  { open: '**', close: '**', style: 'bold' },
  { open: '__', close: '__', style: 'bold' },
  { open: '~~', close: '~~', style: 'strike' },
  { open: '==', close: '==', style: 'highlight' },
  { open: '<u>', close: '</u>', style: 'underline' },
  { open: '<b>', close: '</b>', style: 'bold' },
  { open: '<i>', close: '</i>', style: 'italic' },
  { open: '<s>', close: '</s>', style: 'strike' },
  { open: '<mark>', close: '</mark>', style: 'highlight' },
  { open: '*', close: '*', style: 'italic' },
  { open: '_', close: '_', style: 'italic' },
];

function decodeEntities(text) {
  return text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

export function inlineRuns(source, style = {}) {
  const runs = [];
  let text = '';
  const flush = () => {
    if (text) runs.push({ text: decodeEntities(text), ...style });
    text = '';
  };
  let i = 0;
  const s = String(source);
  while (i < s.length) {
    const rest = s.slice(i);
    // Line break inside a table cell.
    if (/^<br\s*\/?>/i.test(rest)) {
      flush();
      runs.push({ br: true });
      i += rest.match(/^<br\s*\/?>/i)[0].length;
      continue;
    }
    // `code`
    let m = /^`([^`]+)`/.exec(rest);
    if (m) {
      flush();
      runs.push({ text: m[1], ...style, code: true });
      i += m[0].length;
      continue;
    }
    // ![[picture]] / ![alt](picture) inline: left as its name in brackets.
    m = /^!\[\[([^\]]+)\]\]/.exec(rest) || /^!\[([^\]]*)\]\(([^)]+)\)/.exec(rest);
    if (m) {
      i += m[0].length;
      continue;
    }
    // [[Note]], [[Note|shown]], [[Note#Heading]]
    m = /^\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/.exec(rest);
    if (m) {
      flush();
      const target = m[1];
      runs.push({ text: m[2] || target.replace(/#/g, ' › '), ...style, link: target });
      i += m[0].length;
      continue;
    }
    // [text](address)
    m = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest);
    if (m) {
      flush();
      runs.push(...inlineRuns(m[1], { ...style, link: m[2] }));
      i += m[0].length;
      continue;
    }
    // <span style="color: …">…</span>
    m = /^<span style="color: ?([^";<>]+);?">([\s\S]*?)<\/span>/.exec(rest);
    if (m) {
      flush();
      runs.push(...inlineRuns(m[2], { ...style, color: m[1] }));
      i += m[0].length;
      continue;
    }
    // Paired marks (bold, italic, strike, highlight, underline).
    let matched = false;
    for (const mark of MARKS) {
      if (!rest.startsWith(mark.open)) continue;
      // Single * or _ must hug the text (so "5 * 3" stays as it is).
      const after = rest.slice(mark.open.length);
      if (mark.open.length === 1 && (/^\s/.test(after) || (mark.open === '_' && /\w$/.test(text)))) continue;
      const end = after.indexOf(mark.close, 1);
      if (end < 1) continue;
      const inner = after.slice(0, end);
      if (mark.open.length === 1 && /\s$/.test(inner)) continue;
      flush();
      runs.push(...inlineRuns(inner, { ...style, [mark.style]: true }));
      i += mark.open.length + end + mark.close.length;
      matched = true;
      break;
    }
    if (matched) continue;
    // Any other HTML tag is dropped; its text stays.
    m = /^<\/?[a-z][^>]*>/i.exec(rest);
    if (m) {
      i += m[0].length;
      continue;
    }
    // A backslash keeps the next character as it is.
    if (rest[0] === '\\' && rest.length > 1) {
      text += rest[1];
      i += 2;
      continue;
    }
    text += rest[0];
    i += 1;
  }
  flush();
  return runs;
}

export function runsText(runs) {
  return runs.map((r) => (r.br ? '\n' : r.text)).join('');
}

// ---------- Tables (Opal's HTML tables and markdown pipe tables) ----------

function htmlTable(html) {
  const rows = [];
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
    for (const tr of doc.querySelectorAll('tr')) {
      rows.push([...tr.children].filter((c) => /^T[DH]$/.test(c.tagName)).map((cell) => ({
        runs: inlineRuns(cell.innerHTML.replace(/\r?\n/g, ' ')),
        header: cell.tagName === 'TH',
        bg: cell.style.backgroundColor || cell.style.background || null,
        color: cell.style.color || null,
        align: cell.style.textAlign || null,
        colspan: Number(cell.getAttribute('colspan')) || 1,
        rowspan: Number(cell.getAttribute('rowspan')) || 1,
      })));
    }
  }
  return { type: 'table', rows };
}

function pipeRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
}

// ---------- Blocks ----------

export function noteStructure(text) {
  const lines = cleanNote(text).split(/\r?\n/);
  const blocks = [];
  let para = [];
  let list = null;
  const endPara = () => {
    if (para.length) {
      const runs = [];
      para.forEach((line, k) => {
        if (k) runs.push({ br: true });
        runs.push(...inlineRuns(line.replace(/\s+$/, '')));
      });
      blocks.push({ type: 'paragraph', runs });
    }
    para = [];
  };
  const endList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  const endAll = () => {
    endPara();
    endList();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      endAll();
      continue;
    }
    // Fenced code
    if (/^\s*(```|~~~)/.test(line)) {
      endAll();
      const fence = line.trim().slice(0, 3);
      const code = [];
      while (i + 1 < lines.length && !lines[i + 1].trim().startsWith(fence)) code.push(lines[++i]);
      i++;
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    // An HTML table (Opal's tables) runs until </table>.
    if (/^\s*<table\b/i.test(line)) {
      endAll();
      const html = [line];
      while (!/<\/table>/i.test(html[html.length - 1]) && i + 1 < lines.length) html.push(lines[++i]);
      blocks.push(htmlTable(html.join('\n')));
      continue;
    }
    // A markdown pipe table
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      endAll();
      const rows = [pipeRow(line).map((c) => ({ runs: inlineRuns(c), header: true }))];
      i++;
      while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1])) rows.push(pipeRow(lines[++i]).map((c) => ({ runs: inlineRuns(c), header: false })));
      blocks.push({ type: 'table', rows });
      continue;
    }
    let m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) {
      endAll();
      blocks.push({ type: 'heading', level: m[1].length, runs: inlineRuns(m[2]) });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      endAll();
      blocks.push({ type: 'rule' });
      continue;
    }
    m = /^\s*!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/.exec(line) || /^\s*!\[[^\]]*\]\(([^)]+)\)\s*$/.exec(line);
    if (m) {
      endAll();
      blocks.push({ type: 'image', target: m[1] });
      continue;
    }
    m = /^\s*>\s?(.*)$/.exec(line);
    if (m) {
      endAll();
      const quote = [m[1]];
      while (i + 1 < lines.length && /^\s*>/.test(lines[i + 1])) quote.push(lines[++i].replace(/^\s*>\s?/, ''));
      const runs = [];
      quote.forEach((q, k) => {
        if (k) runs.push({ br: true });
        runs.push(...inlineRuns(q.replace(/^\[!\w+\][+-]?\s*/, '')));
      });
      blocks.push({ type: 'quote', runs });
      continue;
    }
    m = /^(\s*)([-*+]|\d+[.)])\s+(\[([ xX])\]\s+)?(.*)$/.exec(line);
    if (m) {
      endPara();
      if (!list) list = { type: 'list', items: [] };
      const ordered = /\d/.test(m[2]);
      list.items.push({
        level: Math.floor(m[1].replace(/\t/g, '    ').length / 2),
        ordered,
        number: ordered ? parseInt(m[2], 10) : null,
        checked: m[3] ? m[4].toLowerCase() === 'x' : null,
        runs: inlineRuns(m[5]),
      });
      continue;
    }
    // A line continuing a list item (indented) joins it.
    if (list && /^\s{2,}\S/.test(line)) {
      const item = list.items[list.items.length - 1];
      item.runs.push({ br: true }, ...inlineRuns(line.trim()));
      continue;
    }
    endList();
    para.push(line);
  }
  endAll();
  return blocks;
}
