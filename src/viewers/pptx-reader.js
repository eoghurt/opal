// Reads a PowerPoint (.pptx) file into a simple list of slides and shapes.
// A .pptx is a zip of XML files: ppt/presentation.xml lists the slides,
// each slide lists its shapes, and "rels" files link parts together.
// This covers text, pictures, tables and groups; charts, SmartArt and
// animations show as labelled boxes.
//
// Result: { width, height, urls, slides: [{ background, shapes: [...] }] }
// Positions and sizes are in slide units (EMU; 12700 per point).

import { unzipSync, strFromU8 } from 'fflate';

const DEFAULT_SIZE = { cx: 12192000, cy: 6858000 }; // 16:9

const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };

// Default text sizes (points) when a slide doesn't say.
const PLACEHOLDER_SIZES = { ctrTitle: 44, title: 36, subTitle: 22, body: 20 };

export function readPptx(bytes) {
  let zip;
  try {
    zip = unzipSync(bytes);
  } catch {
    throw new Error('This file isn’t a readable PowerPoint (.pptx) file. Old .ppt files aren’t supported.');
  }
  const urls = [];

  const xml = (partPath) => {
    const data = zip[partPath];
    if (!data) return null;
    const doc = new DOMParser().parseFromString(strFromU8(data), 'application/xml');
    return doc.getElementsByTagName('parsererror').length ? null : doc;
  };

  // Resolves a relationship target against the folder of the part it's from.
  const resolve = (fromDir, target) => {
    const parts = (target.startsWith('/') ? target.slice(1) : `${fromDir}/${target}`).split('/');
    const out = [];
    for (const part of parts) {
      if (part === '..') out.pop();
      else if (part && part !== '.') out.push(part);
    }
    return out.join('/');
  };

  const relsOf = (partPath) => {
    const slash = partPath.lastIndexOf('/');
    const dir = partPath.slice(0, slash);
    const doc = xml(`${dir}/_rels/${partPath.slice(slash + 1)}.rels`);
    const map = {};
    if (!doc) return map;
    for (const rel of doc.getElementsByTagName('Relationship')) {
      const external = rel.getAttribute('TargetMode') === 'External';
      map[rel.getAttribute('Id')] = {
        type: rel.getAttribute('Type') || '',
        target: external ? null : resolve(dir, rel.getAttribute('Target') || ''),
      };
    }
    return map;
  };

  const pres = xml('ppt/presentation.xml');
  if (!pres) throw new Error('This file isn’t a readable PowerPoint (.pptx) file.');
  const sizeEl = first(pres, 'sldSz');
  const width = Number(sizeEl && sizeEl.getAttribute('cx')) || DEFAULT_SIZE.cx;
  const height = Number(sizeEl && sizeEl.getAttribute('cy')) || DEFAULT_SIZE.cy;
  const presRels = relsOf('ppt/presentation.xml');

  // Placeholder positions from a slide's layout (and that layout's master),
  // used when a slide's own shape doesn't say where it goes.
  const layoutCache = {};
  const placeholdersOf = (partPath) => {
    if (!partPath) return {};
    if (layoutCache[partPath]) return layoutCache[partPath];
    const found = {};
    layoutCache[partPath] = found;
    const doc = xml(partPath);
    if (!doc) return found;
    const rels = relsOf(partPath);
    const parent = Object.values(rels).find((r) => /\/slide(Layout|Master)$/.test(r.type) && r.target !== partPath);
    const inherited = parent && /slideLayout/.test(partPath) ? placeholdersOf(parent.target) : {};
    Object.assign(found, inherited);
    for (const sp of all(doc, 'sp')) {
      const ph = first(sp, 'ph');
      const pos = positionOf(sp);
      if (!ph || !pos) continue;
      const type = ph.getAttribute('type') || 'body';
      if (ph.getAttribute('idx')) found[`idx:${ph.getAttribute('idx')}`] = pos;
      found[`type:${type}`] = pos;
    }
    return found;
  };

  const slides = [];
  for (const sldId of all(pres, 'sldId')) {
    const rel = presRels[sldId.getAttribute('r:id')];
    if (!rel || !rel.target) continue;
    const doc = xml(rel.target);
    if (!doc) continue;
    const rels = relsOf(rel.target);
    const layout = Object.values(rels).find((r) => /\/slideLayout$/.test(r.type));
    const context = {
      rels,
      placeholders: placeholdersOf(layout && layout.target),
      zip,
      urls,
      width,
      height,
    };
    const shapes = [];
    const tree = first(doc, 'spTree');
    if (tree) walkTree(tree, identity, context, shapes);
    slides.push({ background: solidFill(first(doc, 'bg')), shapes });
  }

  return { width, height, slides, urls };
}

