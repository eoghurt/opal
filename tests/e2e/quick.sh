#!/bin/zsh
# Runs the named check files (checks/<name>.sh) against one fresh demo vault:  ./quick.sh v37 v38
source ${0:A:h}/lib.sh
$E/fresh.sh >/dev/null 2>&1
for f in "$@"; do source $E/checks/$f.sh; done
