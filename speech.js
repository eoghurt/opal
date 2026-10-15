// Practice speeches on the Mac: the microphone, saving recordings, and
// transcribing them. Main process only; the debate page calls it through
// the speech:* channels.
//
//   setupSpeech({ ipcMain, dialog, systemPreferences, getWindow, resolveFolderPath, resolveVaultFile, readSettings, scheduleRefresh, log })
//
// Recordings go in the vault as <Debate>/Rounds/Audio/<Round ID>.m4a. A file
// dropped in from a phone (.mp3, .wav, …) is turned into .m4a with macOS's own
// afconvert; the original isn't touched.
//
// Transcribing: afconvert makes a 16 kHz mono WAV in a temporary folder, then
// whisper-cli (Homebrew's whisper-cpp) reads it with the model chosen in
// Settings › Debate. The text comes back to the window, which writes it into
// the note; nothing is kept outside the vault except the temporary files,
// which are deleted. Tests point OPAL_WHISPER_CLI at a stand-in, and
// OPAL_FAKE_MIC gives Chromium a pretend microphone (see main.js).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const AFCONVERT = '/usr/bin/afconvert';
const AFINFO = '/usr/bin/afinfo';
const AUDIO_IN = ['m4a', 'mp4', 'mp3', 'wav', 'aac', 'aif', 'aiff', 'caf'];
const INSTALL_WHISPER = 'Transcribing needs whisper-cpp: run “brew install whisper-cpp” in Terminal, then try again (or paste a transcript).';
const CHOOSE_MODEL = 'Transcribing needs a whisper model: download one (ggml-base.en.bin is a good start) and choose it in Settings › Debate (or paste a transcript).';
// Words that make whisper keep the fillers instead of tidying them away.
const PROMPT = 'Um, uh, like, you know, I think, kind of, basically, right?';

function run(file, args, timeout = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.message = `${path.basename(file)}: ${String(stderr || err.message).trim().split('\n').slice(-1)[0]}`;
        reject(err);
      } else resolve(String(stdout));
    });
  });
}

function whisperPath() {
  const candidates = [process.env.OPAL_WHISPER_CLI, '/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli'].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

// Seconds of audio in a file (afinfo's "estimated duration"), or null.
async function durationOf(file) {
  try {
    const out = await run(AFINFO, [file], 30000);
    const m = /estimated duration:\s*([\d.]+)/i.exec(out);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

function setupSpeech({ ipcMain, dialog, systemPreferences, getWindow, resolveFolderPath, resolveVaultFile, readSettings, scheduleRefresh, log }) {
  const modelPath = async () => {
    const settings = (await readSettings().catch(() => null)) || {};
    const p = settings.debate && settings.debate.whisperModel;
    return typeof p === 'string' && p ? p : '';
  };

  // The microphone: macOS asks once; after that it remembers (System Settings › Privacy).
  ipcMain.handle('speech:mic', async () => {
    if (process.platform !== 'darwin' || process.env.OPAL_FAKE_MIC) return true;
    if (systemPreferences.getMediaAccessStatus('microphone') === 'granted') return true;
    return systemPreferences.askForMediaAccess('microphone');
  });

  // A recording into <folder>/<id>.m4a → { name, seconds }.
  ipcMain.handle('speech:save-audio', async (_event, relFolder, id, bytes, ext) => {
    const type = String(ext || '').toLowerCase().replace(/^\./, '');
    if (!AUDIO_IN.includes(type)) throw new Error(`Opal can't use .${type || '?'} audio. Try .m4a, .mp3 or .wav.`);
    const name = `${String(id || '').replace(/[^A-Za-z0-9-]/g, '')}.m4a`;
    if (name === '.m4a') throw new Error('The recording needs a Round ID.');
    const data = Buffer.from(bytes || []);
    if (!data.length) throw new Error('The recording is empty.');
    if (data.length > 500 * 1024 * 1024) throw new Error('That recording is too big (500 MB at most).');
    const folder = resolveFolderPath(relFolder);
    await fs.promises.mkdir(folder, { recursive: true });
    const target = path.join(folder, name);
    if (fs.existsSync(target)) throw new Error(`${name} is already there.`);
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'opal-speech-'));
    try {
      const source = path.join(tmp, `in.${type}`);
      await fs.promises.writeFile(source, data);
      try {
        // Everything becomes AAC in .m4a, which every Mac app (and whisper's afconvert step) reads.
        await run(AFCONVERT, ['-f', 'm4af', '-d', 'aac', source, target]);
      } catch (err) {
        // A recording that's already .m4a but in a codec afconvert can't read stays as it is.
        if (type !== 'm4a' && type !== 'mp4') throw err;
        log('speech: kept the recording as it was', err);
        await fs.promises.copyFile(source, target);
      }
    } finally {
      fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
    scheduleRefresh();
    return { name, seconds: await durationOf(target) };
  });

  // What's installed, for Settings and the speech page.
  ipcMain.handle('speech:status', async () => {
    const model = await modelPath();
    return { whisper: Boolean(whisperPath()), model, modelFound: Boolean(model && fs.existsSync(model)) };
  });

  ipcMain.handle('speech:choose-model', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Choose a whisper model',
      message: 'A ggml model file for whisper-cpp, e.g. ggml-base.en.bin',
      properties: ['openFile'],
      filters: [{ name: 'Whisper models', extensions: ['bin', 'gguf'] }],
    });
    return result.canceled || !result.filePaths[0] ? null : result.filePaths[0];
  });

  // An audio file in the vault → { text } or { missing, message }.
  ipcMain.handle('speech:transcribe', async (_event, relAudio) => {
    const audio = resolveVaultFile(relAudio);
    const whisper = whisperPath();
    if (!whisper) return { missing: 'whisper', message: INSTALL_WHISPER };
    const model = await modelPath();
    if (!model || !fs.existsSync(model)) return { missing: 'model', message: CHOOSE_MODEL };
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'opal-transcribe-'));
    try {
      const wav = path.join(tmp, 'speech.wav');
      await run(AFCONVERT, ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', audio, wav]);
      const out = path.join(tmp, 'speech');
      await run(whisper, ['-m', model, '-f', wav, '-nt', '-np', '-otxt', '-of', out, '--prompt', PROMPT]);
      const text = (await fs.promises.readFile(`${out}.txt`, 'utf8')).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' ');
      return { text };
    } finally {
      fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  });
}

module.exports = { setupSpeech };
