// Line-by-line differences between two texts (longest common subsequence).
//   diffLines(a, b) → [{ kind: 'same' | 'removed' | 'added', text }]
// 'removed' lines are only in a, 'added' lines only in b.

export function diffLines(a, b) {
  const x = a.split(/\r?\n/);
  const y = b.split(/\r?\n/);
  // Common start and end are cheap to take off first.
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endX = x.length;
  let endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--;
    endY--;
  }
  const midX = x.slice(start, endX);
  const midY = y.slice(start, endY);
  const out = x.slice(0, start).map((text) => ({ kind: 'same', text }));
  if (midX.length * midY.length > 4_000_000) {
    // Too big to compare line by line: show it as replaced.
    out.push(...midX.map((text) => ({ kind: 'removed', text })), ...midY.map((text) => ({ kind: 'added', text })));
  } else {
    const n = midX.length;
    const m = midY.length;
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i][j] = midX[i] === midY[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && midX[i] === midY[j]) {
        out.push({ kind: 'same', text: midX[i] });
        i++;
        j++;
      } else if (j < m && (i === n || table[i][j + 1] >= table[i + 1][j])) {
        out.push({ kind: 'added', text: midY[j] });
        j++;
      } else {
        out.push({ kind: 'removed', text: midX[i] });
        i++;
      }
    }
  }
  out.push(...x.slice(endX).map((text) => ({ kind: 'same', text })));
  return out;
}
