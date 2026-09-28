// Helpers for the folder tree that main.js sends:
//   [{ type: 'folder', name, path, children }, { type: 'file', name, path, created, modified }]

export function flattenFiles(nodes, out = []) {
  for (const node of nodes) {
    if (node.type === 'file') out.push(node);
    else flattenFiles(node.children, out);
  }
  return out;
}

export function findFile(nodes, filePath) {
  return flattenFiles(nodes).find((f) => f.path === filePath) || null;
}

// '' is the vault root; returns { name, path, children } or null.
export function findFolder(nodes, folderPath, rootName = '') {
  if (!folderPath) return { type: 'folder', name: rootName, path: '', children: nodes };
  for (const node of nodes) {
    if (node.type !== 'folder') continue;
    if (node.path === folderPath) return node;
    if (folderPath.startsWith(`${node.path}/`)) return findFolder(node.children, folderPath);
  }
  return null;
}

export function countNotes(folder) {
  return flattenFiles(folder.children).length;
}

export function latestModified(folder) {
  return flattenFiles(folder.children).reduce((max, f) => Math.max(max, f.modified || 0), 0);
}

export function recentFiles(nodes, limit) {
  return flattenFiles(nodes)
    .sort((a, b) => (b.modified || 0) - (a.modified || 0))
    .slice(0, limit);
}
