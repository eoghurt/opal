// Keeping links working when notes and files are renamed or moved.
//
// relinkText(text, { oldPath, newPath, moves, before, after }) returns the
// note's text with every link to a moved file pointed at its new place:
//   [[Old name]]  [[Old name|shown]]  [[Old name#Heading]]  ![[photo.png]]
//   [[Folder/Old name]]  [text](Folder/Old%20name.md)
// `moves` is a list of { from, to } vault paths; `before` / `after` are every
// file's path before and after the move (to tell same-named notes apart);
// oldPath / newPath are where this note itself was and is now.
// Used by main.js only; kept separate so it can be tested on its own.

function normal(name) {
  return String(name).replace(/\.md$/i, '').normalize('NFC').toLowerCase();
}

function baseName(p) {
  return p.slice(p.lastIndexOf('/') + 1);
}

function folderOf(p) {
  return p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
}

// The same rules as following a [[link]]: an exact path from the vault root
// first, then a name anywhere (the one nearest the root wins).
function resolve(target, paths) {
  const wanted = normal(target);
  const byPath = paths.find((p) => normal(p) === wanted);
  if (byPath) return byPath;
  return paths
    .filter((p) => normal(baseName(p)) === wanted)
    .sort((a, b) => a.split('/').length - b.split('/').length)[0] || null;
}

function joinPath(folder, relative) {
  const parts = [];
  for (const part of `${folder ? `${folder}/` : ''}${relative}`.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

// The path from one folder to a file, e.g. ('A/B', 'A/C/x.md') → '../C/x.md'.
function relativePath(fromFolder, to) {
  const from = fromFolder ? fromFolder.split('/') : [];
  const parts = to.split('/');
  let same = 0;
  while (same < from.length && same < parts.length - 1 && from[same] === parts[same]) same++;
  return [...Array(from.length - same).fill('..'), ...parts.slice(same)].join('/');
}

function relinkText(text, { oldPath, newPath, moves, before, after }) {
  const moved = new Map(moves.map((m) => [m.from, m.to]));
  let changed = false;

  // [[wikilinks]] and ![[embeds]]
  let out = text.replace(/(!?)\[\[([^[\]\n]+?)\]\]/g, (whole, bang, inner) => {
    const pipe = inner.indexOf('|');
    const head = pipe >= 0 ? inner.slice(0, pipe) : inner;
    const hash = head.indexOf('#');
    const target = (hash >= 0 ? head.slice(0, hash) : head).trim();
    if (!target) return whole;
    const found = resolve(target, before);
    const to = found && moved.get(found);
    if (!to) return whole;
    const keepExt = /\.md$/i.test(target) || !/\.md$/i.test(to);
    const strip = (p) => (keepExt ? p : p.replace(/\.md$/i, ''));
    // By name if that still finds it; otherwise by its full path.
    let next = strip(target.includes('/') ? to : baseName(to));
    if (resolve(next, after) !== to) next = strip(to);
    if (next === target) return whole;
    changed = true;
    return `${bang}[[${next}${inner.slice(hash >= 0 ? hash : head.length)}]]`;
  });

  // [text](relative/path.md) — relative to the note, then the vault root.
  const oldFolder = folderOf(oldPath);
  const newFolder = folderOf(newPath);
  out = out.replace(/(\]\()(<[^>\n]+>|[^)\s]+)(\s+"[^"\n]*")?\)/g, (whole, open, rawAddress, titlePart) => {
    const angled = rawAddress.startsWith('<');
    const address = angled ? rawAddress.slice(1, -1) : rawAddress;
    if (/^[a-z][a-z0-9+.-]*:/i.test(address) || address.startsWith('#')) return whole;
    const hash = address.indexOf('#');
    const pathPart = hash >= 0 ? address.slice(0, hash) : address;
    let decoded = pathPart;
    try {
      decoded = decodeURIComponent(pathPart);
    } catch {
      // Not %-encoded.
    }
    const lower = (p) => p.normalize('NFC').toLowerCase();
    const relative = before.find((p) => lower(p) === lower(joinPath(oldFolder, decoded)));
    const fromRoot = !relative && before.find((p) => lower(p) === lower(joinPath('', decoded)));
    const found = relative || fromRoot;
    if (!found) return whole;
    const to = moved.get(found) || found;
    // A path from the vault root only changes if the file moved; a relative
    // one also changes when this note moved.
    if (to === found && (fromRoot || oldFolder === newFolder)) return whole;
    const rel = fromRoot ? to : relativePath(newFolder, to);
    const encoded = angled || !/%[0-9a-f]{2}/i.test(pathPart) && !/\s/.test(rel) ? rel : encodeURI(rel);
    const nextAddress = (angled ? `<${encoded}` : encoded) + (hash >= 0 ? address.slice(hash) : '') + (angled ? '>' : '');
    if (nextAddress === rawAddress) return whole;
    changed = true;
    return `${open}${nextAddress}${titlePart || ''})`;
  });

  return changed ? out : text;
}

module.exports = { relinkText };
