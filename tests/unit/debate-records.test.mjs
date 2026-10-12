// Debate rounds and practice speeches (Debate/Rounds/*.md), as Claude's
// debate-judging skill writes them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { src } from './load.mjs';

const R = await src('fidgets/debate/records');

// The contract: a practice speech exactly as the judging skill writes it.
const EXAMPLE = `---
opal-type: debate-round
round_id: PRAC-2026-10-12-P
round: Practice
format: World Schools
position: 1st Prop
motion: THBT the fifth wave of feminism will be more exclusionary
prep: "[[Fifth wave feminism]]"
prep_minutes: 30
recording: "[[PRAC-2026-10-12-P.m4a]]"
judge: Claude
wsdc_style: 26.5
wsdc_content: 27
wsdc_strategy: 13.5
wsdc_total: 67
wudc: 71
duration: "6:59"
wpm: 203
fillers: 63
score_mechanism_depth: 2
score_characterisation: 2
score_weighing_and_comparison: 1
score_structure_and_signposting: 4
form2: true
---
## Transcript
## Judging
## Symptom
## Cause
## Mini fix
## Model rewrite
`;

test('the practice speech example reads with every property', () => {
  const r = R.readRound(EXAMPLE, 'Debate/Rounds/PRAC-2026-10-12-P.md');
  assert.equal(r.round_id, 'PRAC-2026-10-12-P');
  assert.equal(r.round, 'Practice');
  assert.equal(r.format, 'World Schools');
  assert.equal(r.position, '1st Prop');
  assert.equal(r.motion, 'THBT the fifth wave of feminism will be more exclusionary');
  assert.equal(r.prep, '[[Fifth wave feminism]]');
  assert.equal(r.prepName, 'Fifth wave feminism');
  assert.equal(r.prep_minutes, 30);
  assert.equal(r.recording, '[[PRAC-2026-10-12-P.m4a]]');
  assert.equal(r.recordingName, 'PRAC-2026-10-12-P.m4a');
  assert.equal(r.judge, 'Claude');
  assert.equal(r.wsdc_style, 26.5);
  assert.equal(r.wsdc_content, 27);
  assert.equal(r.wsdc_strategy, 13.5);
  assert.equal(r.wsdc_total, 67);
  assert.equal(r.wudc, 71);
  assert.equal(r.duration, '6:59');
  assert.equal(r.wpm, 203);
  assert.equal(r.fillers, 63);
  assert.deepEqual(r.scores, { 'Mechanism depth': 2, Characterisation: 2, 'Weighing and comparison': 1, 'Structure and signposting': 4 });
  assert.equal(r.form2, true);
  assert.equal(r.date, '2026-10-12', 'the date comes from the Round ID');
  assert.equal(R.isSpeech(r), true);
  assert.equal(R.panelJudged(r), false);
});

