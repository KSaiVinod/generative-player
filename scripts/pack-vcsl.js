/* ============================================================
   generative-player — pack the Versilian Community Sample Library's instruments

   VCSL (github.com/sgossner/VCSL, CC0: no conditions at all) is a library
   of real instruments, recorded properly: pianos and harpsichords, organs,
   mallets, harps and zithers, winds, a drum kit and a room full of hand
   percussion. This takes the parts the engine plays and packs them as
   pack-samples.js packs the others: one MP3 an instrument, its notes (or
   hits) end to end, a manifest of where each starts.

   Two kinds:
     notes  a pitched instrument: one articulation at one strength, up to
            twelve notes spread over its range (the engine re-pitches between)
     hits   percussion: named strokes (a conga's open tone and slap, a
            shaker's down and up, ...), each a one-shot

   Only the files used are fetched (the library is a partial clone: a file's
   bytes come down when it is checked out). Converted with macOS's own
   afconvert (to 44.1 kHz mono), every instrument brought to the same peak.

     git clone --filter=blob:none --no-checkout --depth 1 \
       https://github.com/sgossner/VCSL.git samples-src/VCSL
     node scripts/pack-vcsl.js [name ...]
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { MPEGDecoder } = require('mpg123-decoder');

const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'samples-src', 'VCSL');
const WORK = path.join(ROOT, 'samples-src', 'vcsl-work');
const OUT = path.join(ROOT, 'engine', 'vendor', 'vcsl');
const PACKED = path.join(OUT, 'packed');
const SR = 44100, KBPS = 96, GAP = 0.2, FADE = 0.25, PEAK = 0.89;

/* ---- what is taken ----------------------------------------------------
   notes: folder, a pattern the files must match (one articulation, one
   strength, the first round-robin), how long a note is kept (s), how many.
   hits: folder, and each stroke's pattern (the first file matching it).
   oct: most of the library names middle C "C3" where the engine (and MIDI)
   name it "C4", so its notes are re-named this many octaves up; drop: notes
   left out, those measured more than a third of a semitone from their name
   (the Sampler re-pitches a neighbour in their place). Checked by
   measuring every note's pitch. The thumb pianos, the tubular bells, the
   wine glasses and the glockenspiel are not taken: their tunings are their
   own, or their pitch could not be told reliably from their overtones. */
