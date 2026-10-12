// Errors, written down and shown. Main process only.
//
// Every error goes to <userData>/opal.log (with the time and where it came
// from); when that file passes 1 MB it moves to opal.old.log and a new one
// starts. Errors the window should know about are also sent to it as
// 'app:error' with a short message, which it shows at the bottom of the window.
//
//   const errors = setupErrors({ app, getWindow })
//   errors.log(where, err)            → just the log file
//   errors.report(where, err, text)   → the log file and a message in the window
//
// Uncaught exceptions and unhandled promise rejections in the main process are
// caught here too (logged and shown) instead of crashing Opal or vanishing.
// Nothing private goes in the log on purpose: errors carry file paths, never
// note text.

const fs = require('fs');
const path = require('path');

const MAX_BYTES = 1024 * 1024;

function setupErrors({ app, getWindow }) {
  const file = () => path.join(app.getPath('userData'), 'opal.log');

  function line(where, err) {
    const text = err && err.stack ? err.stack : String(err && err.message ? err.message : err);
    return `${new Date().toISOString()} [${where}] ${text.replace(/\n/g, '\n    ')}\n`;
  }

  function log(where, err) {
    try {
      fs.mkdirSync(path.dirname(file()), { recursive: true });
      try {
        if (fs.statSync(file()).size > MAX_BYTES) fs.renameSync(file(), file().replace(/\.log$/, '.old.log'));
      } catch {
        // no log yet
      }
      fs.appendFileSync(file(), line(where, err));
    } catch {
      // Can't write the log (disk full?): don't make things worse.
    }
    if (process.env.OPAL_LOG_TO_CONSOLE) process.stderr.write(line(where, err));
  }

  // `text` is what the window shows, in plain words ("Couldn't save “Plan”.").
  function report(where, err, text) {
    log(where, err);
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    const detail = String(err && err.message ? err.message : err || '').split('\n')[0].slice(0, 300);
    win.webContents.send('app:error', { text: text || 'Something went wrong.', detail });
  }

  process.on('uncaughtException', (err) => report('uncaught', err, 'Something went wrong inside Opal. It has been written to the log.'));
  process.on('unhandledRejection', (reason) => report('unhandled promise', reason, 'Something went wrong inside Opal. It has been written to the log.'));

  return { log, report, file };
}

module.exports = { setupErrors };