// ---------- Walking the shape tree ----------

const identity = (x, y, w, h) => ({ x, y, w, h });

function walkTree(tree, transform, context, shapes) {
  for (const el of tree.children) {
    switch (el.localName) {
      case 'sp': {
        const shape = readTextShape(el, context);
        if (shape) shapes.push(place(shape, transform));
        break;
      }
      case 'pic': {
        const shape = readPicture(el, context);
        if (shape) shapes.push(place(shape, transform));
        break;
      }
      case 'graphicFrame': {
        const shape = readGraphicFrame(el);
        if (shape) shapes.push(place(shape, transform));
        break;
      }
      case 'grpSp':
        walkTree(el, groupTransform(el, transform), context, shapes);
        break;
      case 'AlternateContent': {
        const choice = childNamed(el, 'Choice') || childNamed(el, 'Fallback');
        if (choice) walkTree(choice, transform, context, shapes);
        break;
      }
      default:
        break;
    }
  }
}

function place(shape, transform) {
  return { ...shape, ...transform(shape.x, shape.y, shape.w, shape.h) };
}

// Shapes inside a group use the group's own coordinates; map them to the slide's.
function groupTransform(group, outer) {
  const xfrm = first(childNamed(group, 'grpSpPr'), 'xfrm');
  if (!xfrm) return outer;
  const num = (name, attr) => Number(childNamed(xfrm, name)?.getAttribute(attr)) || 0;
  const off = { x: num('off', 'x'), y: num('off', 'y') };
  const ext = { cx: num('ext', 'cx'), cy: num('ext', 'cy') };
  const chOff = { x: num('chOff', 'x'), y: num('chOff', 'y') };
  const chExt = { cx: num('chExt', 'cx') || ext.cx, cy: num('chExt', 'cy') || ext.cy };
  const sx = chExt.cx ? ext.cx / chExt.cx : 1;
  const sy = chExt.cy ? ext.cy / chExt.cy : 1;
  return (x, y, w, h) => outer(off.x + (x - chOff.x) * sx, off.y + (y - chOff.y) * sy, w * sx, h * sy);
}

// ---------- Shapes ----------

function positionOf(el) {
  const spPr = childNamed(el, 'spPr');
  const xfrm = childNamed(spPr, 'xfrm') || childNamed(el, 'xfrm');
  if (!xfrm) return null;
  const off = childNamed(xfrm, 'off');
  const ext = childNamed(xfrm, 'ext');
  if (!off || !ext) return null;
  return {
    x: Number(off.getAttribute('x')) || 0,
    y: Number(off.getAttribute('y')) || 0,
    w: Number(ext.getAttribute('cx')) || 0,
    h: Number(ext.getAttribute('cy')) || 0,
  };
}

function readTextShape(sp, context) {
  const ph = first(childNamed(sp, 'nvSpPr'), 'ph');
  const phType = ph ? ph.getAttribute('type') || 'body' : null;
  const txBody = childNamed(sp, 'txBody');
  const fill = solidFill(childNamed(sp, 'spPr'));
  const paragraphs = txBody ? readParagraphs(txBody, phType) : [];
  const hasText = paragraphs.some((p) => p.runs.some((r) => r.text.trim()));
  if (!hasText && !fill) return null;

  let pos = positionOf(sp);
  if (!pos && ph) {
    const idx = ph.getAttribute('idx');
    const titleKey = phType === 'ctrTitle' ? 'type:title' : null;
    pos = (idx && context.placeholders[`idx:${idx}`])
      || context.placeholders[`type:${phType}`]
      || (titleKey && context.placeholders[titleKey])
      || null;
  }
  if (!pos) {
    const { width: W, height: H } = context;
    pos = phType === 'title' || phType === 'ctrTitle'
      ? { x: W * 0.07, y: H * 0.05, w: W * 0.86, h: H * 0.18 }
      : { x: W * 0.07, y: H * 0.26, w: W * 0.86, h: H * 0.66 };
  }

  const bodyPr = childNamed(txBody, 'bodyPr');
  const isTitle = phType === 'title' || phType === 'ctrTitle';
  return {
    type: 'text',
    ...pos,
    isTitle,
    fill,
    anchor: (bodyPr && bodyPr.getAttribute('anchor')) || (isTitle ? 'ctr' : 't'),
    defaultSize: PLACEHOLDER_SIZES[phType] || (phType ? PLACEHOLDER_SIZES.body : 18),
    paragraphs,
  };
}

