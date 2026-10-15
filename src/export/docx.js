// Writes Word (.docx) files from the shared note structure (note-structure.js).
//
//   docxFromChapters([{ title, blocks }])  → Uint8Array   (a page break between chapters)
//
// A .docx is a zip of a few XML files; this writes the smallest set Word,
// Pages and Google Docs open: the document, its styles and the zip's index.

import { zipSync, strToU8 } from 'fflate';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// CSS colour → Word's RRGGBB (or null).
function hex(color) {
  if (!color) return null;
  const c = String(color).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) return m[1].toUpperCase();
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (m) return `${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toUpperCase();
  m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
  if (m) return [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  return null;
}

function runXml(run) {
  if (run.br) return '<w:r><w:br/></w:r>';
  const props = [];
  if (run.code) props.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>');
  if (run.bold) props.push('<w:b/>');
  if (run.italic) props.push('<w:i/>');
  if (run.strike) props.push('<w:strike/>');
  const color = run.link ? '0563C1' : hex(run.color);
  if (color) props.push(`<w:color w:val="${color}"/>`);
  if (run.code) props.push('<w:sz w:val="20"/>');
  if (run.highlight) props.push('<w:highlight w:val="yellow"/>');
  if (run.underline || run.link) props.push('<w:u w:val="single"/>');
  
  const rPr = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : '';
  return String(run.text).split('\t').map((part, i) => `${i ? '<w:r><w:tab/></w:r>' : ''}<w:r>${rPr}<w:t xml:space="preserve">${esc(part)}</w:t></w:r>`).join('');
}

function paragraph(runs, { style = null, ind = null, align = null, pageBreakBefore = false, keepNext = false, border = false, shading = null } = {}) {
  const pPr = [];
  if (style) pPr.push(`<w:pStyle w:val="${style}"/>`);
  if (keepNext) pPr.push('<w:keepNext/>');
  if (pageBreakBefore) pPr.push('<w:pageBreakBefore/>');
  if (border) pPr.push('<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>');
  if (shading) pPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${shading}"/>`);
  if (ind) pPr.push(`<w:ind w:left="${ind.left || 0}" w:hanging="${ind.hanging || 0}"/>`);
  if (align) pPr.push(`<w:jc w:val="${align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'}"/>`);
  return `<w:p>${pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : ''}${runs.map(runXml).join('')}</w:p>`;
}

function tableXml(rows, { widthPct = 100, fixedCols = null } = {}) {
  const cols = Math.max(1, ...rows.map((r) => r.reduce((n, c) => n + (c.colspan || 1), 0)));
  const border = '<w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/>';
  const grid = Array.from({ length: cols }, () => `<w:gridCol w:w="${Math.floor(9000 / cols)}"/>`).join('');
  const body = rows.map((row, r) => {
    const header = row.every((c) => c.header);
    const cells = row.map((cell) => {
      const tcPr = [`<w:tcW w:w="${Math.floor(((cell.colspan || 1) * 5000) / cols)}" w:type="pct"/>`];
      if ((cell.colspan || 1) > 1) tcPr.push(`<w:gridSpan w:val="${cell.colspan}"/>`);
      const fill = hex(cell.bg);
      if (fill) tcPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`);
      const lines = [[]];
      for (const run of cell.runs || []) {
        if (run.br) lines.push([]);
        else lines[lines.length - 1].push({ ...run, bold: run.bold || cell.header, color: run.color || cell.color });
      }
      const paras = (cell.paragraphs || lines).map((runs) => paragraph(runs, { align: cell.align })).join('') || '<w:p/>';
      return `<w:tc><w:tcPr>${tcPr.join('')}</w:tcPr>${paras}</w:tc>`;
    }).join('');
    return `<w:tr>${header || r === 0 && fixedCols ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${widthPct * 50}" w:type="pct"/><w:tblBorders>${border}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl><w:p/>`;
}

// One block of the note structure → Word XML. headingShift pushes the note's
// own headings down (its title is the chapter's Heading 1).
function blockXml(block, headingShift = 0) {
  switch (block.type) {
    case 'heading':
      return paragraph(block.runs, { style: `Heading${Math.min(6, block.level + headingShift)}`, keepNext: true });
    case 'paragraph':
      return paragraph(block.runs);
    case 'quote':
      return paragraph(block.runs, { style: 'Quote' });
    case 'code':
      return block.text.split('\n').map((line) => paragraph([{ text: line || ' ', code: true }], { style: 'Code' })).join('');
    case 'rule':
      return paragraph([], { border: true });
    case 'image':
      return paragraph([{ text: `[Picture: ${block.target}]`, italic: true, color: '#777777' }]);
    case 'table':
      return tableXml(block.rows);
    case 'list': {
      const counters = [];
      return block.items.map((item) => {
        counters.length = item.level + 1;
        counters[item.level] = item.ordered ? (item.number ?? (counters[item.level] || 0) + 1) : 0;
        const bullet = item.checked === true ? '☑' : item.checked === false ? '☐' : item.ordered ? `${counters[item.level]}.` : '•';
        return paragraph([{ text: `${bullet}\t` }, ...item.runs], { style: 'ListParagraph', ind: { left: 360 + item.level * 360, hanging: 360 } });
      }).join('');
    }
    default:
      return '';
  }
}

// Plain Word styles: Arial 11pt, black on white, bold Arial headings, Word's
// usual spacing — so an export looks like an ordinary document, not the note.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-AU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:rPr><w:color w:val="404040"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="40"/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading5"><w:name w:val="heading 5"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="4"/></w:pPr><w:rPr><w:b/><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading6"><w:name w:val="heading 6"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="5"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="567" w:right="567"/></w:pPr><w:rPr><w:i/><w:color w:val="404040"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>
</w:styles>`;

function pack(bodyXml) {
  const page = '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${bodyXml}<w:sectPr>${page}</w:sectPr></w:body></w:document>`;
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/_rels/document.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(STYLES),
  });
}

// A manuscript: each chapter's title as Heading 1, a page break between chapters.
export function docxFromChapters(chapters) {
  const body = chapters.map((chapter, i) => [
    paragraph([{ text: chapter.title }], { style: 'Heading1', pageBreakBefore: i > 0 }),
    ...chapter.blocks.map((block) => blockXml(block, 1)),
  ].join('')).join('');
  return pack(body || '<w:p/>');
}

// One note as a document: its name as the heading (unless the note already
// starts with it), then its text.
export function docxFromNote(title, blocks) {
  const rest = blocks.slice();
  const first = rest[0];
  const startsWithTitle = first && first.type === 'heading' && first.level === 1 && runsPlain(first.runs).trim().toLowerCase() === String(title).trim().toLowerCase();
  if (startsWithTitle) rest.shift();
  // If the note has its own top-level headings, they sit under the title.
  const shift = rest.some((b) => b.type === 'heading' && b.level === 1) ? 1 : 0;
  const body = [paragraph([{ text: title }], { style: 'Heading1' }), ...rest.map((block) => blockXml(block, shift))].join('');
  return pack(body);
}

function runsPlain(runs) {
  return (runs || []).map((r) => (r.br ? ' ' : r.text || '')).join('');
}

