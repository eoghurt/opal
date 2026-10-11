// Drives the test copy of Opal's window through Chrome's debugging port (9333).
//   node cdp.mjs "<JavaScript>"          → runs it in the page, prints the result as JSON
//   node cdp.mjs --key "Meta+f"          → a real key press ("Escape", "Control+Tab", "Meta+1"…)
//   node cdp.mjs --type "some text"      → types text where the cursor is
//   node cdp.mjs --drag "x1,y1,x2,y2"    → press, move in steps, release
//   node cdp.mjs --move "x,y"            → moves the mouse there (hover)
//   node cdp.mjs --shot file.png         → screenshot of the window
const [flag, arg] = process.argv.slice(2);
const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const send = (method, params) => new Promise((resolve) => {
  const my = ++id;
  const on = (m) => {
    const d = JSON.parse(m.data);
    if (d.id !== my) return;
    ws.removeEventListener('message', on);
    resolve(d);
  };
  ws.addEventListener('message', on);
  ws.send(JSON.stringify({ id: my, method, params }));
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// The test window sits behind other windows, so macOS doesn't give it focus;
// a page without focus ignores selections made by code (the editor never sees
// them). With OPAL_FOCUS=1, Chrome acts as if it had focus for this one call,
// without bringing it forward. (Not always on: when the call ends the page
// counts it as losing focus, which closes any open menu.)
if (process.env.OPAL_FOCUS === '1') await send('Emulation.setFocusEmulationEnabled', { enabled: true });
const done = async (text) => { console.log(text); await wait(60); ws.close(); process.exit(0); };

if (flag === '--drag') {
  const [x1, y1, x2, y2] = arg.split(',').map(Number);
  const ev = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
  await ev('mousePressed', x1, y1, 1);
  for (let i = 1; i <= 12; i++) { await wait(16); await ev('mouseMoved', x1 + ((x2 - x1) * i) / 12, y1 + ((y2 - y1) * i) / 12, 1); }
  await ev('mouseReleased', x2, y2, 0);
  await wait(200);
  await done('"dragged"');
}
if (flag === '--move') {
  const [x, y] = arg.split(',').map(Number);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await wait(100);
  await done('"moved"');
}
if (flag === '--key') {
  const parts = arg.split('+');
  const key = parts.pop();
  const mods = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };
  const modifiers = parts.reduce((m, p) => m | (mods[p] || 0), 0);
  const code = key.length === 1 ? (/\d/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`) : key;
  const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : ({ Escape: 27, Enter: 13, Tab: 9, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Backspace: 8, ' ': 32 }[key] || 0);
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, modifiers, windowsVirtualKeyCode: vk });
  if (key.length === 1 && !(modifiers & 6)) await send('Input.dispatchKeyEvent', { type: 'char', text: key, key, modifiers });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode: vk });
  await wait(250);
  await done('"pressed"');
}
if (flag === '--type') {
  await send('Input.insertText', { text: arg });
  await wait(150);
  await done('"typed"');
}
if (flag === '--shot') {
  const d = await send('Page.captureScreenshot', { format: 'png' });
  (await import('fs')).writeFileSync(arg, Buffer.from(d.result.data, 'base64'));
  await done('"saved"');
}
const r = await send('Runtime.evaluate', { expression: flag, awaitPromise: true, returnByValue: true });
if (r.result.exceptionDetails) await done(`EXCEPTION: ${r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text}`);
await done(JSON.stringify(r.result.result.value));
