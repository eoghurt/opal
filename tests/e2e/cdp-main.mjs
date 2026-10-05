// Runs JavaScript in the test copy's main process (Node inspector on 9334);
// `require` works (e.g. require('electron').BrowserWindow…). Prints the result as JSON.
const [code] = process.argv.slice(2);
const list = await (await fetch('http://127.0.0.1:9334/json')).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: code, awaitPromise: true, returnByValue: true, includeCommandLineAPI: true } }));
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id !== 1) return;
  const ex = d.result && d.result.exceptionDetails;
  console.log(ex ? `EXCEPTION: ${ex.exception?.description || ex.text}` : JSON.stringify(d.result.result.value));
  ws.close();
  process.exit(0);
});
