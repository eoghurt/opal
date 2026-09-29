// Links in the markdown editor:
//  - [[Note]], [[Note|shown text]], [[Note#Heading]] show tidily (brackets and
//    the hidden part appear only while the cursor is on the link)
//  - [text](address) shows just its text; bare web addresses look like links
//  - pictures in the vault — [[photo.png]], ![[photo.png]], ![alt](photo.png) —
//    show as the picture; double-click one to edit its link text
//  - typing [[ suggests notes and files from the vault
// Clicking is handled in markdown-editor.js; the file keeps plain markdown.

import { Decoration, ViewPlugin, WidgetType, EditorView } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { fileUrl, kindOf } from '../file-types.js';

const hide = Decoration.replace({});

// Is the text cursor (not a selection) within [from, to]?
function cursorIn(state, from, to) {
  return state.selection.ranges.some((r) => r.empty && r.from >= from && r.from <= to);
}

class HeadingArrow extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-link-arrow';
    span.textContent = ' › ';
    return span;
  }
}

// A picture → the picture (found in the vault without creating anything; a
// path that doesn't match from the vault's top falls back to the file name).
class EmbedWidget extends WidgetType {
  constructor(target, findLink) {
    super();
    this.target = target;
    this.findLink = findLink;
  }

  eq(other) {
    return other.target === this.target;
  }

  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-embed';
    const img = document.createElement('img');
    img.alt = this.target;
    img.draggable = false;
    wrap.append(img);
    const name = this.target.split('/').pop();
    this.findLink(this.target)
      .then((path) => path || (name !== this.target ? this.findLink(name) : null))
      .then((path) => {
      if (path && kindOf(path) === 'image') {
        img.src = fileUrl(path);
      } else {
        wrap.classList.add('is-missing');
        wrap.textContent = `missing picture: ${this.target}`;
      }
    }).catch(() => {
      wrap.classList.add('is-missing');
      wrap.textContent = `missing picture: ${this.target}`;
    });
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

// The picture being edited as text (after a double-click), as { from, to };
// it turns back into the picture once the cursor leaves it.
const editPicture = StateEffect.define();
const editingPicture = StateField.define({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(editPicture)) return effect.value;
    if (!value) return value;
    const next = tr.docChanged ? { from: tr.changes.mapPos(value.from, -1), to: tr.changes.mapPos(value.to, 1) } : value;
    const head = tr.state.selection.main.head;
    return head >= next.from && head <= next.to ? next : null;
  },
});

function isEditing(state, from, to) {
  const editing = state.field(editingPicture, false);
  return Boolean(editing && editing.from <= from && editing.to >= to);
}

function pictureWidget(target, findLink, from, to) {
  return Decoration.replace({ widget: new EmbedWidget(target, findLink) }).range(from, to);
}

