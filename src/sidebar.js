// Sidebar: draws the vault's folder tree and reports clicks on files.

export class Sidebar {
  constructor(container, { onOpenFile }) {
    this.container = container;
    this.onOpenFile = onOpenFile;
    this.tree = [];
    this.activePath = null;
    this.expanded = new Set(); // folder paths the user has opened
  }

  setTree(tree) {
    this.tree = tree;
    this.render();
  }

  // Resets remembered folders (used when switching vaults).
  reset() {
    this.expanded.clear();
    this.activePath = null;
    this.setTree([]);
  }

  setActive(filePath) {
    this.activePath = filePath;
    // Make sure the active file is visible by opening its parent folders.
    const parts = filePath ? filePath.split('/') : [];
    for (let i = 1; i < parts.length; i++) this.expanded.add(parts.slice(0, i).join('/'));
    this.render();
  }

  hasFile(filePath) {
    const search = (nodes) => nodes.some((n) => (n.type === 'file' ? n.path === filePath : search(n.children)));
    return search(this.tree);
  }

  render() {
    const scrollTop = this.container.scrollTop;
    this.container.innerHTML = '';
    if (!this.tree.length) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'No notes yet. Click “＋ New” to create one.';
      this.container.append(empty);
      return;
    }
    this.container.append(this.renderNodes(this.tree, 0));
    this.container.scrollTop = scrollTop;
  }

  renderNodes(nodes, depth) {
    const list = document.createElement('ul');
    list.className = 'tree-list';
    for (const node of nodes) {
      const item = document.createElement('li');
      item.append(node.type === 'folder' ? this.renderFolder(node, depth) : this.renderFile(node, depth));
      list.append(item);
    }
    return list;
  }

  renderFolder(node, depth) {
    const details = document.createElement('details');
    details.open = this.expanded.has(node.path);
    const summary = document.createElement('summary');
    summary.className = 'tree-row tree-folder';
    summary.style.paddingLeft = `${12 + depth * 14}px`;
    summary.textContent = node.name;
    details.append(summary, this.renderNodes(node.children, depth + 1));
    details.addEventListener('toggle', () => {
      if (details.open) this.expanded.add(node.path);
      else this.expanded.delete(node.path);
    });
    return details;
  }

  renderFile(node, depth) {
    const row = document.createElement('div');
    row.className = 'tree-row tree-file';
    if (node.path === this.activePath) row.classList.add('active');
    row.style.paddingLeft = `${26 + depth * 14}px`;
    row.textContent = node.name.replace(/\.md$/i, '');
    row.title = node.path;
    row.addEventListener('click', () => this.onOpenFile(node.path));
    return row;
  }
}
