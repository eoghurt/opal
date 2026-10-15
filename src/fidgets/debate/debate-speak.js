// Debate pages: practice speeches. Mixed into DebateView.
//
// Speak (page 'speak'): a speech timer with the format's bells, recording
// from the microphone (or a recording dropped in from a phone). Stopping saves
// <Debate>/Rounds/Audio/<Round ID>.m4a and makes the round note
// <Debate>/Rounds/<Round ID>.md (round: Practice), then transcribes it.
// A saved speech (page 'speak' with a path): transcribe it, or paste a
// transcript; wpm, fillers and the Fillers line go into the note.
//
// io (besides DebateView's): saveAudio(relFolder, roundId, bytes, ext) →
// { name, seconds }, askForMic(), transcribe(relAudio) → { text } or
// { missing, message }.

import { h, icon } from '../../ui.js';
import { FORMATS, POSITIONS, isBP, practiceId, writeRound, formatDuration, transcriptInto, fillersLine, countFillers } from './records.js';
import { likeness } from './motions.js';

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Speaking times: seconds, the bells ([second, knocks]) and the protected
// stretches (no points of information).
const TIMES = {
  substantive: { length: 480, bells: [[60, 1], [420, 1], [480, 2]], protect: [[0, 60], [420, 480]] },
  reply: { length: 240, bells: [[180, 1], [240, 2]], protect: [] },
  bp: { length: 420, bells: [[60, 1], [360, 1], [420, 2]], protect: [[0, 60], [360, 420]] },
};
export const timesFor = (format, kind) => (isBP(format) ? TIMES.bp : kind === 'reply' ? TIMES.reply : TIMES.substantive);
const AUDIO_TYPES = ['m4a', 'mp4', 'mp3', 'wav', 'aac', 'aif', 'aiff', 'caf'];
const isPractice = (r) => r.round === 'Practice';
const short = (date) => (date ? new Date(`${date}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

export const speakPages = {
  // ---------- Speak ----------

  speakPage() {
    if (this.state.path) return this.speechResult();
    const sp = this.speakSetup();
    const rec = this.recording;
    const times = timesFor(sp.format, sp.kind);
    const positions = POSITIONS[sp.format] || POSITIONS['World Schools'];
    const pct = (s) => `${(s / times.length) * 100}%`;
    const track = h('div', { class: 'deb-track', 'aria-hidden': 'true' },
      h('div', { class: 'deb-track-bar' },
        times.protect.map(([a, b]) => h('span', { class: 'deb-track-protect', style: `left: ${pct(a)}; width: ${pct(b - a)}` })),
        h('span', { class: 'deb-track-fill', style: 'width: 0%' })),
      times.bells.map(([s]) => h('span', { class: 'deb-bell', style: `left: calc(${pct(s)} - ${s === times.length ? 2 : 1}px)` }, h('i', null, formatDuration(s)))));
    const knocks = times.bells.map(([s, n]) => `${n === 2 ? 'two' : 'one'} at ${formatDuration(s)}`).join(' · ');
    const timer = h('section', { class: `deb-timer${rec ? ' is-live' : ''}`, 'aria-label': 'Speech timer' },
      h('div', { class: 'deb-timer-top' },
        h('div', { class: 'deb-clock', role: 'timer', 'aria-live': 'off' }, '0:00', h('small', null, `of ${formatDuration(times.length)}`)),
        h('div', { class: 'deb-level', 'aria-hidden': 'true' }, Array.from({ length: 10 }, () => h('i')))),
      track,
      h('div', { class: 'deb-legend' },
        times.protect.length ? h('span', null, h('span', { class: 'deb-protect-key' }), 'protected · no POIs') : null,
        h('span', null, knocks)),
      h('div', { class: 'deb-inline' },
        rec ? [
          this.button('■ Stop and save', () => this.stopRecording(true), 'record'),
          this.button(rec.paused ? 'Resume' : 'Pause', () => this.pauseRecording(), 'ghost'),
          this.button('Discard', () => this.stopRecording(false), 'ghost'),
        ] : [
          this.button('● Start speaking', () => this.startRecording(), 'record'),
          h('span', { class: 'deb-small' }, 'Records to Rounds/Audio and makes the round note when you stop'),
        ]));
    const fileInput = h('input', { type: 'file', accept: 'audio/*,.m4a,.mp3,.wav', hidden: true, onchange: (e) => { if (e.target.files[0]) this.useAudioFile(e.target.files[0]); } });
    const drop = h('div', {
      class: 'deb-drop',
      ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('is-over'); },
      ondragleave: (e) => e.currentTarget.classList.remove('is-over'),
      ondrop: (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('is-over');
        const file = [...(e.dataTransfer?.files || [])][0];
        if (file) this.useAudioFile(file);
      },
    }, h('span', null, 'Or drop a recording from your phone here'), h('small', null, '.m4a, .mp3, .wav · turned into .m4a · ', h('button', { type: 'button', class: 'deb-link', onclick: () => fileInput.click() }, 'choose a file')), fileInput);
    const locked = Boolean(rec);
    const setup = this.card(null, null,
      this.q('Motion', h('button', { type: 'button', class: 'deb-motion-pick', disabled: locked, onclick: (e) => this.pickMotion(sp, e.currentTarget) },
        h('span', null, sp.motion || 'Pick from the motion bank, or type it'), h('span', { class: 'deb-muted' }, '⌄'))),
      this.q('Format', this.pick(sp, 'format', FORMATS.filter((f) => f !== 'Other'), { small: true, after: () => { sp.position = ''; sp.kind = 'substantive'; } })),
      isBP(sp.format) ? null : this.q('Speech', h('div', { class: 'deb-seg' }, [['substantive', `Substantive · ${formatDuration(TIMES.substantive.length)}`], ['reply', `Reply · ${formatDuration(TIMES.reply.length)}`]].map(([k, label]) => h('button', {
        type: 'button', class: `deb-seg-btn${sp.kind === k ? ' is-on' : ''}`, disabled: locked, onclick: () => { sp.kind = k; this.render(); },
      }, label)))),
      this.q('Position', this.pick(sp, 'position', positions, { small: true, after: (p) => { if (!isBP(sp.format)) sp.kind = /reply/i.test(p) ? 'reply' : 'substantive'; } })),
      this.q('Prep time', this.pick(sp, 'prepMinutes', ['15', '30', '60'].map((m) => ({ value: m, label: `${m} min` })), { small: true })),
      locked ? null : drop);
    setup.classList.add('is-stacked');
    const page = h('div', { class: 'deb-page' },
      this.head(['Practice speech', sp.prepName ? `prep: ${sp.prepName}` : null].filter(Boolean).join(' · '), sp.motion || 'Speak.'),
      this.speechNotice ? h('div', { class: 'deb-notice is-amber' }, this.speechNotice) : null,
      h('div', { class: 'deb-split' }, timer, setup));
    if (rec) requestAnimationFrame(() => this.tickRecording());
    return page;
  },

  // What the speech is (kept while the page redraws): from a prep note, a
  // motion in the bank, or the Log page's Practice option.
  speakSetup() {
    const key = `${this.state.prep || ''}|${this.state.motion || ''}|${this.state.motionText || ''}`;
    if (this.sp && this.sp.key === key) return this.sp;
    const prep = this.state.prep ? this.data.preps.find((p) => p.path === this.state.prep) : null;
    const motion = this.state.motion ? this.data.motions.find((m) => m.id === this.state.motion) : null;
    const prepNote = prep || (motion && motion.prep) || null;
    const format = this.state.format || 'World Schools';
    const position = this.state.position || '';
    this.sp = {
      key,
      motion: this.state.motionText || (prep && prep.text) || (motion && motion.text) || '',
      prepName: prepNote ? prepNote.name : '',
      format,
      position,
      kind: /reply/i.test(position) ? 'reply' : 'substantive',
      prepMinutes: prepNote ? String(this.ui.prep) : '',
    };
    return this.sp;
  },

  async startRecording() {
    if (this.recording) return;
    this.speechNotice = '';
    if (!(await this.io.askForMic())) {
      this.speechNotice = 'Opal isn’t allowed to use the microphone. Turn it on in System Settings › Privacy & Security › Microphone, or drop in a recording instead.';
      this.render();
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
    } catch (err) {
      this.speechNotice = `The microphone didn’t start: ${err.message}`;
      this.render();
      return;
    }
    const type = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 512;
    audio.createMediaStreamSource(stream).connect(analyser);
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.start(1000);
    this.recording = { recorder, stream, chunks, audio, analyser, started: performance.now(), pausedFor: 0, pausedAt: null, paused: false, rung: new Set(), levels: [] };
    this.typing = true; // no redraws from file changes while speaking
    this.render();
  },

  elapsed() {
    const r = this.recording;
    if (!r) return 0;
    const now = r.paused ? r.pausedAt : performance.now();
    return (now - r.started - r.pausedFor) / 1000;
  },

  pauseRecording() {
    const r = this.recording;
    if (!r) return;
    if (r.paused) {
      r.pausedFor += performance.now() - r.pausedAt;
      r.paused = false;
      r.recorder.resume();
    } else {
      r.pausedAt = performance.now();
      r.paused = true;
      r.recorder.pause();
    }
    this.render();
  },

  // The clock, the bar, the level meter and the bells; runs while recording.
  tickRecording() {
    const r = this.recording;
    if (!r || this.tickPending) return;
    this.tickPending = true;
    const frame = () => {
      this.tickPending = false;
      if (this.recording !== r || !this.root.isConnected) return;
      const sp = this.sp || {};
      const times = timesFor(sp.format, sp.kind);
      const s = this.elapsed();
      const clock = this.root.querySelector('.deb-clock');
      if (clock) {
        clock.firstChild.textContent = s > times.length ? `+${formatDuration(s - times.length)}` : formatDuration(Math.floor(s));
        clock.classList.toggle('is-over', s > times.length);
        clock.classList.toggle('is-protected', times.protect.some(([a, b]) => s >= a && s < b));
      }
      const fill = this.root.querySelector('.deb-track-fill');
      if (fill) fill.style.width = `${Math.min(100, (s / times.length) * 100)}%`;
      for (const [at, n] of times.bells) {
        if (s >= at && !r.rung.has(at)) {
          r.rung.add(at);
          this.knock(n);
        }
      }
      if (!r.paused) {
        const data = new Uint8Array(r.analyser.fftSize);
        r.analyser.getByteTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / data.length);
        r.levels = [...r.levels.slice(-9), Math.min(1, rms * 4)];
      }
      const bars = this.root.querySelectorAll('.deb-level i');
      bars.forEach((bar, i) => { bar.style.height = `${Math.max(8, (r.levels[i] || 0) * 100)}%`; });
      this.tickPending = true;
      setTimeout(() => requestAnimationFrame(frame), 100);
    };
    requestAnimationFrame(frame);
  },

  // The bell: a short knock, or two.
  knock(times) {
    const r = this.recording;
    const audio = r ? r.audio : new AudioContext();
    for (let i = 0; i < times; i++) {
      const at = audio.currentTime + i * 0.28;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 1320;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.35, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + 0.25);
    }
    const timer = this.root.querySelector('.deb-timer');
    if (timer) {
      timer.classList.remove('is-bell');
      void timer.offsetWidth;
      timer.classList.add('is-bell');
    }
  },

  // Stop: `save` keeps it (the audio and the round note), otherwise it's thrown away.
  async stopRecording(save) {
    const r = this.recording;
    if (!r) return;
    const seconds = this.elapsed();
    this.recording = null;
    this.typing = false;
    const done = new Promise((resolve) => { r.recorder.onstop = resolve; });
    if (r.recorder.state !== 'inactive') r.recorder.stop();
    await done;
    r.stream.getTracks().forEach((t) => t.stop());
    setTimeout(() => r.audio.close().catch(() => {}), 1000);
    if (!save) {
      this.render();
      return;
    }
    const bytes = new Uint8Array(await new Blob(r.chunks, { type: r.recorder.mimeType || 'audio/mp4' }).arrayBuffer());
    await this.saveSpeech(bytes, 'm4a', seconds);
  },

  async useAudioFile(file) {
    const ext = (/\.([a-z0-9]+)$/i.exec(file.name) || [])[1]?.toLowerCase() || '';
    if (!AUDIO_TYPES.includes(ext)) {
      this.speechNotice = `Opal can’t use .${ext || '?'} audio. Try .m4a, .mp3 or .wav.`;
      this.render();
      return;
    }
    await this.saveSpeech(new Uint8Array(await file.arrayBuffer()), ext, null);
  },

  // The recording into Rounds/Audio, then the round note, then transcribing.
  async saveSpeech(bytes, ext, seconds) {
    const sp = this.speakSetup();
    let path = null;
    await this.save(async () => {
      const date = todayKey();
      const id = practiceId(date, this.data.rounds.map((r) => r.round_id));
      const audio = await this.io.saveAudio(`${this.io.folder}/Rounds/Audio`, id, bytes, ext);
      const round = {
        round_id: id,
        date,
        round: 'Practice',
        format: sp.format,
        position: sp.position,
        motion: sp.motion,
        prepName: sp.prepName,
        prep_minutes: sp.prepMinutes ? Number(sp.prepMinutes) : null,
        recordingName: audio.name,
        duration: formatDuration(seconds ?? audio.seconds ?? 0),
        form2: false,
        scores: {},
      };
      path = await this.io.create(`${this.io.folder}/Rounds`, id, writeRound(round));
    });
    if (!path) return;
    this.sp = null;
    this.go('speak', { path });
    this.flash('Speech saved');
    this.transcribe(path);
  },

  // ---------- A saved speech ----------

  speechResult() {
    const r = this.data.rounds.find((x) => x.path === this.state.path);
    if (!r) return this.empty('That speech’s note isn’t there any more.');
    const audioPath = r.recordingName ? `${this.io.folder}/Rounds/Audio/${r.recordingName}` : null;
    const busy = this.transcribing === r.path;
    const has = Boolean(r.transcript);
    const paste = h('textarea', { class: 'deb-textarea is-tall', placeholder: 'Paste the transcript here', 'aria-label': 'Transcript' });
    paste.addEventListener('focus', () => { this.typing = true; });
    paste.addEventListener('blur', () => { this.typing = false; });
    const fillers = has ? countFillers(r.transcript) : null;
    const stats = has ? this.card('From the transcript', h('span', { class: 'deb-muted' }, `wpm uses the ${r.duration || 'recording’s length'}`),
      h('div', { class: 'deb-tiles is-three' },
        this.tile('Words a minute', r.wpm != null ? String(r.wpm) : '—'),
        this.tile('Fillers', String(r.fillers ?? fillers.total)),
        this.tile('Long', r.duration || '—')),
      h('span', { class: 'deb-small' }, 'Top of the Judging section, for Claude:'),
      h('code', { class: 'deb-code' }, (r.judging || '').split('\n')[0] || fillersLine(fillers, r.wpm, r.duration)),
      h('p', { class: 'deb-small deb-transcript' }, r.transcript.length > 600 ? `${r.transcript.slice(0, 600)}…` : r.transcript)) : null;
    const judged = r.wsdc_total != null || r.judge ? this.card('Judging', h('span', { class: 'deb-muted' }, r.judge ? `by ${r.judge}` : ''),
      h('div', { class: 'deb-tiles is-three' },
        r.wsdc_total != null ? this.tile('WSDC total', String(r.wsdc_total), [r.wsdc_style, r.wsdc_content, r.wsdc_strategy].every((x) => x != null) ? `${r.wsdc_style} · ${r.wsdc_content} · ${r.wsdc_strategy}` : '') : null,
        r.wudc != null ? this.tile('WUDC', String(r.wudc)) : null)) : null;
    return h('div', { class: 'deb-page' },
      this.head(['Practice speech', short(r.date), r.format, r.position].filter(Boolean).join(' · '), r.round_id,
        audioPath ? this.button('▶ Play', () => this.io.open(audioPath), 'ghost') : null,
        this.button('Open the note', () => this.io.open(r.path), 'ghost'),
        this.button('Speak again', () => this.go('speak', { motionText: r.motion, format: r.format, position: r.position }), 'ghost')),
      r.motion ? h('p', { class: 'deb-lead' }, r.motion) : null,
      busy ? h('div', { class: 'deb-notice' }, h('span', null, h('b', null, 'Transcribing… '), 'whisper is listening to the recording; a 7-minute speech takes about a minute.')) : null,
      !busy && !has ? h('div', { class: 'deb-notice' },
        h('span', null, h('b', null, 'Saved. '), `${r.round_id}.md with the recording${r.duration ? `, ${r.duration}` : ''}.`),
        audioPath ? this.button('Transcribe', () => this.transcribe(r.path), 'primary') : null) : null,
      this.speechNotice ? h('div', { class: 'deb-notice is-amber' }, this.speechNotice) : null,
      h('div', { class: 'deb-split' },
        h('div', { class: 'deb-stack' }, stats, judged),
        this.card(has ? 'Replace the transcript' : 'Paste a transcript', h('span', { class: 'deb-muted' }, 'from dictation, Otter, anything'),
          paste,
          h('div', { class: 'deb-inline' },
            this.button('Use this transcript', () => { if (paste.value.trim()) this.useTranscript(r.path, paste.value); }, has ? 'ghost' : 'primary'),
            h('span', { class: 'deb-small' }, 'Counts wpm and fillers and writes them into the note'),
            has && audioPath ? this.button('Transcribe again', () => this.transcribe(r.path), 'ghost') : null))));
  },

  async transcribe(path) {
    const r = this.data.rounds.find((x) => x.path === path);
    if (!r || !r.recordingName || this.transcribing) return;
    this.transcribing = path;
    this.speechNotice = '';
    this.render();
    let text = '';
    try {
      const result = await this.io.transcribe(`${this.io.folder}/Rounds/Audio/${r.recordingName}`);
      if (result.missing) this.speechNotice = result.message;
      else text = result.text || '';
      if (!result.missing && !text) this.speechNotice = 'whisper didn’t hear any words in the recording.';
    } catch (err) {
      this.speechNotice = `Couldn’t transcribe it: ${err.message}. You can paste a transcript instead.`;
    }
    this.transcribing = null;
    if (text) await this.useTranscript(path, text);
    else if (this.state.path === path) this.render();
  },

  async useTranscript(path, text) {
    await this.save(async () => this.io.write(path, transcriptInto(await this.io.read(path), text)));
    if (this.state.path === path) this.flash('Transcript saved · wpm and fillers counted');
  },

  // ---------- Lists for other pages ----------

  practiceRounds() {
    return this.data.rounds.filter(isPractice);
  },

  // Log page: practice speeches, their own group.
  practiceList() {
    const list = this.practiceRounds();
    if (!list.length) return null;
    return h('section', { class: 'deb-list', 'aria-label': 'Practice speeches' },
      h('div', { class: 'deb-list-head' }, h('span', null, `Practice speeches · ${list.length}`), h('span', { class: 'deb-muted' }, 'newest first')),
      h('div', { class: 'deb-prac-row is-head' }, ['Date', 'Motion', 'Position', 'WSDC', 'Judge'].map((t) => h('span', null, t))),
      list.map((r) => this.withMenu(h('button', { type: 'button', class: 'deb-prac-row', onclick: () => this.go('speak', { path: r.path }) },
        h('span', { class: 'deb-mono' }, short(r.date)),
        h('span', { class: 'deb-ellipsis' }, r.motion || r.round_id),
        h('span', null, r.position || ''),
        h('span', { class: `deb-mono deb-right${r.wsdc_total == null ? ' deb-muted' : ''}` }, r.wsdc_total == null ? '—' : String(r.wsdc_total)),
        h('span', { class: 'deb-muted' }, r.judge || 'not judged')), () => this.roundMenu(r))));
  },

  // Motion bank: speeches given on a motion (by its prep note or its wording).
  speechesFor(m) {
    return this.practiceRounds().filter((r) => (r.prepName && m.prep && r.prepName === m.prep.name)
      || (r.motion && (r.motion === m.text || likeness(r.motion, m.text) > 0.8)));
  },

  givenCard(m) {
    const list = this.speechesFor(m).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!list.length) return null;
    const totals = list.map((r) => r.wsdc_total).filter((x) => x != null);
    const best = totals.length ? Math.max(...totals) : null;
    return h('section', { class: 'deb-given', 'aria-label': 'Speeches given on this motion' },
      h('div', { class: 'deb-card-head' }, h('h3', null, `Given ${list.length} time${list.length === 1 ? '' : 's'}${best != null ? `, best ${best}` : ''}`), best != null ? h('span', { class: 'deb-muted' }, 'WSDC total') : null),
      list.map((r) => h('button', { type: 'button', class: 'deb-speech', onclick: () => this.io.open(r.path) },
        h('span', null, [short(r.date), r.position].filter(Boolean).join(' · ')),
        h('span', { class: `deb-mono${r.wsdc_total != null && r.wsdc_total === best ? ' is-best' : ''}` }, r.wsdc_total != null ? String(r.wsdc_total) : '—'),
        h('small', null, [r.round_id, r.judge, r.wpm != null ? `${r.wpm} wpm` : null, r.fillers != null ? `${r.fillers} fillers` : null].filter(Boolean).join(' · ')))));
  },

  // A Round ID from a practice speech (PRAC-…, or a round noted as Practice).
  isPracticeId(id) {
    const s = String(id || '').trim();
    return /^PRAC-/i.test(s) || this.data.rounds.some((r) => r.round_id === s && isPractice(r));
  },

  practiceTag() {
    return h('span', { class: 'deb-tag is-practice', title: 'From a practice speech, not a panel' }, 'practice');
  },
};

export { icon };
