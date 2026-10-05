#!/bin/zsh
# A fresh copy of the demo vault and a freshly started test copy of Opal.
source /Users/ethan/opal/tests/e2e/lib.sh
$E/stop.sh 2>/dev/null
rm -rf "$V"; cp -Rp $E/demo-vault "$V"
mkdir -p $S/userdata; printf '{"vaultPath": "%s", "palette": "Riso"}' "$V" > $S/userdata/settings.json
rm -rf "$S/userdata/Local Storage" "$S/userdata/Session Storage"
$E/launch.sh