const WIKILINK = /(!?)\[\[([^[\]\n]+?)\]\]/g;
const BARE_URL = /\bhttps?:\/\/[^\s<>()[\]]+[^\s<>()[\].,;:!?'"]/g;

function buildDecorations(view, findLink) {
  const { state } = view;
  const ranges = [];
  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to);

    for (let m = WIKILINK.exec(text); m; m = WIKILINK.exec(text)) {
      const start = from + m.index;
      const end = start + m[0].length;
      const embed = m[1] === '!';
      const inner = m[2];
      // A picture, linked or embedded: show the picture itself.
      if (kindOf(inner.split('|')[0].split('#')[0].trim()) === 'image') {
        if (!isEditing(state, start, end)) ranges.push(pictureWidget(inner.split('|')[0].trim(), findLink, start, end));
        continue;
      }
      if (cursorIn(state, start, end)) continue;
      const open = start + (embed ? 3 : 2);
      ranges.push(hide.range(start, open));
      const pipe = inner.indexOf('|');
      const hash = inner.indexOf('#');
      if (pipe >= 0) {
        ranges.push(hide.range(open, open + pipe + 1)); // show only the text after |
      } else if (hash > 0) {
        ranges.push(Decoration.replace({ widget: new HeadingArrow() }).range(open + hash, open + hash + 1));
      }
      ranges.push(hide.range(end - 2, end));
    }

    // [text](address) from the markdown parser.
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'Image') {
          // ![alt](photo.png): a picture from the vault (web pictures stay links).
          const urlNode = node.node.getChild('URL');
          const url = urlNode ? state.doc.sliceString(urlNode.from, urlNode.to).replace(/^<|>$/g, '') : '';
          let target = url;
          try {
            target = decodeURIComponent(url);
          } catch {
            // Not %-encoded.
          }
          if (target && !/^[a-z][a-z0-9+.-]*:/i.test(target) && kindOf(target) === 'image' && !isEditing(state, node.from, node.to)) {
            ranges.push(pictureWidget(target, findLink, node.from, node.to));
          }
          return false;
        }
        if (node.name !== 'Link') return undefined;
        const marks = [];
        let url = null;
        for (let child = node.node.firstChild; child; child = child.nextSibling) {
          if (child.name === 'LinkMark') marks.push(child);
          if (child.name === 'URL') url = state.doc.sliceString(child.from, child.to);
        }
        if (!url || marks.length < 2 || cursorIn(state, node.from, node.to)) return false;
        const textFrom = marks[0].to;
        const textTo = marks[1].from;
        if (textTo <= textFrom) return false;
        ranges.push(hide.range(node.from, textFrom));
        ranges.push(Decoration.mark({ class: 'cm-mdlink', attributes: { 'data-href': url, title: url } }).range(textFrom, textTo));
        ranges.push(hide.range(textTo, node.to));
        return false;
      },
    });

    // Bare web addresses (not already part of a [text](address) link).
    for (let m = BARE_URL.exec(text); m; m = BARE_URL.exec(text)) {
      const start = from + m.index;
      const before = state.doc.sliceString(Math.max(0, start - 2), start);
      if (before.endsWith('(') || before.endsWith('<') || before === '](') continue;
      ranges.push(Decoration.mark({ class: 'cm-mdlink cm-url', attributes: { 'data-href': m[0], title: m[0] } }).range(start, start + m[0].length));
    }
  }
  return Decoration.set(ranges, true);
}

// findLink(target) → vault path or null, without creating anything.
export function linkPreview(findLink) {
  const plugin = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = buildDecorations(view, findLink);
      }

      update(update) {
        if (update.docChanged || update.viewportChanged || update.selectionSet
            || update.state.field(editingPicture, false) !== update.startState.field(editingPicture, false)
            || syntaxTree(update.state) !== syntaxTree(update.startState)) {
          this.decorations = buildDecorations(update.view, findLink);
        }
      }
    },
    { decorations: (p) => p.decorations },
  );
  // Double-click a picture to edit its link text.
  const doubleClick = EditorView.domEventHandlers({
    dblclick(event, view) {
      const picture = event.target.closest && event.target.closest('.cm-embed');
      if (!picture) return false;
      const set = view.plugin(plugin);
      let found = null;
      const pos = view.posAtDOM(picture);
      set.decorations.between(pos, pos + 1, (from, to) => {
        if (from === pos) found = { from, to };
      });
      if (!found) return false;
      event.preventDefault();
      view.dispatch({ effects: editPicture.of(found), selection: { anchor: found.to } });
      view.focus();
      return true;
    },
  });
  return [editingPicture, plugin, doubleClick];
}

// Typing [[ suggests notes and files. getTargets() → [{ name, folder, isNote }].
export function wikilinkCompletions(getTargets) {
  return (context) => {
    const typed = context.matchBefore(/\[\[[^[\]\n|#]*/);
    if (!typed) return null;
    const from = typed.from + 2;
    return {
      from,
      validFor: /^[^[\]\n|#]*$/,
      options: getTargets().map((t) => ({
        label: t.name,
        detail: t.folder || 'vault',
        type: t.isNote ? 'text' : 'file',
        boost: t.isNote ? 1 : 0,
        // Fills in the name and closes the link (reusing ]] if it's already there).
        apply: (view, completion, start, end) => {
          const closed = view.state.sliceDoc(end, end + 2) === ']]';
          view.dispatch({
            changes: { from: start, to: end, insert: completion.label + (closed ? '' : ']]') },
            selection: { anchor: start + completion.label.length + 2 },
          });
        },
      })),
    };
  };
}