test('the example writes back with the same properties, values and headings', () => {
  const out = R.writeRound(R.readRound(EXAMPLE, 'x.md'));
  // Every property comes back with the same value (Opal quotes "1st Prop",
  // which YAML reads the same), and these exactly as written:
  const { props } = R.readProps(out);
  for (const [k, v] of Object.entries(R.readProps(EXAMPLE).props)) assert.equal(String(props[k]), String(v), k);
  for (const line of ['prep: "[[Fifth wave feminism]]"', 'recording: "[[PRAC-2026-10-12-P.m4a]]"', 'duration: "6:59"', 'wsdc_style: 26.5', 'wsdc_strategy: 13.5', 'wsdc_total: 67', 'judge: Claude']) assert.ok(out.split('\n').includes(line), `missing: ${line}`);
  const headings = out.split('\n').filter((l) => /^## /.test(l));
  assert.deepEqual(headings, ['## Transcript', '## Judging', '## Symptom', '## Cause', '## Mini fix', '## Model rewrite']);
  // …and reads back the same.
  const again = R.readRound(out, 'x.md');
  const first = R.readRound(EXAMPLE, 'x.md');
  for (const key of ['prep', 'prep_minutes', 'recording', 'judge', 'wsdc_style', 'wsdc_content', 'wsdc_strategy', 'wsdc_total', 'wudc', 'duration', 'wpm', 'fillers', 'scores', 'form2', 'motion', 'position']) assert.deepEqual(again[key], first[key], key);
});

test('filled sections are kept, in order, through a round trip', () => {
  const text = EXAMPLE.replace('## Transcript\n', '## Transcript\n\nMadam Speaker, um, like…\n').replace('## Model rewrite\n', '## Model rewrite\n\nOpen on the mechanism.\n');
  const r = R.readRound(text, 'x.md');
  assert.equal(r.transcript, 'Madam Speaker, um, like…');
  assert.equal(r.rewrite, 'Open on the mechanism.');
  const back = R.readRound(R.writeRound(r), 'x.md');
  assert.equal(back.transcript, r.transcript);
  assert.equal(back.rewrite, r.rewrite);
});

// A competition round with none of the new properties, and what the code
// before practice speeches read and wrote for it.
const OLD = `---
opal-type: debate-round
round_id: WASDC26-R3
competition: "[[Western Australia Schools Debating Championships 2026]]"
date: 2026-05-02
round: R3
format: World Schools
position: 2nd Opp
motion: THW ban zoos
result: Loss
speaks: 74
judges: A. Lee, B. Ng
clusters: [Strategy, Execution]
deserved: Unsure
hours_slept: 7
round_of_day: 3
eaten: Yes
unusual: [Venue]
form2: true
score_round_vision: 2
score_weighing_and_comparison: 1
candidates: [Round vision]
level: Mini
seen_before: First time
priority: Do now
---

## Judge feedback

Didn't weigh the clash.

## Symptom

Lost the weighing.

## Mini fix

Say "even if" twice.
`;
const BEFORE = {
 "read": {
  "path": "Debate/Rounds/WASDC26-R3.md",
  "opal-type": "debate-round",
  "round_id": "WASDC26-R3",
  "competition": "[[Western Australia Schools Debating Championships 2026]]",
  "date": "2026-05-02",
  "round": "R3",
  "format": "World Schools",
  "position": "2nd Opp",
  "motion": "THW ban zoos",
  "result": "Loss",
  "speaks": "74",
  "judges": "A. Lee, B. Ng",
  "clusters": [
   "Strategy",
   "Execution"
  ],
  "deserved": "Unsure",
  "hours_slept": "7",
  "round_of_day": "3",
  "eaten": "Yes",
  "unusual": [
   "Venue"
  ],
  "form2": true,
  "score_round_vision": "2",
  "score_weighing_and_comparison": "1",
  "candidates": [
   "Round vision"
  ],
  "level": "Mini",
  "seen_before": "First time",
  "priority": "Do now",
  "scores": {
   "Round vision": 2,
   "Weighing and comparison": 1
  },
  "feedback": "Didn't weigh the clash.",
  "decided": "",
  "trying": "",
  "surprised": "",
  "partner": "",
  "coach": "",
  "symptom": "Lost the weighing.",
  "cause": "",
  "believe": "",
  "mini": "Say \"even if\" twice.",
  "other": "",
  "form1": true,
  "competitionName": "Western Australia Schools Debating Championships 2026"
 },
 "write": "---\nopal-type: debate-round\nround_id: WASDC26-R3\ncompetition: \"[[Western Australia Schools Debating Championships 2026]]\"\ndate: \"2026-05-02\"\nround: R3\nformat: World Schools\nposition: \"2nd Opp\"\nmotion: THW ban zoos\nresult: Loss\nspeaks: 74\njudges: A. Lee, B. Ng\nclusters: [Strategy, Execution]\ndeserved: Unsure\nhours_slept: 7\nround_of_day: 3\neaten: \"Yes\"\nunusual: [Venue]\nform2: true\nscore_round_vision: 2\nscore_weighing_and_comparison: 1\ncandidates: [Round vision]\nlevel: Mini\nseen_before: First time\npriority: Do now\n---\n\n## Judge feedback\n\nDidn't weigh the clash.\n\n## Symptom\n\nLost the weighing.\n\n## Mini fix\n\nSay \"even if\" twice.\n"
};

test('a round without the new properties reads exactly as before', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(R.readRound(OLD, 'Debate/Rounds/WASDC26-R3.md'))), BEFORE.read);
});

test('…and writes exactly as before', () => {
  assert.equal(R.writeRound(R.readRound(OLD, 'Debate/Rounds/WASDC26-R3.md')), BEFORE.write);
});

test('a second practice speech the same day gets -P2, then -P3', () => {
  assert.equal(R.practiceId('2026-10-12'), 'PRAC-2026-10-12-P');
  assert.equal(R.practiceId('2026-10-12', ['PRAC-2026-10-12-P']), 'PRAC-2026-10-12-P2');
  assert.equal(R.practiceId('2026-10-12', ['PRAC-2026-10-12-P', 'PRAC-2026-10-12-P2']), 'PRAC-2026-10-12-P3');
  assert.equal(R.practiceId('2026-10-13', ['PRAC-2026-10-12-P']), 'PRAC-2026-10-13-P');
});

test('a transcript gives wpm, fillers and the Fillers line on top of Judging', () => {
  const words = 'Right? So like, um, I think the, uh, mechanism is basically, you know, kind of like this. ';
  const r = R.applyTranscript({ duration: '1:00', judging: 'Fillers: 1 (um 1)\n\nThe judging.' }, words.repeat(10));
  assert.equal(r.fillers, 90);
  assert.equal(r.wpm, R.wordCount(words) * 10);
  assert.ok(r.judging.startsWith('Fillers: 90 (like 20, right? 10, kind of 10, you know 10, um 10, uh 10, I think 10, basically 10) · '), r.judging);
  assert.ok(r.judging.endsWith('\n\nThe judging.'), 'the old Fillers line is replaced and the judging kept');
  assert.equal(R.formatDuration(419), '6:59');
  assert.equal(R.parseDuration('6:59'), 419);
});
