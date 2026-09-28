// Turns HTML made from a document into safe page elements: only plain
// formatting tags survive, links can't be followed, and pictures must be
// embedded images. Nothing from a document can run code.

const ALLOWED = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'br',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img', 'blockquote', 'pre', 'code', 'hr',
]);

// Dropped together with everything inside them.
const DROP = new Set(['script', 'style', 'template', 'iframe', 'object', 'embed', 'svg', 'math', 'noscript']);

const SAFE_IMAGE = /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i;

export function sanitizeHtml(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const fragment = document.createDocumentFragment();
  copyChildren(parsed.body, fragment);
  return fragment;
}

function copyChildren(from, to) {
  for (const node of from.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      to.append(node.textContent);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = node.tagName.toLowerCase();
    if (DROP.has(tag)) continue;
    if (!ALLOWED.has(tag)) {
      copyChildren(node, to); // keep the text, lose the tag
      continue;
    }

    if (tag === 'img') {
      const src = node.getAttribute('src') || '';
      if (!SAFE_IMAGE.test(src)) continue;
      const img = document.createElement('img');
      img.src = src;
      img.alt = node.getAttribute('alt') || '';
      to.append(img);
      continue;
    }

    const el = document.createElement(tag);
    if (tag === 'a') {
      // Shown as a link, but inert: the address is only in the tooltip.
      const href = node.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) el.title = href;
      el.className = 'doc-link';
    }
    if (tag === 'td' || tag === 'th') {
      for (const attr of ['colspan', 'rowspan']) {
        const value = Number(node.getAttribute(attr));
        if (Number.isInteger(value) && value > 1 && value < 100) el.setAttribute(attr, String(value));
      }
    }
    copyChildren(node, el);
    to.append(el);
  }
}
