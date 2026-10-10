#!/bin/zsh
# Builds Opal and starts a test copy on the test vault, with debugging ports open.
source /Users/ethan/opal/tests/e2e/lib.sh
cd /Users/ethan/opal && npm run build >/dev/null 2>&1
OPAL_USER_DATA=$S/userdata OPAL_MAIL_FIXTURE=$E/fixtures/mail ELECTRON_ENABLE_LOGGING=1 npx electron . --inspect=9334 --remote-debugging-port=9333 > $S/app.log 2>&1 &
echo $! > $S/app.pid
sleep 6
# The test window sits behind other windows, where macOS pauses screen refreshes; keep it running.
M "require('electron').BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false); 1" >/dev/null
