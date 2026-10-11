#!/bin/zsh
# A fresh copy of the demo vault and a freshly started test copy of Opal.
source ${0:A:h}/lib.sh
$E/stop.sh 2>/dev/null
rm -rf "$V"; cp -Rp $E/demo-vault "$V"
mkdir -p $S/userdata; printf '{"vaultPath": "%s", "palette": "Riso"}' "$V" > $S/userdata/settings.json
rm -rf "$S/userdata/Local Storage" "$S/userdata/Session Storage" "$S/userdata/mail-cache" "$S/userdata/mail-drafts" "$S/userdata/mail-test-outbox"
rm -rf "$S/mail-fixture"; cp -R $E/fixtures/mail "$S/mail-fixture"   # sample emails; checks may add "new" ones
$E/launch.sh
