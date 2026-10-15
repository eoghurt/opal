#!/bin/zsh
# A stand-in for whisper-cli in the tests (launch.sh points OPAL_WHISPER_CLI here).
# It checks it was handed a 16 kHz mono WAV, as Opal's afconvert step makes,
# and "hears" a fixed speech with fillers in it.
while [[ $# -gt 0 ]]; do
  case $1 in
    -m) model=$2; shift 2;;
    -f) wav=$2; shift 2;;
    -of) out=$2; shift 2;;
    --prompt) shift 2;;
    *) shift;;
  esac
done
[[ -f $model ]] || { echo "no model at $model" >&2; exit 1; }
afinfo "$wav" | grep -q "1 ch,  16000 Hz" || { echo "not 16 kHz mono" >&2; exit 1; }
print -r -- "Madam Speaker, right? Um, the fifth wave is, like, basically about who gets heard." > "$out.txt"
print -r -- "And I think, you know, that is kind of the whole case, uh, for the proposition." >> "$out.txt"
