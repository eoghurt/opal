// Counting words the same way everywhere (status bar, Details, folder homes,
// the Logbook): the note's text without its properties block, sticky notes,
// HTML tags (tables) or Obsidian comments.

const { stripFrontmatter } = require('./frontmatter.js');
const { stripStickies } = require('./stickies.js');

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

function countWords(text) {
  const clean = stripStickies(stripFrontmatter(String(text || '')))
    .replace(/%%[\s\S]*?%%/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ');
  return (clean.match(WORD) || []).length;
}

// Words in a piece of selected text (no properties to skip).
function countSelected(text) {
  return (String(text || '').replace(/<[^>]*>/g, ' ').match(WORD) || []).length;
}

module.exports = { countWords, countSelected };
