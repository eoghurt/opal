#!/bin/zsh
# Every check in checks/, each on its own fresh copy of the demo vault and a
# freshly started test copy of Opal. Prints each result, then a summary; exits
# non-zero if anything failed.   zsh tests/e2e/run-all.sh   (or: npm test)
source ${0:A:h}/lib.sh
out=$S/results.txt; : > $out
(cd "$R" && npm run build >/dev/null 2>&1) || { echo "build failed"; exit 1; }
export OPAL_SKIP_BUILD=1
for f in $E/checks/*.sh(on); do
  name=${f:t:r}
  echo "== $name"
  $E/fresh.sh >/dev/null 2>&1
  ( source $E/lib.sh; source $f ) 2>&1 | grep -E "^(PASS|FAIL|SKIP)|EXCEPTION" | sed "s/^/$name  /" | tee -a $out
done
$E/stop.sh 2>/dev/null
pass=$(grep -c "  PASS" $out); fail=$(grep -cE "  FAIL|EXCEPTION" $out); skip=$(grep -c "  SKIP" $out)
echo; echo "e2e: $pass passed, $fail failed, $skip skipped"
[[ $fail -eq 0 ]]
