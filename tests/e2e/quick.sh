#!/bin/zsh
# Runs the named check files (checks/<name>.sh) against a fresh demo vault:  ./quick.sh v37 v38
source /Users/ethan/opal/tests/e2e/lib.sh
$E/fresh.sh >/dev/null 2>&1
for f in "$@"; do source $E/checks/$f.sh; done
