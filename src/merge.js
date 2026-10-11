// Merging two edits of the same note, line by line, from the version both
// started from (a "three-way merge", like git's):
//
//   merge3(base, mine, theirs) → { text, conflicts }
//
// A stretch changed on only one side takes that side's change. A stretch
// changed the same way on both sides is kept once. A stretch changed
// differently on both sides is a conflict: both versions are kept, marked
//
//   <<<<<<< Opal
//   …this window's lines…
//   =======
//   …the other app's lines…
//   >>>>>>> Other app
//
// so nothing is lost and the choice is yours.

function split(text) {
  return String(text).split(/\r?\n/);
}

// Pairs [i, j] of lines that stay the same from x to y (longest common subsequence).
function matches(x, y) {
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endX = x.length;
  let endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--;
    endY--;
  }
  const pairs = [];
  for (let k = 0; k < start; k++) pairs.push([k, k]);
  const n = endX - start;
  const m = endY - start;
  if (n && m && n * m <= 4_000_000) {
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i][j] = x[start + i] === y[start + j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (x[start + i] === y[start + j]) {
        pairs.push([start + i, start + j]);
        i++;
        j++;
      } else if (table[i + 1][j] >= table[i][j + 1]) i++;
      else j++;
    }
  }
  for (let k = 0; k < x.length - endX; k++) pairs.push([endX + k, endY + k]);
  return pairs;
}

const same = (a, b) => a.length === b.length && a.every((line, i) => line === b[i]);

export function merge3(base, mine, theirs) {
  const o = split(base);
  const a = split(mine);
  const b = split(theirs);
  const inA = new Map(matches(o, a));
  const inB = new Map(matches(o, b));
  const out = [];
  let conflicts = 0;
  let i = 0;
  let ia = 0;
  let ib = 0;
  const chunk = (k, ka, kb) => {
    const co = o.slice(i, k);
    const ca = a.slice(ia, ka);
    const cb = b.slice(ib, kb);
    if (same(ca, co)) out.push(...cb);
    else if (same(cb, co) || same(ca, cb)) out.push(...ca);
    else {
      conflicts++;
      out.push('<<<<<<< Opal', ...ca, '=======', ...cb, '>>>>>>> Other app');
    }
  };
  for (let k = 0; k < o.length; k++) {
    const ka = inA.get(k);
    const kb = inB.get(k);
    // A line unchanged on both sides (and in order) closes the stretch before it.
    if (ka === undefined || kb === undefined || ka < ia || kb < ib) continue;
    chunk(k, ka, kb);
    out.push(o[k]);
    i = k + 1;
    ia = ka + 1;
    ib = kb + 1;
  }
  chunk(o.length, a.length, b.length);
  const nl = /\r\n/.test(mine) ? '\r\n' : '\n';
  return { text: out.join(nl), conflicts };
}
