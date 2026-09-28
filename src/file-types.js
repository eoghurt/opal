// What kind of file something is, from the shared list in file-types.json
// (main.js reads the same list, so both sides always agree).

import FILE_TYPES from '../file-types.json';

const KIND_BY_EXTENSION = {};
for (const [kind, type] of Object.entries(FILE_TYPES)) {
  for (const ext of type.extensions) KIND_BY_EXTENSION[ext] = kind;
}

export function extensionOf(filePath) {
  const match = /\.[^./]+$/.exec(filePath);
  return match ? match[0].toLowerCase() : '';
}

// 'note', 'pdf', 'image', 'audio', 'video', 'document', 'spreadsheet', 'presentation' — or null.
export function kindOf(filePath) {
  return KIND_BY_EXTENSION[extensionOf(filePath)] || null;
}

export function kindLabel(kind) {
  return (FILE_TYPES[kind] && FILE_TYPES[kind].label) || 'File';
}

// The address viewers load a vault file from (served only by main.js).
export function fileUrl(filePath, version) {
  const encoded = filePath.split('/').map(encodeURIComponent).join('/');
  return `opal-file://vault/${encoded}${version ? `?v=${Math.round(version)}` : ''}`;
}

export function formatSize(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