const S = 'Idiophones/Struck Idiophones/', P = 'Idiophones/Plucked Idiophones/', M = 'Membranophones/Struck Membranophones/';
const Z = 'Chordophones/Zithers/', C = 'Chordophones/Composite Chordophones/', E = 'Aerophones/Edge-blown Aerophones/';
const R = 'Aerophones/Reed Aerophones/', F = 'Aerophones/Free Aerophones/', X = 'Electrophones/TX81Z/';
const SET = {
  /* keys */
  'grand-piano':    { folder: Z + 'Grand Piano, Steinway B', match: /^Sus\/.*_vl3_rr1\.wav$/, hold: 4.5, drop: ['F#1','G#7'] },
  'upright-piano':  { folder: Z + 'Upright Piano, Yamaha', match: /^Sustains\/.*_vl2_rr1\.wav$/, hold: 4, oct: 1, drop: ['C0'] },
  'harpsichord':    { folder: Z + 'Harpsichord, French', match: /^Sustains\/.*_rr1_Main\.wav$/, hold: 3, oct: 1 },
  'pipe-organ':     { folder: E + 'Pipe Organ', match: /^Quiet\/.*_rr1\.wav$/, hold: 3.5, oct: 1 },
  'chapel-organ':   { folder: E + 'Renaissance Organ', match: /^8'\/.*_rr1\.wav$/, hold: 3.5, oct: 1, drop: ['C1'] },
  'fm-piano':       { folder: X + 'FM Piano', match: /_vl2\.wav$/, hold: 3 },
  'clavisynth':     { folder: X + 'Clavisynth', match: /_vl2\.wav$/, hold: 2, oct: 2 },
  /* mallets and bells */
  'marimba':        { folder: S + 'Marimba', match: /_med_01\.wav$/, hold: 2.2, oct: 1 },
  'vibraphone':     { folder: S + 'Vibraphone', match: /^Soft Mallets\/.*_v2_rr1_Main\.wav$/, hold: 3.5, oct: 1, drop: ['F2','A2','C3'] },
  'xylophone-real': { folder: S + 'Xylophone', match: /^Medium Mallets\/.*_ff_01_far\.wav$/, hold: 1.6, oct: 1 },
  'hand-chimes':    { folder: S + 'Hand Chimes', match: /_r01_main\.wav$/, hold: 4, oct: 1 },
  'balafon':        { folder: S + 'Balafon', match: /^Traditional Mallet\/.*_vl2_rr1_Mid\.wav$/, hold: 1.8, oct: 1, drop: ['F3'] },
  /* strings, plucked and bowed */
  'concert-harp':   { folder: C + 'Concert Harp', match: /_mf1\.wav$/, hold: 3 },
  'folk-harp':      { folder: C + 'Folk Harp', match: /_v2_RR1\.wav$/, hold: 2.8, oct: 1 },
  'strumstick':     { folder: C + 'Strumstick', match: /_Str3_Main_.*_vl2_rr1\.wav$/, hold: 2.2, oct: 1 },
  'dan-tranh':      { folder: Z + 'Dan Tranh', match: /^Normal\/.*_mf_1\.wav$/, hold: 2.8, oct: 1, drop: ['C#3'] },
  'psaltery':       { folder: Z + 'Psaltery, Bowed and Plucked', match: /^LongBow\/.*_rr1\.wav$/, hold: 3.5, oct: 1 },
  /* winds */
  'tenor-sax':      { folder: R + 'Tenor Saxophone', match: /^Non-Vibrato\/.*_vl2_rr1\.wav$/, hold: 3, oct: 1 },
  'saxello':        { folder: R + 'Saxello', match: /^Vibrato\/.*_vl2_rr1\.wav$/, hold: 3, oct: 1 },
  'harmonica':      { folder: F + 'Harmonica-Hohner-Super64', match: /^Sustains\/Vib\//, hold: 3, oct: 1 },
  'recorder':       { folder: E + 'Baroque Alto Recorder', match: /^SusVib\/.*_rr1_Main\.wav$/, hold: 2.8, oct: 1 },
  'ocarina':        { folder: E + 'Ocarina, Typical', match: /^Sustains\/SusVib\//, hold: 2.8, oct: 1 },

  /* percussion: strokes */
  'perc-conga':   { folder: M + 'Conga', hits: { lo: /^Tumba_HitN_v3_rr1/, mid: /^Conga_HitN_v2_rr1/, hi: /^Quinto_HitN_v2_rr1/, slap: /^Quinto_HitFM1_v2_rr1/, mute: /^Conga_HitFM_v2_rr1/ } },
  'perc-bongo':   { folder: M + 'Bongos', hits: { hi: /^BongoH_Hit1_v2_rr1/, lo: /^BongoL_Hit1_v2_rr1/, himute: /^BongoH_HitMuted1_v2_rr1/, lomute: /^BongoL_HitMuted2_v2_rr1/ } },
  'perc-cowbell': { folder: S + 'Cowbells', hits: { open: /^Cowbell1_Normal_v3_rr1/, muted: /^Cowbell1_Muted_v3_rr1/, high: /^Cowbell2_Normal_v3_rr1/ } },
  'perc-clave':   { folder: S + 'Claves', hits: { a: /^Claves1_Hit_v2_rr1/, b: /^Claves2_Hit_v2_rr1/ } },
  'perc-woodblock': { folder: S + 'Woodblock', hits: { a: /^wood_click_f_rr1/, b: /^wood_click_f_rr2/, soft: /^wood_click_mp\./ } },
  'perc-shaker':  { folder: S + 'Shaker, Small', hits: { down: /^Mid_ShakerHighFaster_Down_rr1/, up: /^Mid_ShakerHighFaster_Up_rr1/, down2: /^Mid_ShakerHighFaster_Down_rr2/, up2: /^Mid_ShakerHighFaster_Up_rr2/ } },
  'perc-tamb':    { folder: S + 'Tambourine 1', hits: { hit: /^Tamb1_Hit_v2_rr1/, soft: /^Tamb1_Hit_v1_rr1/, shake: /^Tamb1_Shake_rr1/ } },
  'perc-cabasa':  { folder: S + 'Cabasa', hits: { hit: /^Cabasa1_Hit_rr1/, rub: /^Cabasa1_Rub_v2_rr1/ } },
  'perc-guiro':   { folder: S + 'Guiro', hits: { hit: /^Guiro_Hit_rr1/, fast: /^Guiro_Fast_rr1/ } },
  'perc-agogo':   { folder: S + 'Agogo Bells', hits: { hi: /^Agogo_High_v2_rr1/, lo: /^Agogo_Low_v2_rr1/ } },
  'perc-cajon':   { folder: S + 'Cajon', hits: { bass: /^Cajon_hit1_f_rr1/, tone: /^Cajon_hit2_mp_rr1/, slap: /^Cajon_hit3_f_rr1/ } },
  'perc-darbuka': { folder: M + 'Darbuka', hits: { doum: /^Darbuka_1_hit_vl2_rr1/, tek: /^Darbuka_3_hit_vl2_rr1/, ka: /^Darbuka_5_hit_vl2_rr1/ } },
  'perc-frame':   { folder: M + 'Frame Drum', hits: { lo: /^HDrumL_Hit_v3_rr1/, hi: /^HDrumS_Hit_v3_rr1/, mute: /^HDrumS_HitMuted_v2_rr1/ } },
  'perc-triangle': { folder: S + 'Triangles', hits: { open: /^Triangle1_Hit_v1_rr1/, muted: /^Triangle1_HitM_v1_rr2/ } },
  'perc-sleigh':  { folder: S + 'Sleigh Bells', hits: { hit: /^Sleighbells_Hit_rr1/, shake: /^sleighbell1_shake1/ } },
  'perc-claps':   { folder: S + 'Claps', hits: { a: /^Clap_rr1/, b: /^Clap_rr3/, solo: /^SoloClap_vl3/ } },
  'perc-slit':    { folder: S + 'Slit Drum', hits: { hi: /^LogDrumHi_MedM_v2/, lo: /^LogDrumLo_MedM_v2/ } },
  'perc-finger':  { folder: S + 'Finger Cymbals', hits: { hit: /^Fing_Cymb/ } },
  'perc-timpani': { folder: 'Membranophones/Struck Membranophones/Timpani 1', hits: { lo: /^Hit\/Timpani1_Hit_v4_rr1/, hi: /^Hit\/Timpani4_Hit_v4_rr1/, roll: /^Roll\/Timpani1_Roll_v5/ }, hold: 4 },

  /* a drum kit, played by hand */
  'kit-acoustic': { folder: '', hits: {
    kick: [M + 'Bass Drum 1', /^BDrumNew_hit_v5_rr1/], kick2: [M + 'Bass Drum 1', /^BDrumNew_hit_v3_rr1/],
    snare: [M + 'Snare Drum, Modern 1', /^Snare2_HitSN_v6_rr1/], snare2: [M + 'Snare Drum, Modern 1', /^Snare2_HitSN_v5_rr2/],
    ghost: [M + 'Snare Drum, Modern 1', /^Snare2_taps_v4_rr1/], rim: [M + 'Snare Drum, Modern 3', /^Snare4_Xstick_v2_rr1/],
    hatC: [S + 'Hi-Hat Cymbal', /^HiHat_HitC_v2_rr1/], hatC2: [S + 'Hi-Hat Cymbal', /^HiHat_HitC_v3_rr2/],
    hatO: [S + 'Hi-Hat Cymbal', /^HiHat_HitO_rr1/], hatP: [S + 'Hi-Hat Cymbal', /^HiHat_Close_rr1/],
    tomHi: [M + 'Tom 1', /^Stick\/TomH_HitS_v3_rr1/], tomLo: [M + 'Tom 2', /^Stick\/TomL_HitS_v3_rr1/],
    crash: [S + 'Clash Cymbals 1', /^cymbal_crash1_mf1/], ride: [S + 'Suspended Cymbal 1', /^susCymb1_hit_stick_mp1/],
    bell: [S + 'Suspended Cymbal 1', /^susCymb1_hit_bell_mf1/]
  }, hold: 3 }
};
const HIT_HOLD = 1.6;            // a stroke is kept this long, unless the set says otherwise

const lame = (() => {
  const c = {};
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(require.resolve('lamejs/lame.min.js'), 'utf8') + ';this.lamejs = lamejs;', c);
  return c.lamejs;
})();

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/* the note in a file's name: "_A#3_", "G#2_f", "sus_D5_r01" */
function noteOf(file) {
  const m = path.basename(file).match(/(?:^|[_\s])([A-G]#?)(-?\d)(?=[_\s.])/);
  return m ? m[1] + m[2] : null;
}
const midi = (n) => { const m = /^([A-G]#?)(-?\d)$/.exec(n); return NAMES.indexOf(m[1]) + 12 * (Number(m[2]) + 1); };
function spread(list, max) {
  if (list.length <= max) return list;
  return [...new Set(Array.from({ length: max }, (_, i) => list[Math.round(i * (list.length - 1) / (max - 1))]))];
}
const onset = (x, from, to) => { for (let i = Math.max(0, from); i < Math.min(x.length, to); i++) if (Math.abs(x[i]) > 1e-3) return i; return -1; };

const ALL = execFileSync('git', ['-C', LIB, 'ls-tree', '-r', '--name-only', 'HEAD'], { maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean);

/* the files, fetched (a partial clone fetches a blob when it is checked out) */
function fetchFiles(files) {
  const missing = files.filter((f) => !fs.existsSync(path.join(LIB, f)));
  for (let i = 0; i < missing.length; i += 40) {
    execFileSync('git', ['-C', LIB, 'checkout', 'HEAD', '--', ...missing.slice(i, i + 40)], { stdio: 'ignore' });
  }
}
/* one file, as 44.1 kHz mono floats (afconvert mixes the channels down) */
function readMono(rel) {
  fs.mkdirSync(WORK, { recursive: true });
  const tmp = path.join(WORK, crypto.createHash('sha1').update(rel).digest('hex').slice(0, 12) + '.wav');
  if (!fs.existsSync(tmp)) execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@' + SR, '-c', '1', '--mix', path.join(LIB, rel), tmp]);
  const b = fs.readFileSync(tmp);
  let o = 12;
  while (o < b.length) {
    const id = b.toString('ascii', o, o + 4), size = b.readUInt32LE(o + 4);
    if (id === 'data') {
      const n = size >> 1, out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = b.readInt16LE(o + 8 + i * 2) / 32768;
      return out;
    }
    o += 8 + size + (size & 1);
  }
  throw new Error(rel + ': no data');
}

async function decodeMp3(buf) {
  const dec = new MPEGDecoder();
  await dec.ready;
  const r = dec.decode(new Uint8Array(buf));
  dec.free();
  return r.channelData[0];
}

async function pack(name, parts) {
  /* the same peak for every instrument: their levels are set in the engine */
  const peak = Math.max(...parts.map((p) => p.reduce((m, v) => Math.max(m, Math.abs(v)), 0)), 1e-6);
  const k = PEAK / peak;
  const gap = Math.round(SR * GAP);
  const total = parts.reduce((s, p) => s + p.length + gap, gap);
  const pcm = new Int16Array(total), starts = [];
  let at = gap;
  parts.forEach((p) => {
    starts.push(at);
    for (let i = 0; i < p.length; i++) pcm[at + i] = Math.max(-1, Math.min(1, p[i] * k)) * 32767;
    at += p.length + gap;
  });
  const enc = new lame.Mp3Encoder(1, SR, KBPS), chunks = [];
  for (let i = 0; i < pcm.length; i += 1152 * 20) chunks.push(Buffer.from(enc.encodeBuffer(pcm.subarray(i, i + 1152 * 20))));
  chunks.push(Buffer.from(enc.flush()));
  const mp3 = Buffer.concat(chunks);
  /* where each part really starts once encoded and decoded again */
  const back = await decodeMp3(mp3);
  const ats = parts.map((p, i) => {
    const want = onset(p, 0, p.length), seen = onset(back, starts[i] - SR * 0.1, starts[i] + want + SR * 0.15);
    return want < 0 || seen < 0 ? starts[i] : seen - want;
  });
  const file = name + '.' + crypto.createHash('sha1').update(mp3).digest('hex').slice(0, 10) + '.mp3';
  fs.writeFileSync(path.join(PACKED, file), mp3);
  return { file, ats, bytes: mp3.length };
}

function trim(raw, hold) {
  const s0 = Math.max(0, onset(raw, 0, raw.length) - Math.round(SR * 0.001)), x = raw.subarray(s0);
  /* the tail: kept to `hold` seconds, or less where the sound has died away */
  let end = Math.min(x.length, Math.round(SR * hold));
  let last = end - 1;
  while (last > 0 && Math.abs(x[last]) < 2e-4) last--;
  end = Math.min(end, last + Math.round(SR * 0.05));
  const y = x.slice(0, Math.max(end, Math.round(SR * 0.05))), f = Math.min(Math.round(SR * FADE), y.length >> 1);
  for (let i = 0; i < f; i++) y[y.length - f + i] *= 1 - i / f;
  return y;
}

(async () => {
  const want = process.argv.slice(2);
  fs.mkdirSync(PACKED, { recursive: true });
  const manifestFile = path.join(OUT, 'manifest.js');
  /* the manifest kept for the instruments not re-packed this time */
  let manifest = {};
  if (fs.existsSync(manifestFile)) {
    const c = { window: {} };
    vm.createContext(c); vm.runInContext(fs.readFileSync(manifestFile, 'utf8'), c);
    manifest = Object.assign({}, c.window.VCSL_SAMPLES || {});
  }
  let total = 0;
  for (const [name, cfg] of Object.entries(SET)) {
    if (want.length && !want.includes(name)) continue;
    let entry;
    if (cfg.hits) {
      const picks = Object.entries(cfg.hits).map(([hit, m]) => {
        const [folder, re] = Array.isArray(m) ? m : [cfg.folder, m];
        const f = ALL.find((p) => p.startsWith(folder + '/') && re.test(p.slice(folder.length + 1)) && /\.wav$/i.test(p));
        if (!f) throw new Error(name + ': no file for ' + hit);
        return [hit, f];
      });
      fetchFiles(picks.map((p) => p[1]));
      const parts = picks.map(([, f]) => trim(readMono(f), cfg.hold || HIT_HOLD));
      const out = await pack(name, parts);
      entry = { kind: 'hits', file: 'packed/' + out.file, notes: picks.map((p) => p[0]),
                at: out.ats.map((s) => +(s / SR).toFixed(5)), len: parts.map((p) => +(p.length / SR).toFixed(5)) };
      total += out.bytes;
      console.log(name.padEnd(16), String(picks.length).padStart(2), 'hits ', (out.bytes / 1e6).toFixed(2), 'MB');
    } else {
      const files = ALL.filter((p) => p.startsWith(cfg.folder + '/') && cfg.match.test(p.slice(cfg.folder.length + 1)) && noteOf(p) && !(cfg.drop || []).includes(noteOf(p)));
      /* one file a note (the first, if a note was recorded more than once) */
      const byNote = new Map();
      files.forEach((f) => { const n = noteOf(f); if (!byNote.has(n)) byNote.set(n, f); });
      const notes = spread([...byNote.keys()].sort((a, b) => midi(a) - midi(b)), cfg.max || 12);
      if (!notes.length) throw new Error(name + ': no notes');
      fetchFiles(notes.map((n) => byNote.get(n)));
      const parts = notes.map((n) => trim(readMono(byNote.get(n)), cfg.hold || 3));
      const out = await pack(name, parts);
      const named = (n) => { const m = /^([A-G]#?)(-?\d)$/.exec(n); return m[1] + (Number(m[2]) + (cfg.oct || 0)); };
      entry = { file: 'packed/' + out.file, notes: notes.map((n) => named(n).replace('#', 's')),
                at: out.ats.map((s) => +(s / SR).toFixed(5)), len: parts.map((p) => +(p.length / SR).toFixed(5)) };
      total += out.bytes;
      console.log(name.padEnd(16), String(notes.length).padStart(2), 'notes', (out.bytes / 1e6).toFixed(2), 'MB', notes[0] + '-' + notes[notes.length - 1]);
    }
    /* the last version of this instrument's file, gone */
    if (manifest[name] && manifest[name].file !== entry.file) fs.rmSync(path.join(OUT, manifest[name].file), { force: true });
    manifest[name] = Object.assign({ dir: 'vcsl' }, entry);
  }
  fs.writeFileSync(manifestFile,
    '/* The Versilian Community Sample Library\'s instruments (CC0), packed by\n' +
    '   scripts/pack-vcsl.js: one file each, and where in it each note or stroke\n' +
    '   starts and how long it lasts, in seconds. Read with the others. */\n' +
    'window.VCSL_SAMPLES = ' + JSON.stringify(manifest) + ';\n' +
    'window.TONE_SAMPLES = Object.assign(window.TONE_SAMPLES || {}, window.VCSL_SAMPLES);\n');
  console.log('packed', (total / 1e6).toFixed(1), 'MB this run;', Object.keys(manifest).length, 'instruments in the manifest');
})().catch((e) => { console.error(e.message || e); process.exit(1); });
