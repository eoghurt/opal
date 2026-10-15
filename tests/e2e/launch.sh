#!/bin/zsh
# Builds Opal and starts a test copy on the test vault, with debugging ports open.
source ${0:A:h}/lib.sh
# run-all.sh builds once up front and sets OPAL_SKIP_BUILD, so each check starts faster.
[[ -z $OPAL_SKIP_BUILD ]] && (cd "$R" && npm run build >/dev/null 2>&1)
cd "$R"
OPAL_USER_DATA=${OPAL_TEST_USERDATA:-$S/userdata} OPAL_WHISPER_CLI=$E/fake-whisper.sh OPAL_FAKE_MIC=1 ELECTRON_ENABLE_LOGGING=1 npx electron . --inspect=9334 --remote-debugging-port=9333 > $S/app.log 2>&1 &
echo $! > $S/app.pid
sleep 6
# The test window sits behind other windows, where macOS pauses screen refreshes; keep it running.
M "require('electron').BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false); 1" >/dev/null