function readParagraphs(txBody, phType) {
  const bulletsByDefault = phType === 'body' || phType === 'obj';
  return childrenNamed(txBody, 'p').map((p) => {
    const pPr = childNamed(p, 'pPr');
    const runs = [];
    for (const child of p.children) {
      if (child.localName === 'r' || child.localName === 'fld') {
        const rPr = childNamed(child, 'rPr');
        const text = childNamed(child, 't')?.textContent || '';
        runs.push({
          text,
          size: rPr && rPr.getAttribute('sz') ? Number(rPr.getAttribute('sz')) / 100 : null,
          bold: rPr?.getAttribute('b') === '1',
          italic: rPr?.getAttribute('i') === '1',
          color: solidFill(rPr),
        });
      } else if (child.localName === 'br') {
        runs.push({ text: '\n' });
      }
    }
    const noBullet = pPr && childNamed(pPr, 'buNone');
    const explicitBullet = pPr && (childNamed(pPr, 'buChar') || childNamed(pPr, 'buAutoNum'));
    return {
      level: Number(pPr?.getAttribute('lvl')) || 0,
      align: pPr?.getAttribute('algn') || null,
      bullet: Boolean(runs.length && !noBullet && (explicitBullet || bulletsByDefault)),
      runs,
    };
  });
}

function readPicture(pic, context) {
  const pos = positionOf(pic);
  if (!pos) return null;
  const blip = first(pic, 'blip');
  const rel = blip && context.rels[blip.getAttribute('r:embed')];
  const name = first(pic, 'cNvPr')?.getAttribute('name') || '';
  const target = rel && rel.target;
  const ext = target ? target.split('.').pop().toLowerCase() : '';
  const data = target && context.zip[target];
  if (!data || !IMAGE_TYPES[ext]) {
    return { type: 'image', ...pos, url: null, name, label: ext ? `[picture: .${ext}]` : '[picture]' };
  }
  const url = URL.createObjectURL(new Blob([data], { type: IMAGE_TYPES[ext] }));
  context.urls.push(url);
  return { type: 'image', ...pos, url, name };
}

function readGraphicFrame(frame) {
  const xfrm = childNamed(frame, 'xfrm');
  const off = childNamed(xfrm, 'off');
  const ext = childNamed(xfrm, 'ext');
  const pos = {
    x: Number(off?.getAttribute('x')) || 0,
    y: Number(off?.getAttribute('y')) || 0,
    w: Number(ext?.getAttribute('cx')) || 0,
    h: Number(ext?.getAttribute('cy')) || 0,
  };
  const table = first(frame, 'tbl');
  if (table) {
    const rows = childrenNamed(table, 'tr').map((tr) => childrenNamed(tr, 'tc').map((tc) => textOf(tc)));
    const tblPr = childNamed(table, 'tblPr');
    return { type: 'table', ...pos, rows, headerRow: tblPr?.getAttribute('firstRow') === '1' };
  }
  const uri = first(frame, 'graphicData')?.getAttribute('uri') || '';
  const label = /chart/.test(uri) ? '[chart]' : /diagram/.test(uri) ? '[SmartArt]' : '[embedded object]';
  return { type: 'placeholder', ...pos, label };
}

// ---------- XML helpers ----------

function all(root, localName) {
  return root ? [...root.getElementsByTagNameNS('*', localName)] : [];
}

function first(root, localName) {
  return root ? root.getElementsByTagNameNS('*', localName)[0] || null : null;
}

function childrenNamed(el, localName) {
  return el ? [...el.children].filter((c) => c.localName === localName) : [];
}

function childNamed(el, localName) {
  return childrenNamed(el, localName)[0] || null;
}

function textOf(el) {
  return all(el, 't').map((t) => t.textContent).join(' ').trim();
}

// A plain "#RRGGBB" fill directly on this element, if any (theme colours are skipped).
function solidFill(el) {
  const fill = childNamed(el, 'solidFill') || childNamed(childNamed(el, 'bgPr'), 'solidFill');
  const rgb = childNamed(fill, 'srgbClr');
  const value = rgb && rgb.getAttribute('val');
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : null;
}
