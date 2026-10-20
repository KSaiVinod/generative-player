/* ============================================================
   vinyl-player — the generative engine (a source for <vinyl-player>)

   Original music, made in the browser: no file, no sample, nothing
   licensed. Every time the needle goes down it is a new track, and first
   of all a new STYLE - one of these (in the shuffle, all but lo-fi and
   uplifting trance, which play only when asked for by name):

     house              122-126  the 909, organ and stab chords, a bouncing bass
     deep house         118-122  swung, dark seventh-chord stabs, an electric piano
     progressive house  124-128  a rolling bass, plucked arpeggios, strings, long builds
     melodic house      120-124  minor pads that ache, bells and plucks, a big room
     uplifting trance   136-140  supersaw hooks over a galloping bass, the long breakdown
     classic trance     134-138  sixteenth arps, gated chords, darker
     lo-fi               80-92   swung dusty drums, jazz chords on keys, tape wobble
     disco house        120-124  filtered disco stabs, octave bass, tambourine, pumping
     acid house         122-126  the 303 line, always, over a lean groove
     chicago house      120-125  a raw, jacking 909, swung, piano and organ stabs
     minimal house      122-125  sparse, clicking rims, a sub, one stab echoing
     tech house         124-127  a rolling bass, shakers and percussion, chopped stabs

   The style sets the tempo, swing, drum kit and pattern, the scale and
   the kind of chords and how long each lasts, the bass line, the lead
   and what it plays, the arrangement, and the room: reverb, echo,
   saturation, tape wobble, chorus, a sidechain pump, crackle. Within it,
   the details are picked again for every track (key, progression, which
   of the style's beats and bass lines, the lead's voice, ...).

   The track is rendered ahead (OfflineAudioContext, a bar at a time) and
   then played by a worklet (../stylus.js) that reads it like a stylus:
   at any speed, either way. That is what lets a hand on the record brake
   it and scratch it, the belt change speed with the pitch sliding, and
   the arm cue anywhere.

   Every record is tagged with its speed, as real ones are. A 33 is a full
   side; a 45 is a single, shorter, at the quick end of its style's tempo,
   with the big centre hole. The deck plays whichever matches its belt
   when the needle goes down, and a record on the wrong belt plays at the
   wrong pitch, as it would.

   And one more, not on any list: the B-side (flip()). Always the same
   track, for whoever finds it: a slow break, a sub, bells or an organ
   over strings, echo and tape.

   window.VinylPlayer.Generative: start(delay, at) / stop() (a brake, not
   a cut), hold() / scratch(rate) / release(), seek(at) / lift(up) /
   position(), volume(0..1), speed(33|45), rate() (the platter's speed
   now), click(). start must be called from a tap: browsers allow sound
   only then. It is the source interface <vinyl-player> plays (README.md),
   with the engine's own extras: styles, style(), prepare(), warm(), like(),
   flip() and the B-side.

   Its files are found beside this one (vendor/: Tone.js, the instruments,
   the melody model; ../stylus.js), wherever it is served from. The likes
   are kept in localStorage under the script tag's data-likes-key
   (default "vinyl-player.likes").
   ============================================================ */
window.VinylPlayer = window.VinylPlayer || {};
window.VinylPlayer.Generative = (() => {
  'use strict';
  const ME = document.currentScript;
  const HERE = (ME && ME.src) || location.href;
  const near = (p) => new URL(p, HERE).href;       // a file beside this one
  const LIKES = (ME && ME.dataset.likesKey) || 'vinyl-player.likes';
  const SR = 32000;                               // plenty for this, and a third lighter than 48k

  /* ---- the styles -------------------------------------------------------- */
  const ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const ODD = ALL.filter(i => i % 2), EIGHTHS = ALL.filter(i => i % 2 === 0);
  const OFF = [2, 6, 10, 14], FOUR = [0, 4, 8, 12];
  /* a beat: kick, snare, hats, ghost hats, open hats, percussion, ghost snares */
  const B = (o) => Object.assign({ k: [], s: [], h: [], g: [], o: [], p: [], gs: [] }, o);
  const BEATS = {
    house:  [B({ k: FOUR, s: [4, 12], o: OFF, g: ODD }), B({ k: FOUR, s: [4, 12], h: OFF, g: ODD, p: [3, 11] })],
    techno: [B({ k: FOUR, h: OFF, g: ALL.filter(i => i % 4 !== 2 && i % 4 !== 0), p: [3, 14] }), B({ k: FOUR, s: [4, 12], o: OFF, g: ODD })],
    disco:  [B({ k: FOUR, s: [4, 12], h: EIGHTHS, o: OFF, p: ODD }), B({ k: FOUR, s: [4, 12], g: ALL, o: OFF, p: [4, 12] })],
    lofi:   [B({ k: [0, 7, 10], s: [4, 12], h: EIGHTHS, gs: [15] }), B({ k: [0, 3, 10], s: [4, 12], h: EIGHTHS, gs: [7, 14] })],
    dnb:    [B({ k: [0, 10], s: [4, 12], h: EIGHTHS, gs: [7, 15] }), B({ k: [0, 6, 10], s: [4, 12], g: ALL, gs: [14] })],
    synth:  [B({ k: FOUR, s: [4, 12], h: EIGHTHS }), B({ k: [0, 8, 10], s: [4, 12], h: EIGHTHS, g: ODD })],
    dub:    [B({ k: FOUR, o: OFF, p: [3, 11] }), B({ k: FOUR, o: OFF, g: [1, 5, 9, 13] })],
    garage: [B({ k: [0, 10], s: [4, 12], h: [0, 2, 3, 6, 8, 10, 11, 14], p: [7], g: [5, 13] }),
             B({ k: [0, 9, 10], s: [4, 12], h: EIGHTHS, g: ODD, p: [15] })],
    trance: [B({ k: FOUR, s: [4, 12], o: OFF, g: ODD }), B({ k: FOUR, s: [4, 12], o: OFF, g: ALL.filter(i => i % 4 !== 2 && i % 4 !== 0), p: [14] })],
    minimal:[B({ k: FOUR, h: OFF, p: [3, 7, 10, 13], g: [5, 11] }), B({ k: FOUR, s: [12], h: OFF, p: [3, 6, 11, 14] })],
    tech:   [B({ k: FOUR, s: [4, 12], h: OFF, g: ODD, p: [3, 11, 14] }), B({ k: FOUR, s: [4, 12], o: OFF, g: ALL.filter(i => i % 2), p: [7, 15] })],
    bside:  [B({ k: [0, 7, 9], s: [4, 12], gs: [10, 15], o: [14], h: EIGHTHS })]
  };
  /* a kit: the kick [from Hz, to Hz, decay s], a click on it, the snare's
     kind, hats [highpass Hz, decay s], the percussion's kind */
  const KITS = {
    k909:   { kick: [165, 48, 0.34], click: 0.35, snare: 'clap',  hat: [8500, 0.04], perc: 'rim' },
    rumble: { kick: [150, 42, 0.4],  click: 0.5,  snare: 'clap',  hat: [10000, 0.03], perc: 'rim' },
    disco:  { kick: [140, 52, 0.26], click: 0.2,  snare: 'snare', hat: [9000, 0.035], perc: 'tamb' },
    dusty:  { kick: [100, 52, 0.28], click: 0,    snare: 'dusty', hat: [6000, 0.04], perc: 'shaker' },
    brk:    { kick: [130, 48, 0.3],  click: 0.25, snare: 'snare', hat: [9000, 0.03], perc: 'shaker' },
    gated:  { kick: [135, 46, 0.4],  click: 0.2,  snare: 'gated', hat: [8500, 0.035], perc: 'shaker' },
    soft:   { kick: [110, 46, 0.3],  click: 0,    snare: 'rim',   hat: [7000, 0.05], perc: 'rim' },
    k2step: { kick: [150, 46, 0.3],  click: 0.3,  snare: 'clap',  hat: [9500, 0.03], perc: 'shaker' },
    k909t:  { kick: [165, 48, 0.34], click: 0.35, snare: 'clap',  hat: [8500, 0.04], perc: 'tamb' },
    deep:   { kick: [120, 44, 0.36], click: 0.1,  snare: 'clap',  hat: [7500, 0.045], perc: 'shaker' },
    organic:{ kick: [105, 44, 0.34], click: 0,    snare: 'rim',   hat: [7000, 0.05], perc: 'shaker' }
  };
  /* bass lines: [step, length in steps, interval above the chord's root] */
  const BASS = {
    off:     OFF.map(s => [s, 1.6, 0]),
    house:   [[0, 3, 0], [3, 1, 0], [6, 2, 12], [10, 2, 0], [14, 1, 7]],
    roll:    ALL.filter(i => i % 4).map(s => [s, 0.85, 0]),
    offbeat: [[2, 1.5, 0], [6, 1.5, 12], [10, 1.5, 0], [14, 1.5, 0]],
    octave:  EIGHTHS.map((s, i) => [s, 1, i % 2 ? 12 : 0]),
    disco:   [[0, 1, 0], [2, 1, 12], [3, 1, 0], [6, 1, 12], [8, 1, 0], [10, 1, 12], [11, 1, 7], [14, 1, 12]],
    lofi:    [[0, 6, 0], [7, 2, 7], [10, 5, 0]],
    reese:   [[0, 6, 0], [6, 4, 0], [10, 6, 0]],
    eighths: EIGHTHS.map(s => [s, 1.8, 0]),
    dub:     [[0, 7, 0], [8, 7, 0]],
    garage:  [[0, 2, 0], [3, 1, 0], [6, 2, 0], [10, 2, 12], [13, 2, 0]],
    trance:  [[2, 1, 0], [3, 1, 0], [6, 1, 0], [7, 1, 0], [10, 1, 0], [11, 1, 0], [14, 1, 0], [15, 1, 0]],
    bside:   [[0, 3, 0], [10, 3, 0]],
    /* the genres' own: a syncopated house line, Chicago's jacking bass, deep
       house walking slowly, a progressive pulse, a drone under melodic
       house, disco's octaves with ghost notes, a minimal blip */
    houseSync:  [[0, 2, 0], [3, 1, 0], [7, 1, 12], [10, 2, 0], [13, 1, 7]],
    jack:       [[0, 1.5, 0], [3, 1, 0], [6, 1, 12], [7, 1, 0], [10, 1.5, 0], [13, 1, 10], [14, 1, 12]],
    deepWalk:   [[0, 4, 0], [6, 2, 7], [10, 4, 0], [14, 1, 10]],
    progPulse:  [[2, 1.5, 0], [6, 1.5, 0], [10, 1.5, 0], [12, 1, 12], [14, 1.5, 0]],
    drone:      [[0, 8, 0], [8, 6, 0], [14, 2, 7]],
    discoGhost: [[0, 1, 0], [2, 0.5, 12], [3, 1, 0], [6, 1, 12], [8, 1, 0], [9, 0.4, 0], [10, 1, 12], [11, 1, 7], [14, 1, 12], [15, 0.4, 10]],
    blip:       [[0, 1, 0], [7, 1, 0], [11, 1, 12]]
  };
  /* how the chords are played: held, or stabbed on these steps */
  const RHYTHMS = {
    gate:    { held: true, gated: true, g: 0.05, attack: 0.02 },        // a held chord, chopped by the gate
    stab:    { stabs: [0, 3, 6, 10], len: 1.4, g: 0.05 },
    pad:     { held: true, g: 0.04, attack: 0.6 },
    organ:   { stabs: OFF, len: 1.2, g: 0.045, up: true },
    lone:    { stabs: [3], len: 1.5, g: 0.06 },
    pump:    { stabs: OFF, len: 1.6, g: 0.05, up: true },
    stabpad: { stabs: [0, 6, 12], len: 2, g: 0.045, up: true, pad: true },
    keys:    { held: true, keys: true, g: 0.05 },
    dubstab: { stabs: [2, 10], len: 1.2, g: 0.06 },
    chop:    { stabs: [0, 3, 8, 11, 14], len: 1, g: 0.045, up: true },
    piano:   { stabs: [0, 3, 6, 10, 12], len: 1.3, g: 0.05, voice: 'piano' },       // bright piano chords, house style
    wurli:   { stabs: [2, 6, 10, 14], len: 1.1, g: 0.05, voice: 'wurli' }
  };
  /* progressions, as degrees of the scale */
  const PROGS = {
    minor: [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6], [0, 4, 5, 3], [0, 2, 6, 3], [5, 6, 0, 0]],
    major: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 2, 5], [0, 3, 4, 4], [0, 3, 0, 4]],
    jazz:  [[1, 4, 0, 0], [3, 2, 1, 0], [5, 1, 4, 0], [0, 5, 1, 4]],
    one:   [[0], [0, 3], [0, 0, 0, 5]],
    trance:[[5, 3, 0, 4], [0, 5, 3, 4], [0, 6, 5, 4], [3, 4, 5, 5], [5, 6, 0, 4]]
  };
  const SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
    major: [0, 2, 4, 5, 7, 9, 11], mixo: [0, 2, 4, 5, 7, 9, 10]
  };
  /* fx: reverb (send, seconds), echo (steps, feedback, send), sidechain pump,
     saturation, tape wobble, chorus, crackle, and how open the filter gets */
  const STYLES = {
    house:     { label: 'house', bpm: [122, 126], swing16: 0.06, kit: 'k909t', beats: 'house', bass: ['house', 'off'],
                 tones: ['saw', 'square'], harmony: 'both', scales: ['minor', 'dorian', 'major'], sevenths: 0.5, bpc: [1, 2],
                 rhythms: ['organ', 'stab', 'pump', 'piano'], pads: ['bright'], waves: ['sawtooth', 'square'],
                 leads: ['organ', 'piano', 'pluck', 'saxophone', 'trumpet', 'sawlead'], leadPats: ['hook', 'arp'], leadChance: 0.8, form: 'edm', roll: 'roll', fill: 'hat',
                 fx: { verb: 0.3, verbLen: 2, delay: 3, fb: 0.3, dmix: 0.2, pump: 0.3, bright: 13000 } },
    deep:      { label: 'deep house', bpm: [118, 124], swing16: 0.12, kit: 'deep', beats: 'house', bass: ['off', 'house'],
                 tones: ['sub', 'saw'], harmony: 'minor', scales: ['minor', 'dorian'], sevenths: 0.9, bpc: [1, 2],
                 rhythms: ['stab', 'keys', 'pad', 'wurli'], pads: ['dark'], waves: ['sawtooth'],
                 leads: ['keys', 'wurli', 'saxophone', 'flute', 'vibraphone'], leadPats: ['hook'], leadChance: 0.7, form: 'edm', roll: 'roll', fill: 'hat',
                 fx: { verb: 0.4, verbLen: 2.6, delay: 3, fb: 0.35, dmix: 0.25, pump: 0.3, sat: 0.1, bright: 9000 } },
    prog:      { label: 'progressive house', bpm: [122, 128], kit: 'k909', beats: 'tech', bass: ['roll', 'trance'],
                 tones: ['saw', 'reese'], harmony: 'minor', scales: ['minor', 'dorian'], sevenths: 0.3, bpc: [2, 4],
                 rhythms: ['pad', 'stabpad'], pads: ['strings', 'dark'], waves: ['sawtooth'],
                 leads: ['pluck', 'sawlead', 'bell', 'pluck', 'harp'], leadPats: ['arp'], leadChance: 1, form: 'prog', roll: 'roll', fill: 'hat',
                 fx: { verb: 0.42, verbLen: 3, delay: 3, fb: 0.42, dmix: 0.3, pump: 0.32, chorus: 0.25, bright: 13500 } },
    melodic:   { label: 'melodic house', bpm: [120, 124], kit: 'organic', beats: 'tech', bass: ['off', 'roll'],
                 tones: ['sub', 'reese'], harmony: 'minor', scales: ['minor'], sevenths: 0.4, bpc: [2],
                 rhythms: ['pad'], pads: ['strings', 'dark'], waves: ['sawtooth'], leadOct: 2,
                 leads: ['marimba', 'bell', 'violin', 'flute', 'dan-tranh', 'concert-harp'], leadPats: ['arp', 'hook'], leadChance: 1, form: 'prog', roll: 'roll', fill: 'hat',
                 fx: { verb: 0.55, verbLen: 3.6, delay: 3, fb: 0.48, dmix: 0.35, pump: 0.28, chorus: 0.35, bright: 11000 } },
    uplift:    { label: 'uplifting trance', bpm: [138, 142], kit: 'rumble', beats: 'trance', bass: ['trance'],
                 tones: ['saw', 'reese'], harmony: 'trance', scales: ['minor', 'major'], sevenths: 0, bpc: [2],
                 rhythms: ['pad', 'gate'], pads: ['strings', 'bright'], waves: ['sawtooth'],
                 leads: ['supersaw', 'sawlead', 'violin'], leadPats: ['hook', 'arp'], leadChance: 1, form: 'trance', roll: 'roll', fill: 'snare',
                 fx: { verb: 0.5, verbLen: 3.2, delay: 3, fb: 0.4, dmix: 0.28, pump: 0.4, chorus: 0.3, bright: 15000 } },
    trance:    { label: 'classic trance', bpm: [130, 138], kit: 'rumble', beats: 'trance', bass: ['trance', 'roll'],
                 tones: ['saw', 'square'], harmony: 'minor', scales: ['minor', 'phrygian'], sevenths: 0, bpc: [2, 4],
                 rhythms: ['gate', 'pad'], pads: ['dark', 'strings'], waves: ['sawtooth', 'square'],
                 leads: ['supersaw', 'sawlead', 'supersaw', 'sawlead', 'pluck'], leadPats: ['arp', 'acid'], leadChance: 1, form: 'trance', roll: 'roll', fill: 'snare',
                 fx: { verb: 0.42, verbLen: 2.8, delay: 3, fb: 0.45, dmix: 0.3, pump: 0.35, sat: 0.15, bright: 13500 } },
    lofi:      { label: 'lo-fi', bpm: [72, 90], swing8: 0.38, human: true, kit: 'dusty', beats: 'lofi', bass: ['lofi'],
                 tones: ['sub', 'saw'], harmony: 'jazz', scales: ['major', 'dorian'], sevenths: 1, bpc: [1, 2],
                 rhythms: ['keys'], pads: ['dark'], waves: ['triangle'], leadOct: 2,
                 leads: ['keys', 'saxophone', 'guitar-nylon', 'flute', 'muted-trumpet'], leadPats: ['hook'], leadChance: 0.7, form: 'song', roll: 'none', fill: 'snare',
                 fx: { verb: 0.3, verbLen: 1.6, sat: 0.35, wobble: 1, crackle: 1, bright: 4200 } },
    disco:     { label: 'disco house', bpm: [118, 125], swing16: 0.06, kit: 'disco', beats: 'disco', bass: ['octave', 'disco'],
                 tones: ['saw', 'square'], harmony: 'major', scales: ['major', 'mixo', 'dorian'], sevenths: 0.6, bpc: [1, 2],
                 rhythms: ['pump', 'chop', 'stabpad'], pads: ['bright', 'strings'], waves: ['sawtooth', 'square'],
                 leads: ['violin', 'trumpet', 'saxophone', 'guitar-electric', 'organ', 'violin'], leadPats: ['hook'], leadChance: 0.8, form: 'edm', roll: 'roll', fill: 'snare',
                 fx: { verb: 0.3, verbLen: 1.8, delay: 2, fb: 0.25, dmix: 0.15, pump: 0.45, sat: 0.2, chorus: 0.35, bright: 12500 } },
    acid:      { label: 'acid house', bpm: [120, 128], kit: 'k909', beats: 'house', bass: ['roll', 'off'],
                 tones: ['acid'], harmony: 'minor', scales: ['minor', 'phrygian', 'dorian'], sevenths: 0, bpc: [4],
                 rhythms: ['lone', 'organ'], pads: ['dark'], waves: ['square'],
                 leads: ['acid'], leadPats: ['acid'], leadChance: 1, form: 'edm', roll: 'roll', fill: 'hat',
                 fx: { verb: 0.25, verbLen: 2, delay: 3, fb: 0.4, dmix: 0.25, pump: 0.25, sat: 0.4, bright: 14000 } },
    chicago:   { label: 'chicago house', bpm: [118, 125], swing16: 0.16, kit: 'k909t', beats: 'house', bass: ['house', 'octave'],
                 tones: ['square', 'saw'], harmony: 'both', scales: ['dorian', 'major', 'minor'], sevenths: 0.75, bpc: [1, 2],
                 rhythms: ['stab', 'keys', 'piano', 'organ'], pads: ['bright'], waves: ['square'],
                 leads: ['piano', 'organ', 'grand-piano', 'saxophone', 'organ'], leadPats: ['hook'], leadChance: 0.7, form: 'edm', roll: 'roll', fill: 'snare',
                 fx: { verb: 0.22, verbLen: 1.6, delay: 2, fb: 0.25, dmix: 0.15, pump: 0.2, sat: 0.35, bright: 12000 } },
    minimal:   { label: 'minimal house', bpm: [120, 126], swing16: 0.1, kit: 'soft', beats: 'minimal', bass: ['off', 'dub'],
                 tones: ['sub'], harmony: 'one', scales: ['minor', 'dorian'], sevenths: 0.8, bpc: [4],
                 rhythms: ['lone', 'dubstab', 'wurli'], pads: ['dark'], waves: ['sawtooth'], leadOct: 2,
                 leads: ['blip', 'bell', 'xylophone-real', 'squarelead'], leadPats: ['hook'], leadChance: 0.35, form: 'edm', roll: 'sweep', fill: 'hat',
                 fx: { verb: 0.38, verbLen: 2.6, delay: 3, fb: 0.5, dmix: 0.35, pump: 0.18, sat: 0.12, bright: 8500 } },
    tech:      { label: 'tech house', bpm: [124, 128], swing16: 0.08, kit: 'k2step', beats: 'tech', bass: ['roll', 'garage'],
                 tones: ['saw', 'square', 'reese'], harmony: 'minor', scales: ['minor', 'phrygian'], sevenths: 0.3, bpc: [2, 4],
                 rhythms: ['chop', 'lone'], pads: ['dark'], waves: ['square', 'sawtooth'],
                 leads: ['vox', 'squarelead', 'acid', 'organ', 'vox', 'blip'], leadPats: ['acid', 'hook'], leadChance: 0.55, form: 'edm', roll: 'sweep', fill: 'hat',
                 fx: { verb: 0.28, verbLen: 2, delay: 3, fb: 0.35, dmix: 0.22, pump: 0.3, sat: 0.3, bright: 12500 } },
    /* not in the rotation: only the B-side is this */
    bside:     { label: 'b-side', bpm: [86, 95], kit: 'brk', beats: 'bside', bass: ['bside'],
                 tones: ['sub', 'reese'], harmony: 'minor', scales: ['minor'], sevenths: 0, bpc: [1],
                 rhythms: ['pad'], pads: ['strings'], waves: ['triangle'], leadOct: 2,
                 leads: ['bell', 'organ'], leadPats: ['hook'], leadChance: 1, form: 'edm', roll: 'roll', fill: 'snare',
                 fx: { verb: 0.5, verbLen: 3.4, delay: 3, fb: 0.45, dmix: 0.3, wobble: 0.6, chorus: 0.35, crackle: 0.5, sat: 0.2, bright: 5600 } }
  };
  /* how loud each style comes out of its own mix, evened up so one record
     is not twice as loud as the one before it (measured off renders) */
  const LEVEL = { house: 1.12, deep: 1, prog: 1.12, melodic: 1.04, uplift: 1.08, trance: 0.92, lofi: 0.98, disco: 1.06, acid: 0.86, chicago: 0.93, minimal: 0.85, tech: 0.92, bside: 1.09 };
  /* how much sub each style sits on: lo-fi and techno lighter (their kick
     carries the low end), dub all of it */
  const SUB = { lofi: 0.55, disco: 0.9, uplift: 0.85, trance: 0.85 };
  /* what a style may add on top, picked per track: a percussion layer, one
     of three instruments for a counter-melody, how likely a ride cymbal is,
     and more voices a second drop can hand the lead to */
  /* family: how a style arranges. funk (house, disco, Chicago): instruments
     answering one another; evolve (progressive, melodic, the trances): layers
     coming in towards a payoff; minimal: few parts, small changes; texture
     (lo-fi): the sound and the playing, not the number of parts; groove: the
     rest. resp: what may answer the hook at the end of its phrases. */
  const EXTRAS = {
    house:   { family: 'funk', perc: ['conga', 'cowbell', 'bongo', 'agogo', 'claps'], counter: ['piano', 'guitar', 'organ', 'grand-piano', 'upright-piano', 'vibraphone', 'clavisynth'], resp: ['brass-hit', 'vox-chop', 'guitar-lick'],
               ride: 0.6, bassInst: ['bass-electric'], realBass: 0.5, horns: 0.3, lead2: ['organ', 'pluck', 'saxophone', 'trumpet', 'tenor-sax', 'harmonica'],
               shake: ['shaker', 'tamb'], shakes: 0.5, acoustic: 0.2 },
    deep:    { family: 'groove', perc: ['snap', 'conga', 'bongo', 'cajon', 'triangle', 'finger'], counter: ['wurli', 'saxophone', 'vox', 'vibes', 'fm-piano', 'upright-piano', 'tenor-sax'], resp: ['vox-chop', 'sax-lick'],
               ride: 0.3, bassInst: ['bass-electric'], realBass: 0.3, harmonium: 0.15, ninths: 0.55, lead2: ['keys', 'saxophone', 'flute', 'saxello', 'vibraphone'],
               shake: ['shaker', 'cabasa'], shakes: 0.45, acoustic: 0.35 },
    prog:    { family: 'evolve', perc: ['conga', 'clave', 'frame', 'darbuka', 'triangle'], counter: ['piano', 'harp', 'choir', 'concert-harp', 'grand-piano', 'hand-chimes', 'dan-tranh'], resp: [],
               ride: 0.7, strings: 0.7, revPiano: 0.6, lead2: ['bell', 'supersaw', 'violin'],
               shake: ['shaker'], shakes: 0.3 },
    melodic: { family: 'evolve', perc: ['bongo', 'conga', 'woodblock', 'darbuka', 'slit', 'frame', 'cajon'], counter: ['marimba', 'kalimba', 'piano', 'balafon', 'dan-tranh', 'folk-harp', 'vibraphone', 'psaltery'], resp: [],
               ride: 0.4, strings: 0.8, revPiano: 0.3, lead2: ['guitar-nylon', 'bell', 'flute', 'violin', 'ocarina', 'recorder', 'hand-chimes'],
               shake: ['shaker', 'cabasa'], shakes: 0.45, acoustic: 0.15 },
    uplift:  { family: 'evolve', perc: ['clave'], counter: ['piano', 'choir', 'violin', 'concert-harp', 'grand-piano'], resp: [],
               ride: 0.9, strings: 0.9, horns: 0.4, revPiano: 0.5, lead2: ['pluck', 'bell', 'violin'] },
    trance:  { family: 'evolve', perc: ['clave', 'woodblock'], counter: ['piano', 'choir', 'harp', 'concert-harp', 'grand-piano'], resp: [],
               ride: 0.8, strings: 0.7, horns: 0.3, revPiano: 0.35, lead2: ['sawlead', 'supersaw', 'violin'],
               shake: ['shaker'], shakes: 0.2 },
    lofi:    { family: 'texture', perc: ['snap', 'woodblock', 'finger', 'frame'], counter: ['vibes', 'guitar-nylon', 'muted-trumpet', 'upright-piano', 'vibraphone', 'folk-harp'], resp: ['sax-lick'],
               ride: 0.7, brush: true, bassInst: ['contrabass', 'bass-electric'], realBass: 0.85, wood: 0.4, ninths: 0.6, lead2: ['keys', 'saxophone', 'flute', 'harmonica', 'tenor-sax'],
               shake: ['shaker'], shakes: 0.4, acoustic: 0.6 },
    disco:   { family: 'funk', perc: ['conga', 'cowbell', 'bongo', 'agogo', 'claps', 'guiro'], counter: ['wah-guitar', 'clav', 'guitar-electric', 'clavisynth', 'upright-piano'], resp: ['string-stab', 'brass-hit', 'guitar-lick'],
               ride: 0.7, bassInst: ['bass-electric'], realBass: 0.85, strings: 0.75, horns: 0.6, lead2: ['organ', 'keys', 'trumpet', 'saxophone', 'tenor-sax'],
               shake: ['tamb', 'shaker'], shakes: 0.7, acoustic: 0.5 },
    acid:    { family: 'groove', perc: ['cowbell', 'clave', 'claps', 'slit'], counter: ['organ', 'vox', 'clav', 'clavisynth', 'fm-piano'], resp: ['vox-chop'], ride: 0.5, lead2: ['acid'] },
    chicago: { family: 'funk', perc: ['conga', 'cowbell', 'clave', 'agogo', 'claps', 'triangle'], counter: ['piano', 'organ', 'vox', 'grand-piano', 'upright-piano', 'chapel-organ'], resp: ['brass-hit', 'vox-chop', 'guitar-lick'],
               ride: 0.5, bassInst: ['bass-electric'], realBass: 0.6, ninths: 0.3, lead2: ['organ', 'keys', 'saxophone', 'tenor-sax', 'harmonica'],
               shake: ['tamb', 'shaker'], shakes: 0.5, acoustic: 0.3 },
    minimal: { family: 'minimal', perc: ['conga', 'woodblock', 'clave', 'slit', 'finger', 'frame'], counter: ['marimba', 'wurli', 'vox', 'balafon', 'kalimba', 'xylophone-real', 'hand-chimes'], resp: [], ride: 0.25, lead2: ['bell'],
               shake: ['shaker'], shakes: 0.35 },
    tech:    { family: 'groove', perc: ['bongo', 'conga', 'woodblock', 'darbuka', 'cajon', 'agogo', 'slit'], counter: ['vox', 'guitar', 'clav', 'marimba', 'clavisynth', 'balafon'], resp: ['vox-chop', 'guitar-lick', 'brass-hit'],
               ride: 0.6, bassInst: ['bass-electric'], realBass: 0.4, lead2: ['pluck', 'acid', 'trumpet', 'tenor-sax'],
               shake: ['shaker', 'cabasa'], shakes: 0.4 },
    bside:   { family: 'texture', perc: ['bongo', 'snap', 'finger', 'frame'], counter: ['piano', 'guitar-acoustic', 'cello', 'upright-piano', 'harpsichord', 'folk-harp', 'strumstick', 'psaltery'], resp: [], ride: 0, bassInst: ['contrabass'], realBass: 0.9, wood: 0.8, harmonium: 0.6, strings: 0.4, lead2: ['bell', 'flute', 'clarinet', 'recorder', 'ocarina', 'harmonica'],
               shake: ['shaker', 'sleigh'], shakes: 0.4, acoustic: 0.8 }
  };
  const DANCE = { edm: true, trance: true, prog: true };
  /* the transition concepts each style leans on (weights) */
  const TRANSITIONS = {
    house:   { bass: 2, melodic: 2, perc: 2, chord: 2, strip: 1 },
    chicago: { perc: 3, chord: 3, bass: 1, melodic: 1, strip: 1 },
    deep:    { chord: 3, strip: 2, melodic: 2, bass: 1, perc: 1 },
    prog:    { melodic: 3, strip: 2, chord: 2, bass: 1, perc: 1 },
    melodic: { melodic: 4, chord: 2, strip: 2, perc: 1 },
    trance:  { melodic: 4, chord: 2, bass: 1, strip: 1 },
    uplift:  { melodic: 4, chord: 2, strip: 1 },
    minimal: { strip: 3, perc: 3, bass: 2 },
    disco:   { chord: 3, perc: 2, bass: 2, melodic: 1 },
    tech:    { bass: 4, perc: 3, strip: 1 },
    acid:    { bass: 4, strip: 2, perc: 1 },
    bside:   { strip: 1 }
  };
  /* per concept: its main transition effects (none is a choice), its breath
     (a full pause, a pause that keeps an effect's tail, or straight through)
     and the downbeat hits that suit it */
  const CONCEPT_FX = {
    bass:    { fx: { none: 3, revSnare: 2, noise: 1, whoosh: 1 }, breath: { pause: 4, tail: 1, none: 1 }, hit: { boom: 3, cut: 2, impact: 2, crash: 1 } },
    melodic: { fx: { swell: 3, revPiano: 2, riserTone: 2, none: 2, noise: 1 }, breath: { tail: 3, pause: 1, none: 2 }, hit: { crash: 3, crashImpact: 2, cut: 1 } },
    perc:    { fx: { none: 3, noise: 2, revSnare: 2 }, breath: { none: 3, pause: 2 }, hit: { crash: 3, cut: 2, impact: 1 } },
    chord:   { fx: { swell: 3, whoosh: 2, none: 2, riserTone: 1 }, breath: { tail: 2, pause: 2, none: 1 }, hit: { crashImpact: 3, crash: 2, impact: 1 } },
    strip:   { fx: { none: 4, riserTone: 2, swell: 1 }, breath: { pause: 4, tail: 1 }, hit: { cut: 3, boom: 2, crash: 1 } }
  };
  /* a second effect, under the main one, sometimes */
  const SUPPORT_FX = { swell: 2, revSnare: 2, whoosh: 2, none: 3 };
  /* the effects that run up to the downbeat (and so ring through a breath, on their own bus) */
  const TAIL_FX = { swell: 1, revSnare: 1, revPiano: 1, riserTone: 1 };
  /* a build's five stages, as fractions of its length (for 32 bars: 1-8
     tease, 9-16 develop, 17-24 urgency, 25-30 focus, 31-32 set-up) */
  const STAGE_AT = [8, 16, 24, 30, 32];
  const stageOf = (sec) => { const x = (sec.bar + 0.5) * 32 / sec.len; let i = 0; while (i < 4 && x >= STAGE_AT[i]) i++; return i + 1; };
  /* the sampled instruments (tonejs-instruments): how each plays a counter
     line, which octave of the chord it plays in, and its level */
  const SAMPLED = {
    piano: { fam: 'keys', oct: 1, vol: -10 }, organ: { fam: 'keys', oct: 1, vol: -15, hold: true }, harmonium: { fam: 'keys', oct: 1, vol: -14, hold: true },
    harp: { fam: 'pluck', oct: 2, vol: -9 }, 'guitar-nylon': { fam: 'pluck', oct: 1, vol: -8 }, xylophone: { fam: 'pluck', oct: 4, vol: -12 },
    'guitar-acoustic': { fam: 'strum', oct: 1, vol: -9 }, 'guitar-electric': { fam: 'chop', oct: 1, vol: -10 },
    'wah-guitar': { fam: 'chop', oct: 1, vol: -9, src: 'guitar-electric', fx: 'wah' }, 'muted-trumpet': { fam: 'wind', oct: 1, vol: -12, src: 'trumpet', fx: 'mute' },
    saxophone: { fam: 'wind', oct: 1, vol: -11 }, flute: { fam: 'wind', oct: 2, vol: -12 }, clarinet: { fam: 'wind', oct: 1, vol: -12 },
    'french-horn': { fam: 'wind', oct: 1, vol: -12 }, bassoon: { fam: 'wind', oct: 0.5, vol: -11 },
    trumpet: { fam: 'stab', oct: 2, vol: -14 }, trombone: { fam: 'stab', oct: 0.5, vol: -13 },
    violin: { fam: 'bowed', oct: 2, vol: -13 }, cello: { fam: 'bowed', oct: 0.5, vol: -11 },
    'bass-electric': { fam: 'bass', oct: 1, vol: -6 }, contrabass: { fam: 'bass', oct: 1, vol: -5 }, tuba: { fam: 'bass', oct: 1, vol: -10 },
    /* the Versilian Community Sample Library (VCSL, CC0; vendor/vcsl): the
       keyboards, the mallets and bells, the plucked strings of three
       continents, the reeds and the whistles (each note checked against its
       name: scripts/pack-vcsl.js). Their levels are measured, not guessed:
       each brought to the loudness of the instrument that set its role (the
       piano, the harp, the sax), the brightest a little under it. 'ring' is
       left to sound (chord tones on the beat), 'figure' a small repeating
       figure of its own */
    'grand-piano': { fam: 'keys', oct: 1, vol: -9 }, 'upright-piano': { fam: 'keys', oct: 1, vol: 0 },
    harpsichord: { fam: 'pluck', oct: 1, vol: -6 }, 'pipe-organ': { fam: 'keys', oct: 1, vol: -15, hold: true },
    'chapel-organ': { fam: 'keys', oct: 1, vol: -18, hold: true }, 'fm-piano': { fam: 'keys', oct: 1, vol: -10 },
    clavisynth: { fam: 'chop', oct: 1, vol: -14 },
    marimba: { fam: 'pluck', oct: 2, vol: -11 }, 'xylophone-real': { fam: 'pluck', oct: 2, vol: -7 }, balafon: { fam: 'pluck', oct: 2, vol: -2 },
    vibes: { fam: 'ring', oct: 2, vol: -16, src: 'vibraphone' }, vibraphone: { fam: 'ring', oct: 2, vol: -16 },
    'hand-chimes': { fam: 'ring', oct: 2, vol: -13 },
    'concert-harp': { fam: 'pluck', oct: 2, vol: -7 }, 'folk-harp': { fam: 'pluck', oct: 2, vol: 0 },
    'dan-tranh': { fam: 'figure', oct: 2, vol: -9 }, psaltery: { fam: 'pluck', oct: 2, vol: -1 },
    strumstick: { fam: 'strum', oct: 1, vol: -4.5 },
    'tenor-sax': { fam: 'wind', oct: 1, vol: -7.5 }, saxello: { fam: 'wind', oct: 1, vol: -12 },
    harmonica: { fam: 'wind', oct: 1, vol: -4.5 }, recorder: { fam: 'wind', oct: 2, vol: -11.5 }, ocarina: { fam: 'wind', oct: 2, vol: -11 }
  };
  /* the VCSL's hand percussion and its acoustic kit: one-shots by name
     (vendor/vcsl), each a few to choose between */
  const PERC_REAL = {
    /* [set, its line, its level (dB): drums with the machine's congas, bells and woods under them] */
    conga: ['perc-conga', [[3, 'lo'], [6, 'hi'], [7, 'mute'], [10, 'lo'], [13, 'hi'], [14, 'slap']], -22],
    bongo: ['perc-bongo', [[2, 'hi'], [3, 'himute'], [5, 'lo'], [7, 'hi'], [10, 'hi'], [11, 'himute'], [14, 'lo']], -22],
    cowbell: ['perc-cowbell', [[2, 'open'], [6, 'muted'], [10, 'open'], [13, 'muted']], -30],
    woodblock: ['perc-woodblock', [[4, 'a'], [7, 'b'], [11, 'a'], [14, 'soft']], -30],
    agogo: ['perc-agogo', [[0, 'hi'], [3, 'hi'], [6, 'lo'], [8, 'hi'], [10, 'hi'], [12, 'lo']], -30],
    cajon: ['perc-cajon', [[0, 'bass'], [3, 'tone'], [4, 'slap'], [7, 'tone'], [10, 'bass'], [12, 'slap'], [15, 'tone']], -22],
    darbuka: ['perc-darbuka', [[0, 'doum'], [3, 'tek'], [4, 'ka'], [6, 'tek'], [8, 'doum'], [10, 'tek'], [12, 'ka'], [14, 'tek']], -22],
    frame: ['perc-frame', [[0, 'lo'], [4, 'hi'], [6, 'mute'], [8, 'lo'], [10, 'mute'], [12, 'hi']], -22],
    triangle: ['perc-triangle', [[2, 'muted'], [6, 'muted'], [8, 'open'], [10, 'muted'], [14, 'muted']], -30],
    slit: ['perc-slit', [[0, 'lo'], [3, 'hi'], [6, 'hi'], [10, 'lo'], [12, 'hi']], -22],
    claps: ['perc-claps', [[4, 'a'], [12, 'b'], [15, 'solo']], -30],
    finger: ['perc-finger', [[4, 'hit'], [12, 'hit']], -30],
    guiro: ['perc-guiro', [[0, 'fast'], [4, 'hit'], [8, 'fast'], [12, 'hit']], -30]
  };
  /* the shakers: a sixteenth line under the hand drums, a second layer */
  const SHAKE_REAL = {
    shaker: ['perc-shaker', ['down', 'up', 'down2', 'up2']], cabasa: ['perc-cabasa', ['hit', 'rub', 'hit', 'rub']],
    tamb: ['perc-tamb', ['shake', 'soft', 'hit', 'soft']], sleigh: ['perc-sleigh', ['shake', 'hit', 'shake', 'hit']]
  };
  /* the voices that live at the top: a track has one of them at most */
  const BRIGHT = { bell: 1, xylophone: 1, 'xylophone-real': 1, harpsichord: 1, clavisynth: 1, psaltery: 1, balafon: 1, harmonica: 1 };
  /* the pianos a track's piano part may be played on */
  const PIANOS = ['piano', 'grand-piano', 'upright-piano'];       // the forms that build and drop
  /* the grooves: each player's place against the beat (seconds) and the
     sixteenths' accents; and the fills, [sixteenth, drum, level] */
  const GROOVES = {
    laid: { hat: 0.003, open: 0.002, snare: 0.009, ghost: 0.006, perc: 0.007, acc: [1, 0.6, 0.78, 0.64, 0.92, 0.58, 0.8, 0.66, 1, 0.6, 0.78, 0.64, 0.92, 0.58, 0.82, 0.7] },
    push: { hat: -0.004, open: -0.003, snare: 0, ghost: -0.002, perc: -0.003, acc: [1, 0.7, 0.9, 0.72, 1, 0.7, 0.9, 0.72, 1, 0.7, 0.9, 0.72, 1, 0.7, 0.9, 0.76] },
    even: { hat: -0.0015, open: 0, snare: 0.004, ghost: 0.002, perc: 0.002, acc: [1, 0.64, 0.84, 0.68, 0.96, 0.62, 0.84, 0.7, 1, 0.64, 0.84, 0.68, 0.96, 0.62, 0.86, 0.72] }
  };
  const GROOVE_OF = { deep: 'laid', lofi: 'laid', disco: 'laid', chicago: 'laid', bside: 'laid', trance: 'push', uplift: 'push', tech: 'push', acid: 'push', minimal: 'push' };
  const FILLS = [
    [[12, 'snare', 0.3], [13, 'snare', 0.35], [14, 'snare', 0.45], [15, 'snare', 0.55]],
    [[12, 'tomHi', 0.5], [13, 'tomHi', 0.5], [14, 'tomMid', 0.55], [15, 'tomLo', 0.6]],
    [[14, 'snare', 0.4], [15, 'snare', 0.5]],
    [[12, 'snare', 0.3], [13, 'tomMid', 0.5], [14, 'tomLo', 0.55], [15, 'kick', 0.7]],
    [[12, 'open', 0.16], [14, 'snare', 0.45], [15, 'snare', 0.5]],
    [[13, 'snare', 0.3], [14, 'tomHi', 0.5], [15, 'tomLo', 0.55]]
  ];
  /* the shuffle. Lo-fi and uplifting trance are left out of it (they are
     still there for a page that asks for one by name, style('lofi')) */
  const ROTATION = ['house', 'deep', 'prog', 'melodic', 'trance', 'disco', 'acid', 'chicago', 'minimal', 'tech'];
  let chosen = null;                                 // the style the visitor picked, or none: the rotation
  let edit = 'full';                                 // progressive house: the full length, or the short edit when asked
  const ARPS = [[0, 1, 2, 1], [0, 2, 1, 2], [2, 1, 0, 1], [0, 1, 2, 3]];

  /* ---- composing --------------------------------------------------------- */
  /* a seeded random, so a track renders the same twice (the quick first
     part and the whole side line up sample for sample) */
  const seeded = (a) => () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /* the running order: a dance record builds and drops; lo-fi goes round
     like a song; dub techno unfolds slowly. A 45 is the short version. */
  function arrange(S, rpm, r) {
    let a;
    if (S.form === 'song') {
      a = rpm === 45 ? [['intro', 2], ['groove', 8], ['drop', 8], ['outro', 2]]
        : [['intro', 4], ['groove', 8], ['drop', 8], ['breakdown', 4], ['groove', 8], ['drop', 8], ['outro', 4]];
    } else if (S.form === 'dub') {
      a = rpm === 45 ? [['intro', 4], ['groove', 8], ['drop', 16], ['outro', 4]]
        : [['intro', 8], ['groove', 16], ['drop', 16], ['breakdown', 8], ['drop', 16], ['outro', 8]];
    } else if (S.form === 'trance') {
      a = rpm === 45 ? [['intro', 4], ['groove', 8], ['build', 8], ['drop', 16], ['outro', 4]]
        : [['intro', 8], ['groove', 16], ['breakdown', 16], ['build', 8], ['drop', 16], ['outro', 8]];
    } else if (S.form === 'prog') {
      a = rpm === 45 ? [['intro', 4], ['groove', 12], ['build', 8], ['drop', 16]]
        : [['intro', 8], ['groove', 16], ['breakdown', 8], ['build', 16], ['drop', 16], ['outro', 8]];
    } else if (rpm === 45) {
      a = [['intro', 4], ['groove', 8], ['build', 8], ['drop', 16], ['outro', 4]];
    } else {
      a = [
        [['intro', 8], ['groove', 8], ['build', 8], ['drop', 16], ['breakdown', 8], ['build', 8], ['drop', 16]],
        [['intro', 8], ['groove', 16], ['build', 8], ['drop', 16], ['breakdown', 8], ['build', 4], ['drop', 8], ['outro', 4]],
        [['intro', 4], ['groove', 16], ['build', 8], ['drop', 16], ['breakdown', 8], ['build', 8], ['drop', 8], ['outro', 4]],
        [['intro', 8], ['groove', 8], ['breakdown', 8], ['build', 8], ['drop', 16], ['groove', 8], ['build', 4], ['drop', 8], ['outro', 4]]
      ][Math.floor(r() * 4)];
    }
    /* a build is as long as it wants to be - a short four-bar run-up or a long
       sixteen - the section before it giving or taking the bars, so the side
       stays the same length */
    if (DANCE[S.form]) {
      a = a.map((x) => x.slice());
      for (let i = 1; i < a.length; i++) {
        if (a[i][0] !== 'build') continue;
        const want = (S.form === 'prog' ? [8, 16, 16] : [4, 8, 8, 16])[Math.floor(r() * (S.form === 'prog' ? 3 : 4))];
        const give = want - a[i][1];
        if (a[i - 1][1] - give >= 4) { a[i - 1][1] -= give; a[i][1] = want; }
      }
    }
    /* fast styles run more bars to fill the same side */
    if (S.stretch) a = a.map(([n, len]) => [n, Math.max(4, Math.round(len * S.stretch / 4) * 4)]);
    return a;
  }

  /* ---- the melody: written, not rolled ----------------------------------
     A motif - a rhythm of its own (x a note, - held, . a rest) and a few
     notes - and then what a writer does with one: says it, says it again a
     step away, asks a question with it (the same start, an open ending on
     the fifth or second), and answers home (down to the root, held). Its
     notes are scale degrees: on the beat they land on the chord's own tones,
     between beats they pass through the scale. Mostly by step, a leap now and
     then, rising through the first half and falling back. */
  const MOTIFS = ['x-x-x.xx', 'x--x--x.', 'x-xx-x..', '.x-x.xx-', 'x--xx-x.', 'xx-x--x.', 'x-x--xx-', '..x-x-x-',
    'x---x-xx', 'x-x-xx--', 'x.x.x-x-', '.x.x.x--'];
  function writeMelody(r, pick) {
    const rhythm = pick(MOTIFS), n = rhythm.split('').filter((c) => c === 'x').length;
    const clamp = (d) => Math.max(-2, Math.min(9, d));
    let d = pick([0, 2, 4, 4]);
    const P = [];
    for (let i = 0; i < n; i++) {
      P.push(d);
      const up = i < n / 2 ? r() < 0.7 : r() < 0.3, x = r();
      const size = x < 0.15 ? 0 : x < 0.68 ? 1 : x < 0.9 ? 2 : pick([3, 4]);
      d = clamp(d + (up ? size : -size));
    }
    const bar = (rh, ps) => { let j = 0; return rh.split('').map((c) => (c === 'x' ? ps[Math.min(j++, ps.length - 1)] : c === '-' ? 'h' : null)); };
    /* the second bar of a phrase holds its last note */
    const held = (rh) => { const k = rh.lastIndexOf('x'); return rh.slice(0, k + 1) + '-'.repeat(7 - k); };
    const seq = pick([1, 2, -1]);
    const ask = P.slice(); ask[n - 1] = pick([4, 1]); if (n > 1) ask[n - 2] = ask[n - 1] + 1;
    return {
      hook: bar(rhythm, P).concat(bar(held(rhythm), P.map((p) => clamp(p + seq)))),
      answer: bar(rhythm, P).concat(bar(held(rhythm), ask.map(clamp))),
      close: bar(rhythm, P).concat(bar('x-x-x---', [2, 1, 0]))
    };
  }

  /* ---- the genres' own ways of playing -----------------------------------
     What makes one style not another, beyond its instruments: how long its
     motif is (two bars, or four), how busy and how held, its shape (an arch,
     a rise, a fall, a wave, or barely moving), how far it ranges and leaps,
     how short its notes are played, how its counter-melody and its keyboard
     comp move, what its bass does, how its chords are voiced. bars: motif
     length; rhythms: one bar each (x a note, - held, . rest); gate: how much
     of its length a note sounds; accent: the strong beats leaned on. */
  const PROFILES = {
    house:   { bars: [2], rhythms: ['x-x-x.xx', 'x--x--x.', 'x-xx-x..', 'x.x-x.x-', 'xx-x--x.'], contour: ['arch', 'wave'], range: 7, leap: 0.2, held: 0.15, gate: 0.85,
               counter: { rest: 0.3, contour: 'wave' }, comp: [[0, 6, 10], [2, 6, 10, 14], [3, 8, 14]], bass: ['house', 'off', 'houseSync'], voicing: 'close', model: 0.4 },
    chicago: { bars: [2], riff: true, rhythms: ['x.x..x..', '.x.x..x.', 'x..x.x..', 'xx..x...', '..x.x.x.'], contour: ['static', 'wave'], range: 5, leap: 0.15, held: 0.05, gate: 0.55,
               counter: { rest: 0.4, contour: 'static' }, comp: [[0, 3, 6, 10, 12], [2, 6, 9, 14], [0, 3, 8, 11]], bass: ['jack', 'house', 'octave'], voicing: 'close', model: 0 },
    deep:    { bars: [2, 4], rhythms: ['x---..x.', 'x--x----', '..x---x.', 'x---x---', '.x--..x-'], contour: ['fall', 'arch'], range: 5, leap: 0.1, held: 0.45, gate: 0.95,
               counter: { rest: 0.5, contour: 'fall' }, comp: [[0, 10], [3, 12], [0, 6]], bass: ['deepWalk', 'off', 'house'], voicing: 'open', model: 0.5 },
    prog:    { bars: [4], rhythms: ['x-x-x-x-', 'x--x--x-', 'x-x--x-x', 'x---x-x-', 'xx-x-x-x'], contour: ['rise', 'arch', 'wave'], range: 8, leap: 0.15, held: 0.2, gate: 0.9,
               counter: { rest: 0.25, contour: 'rise' }, comp: [[0, 8], [0, 6, 12]], bass: ['roll', 'trance', 'progPulse'], voicing: 'open', model: 0.5,
               arp: { rest: 0.12, hold: 0.12, span: 5 } },
    melodic: { bars: [4], rhythms: ['x--x-x--', 'x---x.x.', '.x-x--x-', 'x-x---..', 'x--x--..'], contour: ['arch', 'fall', 'wave'], range: 8, leap: 0.25, held: 0.35, gate: 0.92,
               counter: { rest: 0.35, contour: 'arch' }, comp: [[0, 10], [0, 6]], bass: ['off', 'roll', 'drone'], voicing: 'open', model: 0.5,
               arp: { rest: 0.25, hold: 0.2, span: 4 } },
    trance:  { bars: [4], rhythms: ['x---x---', 'x-----x-', 'x---x-x-', 'x--x--x-', 'x-------'], contour: ['rise', 'arch'], range: 9, leap: 0.3, held: 0.55, gate: 1,
               counter: { rest: 0.2, contour: 'rise' }, comp: [[0, 8], [0]], bass: ['trance', 'roll'], voicing: 'close', model: 0.4,
               arp: { rest: 0.05, hold: 0.06, span: 6 } },
    uplift:  { bars: [4], rhythms: ['x---x---', 'x-x-x---', 'x---x-x-', 'x-----x-'], contour: ['rise', 'arch'], range: 9, leap: 0.3, held: 0.5, gate: 1,
               counter: { rest: 0.2, contour: 'rise' }, comp: [[0, 8]], bass: ['trance'], voicing: 'open', model: 0.4, arp: { rest: 0.05, hold: 0.06, span: 6 } },
    minimal: { bars: [2], rhythms: ['x.......', '..x.....', 'x...x...', '...x..x.', '.x......'], contour: ['static'], range: 3, leap: 0.05, held: 0, gate: 0.35,
               counter: { rest: 0.65, contour: 'static' }, comp: [[3], [6], [3, 11]], bass: ['off', 'dub', 'blip'], voicing: 'close', model: 0 },
    disco:   { bars: [2], rhythms: ['x-x-x.x.', 'x.xx.x..', 'xx.x.x..', 'x-x.x-x.', '.x.x-x-.'], contour: ['arch', 'wave'], range: 7, leap: 0.25, held: 0.15, gate: 0.75,
               counter: { rest: 0.2, contour: 'wave' }, comp: [[2, 6, 10, 14], [1, 4, 7, 10, 14], [2, 6, 9, 13]], bass: ['disco', 'octave', 'discoGhost'], voicing: 'close', model: 0.2 },
    tech:    { bars: [2], rhythms: ['x.x.....', '.x..x...', 'x..x....', '..x.x...', 'xx......'], contour: ['static', 'fall'], range: 4, leap: 0.2, held: 0, gate: 0.4,
               counter: { rest: 0.5, contour: 'static' }, comp: [[2, 10], [3, 11, 14], [0, 3, 8, 11, 14]], bass: ['hook', 'hook', 'garage'], voicing: 'close', model: 0 },
    acid:    { bars: [2], rhythms: ['x.x.x.x.', 'xx.x.xx.', 'x.xx.x.x'], contour: ['wave'], range: 6, leap: 0.3, held: 0, gate: 0.6,
               counter: { rest: 0.5, contour: 'wave' }, comp: [[3], [3, 11]], bass: ['acidseq', 'acidseq', 'roll'], voicing: 'close', model: 0 },
    lofi:    { bars: [2], rhythms: ['x--x-x--', 'x---.x-x', '.x-x---.', 'x-x---x-', 'x--.x-..'], contour: ['fall', 'wave'], range: 6, leap: 0.2, held: 0.35, gate: 0.8,
               counter: { rest: 0.45, contour: 'fall' }, comp: [[0, 10], [3, 12]], bass: ['lofi'], voicing: 'open', model: 0.4 },
    bside:   { bars: [2], rhythms: ['x---x-x-', 'x--x----'], contour: ['fall'], range: 6, leap: 0.1, held: 0.4, gate: 0.95,
               counter: { rest: 0.4, contour: 'fall' }, comp: [[0]], bass: ['bside'], voicing: 'open', model: 0 }
  };
  /* a shape's target over a phrase, x from 0 to 1: how far up (in scale steps) */
  const SHAPES = {
    arch: (x) => Math.sin(Math.PI * x), rise: (x) => x, fall: (x) => 1 - x,
    wave: (x) => 0.5 + 0.5 * Math.sin(2 * Math.PI * x), static: () => 0.15
  };
  /* the theme: one motif, said and developed. A phrase is L bars of eighths:
     a number a scale degree, 'h' held, null a rest. Written from the
     profile with the track's second stream (q). Returns the motif (hook)
     and what is done with it: the question it asks (answer), an altered
     ending (alt), the motif a step late (disp), in another register (reg),
     and the close home (close). */
  function writeTheme(q, P) {
    const pick = (a) => a[Math.floor(q() * a.length)];
    const L = pick(P.bars), shape = SHAPES[pick(P.contour)];
    const held = (rh) => { const k = rh.lastIndexOf('x'); return k < 0 ? rh : rh.slice(0, k + 1) + '-'.repeat(7 - k); };
    const r1 = pick(P.rhythms), r2 = pick(P.rhythms), r3 = pick(P.rhythms);
    /* two bars: the motif and its cadence; four: motif, development, the motif again, cadence. A riff (Chicago): call, then a shorter answer */
    let bars = L === 2 ? [r1, held(r2)] : [r1, r2, r1, held(r3)];
    if (P.riff) bars = [r1, r2.replace(/x/g, (m, i) => (i > 4 ? '.' : m))];
    /* some notes held longer where the profile likes long notes */
    bars = bars.map((b) => b.split('').map((c, i, a) => (c === 'x' && i > 0 && a[i - 1] === 'x' && q() < P.held ? '-' : c)).join(''));
    const rhythm = bars.join(''), n = rhythm.split('').filter((c) => c === 'x').length;
    const start = pick([0, 2, 4]), span = Math.max(2, P.range - 2);
    const notes = [];
    let d = start;
    for (let i = 0; i < n; i++) {
      notes.push(d);
      const target = start + Math.round(shape((i + 1) / Math.max(1, n)) * span);
      const leap = q() < P.leap ? pick([2, 3]) : 1;
      d += Math.sign(target - d) * Math.min(Math.abs(target - d), leap) || (q() < 0.4 ? pick([-1, 1]) : 0);
      d = Math.max(-2, Math.min(P.range + 1, d));
    }
    /* in four bars, bar three says bar one again (the motif comes back) */
    if (L === 4) { const c1 = bars[0].split('').filter((c) => c === 'x').length, c2 = bars[1].split('').filter((c) => c === 'x').length; for (let i = 0; i < c1; i++) if (c1 + c2 + i < n) notes[c1 + c2 + i] = notes[i]; }
    const lay = (rh, ps) => { let j = 0; return rh.split('').map((c) => (c === 'x' ? ps[Math.min(j++, ps.length - 1)] : c === '-' ? 'h' : null)); };
    const hook = lay(rhythm, notes);
    const lastOn = (ph) => { for (let i = ph.length - 1; i >= 0; i--) if (typeof ph[i] === 'number') return i; return -1; };
    const ending = (ph, degs) => { const o = ph.slice(); let k = lastOn(o); for (let j = degs.length - 1; j >= 0 && k >= 0; j--) { o[k] = degs[j]; do k--; while (k >= 0 && typeof o[k] !== 'number'); } return o; };
    const answer = ending(hook, [pick([4, 1]) + 1, pick([4, 1])]);
    const alt = ending(hook, [notes[n - 1] + pick([-2, 2]), notes[n - 1] + pick([-1, 1])]);
    const close = ending(hook, [2, 1, 0]);
    /* a step late: the whole phrase moved one eighth on, its last moment dropped */
    const disp = [null].concat(hook.slice(0, hook.length - 1)).map((v, i, a) => (v === 'h' && i > 0 && a[i - 1] === null ? null : v));
    const reg = hook.map((v) => (typeof v === 'number' ? v + (start >= 2 ? -3 : 3) : v));
    return { L, hook, answer, alt, close, disp, reg, rhythm };
  }
  /* the arpeggio as a phrase: two bars of sixteenths over the chord's tones
     (and the octave above), shaped, with rests, accents and a few held notes;
     and a second version for the phrases that turn it round */
  function writeArp(q, A) {
    const pick = (a) => a[Math.floor(q() * a.length)];
    const shape = pick(['up', 'down', 'updown', 'pedal', 'skip']);
    const span = A.span || 4, out = [];
    for (let i = 0; i < 32; i++) {
      const x = i % 8;
      let n = shape === 'up' ? x % span : shape === 'down' ? (span - 1) - (x % span) : shape === 'updown' ? [0, 1, 2, 3, 4, 3, 2, 1][x] % span
        : shape === 'pedal' ? (x % 2 ? 1 + (x >> 1) % (span - 1) : 0) : [0, 2, 1, 3, 2, 4, 3, 5][x] % span;
      const rest = q() < A.rest && i % 4 !== 0, hold = !rest && q() < A.hold;
      out.push({ n: rest ? -1 : n, acc: i % 4 === 0 || (i % 8 === 3 && q() < 0.5), len: hold ? 1.8 : 0.85 });
    }
    const turn = out.map((s, i) => (s.n < 0 ? s : Object.assign({}, s, { n: i >= 16 ? (span - 1) - s.n : s.n })));
    return { A: out, B: turn };
  }
  /* the counter-melody's lines: two bars of eighths as chord tones (or rests),
     a version with its end changed, and a sparser answer */
  function writeCounter(q, C) {
    const shape = SHAPES[C.contour] || SHAPES.wave;
    const A = Array.from({ length: 16 }, (_, i) => (q() < C.rest && i % 4 ? -1 : Math.max(0, Math.min(3, Math.round(shape(i / 15) * 3 + (q() - 0.5))))));
    const A2 = A.map((v, i) => (i >= 12 ? (v < 0 ? Math.floor(q() * 4) : (v + 1 + Math.floor(q() * 2)) % 4) : v));
    const B = A.map((v, i) => (i % 2 ? -1 : v));
    return { A, A2, B };
  }
  /* a bass line written for this track (tech house's hook, a jacking line):
     two bars of [step, length, interval] */
  function writeBassHook(q, P) {
    const pick = (a) => a[Math.floor(q() * a.length)];
    const bar = (busy) => {
      const out = [];
      for (let st = 0; st < 16; st++) {
        const on = st === 0 ? q() < 0.7 : st % 4 === 2 ? q() < 0.65 : st % 2 ? q() < 0.22 * busy : q() < 0.3 * busy;
        if (on) out.push([st, pick([0.8, 1, 1.5]), pick([0, 0, 0, 12, 7, 10, 3])]);
      }
      if (!out.length) out.push([0, 2, 0]);
      return out;
    };
    const a = bar(1), b = bar(1.3);
    return [a, b];
  }
  /* the 303: sixteen steps, each on or off, a note of the chord, an accent, a slide into the next */
  function writeAcid(q) {
    const pick = (a) => a[Math.floor(q() * a.length)];
    return Array.from({ length: 16 }, (_, i) => ({ on: i === 0 || q() < 0.68, iv: pick([0, 0, 0, 12, 7, 3, 10, 5, 12]), acc: q() < 0.3, slide: q() < 0.25 }));
  }
  /* a sound's per-track settings, within bounds: each track's lead a little
     its own (attack, filter, resonance, detune, how much goes to the echo) and
     the same all the way through it */
  function writePreset(q) {
    const in_ = (lo, hi) => lo + q() * (hi - lo);
    return { atk: in_(0.6, 1.6), cut: in_(0.7, 1.4), res: in_(0.7, 1.4), spread: in_(0.6, 1.5), send: in_(0.6, 1.3), bell: [3.5, 2.01, 5.07, 1.4][Math.floor(q() * 4)] };
  }

  /* ---- MusicVAE's melodies ----------------------------------------------
     Magenta's melody model (vendor/magenta: TensorFlow.js and the
     2-bar melody checkpoint, all served from here) is loaded once the first
     record is playing - never in the way of it - and asked for melodies in
     batches; those the critic's ear passes go into a pool the composer draws
     hooks from. Without it (it did not load, or has not yet) the writer above
     does it alone. A melody here is sixteen eighths of MIDI notes, held
     ('h') or rests (null); fromModel puts one into a track's scale. */
  const modelPool = [];
  function fromModel(raw, scaleName, pick) {
    const sc = SCALES[scaleName], ps = raw.filter((v) => typeof v === 'number');
    if (ps.length < 4) return null;
    /* the transposition that fits it into the scale best (fewest notes outside) */
    let shift = 0, worst = 99;
    for (let t = 0; t < 12; t++) {
      const bad = ps.filter((x) => sc.indexOf((x + t) % 12) < 0).length + (sc.indexOf((ps[ps.length - 1] + t) % 12) % 2 ? 0.5 : 0);
      if (bad < worst) { worst = bad; shift = t; }
    }
    const degOf = (x) => {
      const q = x + shift, pc = ((q % 12) + 12) % 12;
      let i = 0;
      for (let k = 0; k < 7; k++) if (Math.abs(sc[k] - pc) < Math.abs(sc[i] - pc)) i = k;
      return i + 7 * Math.floor(q / 12);
    };
    const degs = ps.map(degOf).sort((a, b) => a - b), mid = degs[degs.length >> 1];
    const lift = -7 * Math.round((mid - 3) / 7);                     // centred where the writer's sit
    const hook = raw.map((v) => (typeof v === 'number' ? degOf(v) + lift : v));
    const bar1 = hook.slice(0, 8), bar2 = hook.slice(8);
    const onsets = bar2.map((v, i) => (typeof v === 'number' ? i : -1)).filter((i) => i >= 0);
    const ask = bar2.slice();
    if (onsets.length) { const e = pick([4, 1]); ask[onsets[onsets.length - 1]] = e; if (onsets.length > 1) ask[onsets[onsets.length - 2]] = e + 1; }
    const mel = { hook, answer: bar1.concat(ask), close: bar1.concat([2, 'h', 1, 'h', 0, 'h', 'h', 'h']) };
    return melodyScore(mel) > 0.2 ? mel : null;
  }
  function modelPhrase(ns) {
    /* sixteenths to eighths: each note at the eighth nearest its start, held to its end */
    const out = new Array(16).fill(null);
    (ns.notes || []).slice().sort((a, b) => a.quantizedStartStep - b.quantizedStartStep).forEach((n) => {
      const k = Math.min(15, Math.round(n.quantizedStartStep / 2));
      if (out[k] !== null && out[k] !== 'h') return;
      out[k] = n.pitch;
      const end = Math.min(16, Math.max(k + 1, Math.round(n.quantizedEndStep / 2)));
      for (let j = k + 1; j < end; j++) if (out[j] === null) out[j] = 'h';
    });
    return out;
  }
  let modelLoading = null;
  function loadModel() {
    if (modelLoading) return modelLoading;
    const script = (src) => new Promise((ok, no) => {
      const el = document.createElement('script');
      el.src = src; el.async = true; el.onload = ok; el.onerror = () => no(new Error(src));
      document.head.appendChild(el);
    });
    /* TensorFlow.js's bundled regenerator sets a global, and when it cannot
       falls back to code from a string, which this page's CSP refuses: the
       global made first, the plain assignment works */
    if (!('regeneratorRuntime' in window)) window.regeneratorRuntime = undefined;
    modelLoading = script(near('vendor/magenta/tf.min.js')).then(() => script(near('vendor/magenta/music_vae.js'))).then(() => {
      const vae = new window.music_vae.MusicVAE(near('vendor/magenta/mel_2bar_small'));
      return vae.initialize().then(() => vae);
    }).then((vae) => {
      /* a few batches, a breath between them, so the page never stalls */
      let batches = 0;
      const more = () => vae.sample(12, 0.6 + Math.random() * 0.35).then((seqs) => {
        seqs.forEach((ns) => {
          const raw = modelPhrase(ns);
          if (fromModel(raw, 'major', () => 4) || fromModel(raw, 'minor', () => 4)) modelPool.push(raw);
        });
        if (modelPool.length > 60) modelPool.splice(0, modelPool.length - 60);
        if (++batches < 4) return new Promise((ok) => setTimeout(ok, 1500)).then(more);
        return null;
      });
      return more();
    }).catch((e) => { if (window.console) console.warn('[soon] the melody model did not load:', e && e.message); });
    return modelLoading;
  }

  function compose(seed, side, rpm) {
    const r = seeded(seed), pick = (a) => a[Math.floor(r() * a.length)];
    const rolled = pick(ROTATION);                   // (rolled either way, so the rest of the track is the same)
    const style = side === 'b' ? 'bside' : chosen || rolled;
    const S = STYLES[style];
    const [lo, hi] = S.bpm;
    let bpm = lo + Math.floor(r() * (hi - lo + 1));
    if (rpm === 45) bpm = Math.max(bpm, Math.round(lo + (hi - lo) * 0.6));   // a single sits at the quick end
    const scale = pick(S.scales);
    const family = S.harmony === 'both' ? (scale === 'major' ? 'major' : 'minor')
      : S.harmony === 'minor' && (scale === 'major' || scale === 'mixo') ? 'major' : S.harmony;
    let arr = arrange(S, rpm, r);
    /* the newer decisions draw from a stream of their own, so the choices
       above (and the B-side, the same for everyone) stay what they were */
    const q = seeded((seed ^ 0x7F4A7C15) >>> 0), qpick = (a) => a[Math.floor(q() * a.length)];
    /* progressive house is long whatever the speed it is pressed at: a 45
       plays faster, it is not cut shorter (a short edit only when asked for) */
    let progForm = null;
    if (style === 'prog' && side !== 'b' && edit !== 'short') {
      /* the references: eight in ten at 123 BPM, the rest a little either side */
      bpm = q() < 0.8 ? 123 : [122, 124, 125, 126, 128][Math.floor(q() * 5)];
      progForm = writeProgForm(q, bpm); arr = progForm.arr;
    }
    const tr = {
      seed, style, label: S.label, side: side === 'b' ? 'b' : 'a', rpm: rpm === 45 ? 45 : 33,
      bpm, key: Math.floor(r() * 12) - 5, scale, prog: pick(PROGS[family]),
      sevenths: r() < S.sevenths, bpc: pick(S.bpc),
      beat: pick(BEATS[S.beats]), bassLine: pick(S.bass), bassTone: pick(S.tones),
      rhythm: pick(S.rhythms), padTone: pick(S.pads), wave: pick(S.waves),
      lead: r() < S.leadChance, leadVoice: pick(S.leads), leadPat: pick(S.leadPats), arp: pick(ARPS),
      line: Array.from({ length: 16 }, () => ({ on: r() < 0.62, n: Math.floor(r() * 4), up: r() < 0.25, acc: r() < 0.3 })),
      hook: Array.from({ length: 8 }, () => (r() < 0.22 ? -1 : Math.floor(r() * 4))),
      answer: null,                                  // the hook varied, filled in below
      swing16: (S.swing16 || 0) * (0.8 + r() * 0.4), swing8: (S.swing8 || 0) * (0.8 + r() * 0.4),
      arr, bars: arr.reduce((n, s) => n + s[1], 0)
    };
    /* call and response: the answering phrase is the hook with a few notes
       moved to a neighbouring chord tone, a rest filled or opened */
    tr.answer = tr.hook.map((n) => {
      const x = r();
      if (n < 0) return x < 0.4 ? Math.floor(r() * 3) : -1;
      return x < 0.3 ? Math.max(0, Math.min(3, n + (r() < 0.5 ? -1 : 1))) : x < 0.38 ? -1 : n;
    });
    /* the band beyond the core: a percussion layer, a counter-melody voice
       and its own line, a ride, tom fills, a second lead for a later drop,
       and the style's other beat to alternate with */
    const X = EXTRAS[style] || {};
    const pickIn = (a) => (a && a.length ? pick(a) : null);
    tr.percLayer = pickIn(X.perc);
    tr.counter = r() < 0.92 ? pickIn((X.counter || []).filter((v) => v !== tr.leadVoice)) : null;
    /* a recorded lead (a sax, a violin) sings the hook: a run of sixteenths
       is for the plucks and mallets */
    const leadFam = SAMPLED[tr.leadVoice] && SAMPLED[tr.leadVoice].fam;
    if (leadFam && leadFam !== 'pluck' && tr.leadPat !== 'hook') tr.leadPat = 'hook';
    tr.counterLine = Array.from({ length: 8 }, () => (r() < 0.3 ? -1 : Math.floor(r() * 4)));
    tr.ride = r() < (X.ride || 0);
    tr.toms = r() < 0.7;
    tr.lead2 = pickIn((X.lead2 || []).filter((v) => v !== tr.leadVoice)) || tr.leadVoice;
    const beats = BEATS[S.beats];
    tr.beatB = beats.length > 1 ? beats.find((b) => b !== tr.beat) : null;
    tr.compVariant = r() < 0.5 ? 0 : 1;
    /* for a drop to develop: a second bass line to move to, and a third line
       for the lead's last phrase, mostly longer notes, ending on the root */
    const lines = S.bass.concat(['octave', 'off']).filter((l) => l !== tr.bassLine);
    tr.bassLine2 = lines[Math.floor(r() * lines.length)];
    tr.close = Array.from({ length: 8 }, (_, i) => (i === 7 ? 0 : i % 2 && r() < 0.5 ? -1 : Math.floor(r() * 4)));
    const PR = PROFILES[style] || PROFILES.house;
    const written = writeMelody(r, pick);            // (drawn as before, so the picks after it stay the same)
    /* the B-side keeps the melody it has always had; every other record is written from its style */
    tr.mel = side === 'b' ? Object.assign(written, { L: 2, alt: written.answer, disp: [null].concat(written.hook.slice(0, 15)), reg: written.hook, rhythm: '' }) : writeTheme(q, PR);
    /* or the model's: a melody MusicVAE wrote (learned from real music), put
       into this key - only where the style's own writing allows one, and
       developed the same way */
    const useModel = side !== 'b' && modelPool.length && r() < 0.65;
    if (useModel && q() < (PR.model || 0)) {
      const m = fromModel(modelPool[Math.floor(q() * modelPool.length)], tr.scale, qpick);
      if (m) { tr.mel = Object.assign({}, m, { L: 2, alt: m.answer, disp: [null].concat(m.hook.slice(0, 15)), reg: m.hook.map((v) => (typeof v === 'number' ? v + 3 : v)) }); tr.melBy = 'model'; }
    }
    tr.profile = style;
    tr.arpLine = writeArp(q, PR.arp || { rest: 0.1, hold: 0.1, span: 4 });
    tr.cp = writeCounter(q, PR.counter);
    tr.comp = [qpick(PR.comp), qpick(PR.comp)];
    tr.bassLine = qpick(PR.bass);
    tr.bassLine2 = qpick(PR.bass.concat(['octave', 'off']).filter((l) => l !== tr.bassLine));
    tr.bassHook = writeBassHook(q, PR);
    tr.acidSeq = writeAcid(q);
    tr.preset = writePreset(q);
    tr.voicing = PR.voicing;
    /* (the hook's first bar, as chord tones and rests, for the parts that
       only need to know where it rests) */
    tr.hook = tr.mel.hook.slice(0, 8).map((v) => (typeof v === 'number' ? ((v % 4) + 4) % 4 : -1));
    /* the lead's pattern: a recorded voice (but a mallet's or a harp's) sings the theme */
    /* the transitions, each one in or out for this track: no two tracks
       move between sections quite alike */
    tr.trans = { swell: r() < 0.75, revSnare: r() < 0.5, whoosh: r() < 0.6, riserTone: r() < 0.5, boom: r() < 0.55, roll: r() < 0.85 };
    /* every build and every drop its own kind, so the ear cannot learn the
       routine (riser, roll, silence, crash). A build: the snare rolling up,
       the kick doubling up instead, a half-time build, the drums gone and the
       chords stabbing faster, the lead stuttering, or all of it gone but a
       rising synth - its riser on its own curve and range, its held breath
       a beat, half a bar, an eighth or none. A drop: the slam, a fake (a hit,
       a breakdown, a roll, then the real thing), the bass alone first, half
       time then full, the beat coming in a piece at a time, or the lead and
       the counter-melody answering each other - its first hit, its gap (or
       none), where the lead comes in and where it lifts all its own. */
    const BUILDS = ['snare', 'kick', 'half', 'stabs', 'stutter', 'strip'];
    const DROPS = ['slam', 'fake', 'bassfirst', 'half', 'gradual', 'callresp'];
    const count = (name) => Math.max(1, arr.filter((x) => x[0] === name).length);
    const unlike = (list, prev) => pick(list.filter((x) => x !== prev));
    tr.builds = [];
    for (let i = 0; i < count('build'); i++) {
      tr.builds.push({
        type: unlike(BUILDS, i ? tr.builds[i - 1].type : null),
        curve: 0.6 + r() * 2.4, lo: 250 + r() * 450, hi: 4000 + r() * 6000, noise: r() < 0.85,
        breath: pick(['beat', 'beat', 'half', 'eighth', 'none']), fcurve: 1 + r() * 2
      });
    }
    tr.drops = [];
    for (let i = 0; i < count('drop'); i++) {
      const prev = i ? tr.drops[i - 1].type : 'fake';          // a fake only first time round
      tr.drops.push({
        type: i ? unlike(DROPS.filter((x) => x !== 'fake'), prev) : pick(DROPS),
        hit: pick(['crashImpact', 'crashImpact', 'crash', 'boom', 'cut']),
        gap: pick([null, 0.25, 0.5, 0.5, 0.75]), gapBeats: pick([1, 2, 2]),
        lift: i ? pick([null, 0.5, 0.75, 0.75]) : null, leadIn: pick([0, 0.25, 0.25, 0.5])
      });
    }
    /* how each build hands over to its drop - one idea, carried through,
       weighted by the style: the bass (taken apart, the kick out, a pause,
       the bass answering), the melody (the hook teased, opening up, then
       whole), the percussion (a conversation, fills growing, a stronger
       groove with space in it), the chords (tension in the harmony and its
       articulation, then an open voicing), or stripped (layers taken away
       to one unresolved phrase, then the core groove back alone). One main
       transition effect and at most one other, often none of the noisy
       ones; a breath that is a real pause or keeps a tail; and a downbeat
       hit chosen to fit. The old picks above are still drawn (so nothing
       else moves) but these decide. */
    const CONCEPTS = TRANSITIONS[style] || TRANSITIONS.house;
    const weighted = (w) => { const ks = Object.keys(w), sum = ks.reduce((n, k) => n + w[k], 0); let x = q() * sum; for (const k of ks) { x -= w[k]; if (x < 0) return k; } return ks[0]; };
    tr.moves = tr.builds.map((b, i) => {
      const concept = weighted(CONCEPTS);
      const C = CONCEPT_FX[concept];
      const principal = weighted(C.fx);
      const support = q() < 0.45 ? weighted(Object.fromEntries(Object.entries(SUPPORT_FX).filter(([k]) => k !== principal))) : 'none';
      let breath = weighted(C.breath);
      /* (an effect that swells into the downbeat cannot sit in a full pause: that breath keeps its tail) */
      if (breath === 'pause' && (TAIL_FX[principal] || TAIL_FX[support])) breath = 'tail';
      if (breath === 'tail' && !TAIL_FX[principal] && !TAIL_FX[support]) breath = 'pause';      // (nothing to ring: that is a pause)
      return { concept, principal, support, breath, breathLen: qpick(['eighth', 'beat', 'beat', 'half']),
        hit: weighted(C.hit), riserBars: qpick([4, 8, 8]), fills: q() < 0.5 };
    });
    /* how each breakdown is entered: mostly nothing at all, now and then the air let out or a boom */
    tr.entries = Array.from({ length: count('breakdown') }, () => weighted({ none: 4, air: 1, boom: 1 }));
    /* each drop keyed to the build before it (a drop with no build: the first move, or a plain one) */
    tr.drops.forEach((d, i) => {
      const m = tr.moves[i] || tr.moves[tr.moves.length - 1];
      d.hit = m ? m.hit : qpick(['crash', 'cut', 'boom']); d.concept = m ? m.concept : null;
      /* the drop's shape agrees with its concept: the hook whole at once for the
         melody (and only it may fake), the core groove alone first when stripped,
         the bass leading for the bass */
      if (d.concept === 'melodic' && (d.type === 'bassfirst' || d.type === 'gradual')) d.type = 'slam';
      if (d.concept === 'strip') d.type = 'gradual';
      if (d.concept === 'bass' && d.type === 'gradual') d.type = 'bassfirst';
      if (d.type === 'fake' && d.concept !== 'melodic') d.type = 'slam';
      if (d.concept === 'melodic') d.leadIn = 0;
      if (d.lift && q() < 0.65) d.lift = null;       // an octave up is a seasoning, not the development
    });
    /* harmony with a turn in it: one chord borrowed from the parallel key for
       the breakdown and the later phrases, and (some dance tracks) the last
       drop lifted a whole step */
    tr.borrow = tr.prog.length > 1 && r() < 0.55 ? Math.floor(r() * tr.prog.length) : null;
    tr.keyUp = !!DANCE[S.form] && count('drop') >= 2 && r() < 0.4 && q() < 0.3;   // rare: a later drop is new for what it does with the theme, not for a key change
    /* the drummer's fills: a small one for phrase ends, a big one every eight bars */
    tr.fills = [pick([0, 2, 4, 5]), pick([1, 3, 0])];
    /* the hook early: teased quietly in the first groove, inside the first half minute */
    tr.tease = r() < 0.8;
    /* the real instruments: a bass player, a string section doubling the
       pads, a horn section for the breakdown, a clarinet and bassoon, a
       harmonium bed - each in or out for this track */
    tr.realBass = X.bassInst && r() < (X.realBass || 0) ? pickIn(X.bassInst) : null;
    tr.strings = r() < (X.strings || 0);
    tr.horns = r() < (X.horns || 0);
    tr.wood = r() < (X.wood || 0);
    tr.harmonium = r() < (X.harmonium || 0);
    /* how this style arranges (see EXTRAS); jazz chords where they belong; an
       instrument to answer the hook (most often where the style is funk);
       a reversed piano swelling into a drop */
    tr.family = X.family || 'groove';
    tr.ninths = r() < (X.ninths || 0);
    tr.resp = r() < ({ funk: 0.9, groove: 0.6, evolve: 0.15, minimal: 0.2, texture: 0.3 }[tr.family]) ? pickIn(X.resp) : null;
    tr.revPiano = r() < (X.revPiano || 0);
    /* a few strong parts rather than all of them: two of the beds at most, one
       for minimal and lo-fi (fewer parts, more feel) */
    const beds = ['strings', 'horns', 'wood', 'harmonium'].filter((k) => tr[k]);
    const maxBeds = tr.family === 'minimal' || tr.family === 'texture' ? 1 : 2;
    while (beds.length > maxBeds) tr[beds.splice(Math.floor(r() * beds.length), 1)[0]] = false;
    if (tr.family === 'minimal') tr.fills = [2, 4];                  // small fills, carefully placed
    /* which piano the piano parts are played on; a shaker's sixteenths under
       the hand drums; a real drummer's kit (VCSL) for the styles played by hand */
    tr.piano = pickIn(PIANOS);
    if (tr.counter === 'piano') tr.counter = tr.piano;
    tr.shake = r() < (X.shakes || 0) ? pickIn(X.shake) : null;
    tr.acoustic = r() < (X.acoustic || 0);
    /* parts that sit well together, the picks above checked against each
       other: one bright voice at most among the lead, the counter and the
       second lead (two bells, or a harpsichord over a xylophone, fight for
       the same top end); no counter comping on a keyboard where the chords
       are already played on one; no shaker's sixteenths over a beat whose own
       percussion already fills it */
    const bright = (v) => !!v && (!!BRIGHT[v] || (!!SAMPLED[v] && SAMPLED[v].fam === 'ring'));
    const comps = (v) => (!!SAMPLED[v] && SAMPLED[v].fam === 'keys' && !SAMPLED[v].hold) || v === 'wurli';
    const RHc = RHYTHMS[tr.rhythm] || {}, keyChords = !!(RHc.voice || RHc.keys);
    const leadBright = tr.lead && bright(tr.leadVoice);
    const counterOk = (v) => v !== tr.leadVoice && !(keyChords && comps(v)) && !(leadBright && bright(v));
    if (tr.counter && !counterOk(tr.counter)) {
      tr.counter = pickIn((X.counter || []).map((v) => (v === 'piano' ? tr.piano : v)).filter(counterOk));
    }
    if (bright(tr.lead2) && tr.lead2 !== tr.leadVoice && (bright(tr.counter) || leadBright)) {
      tr.lead2 = pickIn((X.lead2 || []).filter((v) => v !== tr.leadVoice && !bright(v))) || tr.leadVoice;
    }
    /* (a style whose second leads all ring, minimal's bell: the counter gives way instead) */
    if (bright(tr.lead2) && bright(tr.counter)) tr.counter = pickIn((X.counter || []).filter((v) => counterOk(v) && !bright(v)));
    if (tr.shake && tr.beat.p.length >= 4) tr.shake = null;
    /* progressive house: its own renderer, its own sounds (see renderProg) */
    if (style === 'prog' && side !== 'b') {
      tr.engine = 'prog'; tr.sr = PSR; tr.bpc = 2;
      tr.patch = writeProgPatch(q);
      tr.chords = writeProgChords(q, tr);
      tr.progHook = writeProgHook(q, tr);
      const H = progHarmony(tr, tr.chords.degs);
      tr.plan = { H, HB: progHarmony(tr, tr.chords.re), chordBars: tr.chords.bars, reharm: q() < 0.6, arps: writeProgArps(tr.patch.arp, q),
        counter: writeProgCounter(q, H, tr.chords.bars), form: progForm ? progForm.id : 'short' };
      tr.scripts = writeProgScripts(q, tr, progForm ? progForm.vars : tr.arr.map(() => null), progForm ? progForm.main : -1);
      /* (for the critic: the hook as the ear has it) */
      tr.mel = Object.assign({}, tr.mel, { rhythm: tr.progHook.plan + ':' + tr.progHook.hook.map((x) => x[1]).join(','), hook: tr.progHook.hook.map((x) => x[2]) });
      tr.leadVoice = 'prog:' + tr.patch.rec.lead;
      tr.bassLine = 'prog';
      tr.samples = progSets(tr.patch);
      tr.resolved = null;                            // (filled in when its sounds are made)
      return tr;
    }
    /* every sampled instrument this track will need loaded */
    const synthLead = { pluck: 1, supersaw: 1, bell: 1, acid: 1, keys: 1, sawlead: 1, squarelead: 1, wurli: 1, blip: 1, vox: 1 };
    const RESP_SAMPLES = { 'brass-hit': ['trumpet', 'trombone'], 'string-stab': ['violin'], 'guitar-lick': ['guitar-electric'], 'sax-lick': ['saxophone'] };
    tr.samples = [...new Set([
      ...(RESP_SAMPLES[tr.resp] || []), tr.revPiano || tr.rhythm === 'piano' || tr.moves.some((m) => m.principal === 'revPiano') ? tr.piano : null,
      SAMPLED[tr.leadVoice] && !synthLead[tr.leadVoice] ? tr.leadVoice : null,
      SAMPLED[tr.counter] ? tr.counter : null, SAMPLED[tr.lead2] && !synthLead[tr.lead2] ? tr.lead2 : null, tr.realBass,
      tr.strings ? 'violin' : null, tr.strings ? 'cello' : null,
      tr.horns ? 'french-horn' : null, tr.horns ? 'trombone' : null, tr.horns ? 'tuba' : null,
      tr.wood ? 'clarinet' : null, tr.wood ? 'bassoon' : null, tr.harmonium ? 'harmonium' : null,
      PERC_REAL[tr.percLayer] ? PERC_REAL[tr.percLayer][0] : null, SHAKE_REAL[tr.shake] ? SHAKE_REAL[tr.shake][0] : null,
      tr.acoustic ? 'kit-acoustic' : null
    ].filter(Boolean).map((n) => (SAMPLED[n] && SAMPLED[n].src) || n))];      // (a wah guitar is the guitar's recordings)
    return tr;
  }
  const B_SEED = 0x0AD0B51D;                      // the B-side: one track, for everyone

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  /* chords built up the scale in thirds (with the seventh if the track has
     them), voiced close around middle C */
  /* the chords, voice-led: of each chord's inversions the one whose notes
     move least from the chord before. `shift` lifts the key (semitones);
     the chord at `borrowAt` is taken from the parallel key */
  const PARALLEL = { minor: 'major', dorian: 'major', phrygian: 'major', major: 'minor', mixo: 'minor' };
  function chordsOf(tr, shift, borrowAt) {
    shift = shift || 0;
    const tonic = 57 + tr.key + shift;
    let prev = null;
    return tr.prog.map((d, i) => {
      const sc = SCALES[i === borrowAt ? PARALLEL[tr.scale] : tr.scale];
      const pitch = (x) => tonic + sc[((x % 7) + 7) % 7] + 12 * Math.floor(x / 7);
      /* sevenths; or ninths, voiced as a player would (the fifth left out) */
      const degs = tr.ninths ? [d, d + 2, d + 6, d + 8] : tr.sevenths ? [d, d + 2, d + 4, d + 6] : [d, d + 2, d + 4];
      let notes = degs.map(pitch).map(n => { while (n > 69) n -= 12; while (n < 52) n += 12; return n; }).sort((a, b) => a - b);
      if (prev && prev.length === notes.length) {
        const cands = [];
        for (let k = 0; k < notes.length; k++) {
          const inv = notes.slice(k).concat(notes.slice(0, k).map((x) => x + 12));
          cands.push(inv, inv.map((x) => x - 12));
        }
        const cost = (c) => c.reduce((sum, x, j) => sum + Math.abs(x - prev[j]), 0);
        const ok = cands.filter((c) => c[0] >= 48 && c[c.length - 1] <= 74).sort((a, b) => cost(a) - cost(b));
        if (ok.length) notes = ok[0];
      }
      prev = notes;
      return { root: hz(pitch(d) - 24), notes: notes.map(hz), top: hz(notes[0] + 12), deg: d, shift };
    });
  }
  function sectionAt(tr, barIndex) {
    let b = barIndex;
    const seen = {};
    for (let i = 0; i < tr.arr.length; i++) {
      const [name, len] = tr.arr[i];
      if (b < len) return { name, bar: b, len, n: seen[name] || 0, next: tr.arr[i + 1] ? tr.arr[i + 1][0] : null };
      seen[name] = (seen[name] || 0) + 1;
      b -= len;
    }
    const [name, len] = tr.arr[tr.arr.length - 1];
    return { name, bar: len - 1, len, n: (seen[name] || 1) - 1, next: null };
  }
  const barSec = (tr) => 240 / tr.bpm;
  const totalOf = (tr) => Math.ceil(tr.bars * barSec(tr) * ((tr && tr.sr) || SR));
  const RPM = (n) => (n === 45 ? 45 : 33.33);

  /* ---- rendering (Tone.js) ------------------------------------------------
     Every track is rendered offline with Tone.js (vendor/tone), in
     stereo: real instruments built once for the track and played like a
     band - a membrane kick, metal hats and cymbals, noise snares and claps,
     a sub under a driven mono bass, fat-oscillator pads and stabs, an FM
     electric piano, a plucked string, a supersaw, an FM bell, an acid line,
     an organ - through a mix: the drums glued by a compressor, the chords and
     lead high-passed clear of the bass, a stereo reverb (its impulse made
     from the track's own seed), a ping-pong echo, chorus, tape vibrato,
     saturation, a sidechain pump, a low shelf, a compressor and a limiter. */
  const dB = (g) => 20 * Math.log10(Math.max(1e-6, g));


  /* "after this": a message to ourselves rather than a 0 ms timer. A tab in
     the background has its timers slowed to once a second or less, which
     would starve the press while the record plays on; messages are not. */
  function later(fn) {
    const c = new MessageChannel();
    c.port1.onmessage = () => { c.port1.close(); fn(); };
    c.port2.postMessage(0);
  }

  /* ---- the sampled instruments ---------------------------------------------
     Real recordings (tonejs-instruments, CC BY 3.0, credited on the page):
     every note of twenty instruments is on the server; a track decodes up
     to eight of each instrument it uses, spread through its range (the
     Sampler fills the notes between), each held to eight seconds and faded
     - a whole piano decoded would be well over a hundred megabytes. An
     instrument once decoded is kept for later tracks. */
  /* what went wrong fetching the instruments, kept for the page to ask
     (diagnostics()) and told to the console once each: a name with no
     manifest entry, a download that failed, a file that would not decode */
  const diag = [], told = new Set();
  function report(kind, name, detail) {
    diag.push({ kind, name, detail: detail || '', at: Date.now() });
    if (diag.length > 60) diag.shift();
    if (!told.has(kind + name) && window.console) { told.add(kind + name); console.warn('[vinyl-player] ' + kind + ': ' + name + (detail ? ' (' + detail + ')' : '')); }
  }
  const SAMPLE_DIR = near('vendor/tonejs-instruments/');
  const dirOf = (info) => (info.dir ? near('vendor/' + info.dir + '/') : SAMPLE_DIR);
  const decodedInst = new Map();
  let sampleWatch = null;                          // the page's preloader, told as notes arrive
  let pressWatch = null;                           // and as a record's bars are pressed
  /* an instrument: one packed file (scripts/pack-samples.js), its notes cut
     out of it where the manifest says they start */
  function instrument(name) {
    if (decodedInst.has(name)) { const p = decodedInst.get(name); decodedInst.delete(name); decodedInst.set(name, p); return p; }
    if (!window.TONE_SAMPLES) { report('no manifest loaded', name); return Promise.reject(new Error('no manifest')); }
    const info = window.TONE_SAMPLES[name];
    if (!info) { report('not in the manifest', name); return Promise.reject(new Error('no recordings of ' + name)); }
    const dec = new OfflineAudioContext(1, 1, SR);
    if (sampleWatch) sampleWatch(0, info.notes.length);
    const p = fetch(dirOf(info) + info.file)
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }, (e) => { throw new Error('network: ' + (e && e.message)); })
      .catch((e) => { report('download failed', name, e.message); throw e; })
      .then((ab) => dec.decodeAudioData(ab).catch((e) => { report('decode failed', name, e && e.message); throw e; }))
      .then((buf) => {
        const src = buf.getChannelData(0), out = {}, near = Math.round(SR * 0.06);
        info.notes.forEach((n, i) => {
          /* (a decoder that trims the encoder's delay puts the note a little
             earlier than measured: its first sound, if just before) */
          let s = Math.round(info.at[i] * SR);
          for (let k = Math.max(0, s - near); k < s; k++) if (Math.abs(src[k]) > 1e-3) { s = k; break; }
          const len = Math.max(1, Math.min(Math.round(info.len[i] * SR), src.length - s));
          const note = new AudioBuffer({ length: len, numberOfChannels: 1, sampleRate: SR });
          note.getChannelData(0).set(src.subarray(s, s + len));
          out[info.kind === 'hits' ? n : n.replace('s', '#')] = note;
        });
        if (sampleWatch) sampleWatch(info.notes.length, 0);
        return out;
      });
    decodedInst.set(name, p);
    p.catch(() => decodedInst.delete(name));
    /* the six most recently wanted instruments are kept decoded; older ones
       are let go (fetched again, from the browser's cache, if wanted later) */
    while (decodedInst.size > 6) decodedInst.delete(decodedInst.keys().next().value);
    return p;
  }
  /* the recordings a style is likely to want, fetched ahead (into the
     browser's cache, not decoded) while the poster is up */
  const fetched = new Set();
  function prefetch(style) {
    const S = STYLES[style], X = EXTRAS[style] || {}, M = window.TONE_SAMPLES || {};
    if (!S) return;
    const want = new Set([].concat(S.leads, X.counter || [], X.lead2 || [], X.bassInst || [],
      X.strings ? ['violin', 'cello'] : [], X.horns ? ['french-horn', 'trombone', 'tuba'] : [],
      X.wood ? ['clarinet', 'bassoon'] : [], X.harmonium ? ['harmonium'] : [],
      (X.perc || []).map((p) => PERC_REAL[p] && PERC_REAL[p][0]).filter(Boolean)));
    want.forEach((n) => {
      n = (SAMPLED[n] && SAMPLED[n].src) || n;
      if (!M[n] || fetched.has(n)) return;
      fetched.add(n);
      fetch(dirOf(M[n]) + M[n].file, { priority: 'low' }).catch(() => fetched.delete(n));
    });
  }
  const samplesFor = (tr) => Promise.all((tr.samples || []).map((n) => instrument(n).then((m) => [n, m], () => [n, null])))
    .then((pairs) => Object.fromEntries(pairs.filter(([, m]) => m)));

  /* ---- the drum machine ---------------------------------------------------
     Each kit's sounds are made once, with Tone's own drum instruments - metal
     hats and cymbals, noise snares, claps, rims and shakers - and kept as
     one-shot samples. Every hit is then the sample played back, a little
     differently each time (its strength, a hair of pitch), as a drum machine
     does: Tone's drum voices re-triggered thousands of times over a side
     slow a render to a crawl; a sample played back costs nothing. */
  /* Tone, set up for this page once: a quiet offline context as its global
     (it renders, it never plays live here). */
  let toneSet = false;
  function tone() {
    const T = window.Tone;
    if (!T) return null;
    if (!toneSet) { toneSet = true; T.setContext(new T.OfflineContext(1, 0.05, SR)); }
    return T;
  }

  const kits = new Map();
  function kitFor(T, name) {
    if (kits.has(name)) return kits.get(name);
    const K = KITS[name];
    const shot = (dur, make) => T.Offline(() => { make(T.getDestination()); }, dur, 2, SR).then((b) => b.get());
    const metal = (decay, res, vol, note) => shot(decay + 0.15, (out) => {
      new T.MetalSynth({ harmonicity: 5.1, modulationIndex: 32, resonance: res, octaves: 1.5,
        envelope: { attack: 0.001, decay, release: 0.01 }, volume: vol }).connect(out).triggerAttackRelease(note || 320, decay * 0.5, 0.005, 1);
    });
    const noiseShot = (decay, type, freq, q, vol, extra) => shot(decay + 0.12, (out) => {
      const n = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay, sustain: 0 }, volume: vol })
        .connect(new T.Filter({ type, frequency: freq, Q: q }).connect(out));
      n.triggerAttackRelease(decay, 0.005, 1);
      if (extra) extra(out, n);
    });
    const body = (out, f, decay, vol) => new T.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay, sustain: 0, release: 0.02 }, volume: vol })
      .connect(out).triggerAttackRelease(f, decay, 0.005, 1);
    const sn = K.snare;
    const snareShot =
      sn === 'clap' ? noiseShot(0.16, 'bandpass', 1500, 0.9, -4, (out, n) => {
        /* a clap is a few hands, a hair apart */
        n.triggerAttackRelease(0.14, 0.016, 0.8); n.triggerAttackRelease(0.12, 0.027, 0.7);
      })
      : sn === 'rim' ? noiseShot(0.025, 'bandpass', 3200, 2, -6, (out) => body(out, 820, 0.03, -12))
      : sn === 'dusty' ? noiseShot(0.16, 'bandpass', 1400, 0.7, -4, (out) => body(out, 180, 0.08, -9))
      : sn === 'gated' ? shot(0.35, (out) => {
          new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0.75, release: 0.02 }, volume: -4 })
            .connect(new T.Filter({ type: 'bandpass', frequency: 1700, Q: 0.6 }).connect(out)).triggerAttackRelease(0.2, 0.005, 1);
          body(out, 200, 0.1, -9);
        })
      : noiseShot(0.12, 'bandpass', 1900, 0.8, -4, (out) => body(out, 190, 0.07, -9));
    const percShot = K.perc === 'tamb' ? metal(0.06, 9000, -24, 420)
      : K.perc === 'shaker' ? noiseShot(0.035, 'highpass', 6000, 0.7, -14)
      : noiseShot(0.02, 'bandpass', 3200, 2, -10, (out) => body(out, 820, 0.025, -14));
    /* one at a time: each takes the global context while it is made */
    const order = [
      ['hatC', () => metal(K.hat[1] * 1.3, K.hat[0], -20)],
      ['hatO', () => metal(0.3, K.hat[0] - 1000, -22)],
      ['crash', () => metal(1.4, 3500, -20, 300)],
      ['snare', () => snareShot], ['perc', () => percShot],
      ['ghost', () => noiseShot(0.1, 'bandpass', 1900, 0.8, -6)],
      ['click', () => noiseShot(0.008, 'highpass', 3000, 0.7, dB(0.5 * (K.click || 0.0001)))],
      ['crackle', () => noiseShot(0.003, 'highpass', 2500, 0.7, dB(0.12))]
    ];
    const out = { percPan: K.perc === 'shaker' ? -0.3 : 0.3 };
    const p = order.reduce((chain, [key, make]) => chain.then(() => make().then((b) => { out[key] = b; })), Promise.resolve()).then(() => out);
    kits.set(name, p);
    p.catch(() => kits.delete(name));
    return p;
  }

  /* One segment of a track: bars [a, b), rendered with LEAD bars before it
     (so a reverb's tail, an echo, a held chord are already sounding where it
     starts) and FADE samples after it (the overlap its successor is
     crossfaded over). Each segment is its own fresh render, so a long track
     costs no more per bar than a short one. Returns the segment's stereo
     samples, from bar a, FADE past bar b unless it is the last. */
  const LEAD = 2, FADE = 1024;                     // (two bars: longer than any reverb's tail, at the slowest tempo)
  const at = (tr, bar) => Math.round(bar * barSec(tr) * ((tr && tr.sr) || SR));   // a bar's first sample (at the record's own rate)
  /* the rest of the band's percussion and effects, the same for every kit,
     made once: hand drums, a cowbell, claves, a woodblock, a finger snap, a
     ride, three toms, an impact (a sub that drops away under a thud), and a
     reversed cymbal to swell into a drop */
  const reversed = (b) => {
    const r = new AudioBuffer({ length: b.length, numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
    for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c), o = r.getChannelData(c); for (let i = 0; i < d.length; i++) o[i] = d[d.length - 1 - i]; }
    return r;
  };
  let extrasMade = null;
  function extrasFor(T) {
    if (extrasMade) return extrasMade;
    const shot = (dur, make) => T.Offline(() => { make(T.getDestination()); }, dur, 2, SR).then((b) => b.get());
    const membrane = (note, decay, octaves, vol, pitchDecay) => shot(decay + 0.2, (out) =>
      new T.MembraneSynth({ pitchDecay: pitchDecay || 0.02, octaves, oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay, sustain: 0, release: 0.05 }, volume: vol }).connect(out).triggerAttackRelease(note, decay, 0.005, 1));
    const tone1 = (type, notes, decay, vol, filter) => shot(decay + 0.15, (out) => {
      const dest = filter ? new T.Filter(filter).connect(out) : out;
      notes.forEach((f) => new T.Synth({ oscillator: { type }, envelope: { attack: 0.001, decay, sustain: 0, release: 0.02 }, volume: vol })
        .connect(dest).triggerAttackRelease(f, decay, 0.005, 1));
    });
    const order = [
      ['congaLo', () => membrane(210, 0.24, 1.5, -6)], ['congaHi', () => membrane(320, 0.18, 1.5, -7)],
      ['bongoLo', () => membrane(380, 0.12, 1.4, -8)], ['bongoHi', () => membrane(520, 0.09, 1.4, -9)],
      ['cowbell', () => tone1('square', [540, 800], 0.32, -20, { type: 'bandpass', frequency: 1900, Q: 1.2 })],
      ['clave', () => tone1('sine', [2500], 0.05, -8)],
      ['woodblock', () => tone1('triangle', [880], 0.07, -8, { type: 'bandpass', frequency: 1100, Q: 3 })],
      ['snap', () => shot(0.2, (out) => {
        new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 }, volume: -8 })
          .connect(new T.Filter({ type: 'bandpass', frequency: 2600, Q: 1.5 }).connect(out)).triggerAttackRelease(0.05, 0.005, 1);
      })],
      ['ride', () => shot(1.4, (out) => new T.MetalSynth({ harmonicity: 5.1, modulationIndex: 16, resonance: 6000, octaves: 1.2,
        envelope: { attack: 0.001, decay: 1.1, release: 0.05 }, volume: -26 }).connect(out).triggerAttackRelease(600, 0.5, 0.005, 1))],
      ['tomLo', () => membrane(95, 0.45, 2, -5, 0.06)], ['tomMid', () => membrane(135, 0.4, 2, -6, 0.06)], ['tomHi', () => membrane(185, 0.35, 2, -7, 0.06)],
      ['impact', () => shot(1.6, (out) => {
        new T.MembraneSynth({ pitchDecay: 0.9, octaves: 3.4, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 1.4, sustain: 0, release: 0.1 }, volume: -3 })
          .connect(out).triggerAttackRelease(32, 1.3, 0.005, 1);
        new T.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.001, decay: 0.25, sustain: 0 }, volume: -10 })
          .connect(new T.Filter({ type: 'lowpass', frequency: 900 }).connect(out)).triggerAttackRelease(0.25, 0.005, 1);
      })],
      ['revSnare', () => shot(0.5, (out) => {
        new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.32, sustain: 0 }, volume: -6 })
          .connect(new T.Filter({ type: 'bandpass', frequency: 1800, Q: 0.8 }).connect(out)).triggerAttackRelease(0.32, 0.005, 1);
      }).then((b) => reversed(b))],
      ['whoosh', () => shot(1.9, (out) => {
        const f = new T.Filter({ type: 'bandpass', frequency: 300, Q: 1.1 }).connect(out);
        f.frequency.setValueAtTime(300, 0); f.frequency.exponentialRampToValueAtTime(5500, 0.9); f.frequency.exponentialRampToValueAtTime(500, 1.8);
        new T.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.8, decay: 0.9, sustain: 0, release: 0.1 }, volume: -8 }).connect(f).triggerAttackRelease(1.7, 0.005, 1);
      })],
      ['boom', () => shot(2.4, (out) =>
        new T.MembraneSynth({ pitchDecay: 0.25, octaves: 2, oscillator: { type: 'sine' }, envelope: { attack: 0.002, decay: 2.1, sustain: 0, release: 0.1 }, volume: -4 })
          .connect(out).triggerAttackRelease(42, 2, 0.005, 1))],
      ['swell', () => shot(1.6, (out) => new T.MetalSynth({ harmonicity: 5.1, modulationIndex: 32, resonance: 3500, octaves: 1.5,
        envelope: { attack: 0.001, decay: 1.4, release: 0.05 }, volume: -20 }).connect(out).triggerAttackRelease(300, 0.6, 0.005, 1))
        .then((b) => reversed(b))]                     // the cymbal, backwards: it swells and stops dead on the downbeat
    ];
    const out = {};
    extrasMade = order.reduce((chain, [key, make]) => chain.then(() => make().then((b) => { out[key] = b; })), Promise.resolve()).then(() => out);
    extrasMade.catch(() => { extrasMade = null; });
    return extrasMade;
  }

  /* ==== progressive house, made like a record =================================
     Progressive house is not played on the shared band above: it has a
     renderer of its own, built the way a producer builds a track - the
     genre's own sounds synthesised note by note at 44.1 kHz (supersaw pads,
     a pluck whose filter snaps on every note, the sub-and-saw bass, a
     supersaw or saw lead, a drum machine's kick, clap and hats, risers and
     sweeps), each record its own versions of them, with recordings where the
     genre uses them (a piano, real strings under the breakdowns, a shaker,
     a ride and a crash, sometimes real claps or congas). Mixed like a
     record: every part at its level, each ducking under the kick by its own
     amount, a hall, a room and a ping-pong echo, the lows kept mono, glued,
     limited with a look-ahead. Everything that changes over the track
     follows smooth curves over the arrangement, worked out from the bar, so
     any part can be pressed alone and still meet its neighbours. */
  const PSR = 44100;
  const srOf = (tr) => (tr && tr.sr) || SR;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const undb = (d) => Math.pow(10, d / 20);

  /* ---- signal pieces (on plain arrays, at PSR) ---- */
  function noiseOf(n, seed) {
    /* seeded gaussian noise (Box-Muller over the seeded random) - for the reverbs' responses */
    const r = seeded(seed >>> 0), out = new Float32Array(n);
    for (let i = 0; i < n; i += 2) {
      const u = Math.max(1e-9, r()), v = r(), m = Math.sqrt(-2 * Math.log(u));
      out[i] = m * Math.cos(2 * Math.PI * v); if (i + 1 < n) out[i + 1] = m * Math.sin(2 * Math.PI * v);
    }
    return out;
  }
  function coeffs(kind, f, q) {
    f = Math.min(PSR * 0.45, Math.max(10, f));
    const w = 2 * Math.PI * f / PSR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (kind === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (kind === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al;
    return [b0 / a0, b1 / a0, b2 / a0, (-2 * c) / a0, (1 - al) / a0];
  }
  /* a biquad over x, in place; cutoff a number or a function of the sample (updated every 64) */
  function biquad(x, kind, f, q) {
    q = q || 0.707;
    let z1 = 0, z2 = 0, k = typeof f === 'number' ? coeffs(kind, f, q) : null;
    for (let i = 0; i < x.length; i++) {
      if (!k || (typeof f !== 'number' && (i & 63) === 0)) k = coeffs(kind, typeof f === 'number' ? f : f(i), q);
      const v = x[i], y = k[0] * v + z1;
      z1 = k[1] * v - k[3] * y + z2; z2 = k[2] * v - k[4] * y; x[i] = y;
    }
    return x;
  }
  const peakOf = (x) => { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); return m || 1e-9; };
  const rmsOf = (x, n) => { let s = 0; n = Math.min(n || x.length, x.length); for (let i = 0; i < n; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, n)) || 1e-9; };
  const scale = (x, k) => { for (let i = 0; i < x.length; i++) x[i] *= k; return x; };
  const toBuf = (chs) => { const b = new AudioBuffer({ length: chs[0].length, numberOfChannels: chs.length, sampleRate: PSR }); chs.forEach((c, i) => b.copyToChannel(c, i)); return b; };
  const mixIn = (a, b, g) => { for (let i = 0; i < a.length && i < b.length; i++) a[i] += b[i] * (g == null ? 1 : g); return a; };
  const times = (x, e) => { for (let i = 0; i < x.length; i++) x[i] *= e[i]; return x; };
  /* an envelope: attack a, held to hold (s), then a release r */
  const envOf = (n, a, hold, r) => {
    const e = new Float32Array(n), A = Math.max(1, a * PSR), H = hold * PSR, R = Math.max(1, r * PSR);
    for (let i = 0; i < n; i++) e[i] = i < A ? i / A : i < H ? 1 : Math.exp(-(i - H) / (R / 4));
    for (let i = Math.max(0, n - 64), k = 0; i < n; i++, k++) e[i] *= 1 - k / 64;
    return e;
  };

  /* synthesis, for the sounds progressive house is made of */
  const band = (x, lo, hi) => biquad(biquad(x, 'hp', lo), 'lp', hi);
  const hp4 = (x, f) => biquad(biquad(x, 'hp', f, 0.54), 'hp', f, 1.31);
  /* a band-limited saw (PolyBLEP); freq a number or a function of the sample */
  function saw(freq, n, ph) {
    const out = new Float32Array(n), Fx = typeof freq === 'number';
    ph = ph || 0;
    for (let i = 0; i < n; i++) {
      const dt = (Fx ? freq : freq(i)) / PSR;
      let y = 2 * ph - 1;
      if (ph < dt) { const t = ph / dt; y -= 2 * t - t * t - 1; }
      else if (ph > 1 - dt) { const t = (ph - 1) / dt; y -= t * t + 2 * t + 1; }
      out[i] = y; ph += dt; if (ph >= 1) ph -= 1;
    }
    return out;
  }
  function sine(freq, n, ph) {
    const out = new Float32Array(n), Fx = typeof freq === 'number';
    ph = ph || 0;
    for (let i = 0; i < n; i++) { out[i] = Math.sin(2 * Math.PI * ph); ph += (Fx ? freq : freq(i)) / PSR; if (ph >= 1) ph -= 1; }
    return out;
  }
  /* a square from two saws (band-limited too), its width w */
  function square(freq, n, ph, w) {
    const a = saw(freq, n, ph || 0), b = saw(freq, n, ((ph || 0) + (w || 0.5)) % 1);
    for (let i = 0; i < n; i++) a[i] = (a[i] - b[i]) * 0.5;
    return a;
  }
  /* an envelope: attack a, decay time constant d to sustain s, gate dur, release r (seconds) */
  function adsr(dur, a, d, s, r) {
    const on = Math.max(1, Math.round(dur * PSR)), nr = Math.round(r * PSR), e = new Float32Array(on + nr);
    for (let i = 0; i < on; i++) { const t = i / PSR; e[i] = t < a ? t / a : s + (1 - s) * Math.exp(-(t - a) / d); }
    const lv = e[on - 1];
    for (let i = 0; i < nr; i++) e[on + i] = lv * Math.exp(-i / PSR / (r / 5));
    for (let i = Math.max(0, e.length - 64), k = 0; i < e.length; i++, k++) e[i] *= 1 - k / 64;
    return e;
  }
  const stereo = (n) => [new Float32Array(n), new Float32Array(n)];
  /* several saws a few cents apart, spread across the field: the sound of progressive and trance */
  function supersaw(midi, n, voices, cents, width, seed, vib, wave) {
    const r = seeded(seed >>> 0), f0 = mtof(midi), [L, R] = stereo(n);
    const pans = Array.from({ length: voices }, (_, i) => (voices > 1 ? -width + 2 * width * i / (voices - 1) : 0));
    for (let i = pans.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pans[i], pans[j]] = [pans[j], pans[i]]; }
    for (let v = 0; v < voices; v++) {
      const o = voices > 1 ? -1 + 2 * v / (voices - 1) : 0, f = f0 * Math.pow(2, o * cents / 1200);
      const fr = vib ? (i) => f * vib(i) : f;
      const x = wave === 'square' ? square(fr, n, r(), 0.5) : saw(fr, n, r());
      const amp = Math.abs(o) < 1e-9 ? 1 : 0.75, th = (pans[v] + 1) * Math.PI / 4, cl = Math.cos(th) * amp, cr = Math.sin(th) * amp;
      for (let i = 0; i < n; i++) { L[i] += x[i] * cl; R[i] += x[i] * cr; }
    }
    const k = 1 / Math.sqrt(voices);
    for (let i = 0; i < n; i++) { L[i] *= k; R[i] *= k; }
    return [L, R];
  }
  /* saturation: soft clipping that fills a sound's harmonics in (tanh, level kept) */
  const sat = (x, drive) => { const k = 1 / Math.tanh(drive); for (let i = 0; i < x.length; i++) x[i] = Math.tanh(drive * x[i]) * k; return x; };
  const METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
  function metal(n, k) {
    const out = new Float32Array(n);
    METAL.forEach((f, j) => { for (let i = 0; i < n; i++) out[i] += Math.sign(Math.sin(2 * Math.PI * f * k * i / PSR + j)) / 6; });
    return out;
  }

  /* ---- this record's sounds ------------------------------------------------
     A patch per record (from its seed). The genre's own sounds are made
     here - supersaw pads, a synth pluck for the arpeggio, the sub-and-saw
     bass, a supersaw or saw lead, a drum machine's kick, clap and hats -
     each record its own version of them; recordings only where progressive
     house uses them: a piano (for the keys, now and then the hook or the
     arpeggio), real strings under the pad in the breakdowns, a shaker, a
     ride and a crash, sometimes real claps or congas. */
  function writeProgPatch(q) {
    const r = (lo, hi) => lo + q() * (hi - lo), pick = (a) => a[Math.floor(q() * a.length)];
    return {
      rec: { keys: pick(['grand-piano', 'grand-piano', 'upright-piano', 'rhodes']), arp: pick(['synth', 'synth', 'synth', 'piano', 'bell']),
        lead: pick(['supersaw', 'supersaw', 'sawlead', 'pluck', 'piano']), strings: q() < 0.65, clap: pick(['synth', 'synth', 'recorded']), hand: pick(['synth', 'synth', 'conga']) },
      pad: { voices: pick([7, 9, 9, 11]), cents: r(16, 34), width: r(0.6, 1), attack: r(0.35, 1.1), wave: pick(['saw', 'saw', 'saw', 'square']) },
      pluck: { voices: pick([3, 4, 4, 5]), cents: r(7, 16), decay: r(0.07, 0.17), snap: r(2, 4.5), snapT: r(0.03, 0.08), wave: pick(['saw', 'saw', 'square']), octave: q() < 0.3 },
      keys: { index: r(1.0, 2.2), bell: r(0.2, 0.55), ratio: pick([3.5, 3.5, 2, 4.1, 5]), decay: r(0.6, 1.3) },
      lead: { voices: pick([7, 9, 9]), cents: r(12, 24), vibRate: r(4.6, 6), vibDepth: r(0.003, 0.006), attack: r(0.006, 0.04) },
      bass: { kind: pick(['sawsine', 'sawsine', 'reese', 'square']), decay: r(0.06, 0.13), sustain: r(0.4, 0.7) },
      kick: { f0: r(43, 52), sweep: r(150, 230), punch: r(0.014, 0.028), decay: r(0.1, 0.17), click: r(0.2, 0.5), drive: r(1.5, 2.6) },
      clap: pick(['clap', 'clap', 'snareclap']), hat: r(0.05, 0.12), hatHp: r(4500, 7500), ride: q() < 0.7, shaker: q() < 0.85,
      perc: pick([[[3, 4], [6, 0], [10, 2], [14, 4]], [[2, 2], [7, 4], [11, 0]], [[3, 4], [5, 2], [10, 4], [13, 0], [15, 2]]]),
      hall: { len: r(2.8, 4.2), bright: r(6000, 10000), dark: r(1200, 2000) }, delay: pick([0.75, 0.75, 0.5, 0.375]), fb: r(0.35, 0.5),
      arp: pick([[0, 1, 2, 3, 2, 1, 2, 4, 0, 1, 2, 3, 2, 3, 4, 3], [0, 2, 1, 3, 2, 4, 3, 1, 0, 2, 1, 3, 4, 2, 3, 1], [0, 1, 2, 1, 3, 2, 4, 2, 0, 1, 2, 1, 3, 4, 3, 2],
        [0, -1, 2, 1, -1, 3, 2, -1, 0, 4, 2, -1, 3, 1, 2, 4], [0, 1, 0, 2, 0, 3, 0, 4, 1, 2, 1, 3, 1, 4, 2, 3]])
    };
  }
  /* the recordings a record needs: the kit's ride and crash and a shaker always; a piano, strings, claps, congas where it uses them */
  const progSets = (P) => {
    const C = P.rec, piano = C.keys !== 'rhodes' ? C.keys : 'grand-piano';
    return [...new Set(['kit-acoustic', 'perc-shaker'].concat(C.keys !== 'rhodes' || C.arp === 'piano' || C.lead === 'piano' ? [piano] : [],
      C.strings ? ['violin', 'cello'] : [], C.clap === 'recorded' ? ['perc-claps'] : [], C.hand === 'conga' ? ['perc-conga'] : []))];
  };
  const progCache = new Map();                       // a record's sounds and its recordings, kept with it (two records: on the deck and next)
  function progBankFor(tr) {
    if (progCache.has(tr.seed)) return progCache.get(tr.seed);
    const sets = progSets(tr.patch);
    const p = Promise.all(sets.map((n) => instrument(n).then((m) => [n, m], () => [n, null]))).then((pairs) => progBank(tr, Object.fromEntries(pairs)));
    progCache.set(tr.seed, p);
    p.catch(() => progCache.delete(tr.seed));
    while (progCache.size > 2) progCache.delete(progCache.keys().next().value);
    return p;
  }
  function progBank(tr, SM) {
    const P = tr.patch, C = P.rec, BEATs = 60 / tr.bpm, BARs = BEATs * 4, memo = new Map();
    const once = (key, make) => { if (!memo.has(key)) memo.set(key, make()); return memo.get(key); };
    const NT = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const midiOf = (nm) => { const m = /^([A-G]#?)(-?\d)$/.exec(nm); return m ? NT.indexOf(m[1]) + 12 * (+m[2] + 1) : null; };
    const ALT = { 'grand-piano': 'upright-piano', 'upright-piano': 'grand-piano', violin: 'cello', cello: 'violin' };
    const setOf = (n) => { let x = n, k = 0; while (x && !SM[x] && k++ < 3) x = ALT[x]; return SM[x] ? x : null; };
    const nearest = (set, m) => { const s = setOf(set); if (!s) return null; let best = null, bd = 99; for (const [nm, b] of Object.entries(SM[s])) { const sm = midiOf(nm); if (sm == null) continue; const d = Math.abs(m - sm); if (d < bd) { bd = d; best = [b, m - sm]; } } return best; };
    /* a recording read at a rate (re-pitched, from its own rate to 44.1k); loop: ping-pong over its body to hold it */
    function read(b, semis, n, loop) {
      const out = new Float32Array(n); if (!b) return out;
      const src = b.getChannelData(0), base = b.sampleRate / PSR * Math.pow(2, semis / 12), L0 = Math.floor(src.length * 0.25), L1 = Math.floor(src.length * 0.85);
      let pos = 0, dir = 1;
      for (let i = 0; i < n; i++) {
        if (pos >= src.length - 1 && !loop) break;
        const j = Math.floor(pos), f = pos - j; out[i] = (src[j] || 0) * (1 - f) + (src[j + 1] || 0) * f;
        pos += dir * base;
        if (loop && dir > 0 && pos >= L1) dir = -1; else if (loop && dir < 0 && pos <= L0) dir = 1;
      }
      return out;
    }
    const hitOf = (set, name, semis, sec) => { const s = setOf(set), b = s && (SM[s][name] || Object.values(SM[s])[0]); return read(b, semis || 0, Math.round((sec || (b ? b.duration : 0.1)) * PSR)); };
    const note = (set, m, sec, loop) => { const x = nearest(set, m); return x ? read(x[0], x[1], Math.round(sec * PSR), loop) : null; };
    const pair = (set, m, sec, cents, loop) => { const l = note(set, m + cents / 100, sec, loop); return l ? [l, note(set, m - cents / 100, sec, loop)] : null; };
    const mono = (x, k) => toBuf([scale(x, k / peakOf(x))]);
    const duo = (l, r, k) => { const g = k / Math.max(peakOf(l), peakOf(r)); return toBuf([scale(l, g), scale(r, g)]); };
    const piano = C.keys !== 'rhodes' ? C.keys : 'grand-piano';
    /* a piano note, both sides a hair apart (or, without its recordings, the FM electric piano) */
    const pianoNote = (m, sec, rel) => { const pr = pair(piano, m, sec, 3); if (!pr) return null; const n = pr[0].length, e = envOf(n, 0.002, sec - rel, rel); times(pr[0], e); times(pr[1], e); return pr; };
    const fmKeys = (m, beats) => {
      const A = P.keys, env = adsr(beats * BEATs, 0.003, A.decay, 0.35, 1.4), n = env.length, [L, R] = stereo(n);
      [0.998, 1.002].forEach((det, c) => { const o = c ? R : L; for (let i = 0; i < n; i++) { const t = i / PSR, w = 2 * Math.PI * mtof(m) * det * t; o[i] = (Math.sin(w + (0.25 + A.index * Math.exp(-t / 0.3)) * Math.sin(w)) + Math.sin(w + 0.9 * Math.exp(-t / 0.15) * Math.sin(A.ratio * w)) * Math.exp(-t / 0.6) * A.bell) * env[i]; } });
      return [L, R];
    };
    const synthPerc = (f) => { const n = Math.round(0.25 * PSR), tone = sine((i) => f * (1 + 0.5 * Math.exp(-i / PSR / 0.008)), n), tick = band(noiseOf(n, tr.seed ^ 7), 2000, 6000), x = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / PSR; x[i] = tone[i] * Math.exp(-t / 0.07) + tick[i] * Math.exp(-t / 0.004) * 0.2; } return x; };
    /* what each part plays (for the page and the tests) */
    tr.resolved = { keys: { want: C.keys, played: C.keys === 'rhodes' ? 'synth rhodes' : setOf(piano) || 'synth rhodes', source: C.keys === 'rhodes' || !setOf(piano) ? 'synth' : 'recordings' },
      arp: { want: C.arp, played: C.arp, source: C.arp === 'piano' ? 'recordings' : 'synth' }, lead: { want: C.lead, played: C.lead, source: C.lead === 'piano' ? 'recordings' : 'synth' },
      strings: { want: C.strings, played: C.strings && !!setOf('violin'), source: 'recordings' }, pad: { played: 'supersaw', source: 'synth' }, bass: { played: P.bass.kind, source: 'synth' }, drums: { played: 'synth kick/clap/hats, recorded ride/crash/shaker', source: 'mixed' } };
    /* the synth arpeggio's and lead's notes, made (each brought to one loudness by its patch's trim below) */
    const pluckRaw = (m) => {
      const A = P.pluck, env = adsr(BEATs / 4 * 0.85, 0.002, A.decay, 0, 0.06), n = env.length, [L, R] = supersaw(m, n, A.voices, A.cents, 0.6, tr.seed ^ (200 + m), null, A.wave);
      if (A.octave) { const [l2, r2] = supersaw(m + 12, n, 2, A.cents, 0.4, tr.seed ^ (260 + m)); for (let i = 0; i < n; i++) { L[i] += 0.4 * l2[i]; R[i] += 0.4 * r2[i]; } }
      times(L, env); times(R, env); sat(scale(L, 1.5 / peakOf(L)), 1.3); sat(scale(R, 1.5 / peakOf(R)), 1.3); return [L, R];
    };
    const leadRaw = (m, beats) => {
      const A = P.lead, pl = C.lead === 'pluck', env = pl ? adsr(beats * BEATs, 0.003, 0.3, 0.15, 0.4) : adsr(beats * BEATs, A.attack, 0.25, 0.7, 0.35), n = env.length;
      const vib = (i) => { const t = i / PSR; return 1 + A.vibDepth * Math.sin(2 * Math.PI * A.vibRate * t) * Math.min(1, Math.max(0, (t - 0.18) / 0.3)); };
      let L, R;
      if (C.lead === 'sawlead') { L = saw((i) => mtof(m) * vib(i), n, 0); R = saw((i) => mtof(m) * 1.005 * vib(i), n, 0.4); biquad(L, 'lp', 3600, 1.2); biquad(R, 'lp', 3600, 1.2); }
      else { [L, R] = supersaw(m, n, A.voices, A.cents, 0.8, tr.seed ^ (300 + m), pl ? null : vib); const sub = saw((i) => mtof(m - 12) * (pl ? 1 : vib(i)), n, 0.3); for (let i = 0; i < n; i++) { L[i] += 0.35 * sub[i]; R[i] += 0.35 * sub[i]; } }
      if (C.lead !== 'sawlead') { const [l8, r8] = supersaw(m + 12, n, 3, A.cents, 0.9, tr.seed ^ (350 + m), pl ? null : vib); for (let i = 0; i < n; i++) { L[i] += 0.22 * l8[i]; R[i] += 0.22 * r8[i]; } }
      times(L, env); times(R, env); sat(scale(L, 1.5 / peakOf(L)), 1.3); sat(scale(R, 1.5 / peakOf(R)), 1.3); return [L, R];
    };
    /* the gain that brings a note to a loudness (rms over both sides, dBFS): a dense supersaw and a struck piano
       note with the same peak are 9-12 dB apart, so the synth patches are set by their loudness, not their peak
       (the piano arpeggio sits at -24, the bell at -22, the piano lead at -23) */
    const loudTrim = ([L, R], target) => { let e = 0; for (let i = 0; i < L.length; i++) e += L[i] * L[i] + R[i] * R[i]; return undb(target) / Math.max(1e-6, Math.sqrt(e / (2 * L.length))); };
    const S = {
      /* the drum machine's kick: a sine falling from a punch, a click on it, driven */
      kick: () => once('kick', () => {
        const K = P.kick, n = Math.round(0.42 * PSR), x = new Float32Array(n);
        const body = sine((i) => K.f0 + K.sweep * Math.exp(-i / PSR / K.punch) + 12 * Math.exp(-i / PSR / 0.06), n), click = hp4(noiseOf(n, tr.seed ^ 1), 1500);
        for (let i = 0; i < n; i++) { const t = i / PSR, amp = t < 0.05 ? 1 : Math.exp(-(t - 0.05) / K.decay); x[i] = Math.tanh(K.drive * (body[i] * amp + click[i] * Math.exp(-t / 0.0025) * K.click)) / Math.tanh(K.drive) * Math.min(1, (n - i) / (0.01 * PSR)); }
        return toBuf([x]);
      }),
      /* the clap: three hands a hair apart and the room after them (or a snare under it); some records real claps */
      clap: () => once('clap', () => {
        if (C.clap === 'recorded' && setOf('perc-claps')) return mono(hitOf('perc-claps', 'a', 0, 0.4), 1);
        const n = Math.round(0.4 * PSR), x = band(noiseOf(n, tr.seed ^ 2), 900, 3200);
        if (P.clap === 'snareclap') { const b = sine((i) => 190 * (1 + 0.6 * Math.exp(-i / PSR / 0.01)), n); for (let i = 0; i < n; i++) { const t = i / PSR; x[i] = Math.tanh(1.4 * (x[i] * Math.exp(-t / 0.11) + b[i] * Math.exp(-t / 0.05) * 0.6)); } }
        else for (let i = 0; i < n; i++) { const t = i / PSR; let e = 0; [0, 0.010, 0.021].forEach((o) => { if (t >= o) e += Math.exp(-(t - o) / 0.0045); }); if (t >= 0.025) e += 0.7 * Math.exp(-(t - 0.025) / 0.08) * Math.min(1, (t - 0.025) / 0.003); x[i] *= e; }
        return mono(x, 1);
      }),
      /* the machine's hats: noise and a metallic ring, high-passed */
      hat: (decay) => once('hat' + decay, () => {
        const n = Math.round(Math.min(0.6, decay * 7) * PSR), nz = noiseOf(n, tr.seed ^ 21), m = metal(n, 1), x = new Float32Array(n);
        for (let i = 0; i < n; i++) x[i] = 0.6 * nz[i] + 0.5 * m[i];
        hp4(x, P.hatHp);
        for (let i = 0; i < n; i++) { const t = i / PSR; x[i] *= Math.exp(-t / decay) * Math.min(1, t / 0.0008); }
        return mono(x, 1);
      }),
      openHat: () => once('openhat', () => { const b = S.hat(0.22), x = b.getChannelData(0).slice(); return toBuf([x]); }),
      /* real cymbals and a real shaker */
      ride: () => once('ride', () => mono(hitOf('kit-acoustic', 'ride', 0, 0.9), 1)),
      shaker: () => once('shaker', () => mono(hitOf('perc-shaker', 'down', 0, 0.12), 1)),
      crash: (len) => once('cr' + len, () => { const n = Math.round(len * PSR), l = hitOf('kit-acoustic', 'crash', 0, len), r = hitOf('kit-acoustic', 'crash', 0.08, len), e = envOf(n, 0.001, 0.01, len); times(l, e); times(r, e); return duo(l, r, 1); }),
      revCrash: (len) => once('rc' + len, () => { const b = S.crash(Math.max(len, 1)), n = Math.round(len * PSR); return toBuf([0, 1].map((c) => b.getChannelData(c).slice().reverse().slice(-n))); }),
      /* percussion: a tuned synth tom-tick, or real congas */
      perc: (f) => once('perc' + f, () => (C.hand === 'conga' && setOf('perc-conga') ? mono(hitOf('perc-conga', f > 600 ? 'hi' : f > 480 ? 'mid' : 'lo', 0, 0.3), 1) : mono(synthPerc(f), 1))),
      snare: (tone) => once('sn' + tone, () => {
        const n = Math.round(0.3 * PSR), body = sine((i) => tone * (1 + 0.6 * Math.exp(-i / PSR / 0.01)), n), sn = band(noiseOf(n, tr.seed ^ 8), 1500, 8000), x = new Float32Array(n);
        for (let i = 0; i < n; i++) { const t = i / PSR; x[i] = Math.tanh(1.5 * (body[i] * Math.exp(-t / 0.06) * 0.7 + sn[i] * Math.exp(-t / 0.1))); }
        return mono(x, 1);
      }),
      tom: (w) => once('tom' + w, () => { const f0 = w === 'hi' ? 165 : 110, n = Math.round(0.4 * PSR), x = sine((i) => f0 * (1 + 0.7 * Math.exp(-i / PSR / 0.02)), n), nz = band(noiseOf(n, tr.seed ^ 9), 400, 3000); for (let i = 0; i < n; i++) { const t = i / PSR; x[i] = x[i] * Math.exp(-t / 0.16) + nz[i] * Math.exp(-t / 0.02) * 0.25; } return mono(x, 1); }),
      impact: () => once('imp', () => {
        const n = Math.round(2.5 * PSR), boom = sine((i) => 32 + 45 * Math.exp(-i / PSR / 0.25), n), thud = biquad(noiseOf(n, tr.seed ^ 11), 'lp', 250), x = new Float32Array(n);
        for (let i = 0; i < n; i++) { const t = i / PSR; x[i] = Math.tanh(1.6 * (boom[i] * Math.exp(-t / 0.7) + thud[i] * Math.exp(-t / 0.25) * 2)) * Math.min(1, (n - i) / (0.05 * PSR)); }
        return mono(x, 1);
      }),
      /* the sweeps and the riser: noise through a moving band, a saw climbing under the riser */
      sweep: (bars, f0, f1, up, seed) => once('sw' + bars + f0 + f1 + seed, () => {
        const n = Math.round(bars * BARs * PSR), chs = [0, 1].map((c) => { const x = noiseOf(n, tr.seed ^ seed ^ c * 77); biquad(x, 'bp', (i) => f0 * Math.pow(f1 / f0, up ? Math.pow(i / n, 1.3) : i / n), 1.2); for (let i = 0; i < n; i++) { const u = i / n; x[i] *= up ? u * u : Math.min(1, u / 0.01) * (1 - u) * (1 - u); } return x; });
        return duo(chs[0], chs[1], 1);
      }),
      riser: (bars) => once('ris' + bars, () => {
        const n = Math.round(bars * BARs * PSR), cut = (i) => 300 * Math.pow(30, Math.pow(i / n, 1.3));
        const tone = biquad(saw((i) => mtof(57 + tr.key) * Math.pow(2, 2 * Math.pow(i / n, 1.5)), n), 'lp', cut);
        const chs = [0, 1].map((c) => { const x = biquad(noiseOf(n, tr.seed ^ 12 ^ c * 91), 'bp', cut, 1.2); for (let i = 0; i < n; i++) { const u = i / n; x[i] = x[i] * u * u + 0.25 * tone[i] * u * u; } return x; });
        return duo(chs[0], chs[1], 1);
      }),
      atmos: (bars, seed) => once('at' + bars + seed, () => {
        const n = Math.round(bars * BARs * PSR), chs = [0, 1].map((c) => { const x = biquad(noiseOf(n, tr.seed ^ seed ^ c * 13), 'lp', (i) => 900 * Math.pow(2, Math.sin(2 * Math.PI * (i / n) * 2)), 1.5); for (let i = 0; i < n; i++) { const u = i / n; x[i] *= Math.min(1, u / 0.25) * Math.min(1, (1 - u) / 0.25); } return x; });
        const k = 0.25 / Math.max(rmsOf(chs[0]), rmsOf(chs[1])); return toBuf(chs.map((x) => scale(x, k)));
      }),
      /* the pad: a chord of supersaws, held for its chord's length */
      pad: (notes, bars) => once('pad' + notes.join(',') + 'x' + bars, () => {
        const A = P.pad, env = adsr(bars * BARs, A.attack, 0.8, 0.85, 1.8), n = env.length, [L, R] = stereo(n);
        /* the chord, and its lowest note an octave down too (the body, 130-260 Hz) */
        const body = notes[0] - 12 >= 45 ? notes[0] - 12 : notes[0];
        notes.concat(body !== notes[0] ? [body] : []).forEach((m, j) => { const g = j < notes.length ? 1 : 0.7, [l, r] = supersaw(m, n, A.voices, A.cents, A.width, tr.seed ^ (100 + m), null, A.wave); for (let i = 0; i < n; i++) { L[i] += l[i] * env[i] * g; R[i] += r[i] * env[i] * g; } });
        /* a faint breath of noise between the harmonics (as a real synth pad has; kept low, 20 dB under the chord, so the filter's sweeps don't make it a swoosh), then saturated */
        const pr = rmsOf(L, Math.round(BARs * PSR));
        [L, R].forEach((x, c) => { const nz = band(noiseOf(n, tr.seed ^ 55 ^ c * 7), 500, 6000), g = pr * 0.1 / Math.max(1e-9, rmsOf(nz)); for (let i = 0; i < n; i++) x[i] += nz[i] * g * env[i]; sat(scale(x, 1.6 / Math.max(peakOf(x), 1e-9)), 1.4); });
        const k = 0.0625 / Math.max(rmsOf(L, Math.round(BARs * PSR)), 1e-6); return toBuf([scale(L, k), scale(R, k)]);
      }),
      /* real strings under the pad, in the breakdowns: violins (celli below), two players a side, held */
      strings: (notes, bars) => once('str' + notes.join(',') + 'x' + bars, () => {
        const sec = bars * BARs + 1.8, n = Math.round(sec * PSR), L = new Float32Array(n), R = new Float32Array(n);
        notes.forEach((m) => { const pr = pair(m < 55 ? 'cello' : 'violin', m, sec, 9, true); if (pr) { mixIn(L, pr[0]); mixIn(R, pr[1]); } });
        const e = envOf(n, 0.6, bars * BARs, 1.8); times(L, e); times(R, e);
        const k = 0.0625 / Math.max(rmsOf(L, Math.round(BARs * PSR)), 1e-6); return toBuf([scale(L, k), scale(R, k)]);
      }),
      /* the arpeggio: a synth pluck (saws a few cents apart, decaying fast), or the piano, or an FM bell */
      pluck: (m) => once('pl' + m, () => {
        const A = P.pluck;
        if (C.arp === 'piano') { const pr = pianoNote(m, BEATs / 4 * 0.85 + 0.35, 0.3); if (pr) return duo(pr[0], pr[1], 0.22); }      // (a struck note rings fuller than a pluck: brought to its level)
        if (C.arp === 'bell') { const n = Math.round((BEATs / 4 + 0.4) * PSR), [L, R] = stereo(n); for (let i = 0; i < n; i++) { const t = i / PSR, w = 2 * Math.PI * mtof(m) * t, y = Math.sin(w + 2 * Math.exp(-t / 0.08) * Math.sin(3.5 * w)) * Math.exp(-t / (A.decay * 2)); L[i] = y; R[i] = y; } return duo(L, R, 0.22); }
        const [L, R] = pluckRaw(m), k = once('plTrim', () => loudTrim(pluckRaw(72), -22));
        return toBuf([scale(L, k), scale(R, k)]);
      }),
      /* the bass: a sine under a saw (or a square, or two saws apart: a reese) */
      bass: (m, beats) => once('b' + m + 'x' + beats, () => {
        const A = P.bass, env = adsr(beats * BEATs, 0.003, A.decay, A.sustain, 0.02), n = env.length, x = new Float32Array(n);
        const s1 = sine(mtof(m), n), top = A.kind === 'square' ? square(mtof(m + 12), n, 0.1, 0.35) : saw(mtof(m + 12), n, 0.2), top2 = A.kind === 'reese' ? saw(mtof(m + 12) * 1.012, n, 0.6) : null;
        for (let i = 0; i < n; i++) x[i] = (0.55 * top[i] + (top2 ? 0.45 * top2[i] : 0) + 0.9 * s1[i]) * env[i];
        sat(scale(x, 1.8 / peakOf(x)), 1.8);          // (driven: its harmonics fill the low mids)
        return mono(x, 0.6);
      }),
      /* the lead: a supersaw with a late vibrato, a saw lead, a bright pluck lead, or the piano */
      lead: (m, beats) => once('ld' + m + 'x' + beats, () => {
        const A = P.lead;
        if (C.lead === 'piano') { const pr = pianoNote(m, beats * BEATs + 1.2, 1.2); if (pr) return duo(pr[0], pr[1], 0.5); }
        const [L, R] = leadRaw(m, beats), k = once('ldTrim', () => loudTrim(leadRaw(76, 2), C.lead === 'pluck' ? -18 : -16));
        return toBuf([scale(L, k), scale(R, k)]);
      }),
      /* the keys: the piano (grand or upright), or an FM electric piano */
      keys: (m, beats) => once('k' + m + 'x' + beats, () => {
        /* (each kind measured and brought to one loudness: the FM piano rings 6 dB over the grand, the upright 2.5 under it) */
        if (C.keys !== 'rhodes') { const pr = pianoNote(m, beats * BEATs + 1.4, 1.4); if (pr) return duo(pr[0], pr[1], C.keys === 'upright-piano' ? 0.53 : 0.4); }
        const [L, R] = fmKeys(m, beats); return duo(L, R, 0.25);
      }),
      /* the counter-melody: a string machine - saws a little apart, slow to speak, darkened */
      counter: (m, beats) => once('ct' + m + 'x' + beats, () => {
        const env = adsr(beats * BEATs, 0.35, 0.6, 0.85, 1), n = env.length, [L, R] = supersaw(m, n, 5, 20, 0.7, tr.seed ^ (400 + m));
        biquad(L, 'lp', 2500); biquad(R, 'lp', 2500); times(L, env); times(R, env); return duo(L, R, 0.5);
      }),
      /* the hall and the room: noise darkening as it decays (a space's response) */
      ir: (len, pre, bright, dark, seed) => once('ir' + len + seed, () => {
        const n = Math.round(len * PSR), p = Math.round(pre * PSR);
        return toBuf([0, 1].map((c) => { const x = biquad(noiseOf(n, seed ^ c * 101), 'lp', (i) => bright * Math.pow(dark / bright, i / n)); let e = 0; for (let i = 0; i < n; i++) { const t = i / PSR; x[i] *= Math.exp(-6.9 * t / len) * Math.min(1, t / 0.012); e += x[i] * x[i]; } const o = new Float32Array(n + p); o.set(scale(x, 1 / Math.sqrt(e)), p); return o; }));
      })
    };
    return S;
  }

  /* ---- progressive house's plan -------------------------------------------
     Everything a progressive record does is written here, once, from its
     seed: its form (one of several), how each of its sections is arranged
     (which parts play in which bars, and playing what), its patterns, its
     harmony, its hook and the counter-melody - so no two records share a
     shape, and the renderer only plays what the plan says. */
  const PROG_FORMS = [
    /* the classic: a first, shorter breakdown, the main one past the middle, two builds */
    { id: 'classic', s: [['intro', [16, 32]], ['groove', [32, 48]], ['breakdown', [16]], ['build', [16, 32]], ['drop', [32, 48]], ['breakdown', [24, 32]], ['build', [16, 32]], ['drop', [32, 48]], ['outro', [16, 32]]] },
    /* an early, smaller drop; then the long breakdown and the main one */
    { id: 'early', s: [['intro', [16]], ['groove', [16, 32]], ['build', [8, 16]], ['drop', [16]], ['breakdown', [32]], ['build', [32]], ['drop', [32, 48]], ['outro', [16, 32]]] },
    /* one long breakdown in the middle */
    { id: 'onebreak', s: [['intro', [16, 32]], ['groove', [48]], ['build', [16]], ['drop', [32]], ['breakdown', [32]], ['build', [32]], ['drop', [48]], ['outro', [16]]] },
    /* a drop, the main breakdown, a drop, then a bridge (the groove again, changed) into the last drop without a build */
    { id: 'bridge', s: [['intro', [16]], ['groove', [32]], ['build', [16]], ['drop', [32]], ['breakdown', [24, 32]], ['build', [32]], ['drop', [32]], ['groove', [16], 'bridge'], ['drop', [16, 32]], ['outro', [16]]] },
    /* led by the groove: a short break, the groove again, then the main breakdown, the build and one long drop */
    { id: 'grooveled', s: [['intro', [16, 32]], ['groove', [32]], ['breakdown', [8], 'break'], ['groove', [24, 32]], ['breakdown', [24, 32]], ['build', [16, 32]], ['drop', [40, 48]], ['outro', [16, 32]]] }
  ];
  const PROG_FLOOR = { intro: 16, groove: 16, breakdown: 8, build: 8, drop: 16, outro: 16 };
  /* the form, fitted to six to eight and a half minutes at the record's tempo: the longest sections give or take eight bars */
  function writeProgForm(q, bpm) {
    for (let tries = 0; tries < 12; tries++) {
      const f = writeProgForm1(q, bpm), lens = f.arr.map((x) => x[1]), tot = lens.reduce((a, b) => a + b, 0);
      let at = 0, best = null, any = null;
      f.arr.forEach(([n, L], i) => { const mid = (at + L / 2) / tot; if (n === 'breakdown' && f.vars[i] !== 'break') { if (!any || L > any.L) any = { i, L }; if (L >= 16 && L <= 32 && mid >= 0.35 && mid <= 0.6 && (!best || L > best.L)) best = { i, L }; } at += L; });
      if (best) { f.main = best.i; return f; }
      const best2 = any;
      if (tries === 11) { f.main = best2 ? best2.i : -1; return f; }
    }
  }
  /* (the main breakdown, as the references have it: the longest, 16 to 32 bars, its middle 35-60% of the way in) */
  function writeProgForm1(q, bpm) {
    const pick = (a) => a[Math.floor(q() * a.length)], F = pick(PROG_FORMS);
    const lo = Math.max(192, Math.ceil(6 * bpm / 4 / 8) * 8), hi = Math.min(256, Math.floor(8.5 * bpm / 4 / 8) * 8);
    const a = F.s.map(([n, opts, v]) => [n, pick(opts), v || null]);
    const total = () => a.reduce((s, x) => s + x[1], 0);
    for (let i = 0; total() > hi && i < 60; i++) {
      /* (the builds keep their length: the longest other section that can, gives eight bars) */
      let best = -1; a.forEach((x, j) => { if (x[0] !== 'build' && x[1] - 8 >= (PROG_FLOOR[x[0]] || 8) && (best < 0 || x[1] > a[best][1])) best = j; });
      if (best < 0) break; a[best][1] -= 8;
    }
    for (let i = 0; total() < lo && i < 60; i++) { const c = a.map((x, j) => j).filter((j) => (a[j][0] === 'drop' || a[j][0] === 'groove') && a[j][1] < 48); if (!c.length) break; a[c[i % c.length]][1] += 8; }
    return { id: F.id, arr: a.map((x) => [x[0], x[1]]), vars: a.map((x) => x[2]) };
  }
  /* the patterns a record draws from */
  /* bass lines: per bar, [sixteenth, length (sixteenths), interval, level] */
  const PB = {
    roll: [[1, 0.9, 0, 0.85], [2, 0.9, 0, 1], [3, 0.9, 12, 0.7], [5, 0.9, 0, 0.85], [6, 0.9, 0, 1], [7, 0.9, 12, 0.7], [9, 0.9, 0, 0.85], [10, 0.9, 0, 1], [11, 0.9, 12, 0.7], [13, 0.9, 0, 0.85], [14, 0.9, 0, 1], [15, 0.9, 12, 0.7]],
    gallop: [[1, 0.9, 0, 0.8], [2, 0.9, 12, 0.6], [3, 0.9, 0, 1], [5, 0.9, 0, 0.8], [6, 0.9, 12, 0.6], [7, 0.9, 0, 1], [9, 0.9, 0, 0.8], [10, 0.9, 12, 0.6], [11, 0.9, 0, 1], [13, 0.9, 0, 0.8], [14, 0.9, 12, 0.6], [15, 0.9, 0, 1]],
    offroll: [[2, 0.9, 0, 1], [3, 0.9, 12, 0.75], [6, 0.9, 0, 1], [7, 0.9, 12, 0.75], [10, 0.9, 0, 1], [11, 0.9, 12, 0.75], [14, 0.9, 0, 1], [15, 0.9, 12, 0.75]],
    offbeat: [[2, 1.8, 0, 1], [6, 1.8, 0, 1], [10, 1.8, 0, 1], [14, 1.8, 0, 1]],
    pulse8: [[0, 1.6, 0, 0.8], [2, 1.6, 0, 1], [4, 1.6, 0, 0.8], [6, 1.6, 12, 0.8], [8, 1.6, 0, 0.8], [10, 1.6, 0, 1], [12, 1.6, 0, 0.8], [14, 1.6, 7, 0.8]],
    synco: [[0, 2.5, 0, 1], [3, 2.5, 0, 0.9], [6, 1.5, 12, 0.8], [8, 2.5, 0, 1], [11, 2.5, 7, 0.9], [14, 1.5, 0, 0.8]],
    long: [[0, 7, 0, 1], [8, 5, 0, 0.9], [14, 1.5, 12, 0.7]],
    walk: [[2, 1.8, 0, 1], [6, 1.8, 3, 0.9], [10, 1.8, 5, 0.9], [14, 1.8, 7, 0.9]]
  };
  const PB_DRIVE = ['roll', 'gallop', 'offroll', 'offbeat', 'pulse8', 'synco', 'walk'];
  /* hats per bar: [beat offset, level, open?] */
  const PH = {
    off: [[0.5, 0.9], [1.5, 0.85], [2.5, 0.9], [3.5, 0.85]],
    sixteen: [0, 1, 2, 3].flatMap((b) => [[b, 0.45], [b + 0.25, 0.6], [b + 0.5, 0.9], [b + 0.75, 0.6]]),
    offopen: [[0.5, 0.9], [1.5, 0.85], [2.5, 0.9], [3.5, 0.8, 1]],
    shuffle: [0, 1, 2, 3].flatMap((b) => [[b + 0.5, 0.9], [b + 0.75, 0.45]]),
    sparse: [[0.5, 0.8], [2.5, 0.8], [3.75, 0.5]]
  };
  const PHATS = Object.keys(PH);
  /* the backbeat: claps on two and four, on four alone with a ghost, or with a pickup */
  const PC = { two4: [[1, 1], [3, 1]], four: [[3, 1], [1.75, 0.3, 'ghost']], pick: [[1, 1], [3, 1], [2.75, 0.35, 'ghost']] };
  const PCLAPS = Object.keys(PC);
  /* the arpeggio's versions: from the record's figure, two bars - itself, turned round, busier, sparse, in eighths */
  function writeProgArps(base, q) {
    const A = base.concat(base.map((ix, s) => (s >= 12 && ix >= 0 ? (ix + 1 + Math.floor(q() * 2)) % 5 : ix)));
    const B = A.map((ix, s) => (ix < 0 ? ix : s >= 16 ? 4 - ix : ix));
    const C = A.map((ix, s) => (ix < 0 ? (s % 4 ? (s + 1) % 5 : 0) : ix));
    const S = A.map((ix, s) => (s % 4 === 0 ? Math.max(0, ix) : -1));
    const E = A.map((ix, s) => (s % 2 === 0 ? Math.max(0, ix) : -1));
    return { A, B, C, S, E };
  }

  /* every section's script: on[part] = [[from bar, to bar, pattern], ...]
     (bars within the section), the hook's entries, its fills, and for builds
     and drops what they do at their ends */
  function writeProgScripts(q, tr, vars, mainBd) {
    const pick = (a) => a[Math.floor(q() * a.length)], chance = (p) => q() < p;
    const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(q() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const P = tr.patch, lines = shuffle(PB_DRIVE), lineA = lines[0], lineB = lines[1];
    const hatsA = pick(PHATS.filter((h) => h !== 'sparse')), hatsB = pick(PHATS.filter((h) => h !== hatsA && h !== 'sparse')), clapA = pick(PCLAPS), clapB = pick(PCLAPS);
    const out = [];
    let x = 0, kickOuts = 0; const seen = {};
    tr.arr.forEach(([name, L], i) => {
      const n = seen[name] || 0; seen[name] = n + 1;
      const v = vars[i], nx = tr.arr[i + 1] && tr.arr[i + 1][0], pv = i ? tr.arr[i - 1][0] : null;
      const sc = { name, start: x, len: L, n, v, on: {}, hooks: [], fills: [] };
      const put = (part, f, t, pt) => { (sc.on[part] = sc.on[part] || []).push([Math.max(0, f), Math.min(L, t), pt == null ? true : pt]); };
      const steps = Math.max(1, L / 8);
      /* fills at phrase ends (every eight bars), each its own kind */
      const fillAt = () => { for (let k = 7; k < L - 1; k += 8) sc.fills.push([k, pick(k % 16 === 15 ? ['snare4', 'toms', 'flam', 'kickdrop'] : ['snare4', 'toms', 'none', 'none', 'kickdrop'])]); };
      if (name === 'intro') {
        sc.v = v || pick(['pad', 'drums', 'pulse', 'perc']);
        const h = L / 2, q3 = L * 3 / 4, dj = chance(0.9);
        if (sc.v === 'pad') { put('pad', 0, L, 'hold'); put('atmos', 0, L); put('arp', Math.min(4, L / 4), L, 'E'); put('kick', h, L); put('hats', q3, L, 'sparse'); }
        if (sc.v === 'drums') { put('kick', 0, L); put('hats', 0, L, 'sparse'); if (P.shaker) put('shaker', 4, L, 'eighth'); put('perc', 8, L, 'A'); put('pad', h, L, 'hold'); put('arp', q3, L, 'S'); }
        if (sc.v === 'pulse') { put('bass', 0, L, 'pulse8'); put('arp', 0, L, 'E'); put('pad', 4, L, 'hold'); put('atmos', 0, L); put('kick', h, L); put('hats', q3, L, 'off'); }
        if (sc.v === 'perc') { put('perc', 0, L, 'B'); if (P.shaker) put('shaker', 0, L, 'sixteen'); put('kick', 4, L); put('pad', 8, L, 'hold'); put('hats', h, L, 'sparse'); put('arp', q3, L, 'E'); }
        /* (as DJ-friendly records do: the kick and hats from the first bar) */
        if (dj) { sc.on.kick = [[0, L, true]]; if (!sc.on.hats || sc.on.hats[0][0] > 0) sc.on.hats = [[0, L, 'off']]; }
      } else if (name === 'groove') {
        sc.v = v || 'groove';
        const bridge = sc.v === 'bridge';
        put('kick', 0, L); put('pad', 0, L, 'hold');
        /* the parts come in in their own order, eight bars at a time, two at the start; one may leave again */
        const parts = shuffle(['bass', 'clap', 'hats', 'shaker', 'arp', 'perc', 'ride', 'counter', 'top']).filter((p) => (p !== 'shaker' || P.shaker) && (p !== 'ride' || P.ride) && !(bridge && p === 'arp'));
        const first = parts.splice(0, 2), when = {};
        first.forEach((p) => { when[p] = 0; });
        parts.forEach((p, j) => { when[p] = Math.min(steps - 1, 1 + Math.floor(j * (steps - 1) / Math.max(1, parts.length - 1))) * 8; if (steps === 1) when[p] = 4 * (j % 2); });
        const leaver = steps >= 3 && chance(0.6) ? pick(Object.keys(when).filter((p) => p !== 'bass' && when[p] < L - 16)) : null;
        Object.entries(when).forEach(([p, w]) => {
          const end = p === leaver ? Math.min(L, w + 16) : L;
          if (p === 'bass') put('bass', w, end, bridge ? lineB : lineA);
          else if (p === 'hats') { put('hats', w, Math.min(end, w + L / 2), hatsA); if (w + L / 2 < end) put('hats', w + L / 2, end, hatsB); }
          else if (p === 'clap') put('clap', w, end, clapA);
          else if (p === 'shaker') put('shaker', w, end, pick(['sixteen', 'eighth']));
          else if (p === 'arp') put('arp', w, end, pick(['A', 'B']));
          else if (p === 'perc') put('perc', w, end, bridge ? 'C' : pick(['A', 'B']));
          else if (p === 'ride') put('ride', w, end, pick(['quarter', 'eighth']));
          else if (p === 'counter') put('counter', w, end);
          else if (p === 'top') put('top', w, end);
        });
        if (!sc.on.clap) put('clap', L / 2, L, clapA);
        /* (from its third phrase on, the hats change pattern each eight bars) */
        const hatsIn = (b) => (sc.on.hats || []).some(([f, t]) => b >= f && b < t);       // (only where the hats already play: their entry, and their leaving, stand)
        for (let bl = 2; bl < steps; bl++) if (hatsIn(bl * 8) && hatsIn(bl * 8 + 7)) put('hats', bl * 8, bl * 8 + 8, pick(['off', 'sixteen', 'offopen', 'shuffle']));
        /* the hook teased quietly near the end, now and then */
        if (!bridge && n === 0 && L >= 16 && chance(0.7)) sc.hooks.push({ at: L - 8, which: 'hook', voice: 'keys', g: 0.35 });
        if (bridge) sc.hooks.push({ at: 0, which: 'alt', voice: 'keys', g: 0.45, tr: 12 });
        fillAt();
      } else if (name === 'breakdown') {
        sc.v = v || (i === mainBd ? pick(['keys', 'strings', 'piano']) : pick(['keys', 'strings', 'perc', 'halftime', 'piano']));
        const h = L / 2;
        if (sc.v === 'break') { put('hats', 0, L, 'off'); put('clap', 0, L, clapB); put('perc', 0, L, 'C'); put('bass', 0, L, 'long'); put('arp', 4, L, 'S'); }
        if (sc.v === 'keys') { put('pad', 0, L, 'hold'); put('atmos', 0, L); put('arp', h, L, 'S'); sc.hooks.push({ at: 0, which: 'hook', voice: 'keys', g: 1 }); for (let k = 8; k < L; k += 8) sc.hooks.push({ at: k, which: 'hook', voice: 'lead', g: 0.7 }, { at: k, which: 'hook', voice: 'keys', g: 0.3, tr: 12 }); }
        if (sc.v === 'strings') { put('pad', 0, L, 'hold'); put('atmos', 0, L); put('counter', 8, L); for (let k = 0; k < L; k += 8) sc.hooks.push({ at: k, which: k ? 'hook' : 'open', voice: 'lead', g: k ? 0.75 : 0.5 }); }
        if (sc.v === 'perc') { put('pad', 0, L, 'hold'); put('perc', 0, L, 'A'); if (P.shaker) put('shaker', 0, L, 'eighth'); put('bass', 0, L, 'long'); put('atmos', 0, L); sc.hooks.push({ at: Math.max(0, L - 8), which: 'hook', voice: 'keys', g: 0.6 }); }
        if (sc.v === 'halftime') { put('half', 0, L); put('hats', 0, L, 'sparse'); put('pad', 0, L, 'hold'); put('arp', 0, L, 'S'); put('bass', 0, L, 'long'); for (let k = 0; k < L; k += 8) sc.hooks.push({ at: k, which: k ? 'hook' : 'alt', voice: 'lead', g: 0.7 }); }
        if (sc.v === 'piano') { put('chords', 0, L); put('pad', h, L, 'hold'); put('atmos', 0, L); sc.hooks.push({ at: 0, which: 'hook', voice: 'keys', g: 0.9 }); for (let k = 8; k < L; k += 8) sc.hooks.push({ at: k, which: 'open', voice: 'keys', g: 0.8 }, { at: k, which: 'hook', voice: 'lead', g: 0.55 }); }
        sc.entry = pv === 'drop' ? pick(['sweep', 'sweep', 'impact', 'none']) : 'none';
      } else if (name === 'build') {
        const M = tr.moves[n] || tr.moves[0] || { concept: 'melodic' }, c = M.concept, toDrop = nx === 'drop';
        sc.v = c;
        const end = toDrop ? L : L, r8 = Math.max(0, L - 8), q1 = L / 4, h = L / 2, q3 = L * 3 / 4;
        sc.build = { roll: 'snare', rollBars: Math.min(8, L), riser: true, riserBars: Math.min(16, L), gate: [r8, L], breath: toDrop, muffle: true };
        if (c === 'melodic') { put('kick', 0, end); put('clap', 0, r8, clapA); put('hats', 0, end, hatsA); put('bass', 0, L - 4, 'offbeat'); put('arp', 0, h, 'A'); put('arp', h, L, 'C'); put('pad', 0, L, 'hold');
          for (let k = 0; k < r8; k += 16) sc.hooks.push({ at: k, which: 'hook', voice: 'lead', g: 0.9 }); for (let k = 8; k < r8; k += 16) sc.hooks.push({ at: k, which: 'open', voice: 'keys', g: 0.6 }); }
        if (c === 'strip') { put('kick', 0, q3); put('clap', 0, h, clapA); put('hats', 0, h, hatsA); put('perc', 0, q1, 'A'); put('counter', 0, q1); put('bass', 0, q3, lineA); put('arp', 0, L, 'A'); put('pad', 0, L, 'hold');
          sc.hooks.push({ at: r8, which: 'open', voice: 'lead', g: 0.7, only: 6 }); Object.assign(sc.build, { roll: 'none', gate: null, riserBars: Math.min(8, L) }); }
        if (c === 'perc') { put('kick', 0, end); put('perc', 0, L, 'C'); put('hats', 0, L, 'sixteen'); if (P.shaker) put('shaker', 0, L, 'sixteen'); put('bass', 0, h, lineA); put('arp', h, L, 'C'); put('pad', 0, L, 'hold');
          for (let k = 1; k < L - 1; k += 2) sc.fills.push([k, k >= r8 ? 'toms' : 'none']); Object.assign(sc.build, { roll: 'toms', riser: false, gate: null, sweepUp: true }); }
        if (c === 'chord') { put('kick', q1, end); put('hats', 0, L, 'off'); put('bass', 0, L, 'long'); put('pad', 0, L, 'hold'); put('arp', 0, h, 'S'); put('arp', h, L, 'A');
          for (let k = 0; k < r8; k += 16) sc.hooks.push({ at: k, which: 'hook', voice: 'keys', g: 0.7 }); Object.assign(sc.build, { gate: [h, L], riserBars: Math.min(8, L) }); }
        if (c === 'bass') { put('kick', 0, q3); put('clap', 0, q3, clapB); put('hats', 0, L, hatsB); put('bass', 0, q1, lineA); put('bass', q1, h, 'pulse8'); put('bass', h, q3, 'offbeat'); put('bass', q3, L - 1, 'long'); put('arp', 0, L, 'E'); put('pad', 0, L, 'hold');
          Object.assign(sc.build, { rollBars: Math.min(4, L), gate: null }); }
        if (c !== 'strip') put('top', 0, L / 2);
        if (!toDrop) sc.build.breath = false;
        /* (often the kick and the bass leave for the last eight bars, the roll alone into the drop; in a long build the top end rests a block first) */
        if (toDrop && L >= 16 && c !== 'strip' && c !== 'bass' && chance(0.6)) ['kick', 'bass', 'clap'].forEach((p) => put(p, r8, L, false));
        if (L >= 32 && chance(0.6)) ['hats', 'top', 'shaker'].forEach((p) => put(p, 8, 16, false));
      } else if (name === 'drop') {
        sc.v = n ? 'developed' : pick(['full', 'stagger']);
        const D = tr.drops[n] || {}, blocks = L / 8;
        sc.hit = D.hit || 'crashImpact';
        put('kick', 0, L); put('pad', 0, L, 'hold');
        for (let bl = 0; bl < L / 16; bl++) put('bass', bl * 16, Math.min(L, bl * 16 + 16), (bl + n) % 2 ? lineB : lineA);
        put('clap', 0, L, n ? clapB : clapA);
        const late = sc.v === 'stagger' ? 8 : 0;
        for (let bl = 0; bl < L / 8; bl++) put('hats', bl * 8, bl * 8 + 8, bl === 0 ? (n ? hatsB : hatsA) : pick(['off', 'sixteen', 'offopen', 'shuffle']));
        if (P.shaker) put('shaker', late, L, 'sixteen');
        /* the top end by eight-bar block: the ride, the percussion, the top layer, each in or out, never all out */
        const rideP = pick(['quarter', 'eighth']), percP = pick(['A', 'B']);
        for (let bl = 0; bl < blocks; bl++) {
          const at = bl * 8, inn = [chance(0.75), chance(0.7), chance(0.8)];
          if (!inn.some(Boolean) || (n === 0 && bl < 2)) inn[2] = true;
          if (inn[0] && P.ride && at >= 8) put('ride', at, at + 8, rideP);
          if (inn[1] && at >= late) put('perc', at, at + 8, percP);
          if (inn[2]) put('top', at, at + 8);
        }
        /* the drop in eight-bar blocks: it starts on the whole hook (the payoff); then the record's own order of
           the hook again, its other endings, the keys saying it alone, the counter-melody joining, a block without the lead */
        const opts = n ? ['alt', 'hook', 'keysonly', 'counter', 'open', 'arp'] : ['hook', 'open', 'keysonly', 'counter', 'arp', 'hook'];
        let counterOn = n > 0 ? 0 : null;
        for (let bl = 0; bl < blocks; bl++) {
          const w = bl === 0 ? (n ? pick(['alt', 'hook']) : 'hook') : pick(opts), at = bl * 8;
          put('arp', at, at + 8, w === 'arp' ? 'C' : n ? pick(['B', 'C']) : pick(['A', 'B']));
          if (w === 'keysonly') sc.hooks.push({ at, which: 'hook', voice: 'keys', g: 0.65, tr: 12 });
          else if (w === 'arp') { if (counterOn == null) counterOn = at; }
          else { sc.hooks.push({ at, which: w === 'counter' ? 'hook' : w, voice: 'lead', g: 1 }, { at, which: w === 'counter' ? 'hook' : w, voice: 'keys', g: 0.3, tr: 12 }); if (w === 'counter' && counterOn == null) counterOn = at; }
        }
        if (counterOn != null) put('counter', counterOn, L);
        sc.crashEvery = pick([8, 16]);
        fillAt();
      } else if (name === 'outro') {
        sc.v = pick(['drums', 'pad', 'mirror']);
        const h = L / 2, q3 = L * 3 / 4;
        put('top', 0, h);
        if (sc.v === 'drums') { put('kick', 0, L - 1); put('clap', 0, q3, clapA); put('hats', 0, L, hatsA); put('bass', 0, h, lineA); put('pad', 0, h, 'hold'); put('arp', 0, h / 2, 'S'); }
        if (sc.v === 'pad') { put('kick', 0, h); put('clap', 0, h / 2, clapA); put('hats', 0, h, 'sparse'); put('bass', 0, h / 2, lineA); put('pad', 0, L, 'hold'); put('arp', 0, L, 'E'); put('atmos', 0, L); }
        if (sc.v === 'mirror') { put('kick', 0, q3); put('hats', 0, h, hatsB); put('clap', 0, h, clapB); put('perc', 0, q3, 'A'); put('bass', 0, h, lineB); put('pad', 0, L, 'hold'); put('arp', 0, q3, 'E'); }
      }
      /* the eight-bar moves, as the references make them: each block of a drop or a long groove its own
         shape - the top end out (all but the offbeat hat), the bass out (kick alone under the music), the kick out for
         four bars (once in a record), the pad out, stripped to the drums and bass, or everything - never the same shape twice running */
      if ((name === 'drop' || (name === 'groove' && L >= 24)) && L >= 16) {
        const off = (part, f, t) => { if (sc.on[part]) sc.on[part].push([Math.max(0, f), Math.min(L, t), false]); };
        const blocks = L / 8, last = (tr.arr[i + 1] || [])[0];
        let prev = 'full';
        sc.blocks = [];
        for (let bl = 0; bl < blocks; bl++) {
          const at = bl * 8;
          let m = 'full';
          if (name === 'drop' ? bl > (n === 0 && blocks >= 4 ? 1 : 0) : bl >= 2) {      // (the first drop's first sixteen bars, the whole payoff)
            const menu = name === 'drop' ? ['full', 'notop', 'strip', 'kickout', 'nobass', 'notop', 'nopad', 'kickout'] : ['full', 'notop', 'nobass', 'nopad', 'kickout', 'notop'];
            const ok = menu.filter((x) => x !== prev && (x !== 'kickout' || (!kickOuts && bl < blocks - 1)) && (x === 'full' || prev === 'full' || x !== 'strip'));
            m = pick(ok);
            /* (the block before a breakdown or the outro, the record says it all) */
            if (bl === blocks - 1 && name === 'drop' && (last === 'breakdown' || last === 'outro') && chance(0.35)) m = 'full';
          }
          if (m === 'nobass') off('bass', at, at + 8);
          if (m === 'notop') { ['shaker', 'ride', 'top'].forEach((p) => off(p, at, at + 8)); if (sc.on.hats) sc.on.hats.push([at, at + 8, 'off']); }      // (the offbeat hat alone stays)
          if (m === 'nopad') { off('pad', at, at + 8); off('counter', at, at + 8); }
          if (m === 'strip') { off('pad', at, at + 8); off('arp', at, at + 8); off('counter', at, at + 8); off('perc', at, at + 8); off('ride', at, at + 8); }
          if (m === 'kickout') { off('kick', at, at + 4); off('bass', at, at + 4); off('clap', at, at + 4); kickOuts++; }
          sc.blocks.push(m); prev = m;
        }
      }
      out.push(sc);
      x += L;
    });
    return out;
  }

  /* the harmony: two, four or eight chords, each one, two or four bars (a
     cycle of four or eight bars), and for the breakdowns the same chords
     re-harmonised (each by the chord a third below, sharing two of its notes) */
  function writeProgChords(q, tr) {
    const pick = (a) => a[Math.floor(q() * a.length)], minor = tr.scale !== 'major' && tr.scale !== 'mixo';
    const [len, bars] = pick([[4, 2], [4, 2], [2, 4], [4, 1], [8, 1]]);
    const two = minor ? [[0, 5], [0, 3], [0, 6], [5, 6], [0, 4]] : [[0, 4], [0, 3], [0, 5], [3, 4]];
    let degs = len === 2 ? pick(two) : tr.prog.slice(0, 4);
    if (len === 8) { const other = pick(PROGS[minor ? 'minor' : 'major']); degs = degs.concat([degs[0], degs[1], other[2], other[3]]); }
    return { degs, bars, re: degs.map((d) => d - 2) };
  }
  function progHarmony(tr, degsIn) {
    const sc = SCALES[tr.scale] || SCALES.minor, T = 57 + tr.key;
    const pitch = (d) => sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    let prev = null;
    return (degsIn || tr.prog).map((d) => {
      const third = (pitch(d + 2) - pitch(d) + 12) % 12, sev = (pitch(d + 6) - pitch(d) + 12) % 12;
      const colour = third === 4 && sev === 11 ? d + 6 : d + 8;            // maj7 where it is major-seventh, else the ninth
      let notes = [d, d + 2, d + 4, colour].map((x) => T + pitch(x)).map((n) => { while (n > 71) n -= 12; while (n < 52) n += 12; return n; }).sort((x, y) => x - y);
      if (prev) {
        const cands = [];
        for (let k = 0; k < 4; k++) { const inv = notes.slice(k).concat(notes.slice(0, k).map((x) => x + 12)); cands.push(inv, inv.map((x) => x - 12)); }
        const ok = cands.filter((c) => c[0] >= 50 && c[3] <= 74).sort((x, y) => x.reduce((s, v, j) => s + Math.abs(v - prev[j]), 0) - y.reduce((s, v, j) => s + Math.abs(v - prev[j]), 0));
        if (ok.length) notes = ok[0];
      }
      prev = notes;
      let root = T + pitch(d); while (root > 35) root -= 12; while (root < 28) root += 12;      // (the bass's root under 62 Hz: the sub carries the drop, as in the references)
      const arp = [d, d + 2, d + 4].map((x) => { let n = T + 12 + pitch(x); while (n > 77) n -= 12; while (n < 64) n += 12; return n; }).sort((x, y) => x - y);
      /* the counter-melody's tones: the chord's third and seventh, in the middle register */
      const guide = [d + 2, d + 6].map((x) => { let n = T + pitch(x); while (n > 67) n -= 12; while (n < 55) n += 12; return n; });
      return { notes, root, arp: [arp[0], arp[1], arp[2], arp[0] + 12, arp[1] + 12], deg: d, guide };
    });
  }
  /* the counter-melody: the guide tones voice-led - the nearest of each chord's third and seventh to the note before - held through the chord, or moving within it */
  function writeProgCounter(q, H, chordBars) {
    let prev = H[0].guide[0];
    const moving = q() < 0.5, out = [];
    H.forEach((c, i) => {
      const a = c.guide.slice().sort((x, y) => Math.abs(x - prev) - Math.abs(y - prev)), beats = chordBars * 4, at = i * beats;
      if (moving && beats >= 8) { out.push([at, beats / 2, a[0]], [at + beats / 2, beats / 2, a[1]]); prev = a[1]; }
      else { out.push([at, beats, a[0]]); prev = a[0]; }
    });
    return out;
  }
  const PCELLS = [[1.5, 0.5, 1, 1], [2, 1, 1], [1, 1, 2], [1.5, 0.5, 2], [1, 0.5, 0.5, 1, 1], [2, 2], [1, 1, 1, 1], [3, 1], [0.5, 0.5, 1, 2], [1.5, 1.5, 1]];
  /* the hook: eight bars in one of several plans (AABA, ABAC, a call and a
     response, a four-bar line said twice), on one of several shapes (an
     arch, a sigh falling, a wave, a climb, a high pedal), sometimes with a
     pickup into it; its strong beats on the chords' own notes (on the
     record's chord rhythm), home at the end. And its other endings: open
     (to the fifth) and alt (a new last two bars) */
  function writeProgHook(q, tr) {
    const pick = (a) => a[Math.floor(q() * a.length)], wob = () => Math.round((q() - 0.5) * 2);
    const degs = (tr.chords && tr.chords.degs) || tr.prog, cb = (tr.chords && tr.chords.bars) || 2;
    const c = Array.from({ length: 6 }, () => pick(PCELLS)), sparse = () => pick([[2, 2], [3, 1], [-2, 2], [1, -1, 2]]);
    const plan = pick(['AABA', 'ABAC', 'callresp', 'long4', 'AABA']);
    const bars = plan === 'AABA' ? [c[0], c[1], c[0], c[2], c[0], c[3], q() < 0.6 ? c[0] : c[4], [4]]
      : plan === 'ABAC' ? [c[0], c[1], c[2], c[3], c[0], c[1], c[4], [4]]
      : plan === 'callresp' ? [c[0], c[1], sparse(), [-4], c[0], c[2], sparse(), [4]]
      : [c[0], c[1], c[2], [4], c[0], c[1], c[3], [4]];
    const s = pick([4, 2, 4, 3]), peak = s + pick([4, 5, 5, 6]), shapeName = pick(['arch', 'sigh', 'wave', 'climb', 'pedal']);
    const A = {
      arch: [[0, s], [3, s + 3 + wob()], [6, s + 1], [8, s], [11, s + 1 + wob()], [14, s - 2], [16, s], [19, s + 3], [20.5, peak], [22, s + 3 + wob()], [24, s + 1], [27, s + 3], [28, 7]],
      sigh: [[0, s + 4], [4, s + 2], [8, s], [12, s - 1], [16, s + 3], [20, s + 1], [24, s - 1], [28, 7]],
      wave: [[0, s], [4, s + 2], [8, s - 1], [12, s + 3], [16, s], [20, s + 4], [24, s + 1], [28, 7]],
      climb: [[0, s - 2], [8, s], [16, s + 2], [24, peak], [26, peak - 1], [28, 7]],
      pedal: [[0, s + 3], [8, s + 3], [16, s + 3], [24, s + 4], [28, 7]]
    }[shapeName];
    const target = (b) => { for (let i = 1; i < A.length; i++) if (b <= A[i][0]) { const [x0, y0] = A[i - 1], [x1, y1] = A[i]; return y0 + (y1 - y0) * (b - x0) / (x1 - x0); } return 7; };
    const chordTones = (beat) => { const cd = degs[Math.floor(beat / (4 * cb)) % degs.length]; return [0, 2, 4].map((k) => (((cd + k) % 7) + 7) % 7); };
    const out = [];
    bars.forEach((cell, bi) => {
      let beat = bi * 4;
      cell.forEach((len) => {
        if (len < 0) { beat -= len; return; }                     // a rest
        let d = Math.round(target(beat));
        if (shapeName === 'pedal' && beat % 2 !== 0) d += pick([-1, -2, 1]);    // the pedal's neighbours between its beats
        if (beat % 2 === 0) {
          const tones = chordTones(beat);
          let best = d, bd = 9; for (let x = d - 2; x <= d + 2; x++) if (tones.indexOf(((x % 7) + 7) % 7) >= 0 && Math.abs(x - d) < bd) { bd = Math.abs(x - d); best = x; }
          d = best;
        }
        const n = out.length;
        if (shapeName !== 'pedal' && n >= 2 && out[n - 1][2] === d && out[n - 2][2] === d) d += target(beat + 1) > d ? 1 : -1;       // not three the same
        out.push([beat, len, d]);
        beat += len;
      });
    });
    out[out.length - 1][2] = 7;                        // home, held
    /* a pickup into the first bar, now and then */
    if (q() < 0.45) { const p = out[0][2]; out.unshift([-0.5, 0.5, p - 1]); if (q() < 0.5) out.unshift([-1, 0.5, p - 2]); }
    const lastTwo = (o) => o.findIndex((x) => x[0] >= 24);
    const open = out.map((x) => x.slice());
    for (let i = lastTwo(open); i < open.length; i++) open[i][2] = i === open.length - 1 ? 4 : Math.round((open[i][2] + 4) / 2);
    /* alt: a new seventh bar, and the end on the third, held */
    const alt = out.filter((x) => x[0] < 24).map((x) => x.slice()), cell = pick(PCELLS);
    let beat = 24; cell.forEach((len) => { alt.push([beat, len, Math.round(target(beat)) + pick([1, 2])]); beat += len; });
    alt.push([28, 4, 2]);
    return { hook: out, open, alt, plan, shape: shapeName };
  }

  /* ---- the record, pressed: one segment of it -------------------------------- */
  /* the look-ahead brickwall on the finished segment: gain from the loudest
     moment a little ahead, held, smoothed (ceiling in dBFS) */
  function lookahead(L, R, ceil) {
    const n = L.length, c = undb(ceil), g = new Float32Array(n);
    /* the true peak: the samples and the wave between them (read at quarter steps through a windowed sinc), so the
       ceiling holds once the record is played back through a converter, not only on its samples */
    const TAP = 8, PH = [0.25, 0.5, 0.75].map((f) => { const k = []; for (let j = -TAP + 1; j <= TAP; j++) { const x = j - f, w = 0.5 + 0.5 * Math.cos(Math.PI * x / TAP); k.push(Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x) * w); } return k; });
    const tpOf = (X, i) => { let p = Math.abs(X[i]); if (i < TAP || i >= n - TAP) return p; for (const k of PH) { let v = 0; for (let j = 0; j < k.length; j++) v += k[j] * X[i - TAP + 1 + j]; v = Math.abs(v); if (v > p) p = v; } return p; };
    for (let i = 0; i < n; i++) { const p = Math.max(tpOf(L, i), tpOf(R, i)); g[i] = p > c ? c / p : 1; }
    const look = Math.round(0.003 * PSR), hold = Math.round(0.09 * PSR), sm = Math.round(0.025 * PSR), W = look + hold;      // (a held release: each kick's peak breathes the mix after it, the pump)
    /* the minimum over the window ahead (a deque), then a moving average twice */
    const m = new Float32Array(n), dq = new Int32Array(n + W + 1); let h = 0, t = 0;
    for (let i = n - 1, j = n - 1; i >= 0; i--) {
      while (j >= 0 && j >= i - look) { while (t > h && g[dq[t - 1]] >= g[j]) t--; dq[t++] = j; j--; }
      while (t > h && dq[h] > i + hold) h++;
      m[i] = g[dq[h]];
    }
    const box = (x, w) => { const o = new Float32Array(n); let s = 0; for (let i = 0; i < n; i++) { s += x[i]; if (i >= w) s -= x[i - w]; o[i] = s / Math.min(i + 1, w); } return o; };
    const G = box(box(m, sm), sm);
    for (let i = 0; i < n; i++) { const k = Math.min(G[i], m[i]); L[i] *= k; R[i] *= k; }
  }
  function renderProg(tr, a, b) {
    return progBankFor(tr).then((S) => pressProg(tr, a, b, S));
  }
  function pressProg(tr, a, b, S) {
    const P = tr.patch, PL = tr.plan;
    const BEATs = 60 / tr.bpm, BARs = BEATs * 4;
    const from = Math.max(0, Math.floor((a - 2) / 2) * 2), end = Math.min(b + 1, tr.bars), last = b >= tr.bars;
    const t0 = from * BARs, skip = at(tr, a) - at(tr, from), want = at(tr, b) - at(tr, a) + (last ? 0 : FADE);
    const LOOK = Math.round(0.1 * PSR), total = skip + want + LOOK;
    const ctx = new OfflineAudioContext(2, total, PSR), T1 = total / PSR;
    /* the sections, and where in them a bar is */
    const secs = tr.scripts;
    const secOf = (bar) => secs.find((s) => bar >= s.start && bar < s.start + s.len) || secs[secs.length - 1];
    /* the chords on the record's harmonic rhythm; a breakdown re-harmonised where the plan says */
    const chordAtBar = (bar) => { const s = secOf(bar), set = s && s.name === 'breakdown' && PL.reharm ? PL.HB : PL.H; return set[Math.floor(bar / PL.chordBars) % set.length]; };
    const when = (beatAbs) => beatAbs * BEATs - t0;
    /* ---- the graph ---- */
    const G = (v) => { const g = ctx.createGain(); g.gain.value = v == null ? 1 : v; return g; };
    const F = (type, f, q) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q || 0.707; return x; };
    const chain = (...ns) => { for (let i = 1; i < ns.length; i++) ns[i - 1].connect(ns[i]); return ns[ns.length - 1]; };
    const out = G(1); out.connect(ctx.destination);
    const glue = ctx.createDynamicsCompressor(); glue.threshold.value = -16; glue.ratio.value = 2; glue.knee.value = 6; glue.attack.value = 0.03; glue.release.value = 0.2;
    /* (the master set for the references' loudness, about -9.5 LUFS; the look-ahead limiter holds the peaks at -1 dB) */
    const master = G((tr.progGain || 1) * 1.25);
    /* the lows kept mono: the side channel high-passed at 140 Hz */
    const msIn = G(1), split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
    msIn.connect(split);
    const mid = G(1), sideL = G(0.5), sideR = G(-0.5), side = G(1), inv = G(-1);
    const midL = G(0.5), midR = G(0.5); split.connect(midL, 0); split.connect(midR, 1); midL.connect(mid); midR.connect(mid);
    split.connect(sideL, 0); split.connect(sideR, 1); sideL.connect(side); sideR.connect(side);
    const sideHP = chain(side, F('highpass', 90, 0.707));
    mid.connect(merge, 0, 0); mid.connect(merge, 0, 1); sideHP.connect(merge, 0, 0); sideHP.connect(inv); inv.connect(merge, 0, 1);
    /* air: a shelf over 9 kHz */
    const air = F('highshelf', 9000, 0.707); air.gain.value = 3;
    const sub = F('lowshelf', 55, 0.707); sub.gain.value = -4.5;
    /* the tilt the references have: the 60-120 Hz (the kick's body) a little up, the presence and top lifted */
    const thin = F('peaking', 90, 1.0); thin.gain.value = 2.5;
    const body = F('peaking', 320, 0.8); body.gain.value = 2.5;
    const pres = F('peaking', 1400, 0.9); pres.gain.value = 2.5;
    const lift = F('highshelf', 1800, 0.6); lift.gain.value = 6;
    chain(merge, F('highpass', 28, 0.707), sub, thin, body, pres, lift, air, glue, master, out);
    const hush = G(1); hush.connect(msIn);
    const tail = G(1); tail.connect(msIn);                         // rings through the breath
    const music = G(1), musicHP = F('highpass', 20, 0.707); chain(music, musicHP, hush);
    const rest = G(1); rest.connect(hush);
    /* the spaces: a hall, a room, a ping-pong echo into the hall */
    const hall = ctx.createConvolver(); hall.normalize = false; hall.buffer = S.ir(P.hall.len, 0.03, P.hall.bright, P.hall.dark, tr.seed ^ 40);
    const room = ctx.createConvolver(); room.normalize = false; room.buffer = S.ir(1.1, 0.01, 9000, 3000, tr.seed ^ 41);
    const hallIn = G(1), roomIn = G(1), dlyIn = G(1), hallDuck = G(1), roomDuck = G(1), dlyDuck = G(1);
    chain(hallIn, hall, hallDuck, music);
    chain(roomIn, room, roomDuck, rest);
    {
      const d = P.delay * BEATs, hp = F('highpass', 300, 0.5), dl = ctx.createDelay(2), dr = ctx.createDelay(2), fl = F('lowpass', 3500), fr = F('lowpass', 3500), fbL = G(P.fb), fbR = G(P.fb), pm = ctx.createChannelMerger(2), ret = G(1);
      dl.delayTime.value = d; dr.delayTime.value = d;
      const mono = G(1); mono.channelCountMode = 'explicit'; mono.channelCount = 1; mono.channelInterpretation = 'speakers';
      chain(dlyIn, mono, hp, dl, fl); fl.connect(fbL); fbL.connect(dr); chain(dr, fr); fr.connect(fbR); fbR.connect(dl);
      fl.connect(pm, 0, 1); fr.connect(pm, 0, 0); chain(pm, ret, dlyDuck); dlyDuck.connect(music); const toHall = G(0.3); ret.connect(toHall); toHall.connect(hallIn);
    }
    /* each part: its filter, its level, its duck, its sends */
    const part = (dest, lvl, sends, filt, panAt) => {
      const inp = G(1), shapeG = G(1), gain = G(lvl), duck = G(1), outG = G(1);
      const pn = panAt ? (() => { const x = ctx.createStereoPanner(); x.pan.value = panAt; return x; })() : null;
      chain(inp, ...(filt ? [filt] : []), shapeG, gain, duck, ...(pn ? [pn] : []), outG);
      outG.connect(dest);
      Object.entries(sends || {}).forEach(([k, v]) => { const s = G(v); outG.connect(s); s.connect(k === 'hall' ? hallIn : k === 'room' ? roomIn : dlyIn); });
      return { inp, shapeG, gain, duck, outG, filt };
    };
    const LV = tr.progLevels || PROG_LEVELS;
    const solo = tr.solo, lv = (k) => (solo && solo !== k ? 0 : LV[k]);
    const kickF = F('lowpass', 19000, 0.707), padF = F('lowpass', 1400, 0.9), arpF = F('lowpass', 1100, 1.0), bassF = F('lowpass', 700, 1.1), leadF = F('lowpass', 3500, 0.8), keysF = F('lowpass', 7000), snareF = F('highpass', 40);
    const p = {
      kick: part(rest, lv('kick'), null, kickF), clap: part(rest, lv('clap'), { room: 0.3 }), hats: part(rest, lv('hats'), { room: 0.08 }, null, -0.5),
      shaker: part(rest, lv('shaker'), null, null, 0.6), top: part(rest, lv('top'), { room: 0.05 }, null, 0.55), ride: part(rest, lv('ride'), null, null, 0.3), perc: part(rest, lv('perc'), { hall: 0.2, delay: 0.35 }, null, -0.4), snare: part(rest, lv('snare'), { room: 0.3 }, snareF),
      bass: part(rest, lv('bass'), null, bassF), pad: part(music, lv('pad'), { hall: 0.35 }, padF), arp: part(music, lv('arp'), { hall: 0.25, delay: 0.3 }, arpF),
      lead: part(music, lv('lead'), { hall: 0.3, delay: 0.22 }, leadF), strings: part(music, lv('strings'), { hall: 0.45 }), counter: part(music, lv('counter'), { hall: 0.35 }), keys: part(music, lv('keys'), { hall: 0.5, delay: 0.3 }, keysF), atmos: part(rest, lv('atmos'), { hall: 0.4 }),
      crash: part(rest, lv('crash'), { hall: 0.3 }), impact: part(tail, lv('impact'), { hall: 0.3 }), revcym: part(tail, lv('revcym')), sweeps: part(rest, lv('sweeps')), riser: part(tail, lv('riser'))
    };
    /* the gate (the build's chopped chords) sits between the pad's duck and its output */
    const gate = G(1); p.pad.duck.disconnect(); p.pad.duck.connect(gate); gate.connect(p.pad.outG);
    /* ---- smooth curves over the arrangement (values at bars, interpolated) ---- */
    const curves = progCurves(tr, secs);
    const automate = (param, name, logScale) => {
      const pts = curves[name]; if (!pts) return;
      const val = (bar) => {
        let i = 1; while (i < pts.length && pts[i][0] < bar) i++;
        if (i >= pts.length) return pts[pts.length - 1][1];
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; if (bar <= x0) return y0;
        const u = (bar - x0) / Math.max(1e-6, x1 - x0);
        return logScale ? y0 * Math.pow(y1 / y0, u) : y0 + (y1 - y0) * u;
      };
      param.setValueAtTime(val(from), 0);
      for (let t = BEATs / 4; t < T1; t += BEATs / 4) param.linearRampToValueAtTime(val(from + t / BARs), t);
      return val;
    };
    const padCut = automate(padF.frequency, 'padCut', true), arpCut = automate(arpF.frequency, 'arpCut', true), bassCut = automate(bassF.frequency, 'bassCut', true);
    automate(leadF.frequency, 'leadCut', true); automate(keysF.frequency, 'keysCut', true); automate(kickF.frequency, 'kickCut', true);
    automate(snareF.frequency, 'snareHP', true); automate(musicHP.frequency, 'musicHP', true);
    automate(p.pad.shapeG.gain, 'padGain'); automate(p.arp.shapeG.gain, 'arpGain'); automate(p.lead.shapeG.gain, 'leadGain');
    /* per-note filter snaps: added to the cutoff, decaying */
    const snapper = (filter) => { const c = ctx.createConstantSource(); c.offset.value = 0; c.connect(filter.frequency); c.start(0); return c.offset; };
    const arpSnap = snapper(arpF), bassSnap = snapper(bassF);
    /* ---- the playing ---- */
    const play = (buf, beatAbs, g, dest, rate) => {
      const st = when(beatAbs); if (st >= T1 || st + buf.duration / (rate || 1) <= 0) return null;
      const src = ctx.createBufferSource(); src.buffer = buf; if (rate) src.playbackRate.value = rate;
      const v = ctx.createGain(); v.gain.value = g; src.connect(v); v.connect(dest.inp || dest);
      if (st >= 0) src.start(st); else src.start(0, -st * (rate || 1));
      return st;
    };
    const duckCurve = (depth, Lb) => { const n = 96, c = new Float32Array(n); for (let k = 0; k < n; k++) { const u = k / (n - 1), a = Math.min(1, u * Lb * BEATs / 0.003); c[k] = 1 - depth * a * 0.5 * (1 + Math.cos(Math.PI * u)); } c[n - 1] = 1; return c; };
    const DUCKS = [[p.bass.duck, duckCurve(0.88, 0.7), 0.7], [p.pad.duck, duckCurve(0.8, 0.85), 0.85], [p.arp.duck, duckCurve(0.7, 0.8), 0.8], [p.lead.duck, duckCurve(0.6, 0.8), 0.8], [p.top.duck, duckCurve(0.55, 0.55), 0.55], [p.shaker.duck, duckCurve(0.5, 0.55), 0.55], [p.perc.duck, duckCurve(0.45, 0.55), 0.55], [p.hats.duck, duckCurve(0.3, 0.4), 0.4], [p.counter.duck, duckCurve(0.5, 0.8), 0.8], [p.strings.duck, duckCurve(0.55, 0.8), 0.8], [hallDuck, duckCurve(0.62, 0.8), 0.8], [dlyDuck, duckCurve(0.6, 0.8), 0.8], [roomDuck, duckCurve(0.5, 0.6), 0.6]];
    const rnd = (bar, salt) => seeded((tr.seed ^ Math.imul(bar + 1, 0x9E3779B1) ^ salt) >>> 0);
    const hook = tr.progHook;
    const tonic = 69 + tr.key, sc = SCALES[tr.scale] || SCALES.minor, mel = (d) => tonic + sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    const playHook = (startBar, which, dest, g, transpose, only) => {
      (hook[which] || hook.hook).forEach(([bt, len, d], i) => {
        if (only != null && i >= only) return;
        const bAbs = startBar * 4 + bt, bar = Math.floor(bAbs / 4); if (bar < from - 20 || bar >= end) return;
        const buf = dest === p.lead ? S.lead(mel(d) + (transpose || 0), len) : S.keys(mel(d) + (transpose || 0), len);
        play(buf, bAbs, g, dest);
      });
    };
    /* (the last range written that covers the bar wins: a block's own pattern, or its 'out', over the section's) */
    const onIn = (scr, part, k) => { const r = scr.on[part]; if (!r) return null; for (let i = r.length - 1; i >= 0; i--) { const [f, t, pt] = r[i]; if (k >= f && k < t) return pt === false ? null : pt; } return null; };
    const hatBuf = S.hat(+P.hat.toFixed(3));
    for (let bar = Math.max(0, from - 20); bar < end; bar++) {
      const sec = secOf(bar), k = bar - sec.start, L = sec.len, name = sec.name, nx = secs[secs.indexOf(sec) + 1], toDrop = name === 'build' && nx && nx.name === 'drop';
      const ch = chordAtBar(bar), nch = chordAtBar(bar + 1), R = rnd(bar, 0x77), longEvent = bar < from;
      const on = (part) => onIn(sec, part, k);
      const B = sec.build || {};
      const gapBeat = toDrop && B.breath && k === L - 1;             // the breath's beat: nothing struck in it
      const fill = (sec.fills.find((f) => f[0] === k) || [])[1];
      if (!longEvent) {
        /* the drums */
        const kickOn = on('kick');
        for (let bt = 0; bt < 4; bt++) {
          const beatAbs = bar * 4 + bt, lastBeat = bt === 3;
          if (kickOn && !(lastBeat && (gapBeat || fill === 'kickdrop'))) {
            play(S.kick(), beatAbs, 1, p.kick);
            const st = when(beatAbs);
            if (st >= 0 && st < T1 - 0.6) DUCKS.forEach(([d, c, lb]) => d.gain.setValueCurveAtTime(c, st, lb * BEATs));
          }
        }
        if (on('half')) { play(S.kick(), bar * 4, 1, p.kick); play(S.clap(), bar * 4 + 2, 1, p.clap); }
        const cl = on('clap');
        if (cl) (PC[cl] || PC.two4).forEach(([b, g, kind]) => { if (gapBeat && b >= 3) return; if (kind === 'ghost') play(S.snare(220), bar * 4 + b, g, p.snare); else play(S.clap(), bar * 4 + b, g, p.clap); });
        const ht = on('hats');
        if (ht) (PH[ht] || PH.off).forEach(([b, g, open]) => { if (gapBeat && b >= 3) return; play(open ? S.openHat() : hatBuf, bar * 4 + b, g * (0.88 + 0.12 * R()), p.hats); });
        /* the top: soft sixteenths on the hats, accented, a hair late on the offs */
        if (on('top')) { const acc = [0.5, 0.32, 0.75, 0.38]; for (let s = 0; s < 16; s++) { if (gapBeat && s >= 12) continue; play(hatBuf, bar * 4 + s / 4 + (s % 2 ? 0.02 : 0), acc[s % 4] * (0.9 + 0.2 * R()), p.top); } }
        const sh = on('shaker');
        if (sh) { const v = [0.45, 0.7, 0.55, 0.9]; for (let s = 0; s < 16; s += sh === 'eighth' ? 2 : 1) play(S.shaker(), bar * 4 + s / 4 + (s % 2 ? 0.04 : 0), v[s % 4], p.shaker); }
        const rd = on('ride');
        if (rd) for (let s = 0; s < 4; s += rd === 'eighth' ? 0.5 : 1) play(S.ride(), bar * 4 + s, s % 1 ? 0.45 : s % 2 ? 0.7 : 1, p.ride);
        const pc = on('perc');
        if (pc) {
          const base = P.perc, alt = pc === 'B' ? base.map(([st, d]) => [(st + 8) % 16, d]) : pc === 'C' ? base.concat(base.map(([st, d]) => [(st + 6) % 16, (d + 2) % 7])) : base;
          const two = pc === 'B' && k % 2 === 1 ? base : alt;
          two.forEach(([st, d]) => play(S.perc(Math.round(mtof(tonic + sc[d % 7]))), bar * 4 + st / 4, 1, p.perc));
        }
        /* the fills, each its own kind */
        if (fill === 'snare4') [0.5, 0.6, 0.75, 0.9].forEach((v, i) => play(S.snare(200), bar * 4 + 3 + i / 4, v, p.snare));
        if (fill === 'flam') for (let i = 0; i < 4; i++) play(S.snare(190 + 10 * i), bar * 4 + 2 + i / 2, 0.45 + 0.12 * i, p.snare);
        if (fill === 'toms') ['hi', 'hi', 'lo', 'lo'].forEach((t, i) => play(S.tom(t), bar * 4 + 3 + i / 4, 0.6 + 0.1 * i, p.snare));
        if (fill === 'kickdrop' && k + 1 < L) play(S.revCrash(BEATs), bar * 4 + 3, 0.5, p.revcym);
        /* the build's roll: snare (quarters, eighths, sixteenths, thirty-seconds) or the toms */
        if (toDrop && B.roll !== 'none' && k >= L - B.rollBars) {
          const r0 = L - B.rollBars, nseg = B.rollBars / 4, seg = Math.min(3, Math.floor((k - r0) / Math.max(1, B.rollBars / 4))), per = [1, 2, 4, 8][seg], cnt = (k === L - 1 ? 3.75 : 4) * per;
          for (let i = 0; i < cnt; i++) {
            const tb = bar * 4 + i / per, u = ((k - r0) * 4 + i / per) / (B.rollBars * 4 - 1);
            if (B.roll === 'toms') play(S.tom(u < 0.5 ? 'hi' : 'lo'), tb, 0.35 + 0.6 * u, p.snare); else play(S.snare(Math.round(180 + 170 * u)), tb, 0.3 + 0.7 * Math.pow(u, 1.5), p.snare);
          }
          void nseg;
        }
        /* the bass: the section's line, the last bar of every four turned towards the next chord */
        const bl = on('bass');
        if (bl) {
          let line = PB[bl] || PB.roll;
          if (k % 4 === 3 && bl !== 'long') { const step = nch.root - ch.root; line = line.filter(([s]) => s < 12).concat([[12, 1.5, 7, 0.8], [14, 0.9, 12, 0.7], [15, 0.9, step + (step > 0 ? -1 : 1), 0.8]]); }
          line.forEach(([s, len, add, v]) => {
            if (gapBeat && s >= 12) return;
            const st = play(S.bass(ch.root + add, Math.round(len * 25) / 100), bar * 4 + s / 4, v, p.bass);
            if (st != null && st >= 0) { const f = bassCut ? bassCut(bar + s / 16) : 700; bassSnap.setValueAtTime(f * 2, st); bassSnap.setTargetAtTime(0, st, 0.04); }
          });
        }
        /* the arpeggio: the section's version of the record's figure, two bars long */
        const ap = on('arp');
        if (ap) {
          const fig = PL.arps[ap] || PL.arps.A, half = (bar % 2) * 16;
          for (let s = 0; s < 16; s++) {
            const ix = fig[half + s]; if (ix < 0 || (gapBeat && s >= 12)) continue;
            const st = play(S.pluck(ch.arp[ix % 5]), bar * 4 + s / 4, ap === 'S' ? 1.1 : 1, p.arp);
            if (st != null && st >= 0) { const f = arpCut ? arpCut(bar + s / 16) : 1100; arpSnap.setValueAtTime(f * P.pluck.snap, st); arpSnap.setTargetAtTime(0, st, P.pluck.snapT); }
          }
        }
        /* the piano breakdown's chords */
        if (on('chords') && bar % PL.chordBars === 0) ch.notes.forEach((m, i) => play(S.keys(m, PL.chordBars * 4 * 0.95), bar * 4 + i * 0.02, 0.6, p.keys));
        /* the drop's hit, and its crashes; the groove's crash; the breakdown's entry */
        if (name === 'drop' && k === 0) { const h = sec.hit; if (h !== 'cut' && h !== 'impact' && h !== 'boom') play(S.crash(3), bar * 4, 1, p.crash); if (h === 'crashImpact' || h === 'impact' || h === 'boom') play(S.impact(), bar * 4, h === 'boom' ? 0.8 : 1, p.impact); }
        if (name === 'drop' && k > 0 && k % (sec.crashEvery || 8) === 0) play(S.crash(3), bar * 4, 0.7, p.crash);
        if (name === 'groove' && k === 0 && sec.n === 0) play(S.crash(3), bar * 4, 0.6, p.crash);
        if (name === 'breakdown' && k === 0 && sec.entry === 'sweep') play(S.sweep(2, 8000, 250, false, 14), bar * 4, 1, p.sweeps);
        if (name === 'breakdown' && k === 0 && (sec.entry === 'sweep' || sec.entry === 'impact')) play(S.impact(), bar * 4, 0.6, p.impact);
        if (nx && nx.name === 'breakdown' && name !== 'build' && k === L - 4) play(S.sweep(4, 500, 7000, true, 13), bar * 4, 0.7, p.sweeps);
        if (toDrop && B.sweepUp && k === L - 4) play(S.sweep(4, 500, 7000, true, 15), bar * 4, 0.8, p.sweeps);
        if (k === L - 1 && nx && (nx.name === 'groove' || nx.name === 'breakdown')) play(S.revCrash(BARs), (bar + 1) * 4 - 4, 0.5, p.revcym);
        if (toDrop && k === L - 2) play(S.revCrash(2 * BARs), bar * 4, 1, p.revcym);
      }
      /* the pad, the counter-melody, the air: held, so they may reach back before the segment */
      if (onIn(sec, 'pad', k) && bar % PL.chordBars === 0) {
        play(S.pad(ch.notes, PL.chordBars), bar * 4, 1, p.pad);
        /* (real strings under it in the breakdowns, where the record has them) */
        if (P.rec.strings && sec.name === 'breakdown') play(S.strings(ch.notes, PL.chordBars), bar * 4, 1, p.strings);
      }
      if (onIn(sec, 'counter', k)) {
        const cyc = PL.chordBars * PL.H.length, pos = ((bar % cyc) + cyc) % cyc;
        PL.counter.forEach(([bt, len, m]) => { if (Math.floor(bt / 4) === pos) play(S.counter(m, len * 0.95), bar * 4 + (bt - pos * 4), 0.9, p.counter); });
      }
      if (onIn(sec, 'atmos', k) && k === (sec.on.atmos[0][0] || 0)) play(S.atmos(Math.max(4, sec.on.atmos[0][1] - sec.on.atmos[0][0] + 2), 30 + secs.indexOf(sec)), bar * 4, 1, p.atmos);
      /* the riser over the build's last bars (when the build has one) */
      if (toDrop && B.riser && k === Math.max(0, L - B.riserBars)) play(S.riser(Math.min(B.riserBars, L) - 0.25), bar * 4, 1, p.riser);
      /* the hook, where the plan puts it */
      sec.hooks.forEach((h) => { if (h.at === k) playHook(bar, h.which, h.voice === 'lead' ? p.lead : p.keys, h.g, h.tr || 0, h.only); });
    }
    /* the gate on the pad where a build chops it; the breath: everything but the tails, gone */
    secs.forEach((s, i) => {
      const nx = secs[i + 1], B = s.build; if (s.name !== 'build' || !B) return;
      const mv = tr.moves[s.n] || {}, gEnd = (s.start + s.len) * 4 - (B.breath ? (mv.breathLen === 'half' ? 2 : mv.breathLen === 'eighth' ? 0.5 : 1) : 0);
      if (B.gate) {
        const g0 = (s.start + B.gate[0]) * 4, g1 = (s.start + s.len) * 4, mid = Math.max(g0, g1 - 8);
        [[g0, mid, 0.5], [mid, gEnd, 0.25]].forEach(([b0, b1, st]) => {
          for (let x = b0; x < b1 - 1e-6; x += st) {
            const t = when(x), d = st * BEATs, r = 0.003;
            if (t + d < 0 || t > T1) continue;
            if (t >= 0) { gate.gain.setValueAtTime(0, t); gate.gain.linearRampToValueAtTime(1, t + r); gate.gain.setValueAtTime(1, t + 0.55 * d); gate.gain.linearRampToValueAtTime(0, t + 0.55 * d + r); }
          }
        });
        const tgate = when(g1); if (tgate > 0 && tgate < T1) gate.gain.setValueAtTime(1, tgate);
      }
      if (!B.breath || !nx || nx.name !== 'drop') return;
      const tg = when(gEnd), td = when((s.start + s.len) * 4);
      if (td > 0 && tg < T1) {
        if (tg > 0) { hush.gain.setValueAtTime(1, Math.max(0, tg - 0.004)); hush.gain.linearRampToValueAtTime(0, tg); }
        else hush.gain.setValueAtTime(0, 0);
        if (td < T1) { hush.gain.setValueAtTime(0, Math.max(0, td - 0.004)); hush.gain.linearRampToValueAtTime(1, td); }
      }
    });
    /* the end of the record: a fade over its last three bars */
    if (last) { const tf = when((tr.bars - 3) * 4); if (tf < T1) { out.gain.setValueAtTime(1, Math.max(0, tf)); out.gain.linearRampToValueAtTime(0.0001, Math.max(0.01, when(tr.bars * 4))); } }
    return ctx.startRendering().then((buf) => {
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      /* a soft clip before the limiter (as mastered records are made loud): the loudest instants rounded off from
         0.85 of the ceiling, so the limiter takes less and the record stands louder at the same peak */
      const cc = undb(-1.2), kn = 0.85 * cc, room = 1.6 * cc - kn;
      const clip = (X) => { for (let i = 0; i < X.length; i++) { const a = Math.abs(X[i]); if (a > kn) X[i] = Math.sign(X[i]) * (kn + room * Math.tanh((a - kn) / room)); } };
      clip(L); clip(R);
      lookahead(L, R, -1.2);
      /* the section gain (progCurves' secGain), after the limiter */
      const SGp = curves.secGain, sr = buf.sampleRate, blk = 256;
      const sgAt = (t) => { const bar = (t + t0) / BARs; let i = 1; while (i < SGp.length && SGp[i][0] < bar) i++; if (i >= SGp.length) return SGp[SGp.length - 1][1]; const [x0, y0] = SGp[i - 1], [x1, y1] = SGp[i]; return bar <= x0 ? y0 : y0 + (y1 - y0) * (bar - x0) / Math.max(1e-6, x1 - x0); };
      let g0 = sgAt(0);
      for (let i = 0; i < L.length; i += blk) {
        const g1 = sgAt((i + blk) / sr), n = Math.min(blk, L.length - i);
        for (let j = 0; j < n; j++) { const g = g0 + (g1 - g0) * j / blk; L[i + j] *= g; R[i + j] *= g; }
        g0 = g1;
      }
      return { l: L.slice(skip, skip + want), r: R.slice(skip, skip + want) };
    });
  }

  /* every part's level (each sound is made at a known level; these set the
     balance, as a mix engineer's faders): measured part by part in a drop,
     over five records with different recordings, to a reference mix's balance (kick -13 dB rms,
     bass -17, pad -21, lead -19, arp -24, clap -10 peak, hats -16 ...) */
  const PROG_LEVELS = { top: 0.337, strings: 0.5, counter: 0.318, kick: 0.8, clap: 0.196, hats: 0.256, shaker: 0.0813, ride: 0.101,
    perc: 0.087, snare: 0.0815, bass: 0.58, pad: 0.88, arp: 0.338, lead: 0.623, keys: 0.428, atmos: 0.0683,
    crash: 0.264, impact: 0.35, revcym: 0.228, sweeps: 0.167, riser: 0.446 };
  /* the curves: for each section, where each filter and level starts and
     ends (and turns, in between), at bars; a section's start may jump from
     where the last one ended */
  function progCurves(tr, secs) {
    const C = { padCut: [], arpCut: [], bassCut: [], leadCut: [], keysCut: [], kickCut: [], snareHP: [], musicHP: [], padGain: [], arpGain: [], leadGain: [], secGain: [] };
    const longest = Math.max(0, ...secs.filter((x) => x.name === 'breakdown').map((x) => x.len));
    secs.forEach((sc) => {
      const s = sc.start, L = sc.len, e = s + L - 0.001, nm = sc.name;
      const put = (k, pts) => pts.forEach(([x, v]) => C[k].push([s + x, v]));
      const D = { padCut: [[0, 2400], [L - 0.001, 2400]], arpCut: [[0, 3000], [L - 0.001, 3000]], bassCut: [[0, 800], [L - 0.001, 800]], leadCut: [[0, 3500], [L - 0.001, 3500]],
        keysCut: [[0, 7000], [L - 0.001, 7000]], kickCut: [[0, 19000], [L - 0.001, 19000]], snareHP: [[0, 40], [L - 0.001, 40]], musicHP: [[0, 20], [L - 0.001, 20]],
        padGain: [[0, 1], [L - 0.001, 1]], arpGain: [[0, 0.8], [L - 0.001, 0.8]], leadGain: [[0, 1], [L - 0.001, 1]], secGain: [[0, 1], [L - 0.001, 1]] };
      const dB_ = (d) => Math.pow(10, d / 20);
      /* (the references: a plateau, dipping 4-11 LU at the breakdowns) */
      const dip = nm === 'breakdown' ? (L === longest && L >= 16 ? -3.5 : -2.5) : 0;
      /* the record's one section gain, set after the limiter (which would level it): the drops the loudest, the
         breakdowns under them (the main one most), the builds climbing back, the intro and outro easing in and out */
      const SG = nm === 'breakdown' ? [[0, dB_(dip)], [L - 0.001, dB_(dip)]] : nm === 'build' ? [[0, dB_(-2.5)], [L - 0.001, dB_(-1)]]
        : nm === 'intro' ? [[0, dB_(-3)], [L - 0.001, dB_(-1.5)]] : nm === 'groove' ? [[0, dB_(-1.5)], [L - 0.001, dB_(-1.5)]]
        : nm === 'outro' ? [[0, dB_(-1)], [L - 0.001, dB_(-5)]] : [[0, 1], [L - 0.001, 1]];
      const X = {};
      if (nm === 'intro') Object.assign(X, { padCut: [[0, 500], [L - 0.001, 1400]], arpCut: [[0, 350], [L - 0.001, 1100]], padGain: [[0, 0], [Math.min(6, L / 2), 1], [L - 0.001, 0.8]],
        arpGain: [[0, 0], [Math.min(4, L / 4), 0], [Math.min(8, L / 2), 0.7], [L - 0.001, 0.8]], bassCut: [[0, 260], [L - 0.001, 260]] });
      if (nm === 'groove') Object.assign(X, { padCut: [[0, 1400], [L - 0.001, 2200]], arpCut: [[0, 1100], [L / 2, 2600], [L - 0.001, 4200]], bassCut: [[0, 260], [L / 2, 700], [L - 0.001, 900]],
        padGain: [[0, 0.8], [L - 0.001, 0.8]], keysCut: [[0, 1800], [L - 0.001, 1800]] });
      if (nm === 'breakdown') Object.assign(X, { padCut: [[0, 1800], [L - 0.001, 6000]], arpCut: [[0, 1600], [L - 0.001, 3200]], padGain: [[0, 1.1], [L - 0.001, 1.1]], arpGain: [[0, 0.7], [L - 0.001, 0.7]],
        leadCut: [[0, 1200], [L / 2, 1200], [L - 0.001, 3500]], leadGain: [[0, 0.5], [L - 0.001, 0.8]] });
      if (nm === 'build') Object.assign(X, { padCut: [[0, 6000], [L - 0.001, 5000]], arpCut: [[0, 3200], [Math.max(1, L - 4), 10000], [L - 0.001, 10000]], bassCut: [[0, 400], [Math.max(1, L - 4), 1400], [L - 0.001, 1400]],
        leadCut: [[0, 3500], [L / 2, 9000], [L - 0.001, 9000]], kickCut: [[0, 180], [Math.min(8, L / 4), 19000], [L - 0.001, 19000]], snareHP: [[0, 40], [Math.max(0, L - 4), 40], [L - 0.25, 900], [L - 0.001, 900]],
        musicHP: [[0, 20], [Math.max(0, L - 8), 20], [L - 0.25, 450], [L - 0.001, 450]], arpGain: [[0, 0.7], [L - 0.001, 0.7]], leadGain: [[0, 0.8], [L - 0.001, 0.9]] });
      if (nm === 'drop') Object.assign(X, { padCut: [[0, 5000], [L - 0.001, 5500]], arpCut: [[0, 4500], [L - 0.001, 5500]], bassCut: [[0, 800], [L - 0.001, 900]], leadCut: [[0, 9000], [L - 0.001, 9000]] });
      if (nm === 'outro') Object.assign(X, { padCut: [[0, 5000], [L - 0.001, 800]], arpCut: [[0, 4500], [L - 0.001, 600]], bassCut: [[0, 900], [L - 0.001, 400]],
        padGain: [[0, 1], [Math.max(0, L - 4), 0.8], [L - 0.001, 0]], arpGain: [[0, 0.8], [L - 0.001, 0.2]] });
      /* the eight-bar phrases breathe: in a groove or a drop the arpeggio and the pad open in one phrase and close in the next */
      if ((nm === 'groove' || nm === 'drop') && L >= 16) ['arpCut', 'padCut'].forEach((k) => {
        const base = X[k] || D[k], at = (x) => { for (let j = 1; j < base.length; j++) if (x <= base[j][0]) { const [x0, y0] = base[j - 1], [x1, y1] = base[j]; return y0 * Math.pow(y1 / y0, (x - x0) / Math.max(1e-6, x1 - x0)); } return base[base.length - 1][1]; };
        const pts = []; for (let b = 0; b <= L - 0.001; b += 4) pts.push([Math.min(b, L - 0.001), at(b) * (b % 16 < 8 ? (k === 'arpCut' ? 0.45 : 0.6) : (k === 'arpCut' ? 2.1 : 1.5))]);
        X[k] = pts;
      });
      X.secGain = SG;
      Object.keys(C).forEach((k) => put(k, X[k] || D[k]));
    });
    Object.values(C).forEach((pts) => pts.sort((x, y) => x[0] - y[0]));
    return C;
  }

  function renderSegment(tr, a, b) {
    if (tr.engine === 'prog') return renderProg(tr, a, b);
    const T = tone();
    if (!T) return Promise.reject(new Error('Tone.js not loaded'));
    const S = STYLES[tr.style], FX = S.fx, KIT = KITS[S.kit];
    let BT = tr.beat;                                  // the beat this bar (two alternate by phrase)
    const dance = !!DANCE[S.form];                     // a form that builds and drops
    const STEP = 60 / tr.bpm / 4, BAR = STEP * 16, BEAT = STEP * 4;
    /* the lead-in reaches back to where the held chords and beds were struck
       (a chord lasts bpc bars, the horns two), so they sound where it starts */
    const ALIGN = Math.max(2, tr.bpc || 1);
    const from = Math.max(0, Math.floor((a - LEAD) / ALIGN) * ALIGN), off = from * BAR;
    const last = b >= tr.bars;
    const skip = at(tr, a) - at(tr, from);                             // the lead-in, discarded
    const want = at(tr, b) - at(tr, a) + (last ? 0 : FADE);
    /* chance, seeded afresh for every bar: the same bar plays the same
       whichever segment it is rendered in */
    let rnd = seeded(tr.seed ^ 0x5bd1e995);
    const reseed = (bar) => { rnd = seeded((tr.seed ^ Math.imul(bar + 1, 0x9E3779B1)) >>> 0); };
    const irRnd = seeded(tr.seed ^ 0x2545F491);                       // the room: the same in every segment

    const CH = chordsOf(tr), sets = {};
    const chordSet = (up, borrow) => {
      const k = (up ? 'u' : '') + (borrow ? 'b' : '');
      if (!k) return CH;
      return sets[k] || (sets[k] = chordsOf(tr, up ? 2 : 0, borrow ? tr.borrow : -1));
    };
    const lastDrop = tr.arr.reduce((acc, [nm, len]) => ({ at: nm === 'drop' ? acc.b : acc.at, b: acc.b + len }), { at: -1, b: 0 }).at;
    const chordAt = (barIndex) => {
      const sec = sectionAt(tr, barIndex);
      const borrow = tr.borrow != null && (sec.name === 'breakdown' || (sec.name === 'drop' && Math.floor(sec.bar / 4) % 2 === 1));
      const set = chordSet(tr.keyUp && lastDrop >= 0 && barIndex >= lastDrop, borrow);
      return set[Math.floor(barIndex / tr.bpc) % set.length];
    };

    /* Tone's own offline context, driven here rather than by Tone.Offline:
       the notes are written a bar at a time, the render pausing before
       each bar (written all at once, Tone's noise voices slow the render to
       a crawl the longer the track). The instruments are built once. */
    let ctx;
    return kitFor(T, S.kit).then((K) => extrasFor(T).then((E) => samplesFor(tr).then((SM) => {
      ctx = new T.OfflineContext(2, (skip + want + 128) / SR, SR);
      return Object.assign({ E, SM }, K);
    }))).then((K) => {
    let E = K.E;
    const SM = K.SM;
    /* what each part was meant to be and what it is (its recordings, or the synth standing in), for the page and the tests */
    const resolved = {};
    /* a drummer's kit (VCSL) in place of the machine's: each drum brought to
       the level of the sound it stands in for, the middle tom the high one
       tuned down; the kick still has the machine's under it, for the floor */
    const AK = tr.acoustic ? SM['kit-acoustic'] : null;
    if (AK) {
      const peak = (b) => { let m = 0; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); } return m || 1; };
      const like = (b, as, rate) => {
        const k = peak(as) / peak(b), r = rate || 1, len = Math.floor(b.length / r), src = b.getChannelData(0);
        const o = new AudioBuffer({ length: len, numberOfChannels: 1, sampleRate: b.sampleRate }), d = o.getChannelData(0);
        for (let i = 0; i < len; i++) { const x = i * r, j = Math.floor(x), fr = x - j; d[i] = k * ((src[j] || 0) * (1 - fr) + (src[j + 1] || 0) * fr); }
        return o;
      };
      K = Object.assign({}, K, {
        hatC: like(AK.hatC, K.hatC), hatC2: like(AK.hatC2 || AK.hatC, K.hatC), hatO: like(AK.hatO, K.hatO), crash: like(AK.crash, K.crash),
        snare: like(AK.snare, K.snare), snare2: like(AK.snare2 || AK.snare, K.snare), ghost: like(AK.ghost, K.ghost),
        kickReal: AK.kick
      });
      E = Object.assign({}, E, { ride: like(AK.ride, E.ride), tomHi: like(AK.tomHi, E.tomHi), tomMid: like(AK.tomHi, E.tomMid, 0.84), tomLo: like(AK.tomLo, E.tomLo) });
    }
    /* a real instrument, played: its recordings, re-pitched between them */
    const srcOf = (name) => (SAMPLED[name] && SAMPLED[name].src) || name;
    const sampler = (name, opts) => SM[srcOf(name)] ? new T.Sampler(Object.assign({ urls: SM[srcOf(name)], release: 0.8, volume: SAMPLED[name] ? SAMPLED[name].vol : -12 }, opts || {})) : null;
    /* what an alias plays through: the guitar through a wah that opens with
       each note's attack, the trumpet through a mute */
    const fxOf = (name) => {
      const f = SAMPLED[name] && SAMPLED[name].fx;
      if (f === 'wah') return [new T.AutoWah({ baseFrequency: 260, octaves: 5, sensitivity: -30, Q: 2.6, wet: 1 })];
      if (f === 'mute') return [new T.Filter({ type: 'highpass', frequency: 480, Q: 0.7 }), new T.Filter({ type: 'lowpass', frequency: 2100, Q: 1.2 })];
      return [];
    };
    T.setContext(ctx);
    const raw = ctx.rawContext;
    let play;
    {
      /* ---- the mix ---- */
      const limiter = new T.Limiter(-1.5).toDestination();
      const master = new T.Gain(0.8 * (LEVEL[tr.style] || 1)).connect(limiter);
      const comp = new T.Compressor({ threshold: -16, ratio: 4, attack: 0.004, release: 0.2 }).connect(master);
      const shelf = new T.Filter({ type: 'lowshelf', frequency: 90, gain: 3 }).connect(comp);
      /* a gentle tilt for long listening: the upper mids and top eased back */
      const eq = new T.EQ3({ low: 0, mid: -0.8, high: -1.6, lowFrequency: 250, highFrequency: 5200 }).connect(shelf);
      let head = eq;
      if (FX.sat) head = new T.Distortion({ distortion: 0.12 + FX.sat * 0.25, oversample: 'none', wet: 0.5 }).connect(eq);
      /* the section's filter: closed for an intro, opening through a build */
      /* the hush: a pause before a drop silences everything, the reverb and
         echo returns too (all of it comes through here); what is meant to
         ring through the pause goes round it, on the tail bus */
      const hush = new T.Gain(1).connect(head);
      const tailBus = new T.Gain(1).connect(head);
      const filter = new T.Filter({ type: 'lowpass', frequency: 800, Q: 0.7, rolloff: -12 }).connect(hush);
      function hushFor(from, to) {
        /* (short ramps, no click) */
        hush.gain.setValueAtTime(1, Math.max(0, from - 0.008)); hush.gain.linearRampToValueAtTime(0, from);
        hush.gain.setValueAtTime(0, Math.max(0, to - 0.006)); hush.gain.linearRampToValueAtTime(1, to);
      }

      const glue = new T.Compressor({ threshold: -18, ratio: 3, attack: 0.01, release: 0.12, knee: 6 }).connect(filter);
      const drums = new T.Gain(1).connect(glue);
      const low = new T.Gain(1), keys = new T.Gain(1);          // both pumped by the kick
      const keysHP = new T.Filter({ type: 'highpass', frequency: 160, Q: 0.6 });
      keys.connect(new T.Gain(1.5).connect(keysHP));
      let musicOut = filter;
      /* anything that wobbles is set to where the track is, so a segment's
         wobble carries on from the last one's */
      const sync = (fx, hz) => {
        ['_lfo', '_lfoL', '_lfoR'].forEach((k) => { if (fx[k] && 'phase' in fx[k]) fx[k].phase = (fx[k].phase + 360 * hz * off) % 360; });
        return fx;
      };
      if (FX.wobble) musicOut = sync(new T.Vibrato({ frequency: 0.55, depth: 0.14 * FX.wobble, wet: 1 }), 0.55).connect(filter);
      low.connect(musicOut);
      if (FX.chorus) keysHP.connect(sync(new T.Chorus({ frequency: 0.9, delayTime: 3.5, depth: 0.55 * FX.chorus, spread: 170, wet: 0.5 }).start(), 0.9).connect(musicOut));
      else keysHP.connect(musicOut);

      let verbIn = null;
      if (FX.verb) {
        const len = Math.floor(SR * FX.verbLen), L = new Float32Array(len), R = new Float32Array(len);
        for (let i = 0; i < len; i++) { const d = Math.pow(1 - i / len, 3); L[i] = (irRnd() * 2 - 1) * d; R[i] = (irRnd() * 2 - 1) * d; }
        const verb = new T.Convolver(T.ToneAudioBuffer.fromArray([L, R]));
        verb.connect(new T.Gain(0.6).connect(filter));
        verbIn = new T.Gain(FX.verb).connect(verb);
        keysHP.connect(verbIn);
        drums.connect(new T.Gain(0.25).connect(verbIn));
      }
      if (FX.delay) {
        const pp = new T.PingPongDelay({ delayTime: FX.delay * STEP, feedback: FX.fb, wet: 1 });
        const send = new T.Gain(FX.dmix * ((tr.preset && tr.preset.send) || 1));
        keysHP.connect(send);
        send.chain(new T.Filter({ type: 'highpass', frequency: 300 }), pp, new T.Filter({ type: 'lowpass', frequency: 2600 }), filter);
      }
      if (FX.crackle) {
        new T.Noise({ type: 'pink', volume: dB(0.02 * FX.crackle) }).start(0)
          .connect(new T.Filter({ type: 'bandpass', frequency: 5000, Q: 0.5 }).connect(master));
      }
      const pan = (p) => new T.Panner(p);

      /* ---- the drums: the kit's samples, played ---- */
      const [kf0, kf1, kdec] = KIT.kick;
      const kickSyn = new T.MembraneSynth({ pitchDecay: 0.045, octaves: kf0 / kf1, oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: kdec * 1.25, sustain: 0, release: 0.05 }, volume: -1 }).connect(drums);
      const into = (node) => node.input || node;
      function hit(buf, t, g, dest, rate) {
        const src = raw.createBufferSource(); src.buffer = buf;
        if (rate) src.playbackRate.value = rate;
        const v = raw.createGain(); v.gain.value = g;
        src.connect(v); v.connect(into(dest)); src.start(Math.max(0, t));
      }
      const lane = (p) => new T.Gain(1).connect(p ? pan(p).connect(drums) : drums);
      const hatsIn = lane(-0.18), openIn = lane(0.16), crashIn = lane(0.22), snareIn = lane(0), ghostIn = lane(-0.08);
      /* the percussion drifts slowly across the field, two bars a sweep */
      const panHz = 1 / (BAR * 2);
      const percIn = new T.Gain(1).connect(sync(new T.AutoPanner({ frequency: panHz, depth: 0.45 }).start(), panHz).connect(drums));
      if (KIT.snare === 'gated' && verbIn) snareIn.connect(verbIn);       // the eighties: a big snare in a big room
      const crackleIn = FX.crackle ? new T.Gain(1).connect(master) : null;
      /* the added percussion: the hand drums on the other side from the main
         percussion, the ride high on the right, the toms across the kit */
      const layerIn = lane(-(K.percPan || 0.3) * 1.2);
      /* (lo-fi plays the ride with brushes: softer, darker) */
      const rideIn = (EXTRAS[tr.style] || {}).brush ? new T.Gain(0.55).connect(new T.Filter({ type: 'lowpass', frequency: 2600 }).connect(pan(0.28).connect(drums))) : lane(0.28);
      const tomIn = { tomHi: lane(0.3), tomMid: lane(0), tomLo: lane(-0.3) };
      const shade = () => 0.985 + rnd() * 0.03;                        // a hair of pitch, never the same twice
      function kick(t, g) {
        if (LOG) LOG.push({ bar: curBar, t: +(t + off).toFixed(3), part: 'kick', g: +g.toFixed(3) });
        if (K.kickReal) { hit(K.kickReal, t, Math.min(1, 0.85 * g / 0.95), drums); kickSyn.triggerAttackRelease(kf1, kdec, t, Math.min(1, 0.45 * g / 0.95)); return; }
        kickSyn.triggerAttackRelease(kf1, kdec, t, Math.min(1, g / 0.95));
        if (KIT.click) hit(K.click, t, Math.min(1, g / 0.95), drums);
      }
      const hat = (t, g) => hit(K.hatC2 && rnd() < 0.4 ? K.hatC2 : K.hatC, t, Math.min(1.2, g / 0.12), hatsIn, shade());
      const openHat = (t, g) => hit(K.hatO, t, Math.min(1.2, g / 0.12), openIn, shade());
      const crash = (t) => hit(K.crash, t, 0.9, crashIn);
      function snare(t, g, ghost) {
        g *= 1.2;
        if (ghost) { hit(K.ghost, t, Math.min(1.2, g / 0.5), ghostIn, shade()); return; }
        hit(K.snare2 && rnd() < 0.35 ? K.snare2 : K.snare, t, Math.min(1.2, g / 0.6), snareIn);
      }
      const perc = (t, g) => hit(K.perc, t, Math.min(1.2, g / 0.12), percIn, shade());
      /* the riser over a build: noise through a band that climbs (a few a side) */
      const riserF = new T.Filter({ type: 'bandpass', frequency: 400, Q: 1.2 }).connect(drums);
      const riser = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.4, decay: 0.1, sustain: 1, release: 0.05 }, volume: -6 }).connect(riserF);
      function noise(t, dur, g, type, freq, q, to, dest) {
        if (dest === master) { if (crackleIn) hit(K.crackle, t, 1, crackleIn, shade()); return; }
        riserF.frequency.setValueAtTime(freq, t);
        if (to) riserF.frequency.exponentialRampToValueAtTime(to, t + dur);
        riser.triggerAttackRelease(dur, t, Math.min(1, g / 0.36));
      }

      /* ---- the bass: a sub, and the style's tone driven over it ---- */
      const subSyn = new T.Synth({ oscillator: { type: 'custom', partials: [1, 0.22, 0.1] },
        envelope: { attack: 0.008, decay: 0.08, sustain: 0.9, release: 0.06 }, volume: -8 }).connect(low);
      const tone = tr.bassTone;
      /* the 303: a saw through a resonant filter that snaps shut, sliding note to note */
      const midSyn = tone === 'sub' ? null : tone === 'acid' ? new T.MonoSynth({ portamento: 0.035, oscillator: { type: 'sawtooth' },
        filter: { type: 'lowpass', Q: 14, rolloff: -24 },
        filterEnvelope: { attack: 0.003, decay: 0.17, sustain: 0.06, release: 0.08, baseFrequency: 130, octaves: 3.6 },
        envelope: { attack: 0.003, decay: 0.2, sustain: 0.6, release: 0.05 }, volume: -12
      }) : new T.MonoSynth({
        oscillator: tone === 'reese' ? { type: 'fatsawtooth', count: 2, spread: 28 } : { type: tone === 'square' ? 'square' : 'sawtooth' },
        filter: { type: 'lowpass', Q: 5, rolloff: -24 },
        filterEnvelope: { attack: 0.005, decay: 0.25, sustain: 0.25, release: 0.1, baseFrequency: 220, octaves: 2.3 },
        envelope: { attack: 0.008, decay: 0.2, sustain: 0.75, release: 0.06 }, volume: -10
      });
      if (midSyn) midSyn.chain(new T.Distortion({ distortion: 0.35, oversample: 'none' }), new T.Filter({ type: 'highpass', frequency: 110 }), low);
      const bassPlayer = tr.realBass ? sampler(tr.realBass, { release: 0.25 }) : null;
      if (bassPlayer) bassPlayer.chain(new T.Filter({ type: 'highpass', frequency: 55 }), low);
      function bass(t, f0, g, dur, acc, slide) {
        if (LOG) LOG.push({ bar: curBar, t: +(t + off).toFixed(3), part: 'bass', f: Math.round(f0), g: +g.toFixed(4), dur: +dur.toFixed(3) });
        const v = Math.min(1, (g / 0.42) * (acc ? 1.2 : 1));
        if (tone === 'acid' && midSyn) {
          midSyn.portamento = slide ? 0.07 : 0.02;
          midSyn.filterEnvelope.octaves = acc ? 4.4 : 3.4;
          midSyn.filterEnvelope.baseFrequency = 130 * (0.65 + 0.9 * (0.5 - 0.5 * Math.cos(2 * Math.PI * curBar / 16)));
        }
        if (bassPlayer) {
          /* a bass player: the recording over the sub, the synth layer resting */
          subSyn.triggerAttackRelease(f0, dur, t, v * 0.6 * (SUB[tr.style] || 1));
          bassPlayer.triggerAttackRelease(f0 * 2, Math.max(dur, STEP), t, v);
          return;
        }
        subSyn.triggerAttackRelease(f0, dur, t, v * (tone === 'sub' ? 1 : 0.75) * (SUB[tr.style] || 1));
        if (midSyn) midSyn.triggerAttackRelease(f0, dur, t, v * (tone === 'reese' ? 0.8 : 1));
      }

      /* ---- the chords ---- */
      const padTone = tr.padTone;
      /* the pads breathe: a filter opening and closing over four bars, and
         spread wide across the stereo field */
      const sweepHz = 1 / (BAR * 4);
      const padAir = sync(new T.AutoFilter({ frequency: sweepHz, baseFrequency: 500, octaves: 2.8, depth: 0.55, wet: 0.75 }).start(), sweepHz);
      padAir.chain(new T.StereoWidener(0.7), keys);
      const toneF = () => new T.Filter({ type: 'lowpass', frequency: padTone === 'dark' ? 1400 : padTone === 'strings' ? 2600 : 7000 }).connect(padAir);
      /* a few voices of one instrument taking turns: the chords' polyphony,
         without a PolySynth building and discarding voices all the way through */
      const pool = (make, n) => {
        const v = Array.from({ length: n }, make);
        let k = 0;
        return {
          connect(d) { v.forEach((x) => x.connect(d)); return this; },
          chain(...nodes) { this.connect(nodes[0]); for (let i = 1; i < nodes.length; i++) nodes[i - 1].connect(nodes[i]); return this; },
          triggerAttackRelease(notes, dur, t, vel) {
            (Array.isArray(notes) ? notes : [notes]).forEach((f) => { v[k].triggerAttackRelease(f, dur, t, vel); k = (k + 1) % n; });
          }
        };
      };
      /* plucked strings: Tone's PluckSynth (15.1) takes no velocity, so each
         voice goes through a gain of its own, set as it is plucked */
      const plucks = (opts, n) => {
        const v = Array.from({ length: n }, () => { const s = new T.PluckSynth(opts), g = new T.Gain(1); s.connect(g); return { s, g }; });
        let k = 0;
        return {
          connect(d) { v.forEach((x) => x.g.connect(d)); return this; },
          chain(...nodes) { this.connect(nodes[0]); for (let i = 1; i < nodes.length; i++) nodes[i - 1].connect(nodes[i]); return this; },
          triggerAttackRelease(notes, dur, t, vel) {
            (Array.isArray(notes) ? notes : [notes]).forEach((f) => {
              const x = v[k]; k = (k + 1) % n;
              x.g.gain.setValueAtTime(vel == null ? 1 : Math.max(0, vel), t);
              x.s.triggerAttack(f, t);
            });
          }
        };
      };
      const PRF = PROFILES[tr.profile || tr.style] || PROFILES.house;
      const PS = tr.preset || { atk: 1, cut: 1, res: 1, spread: 1, send: 1, bell: 3.5 };
      const ML = (tr.mel && tr.mel.L) || 2;              // the motif's length in bars
      /* a voice's vowel: three resonances over a buzzing source */
      function vowel(f1, f2, f3) {
        const inp = new T.Gain(1), sum = new T.Gain(1).connect(keys);
        [[f1, 1, 6], [f2, 0.55, 8], [f3, 0.3, 10]].forEach(([f, gain, q]) =>
          inp.connect(new T.Filter({ type: 'bandpass', frequency: f, Q: q }).connect(new T.Gain(gain * 2.2).connect(sum))));
        return inp;
      }
      const fat = (w, spread, env, vol, n) => pool(() => new T.Synth({ oscillator: { type: 'fat' + w, count: 3, spread }, envelope: env, volume: vol }), n || 8);
      const wave = tr.wave;
      const padSyn = fat(wave, padTone === 'strings' ? 30 : 14, { attack: padTone === 'strings' ? 0.95 : 0.6, decay: 0.4, sustain: 0.8, release: 1.2 }, -20).connect(toneF());
      const stabSyn = fat(wave, 14, { attack: 0.005, decay: 0.22, sustain: 0.25, release: 0.18 }, -18).connect(toneF());
      const stringSyn = fat('sawtooth', 30, { attack: 1.2, decay: 0.5, sustain: 0.8, release: 1.4 }, -24)
        .connect(new T.Filter({ type: 'lowpass', frequency: 2600 }).connect(keys));
      /* the trance gate: the held chords chopped on the sixteenths */
      const gateHz = 1 / (STEP * 2);
      const gateSyn = RHYTHMS[tr.rhythm] && RHYTHMS[tr.rhythm].gated
        ? fat(wave, 18, { attack: 0.02, decay: 0.3, sustain: 0.85, release: 0.3 }, -17, 8)
            .connect(sync(new T.Tremolo({ frequency: gateHz, type: 'square', depth: 0.92, spread: 0 }).start(), gateHz).connect(toneF()))
        : null;
      const buildSyn = fat('square', 10, { attack: 0.3, decay: 0.2, sustain: 0.8, release: 0.2 }, -26).connect(keys);
      /* an electric piano: FM, the bell of a Rhodes at the start of each note */
      const rhodes = pool(() => new T.FMSynth({ harmonicity: 1, modulationIndex: 3.2, oscillator: { type: 'sine' }, modulation: { type: 'sine' },
        envelope: { attack: 0.005, decay: 1.6, sustain: 0.25, release: 1.2 },
        modulationEnvelope: { attack: 0.002, decay: 0.5, sustain: 0.05, release: 0.6 }, volume: -14 }), 8)
        .connect(sync(new T.Tremolo({ frequency: 3.6, depth: 0.32, spread: 160 }).start(), 3.6).connect(keys));
      function keysNote(t, f0, g, dur) { rhodes.triggerAttackRelease(f0, dur, t, Math.min(1, g / 0.07)); }
      function chord(t, notes, g, dur, attack, type, toneName) {
        if (LOG) LOG.push({ bar: curBar, t: +(t + off).toFixed(3), part: 'chords', f: Math.round(notes[0]), n: notes.length, g: +g.toFixed(4), dur: +dur.toFixed(3) });
        const syn = type === 'square' ? buildSyn : toneName === 'strings' ? stringSyn : attack >= 0.1 ? padSyn : stabSyn;
        syn.triggerAttackRelease(notes, dur, t, Math.min(1, g / 0.07));
      }

      /* ---- the leads: the track's voice, and the one a later drop hands it to ---- */
      /* vibrato that comes in late, as a singer's does: none at the start of
         a note, opening over its first half-second, only on held notes */
      function vibrato(v, t, dur) {
        v.depth.cancelScheduledValues(t);
        v.depth.setValueAtTime(0, t);
        if (dur > 0.3) v.depth.linearRampToValueAtTime(0.1, t + Math.min(0.5, dur * 0.6));
      }
      const SYNTH_LEADS = { pluck: 1, supersaw: 1, bell: 1, acid: 1, keys: 1, sawlead: 1, squarelead: 1 };   // these names are synth voices first
      /* a recorded lead whose recordings did not come: the synth of its own
         family, not one voice for all (a wind by a breathy sine, a bow by a
         soft saw, a mallet or a bell by the FM bell) */
      const LEAD_FALL = { wind: 'flute', bowed: 'sawlead', keys: 'keys', pluck: 'pluck', strum: 'pluck', chop: 'pluck', stab: 'brass', ring: 'bell', figure: 'bell', bass: 'pluck' };
      function makeLead(lv, role, synthOnly) {
        if (!synthOnly && SAMPLED[lv] && !SYNTH_LEADS[lv]) {
          /* a player's breath and bow: winds swell into a note, strings lean
             into it, and a held note opens into vibrato a moment after it starts */
          const fam = SAMPLED[lv].fam, breathes = fam === 'wind' || fam === 'bowed';
          const sm = sampler(lv, { release: 0.5, attack: fam === 'bowed' ? 0.09 : fam === 'wind' ? 0.03 : 0 });
          if (!sm) {
            const fb = lv === 'organ' ? 'organ' : LEAD_FALL[SAMPLED[lv].fam] || 'pluck';
            if (role) resolved[role] = { want: lv, played: 'synth:' + fb, source: 'synth', reason: 'recordings did not load' };
            return makeLead(lv === 'organ' ? 'organ-synth' : fb, null, true);
          }
          if (role) resolved[role] = { want: lv, played: lv, source: (window.TONE_SAMPLES[srcOf(lv)] || {}).dir || 'tonejs-instruments' };
          const vib = breathes ? sync(new T.Vibrato({ frequency: 5.2, depth: 0, wet: 1 }), 5.2) : null;
          sm.chain(...fxOf(lv), ...(vib ? [vib] : []), keys);
          const k = SAMPLED[lv].oct / 2;                 // a lead line sits an octave or so under the synth leads
          return Object.assign((t, f0, g, dur) => {
            const d = Math.max(dur, STEP * 2);
            if (vib) vibrato(vib, t, d);
            sm.triggerAttackRelease(f0 * k, d, t, Math.min(1, g / 0.04));
          }, { mul: k });
        }
        if (role && !resolved[role]) resolved[role] = { want: lv, played: lv, source: 'synth' };
        if (lv === 'keys') return (t, f0, g, dur) => rhodes.triggerAttackRelease(f0, Math.max(dur, 0.6), t, Math.min(1, (g / 0.04) * 0.8));
        if (lv === 'wurli') { const w = wurliVoice(); return (t, f0, g, dur) => w.triggerAttackRelease(f0, Math.max(dur, 0.4), t, Math.min(1, (g / 0.04) * 0.85)); }
        const syn = lv === 'pluck' ? plucks({ attackNoise: 1.2, dampening: 4200 * PS.cut, resonance: Math.min(0.97, 0.92 * (0.97 + 0.03 * PS.res)), volume: -6 }, 3)
          /* minimal's blip: a tone whose pitch drops as it is struck, short */
          : lv === 'blip' ? pool(() => new T.MembraneSynth({ pitchDecay: 0.012, octaves: 1.2, oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.16 * PS.atk, sustain: 0, release: 0.05 }, volume: -12 }), 3)
          /* a vocal chop, for tech house's short motifs */
          : lv === 'vox' ? pool(() => new T.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.005, decay: 0.12, sustain: 0.3, release: 0.08 }, volume: -15 }), 4)
          /* the organ without its recordings: drawbars (a fundamental, the octave and twelfth), a slow rotor */
          : lv === 'organ-synth' ? pool(() => new T.Synth({ oscillator: { type: 'custom', partials: [1, 0.7, 0.45, 0, 0.25, 0, 0, 0.12] }, envelope: { attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.12 }, volume: -20 }), 4)
          /* a flute's breath: a sine, a little air, vibrato late */
          : lv === 'flute' ? pool(() => new T.Synth({ oscillator: { type: 'custom', partials: [1, 0.12, 0.05] }, envelope: { attack: 0.06, decay: 0.2, sustain: 0.8, release: 0.25 }, volume: -16 }), 3)
          /* brass: a saw opening through its filter as it is blown */
          : lv === 'brass' ? pool(() => new T.MonoSynth({ oscillator: { type: 'sawtooth' }, filter: { type: 'lowpass', Q: 2, rolloff: -24 },
              filterEnvelope: { attack: 0.04, decay: 0.25, sustain: 0.4, release: 0.2, baseFrequency: 350, octaves: 3 },
              envelope: { attack: 0.03, decay: 0.2, sustain: 0.6, release: 0.2 }, volume: -18 }), 4)
          : lv === 'supersaw' ? pool(() => new T.Synth({ oscillator: { type: 'fatsawtooth', count: 5, spread: 40 * PS.spread }, envelope: { attack: 0.004 * PS.atk, decay: 0.2, sustain: 0.3, release: 0.15 }, volume: -22 }), 4)
          : lv === 'bell' ? pool(() => new T.FMSynth({ harmonicity: PS.bell, modulationIndex: 12, envelope: { attack: 0.002, decay: 0.9, sustain: 0, release: 0.6 },
              modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.4 }, volume: -16 }), 4)
          /* held leads, not struck ones: a saw gliding note to note through a
             filter that opens on each, and a hollow square with a singer's vibrato */
          : lv === 'sawlead' ? new T.MonoSynth({ portamento: 0.045, oscillator: { type: 'fatsawtooth', count: 2, spread: 14 * PS.spread },
              filter: { type: 'lowpass', Q: 3 * PS.res, rolloff: -24 },
              filterEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.5, release: 0.3, baseFrequency: 700 * PS.cut, octaves: 2.6 },
              envelope: { attack: 0.02 * PS.atk, decay: 0.2, sustain: 0.85, release: 0.25 }, volume: -19 })
          : lv === 'squarelead' ? new T.MonoSynth({ portamento: 0.03, oscillator: { type: 'square' },
              filter: { type: 'lowpass', Q: 1.5, rolloff: -12 },
              filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.2, baseFrequency: 900 * PS.cut, octaves: 2 },
              envelope: { attack: 0.015, decay: 0.15, sustain: 0.8, release: 0.2 }, volume: -22 })
          : lv === 'acid' ? new T.MonoSynth({ oscillator: { type: 'sawtooth' }, filter: { type: 'lowpass', Q: 12 * PS.res, rolloff: -24 },
              filterEnvelope: { attack: 0.003, decay: 0.18, sustain: 0.1, release: 0.1, baseFrequency: 260 * PS.cut, octaves: 3.4 },
              envelope: { attack: 0.003, decay: 0.15, sustain: 0.5, release: 0.05 }, volume: -16 })
          : pool(() => new T.Synth({ oscillator: { type: 'custom', partials: [1, 0.45, 0.2, 0.1] }, envelope: { attack: 0.005, decay: 0.1, sustain: 0.8, release: 0.08 }, volume: -18 }), 4);
        const vib = lv === 'sawlead' || lv === 'squarelead' || lv === 'flute' ? sync(new T.Vibrato({ frequency: 5.5, depth: 0, wet: 1 }), 5.5) : null;
        if (lv === 'supersaw') syn.connect(new T.Filter({ type: 'lowpass', frequency: 3200 * PS.cut }).connect(keys));
        else if (lv === 'vox') syn.connect(vowel(570, 840, 2410));
        else if (vib) syn.chain(vib, keys);
        else syn.connect(keys);
        const HALF = { acid: 1, blip: 1, vox: 1, flute: 1, 'organ-synth': 1, brass: 1 };
        return Object.assign((t, f0, g, dur, accent, slide) => {
          const v = Math.min(1, (g / 0.04) * (accent ? 1.15 : 1));
          if (lv === 'acid') {
            /* the 303: a slide glides into its note, an accent opens the filter wider; the cutoff wanders over sixteen bars */
            syn.portamento = slide ? 0.06 : 0;
            syn.filterEnvelope.octaves = accent ? 4.2 : 3.2;
            syn.filterEnvelope.baseFrequency = 260 * PS.cut * (0.6 + 0.9 * (0.5 - 0.5 * Math.cos(2 * Math.PI * curBar / 16)));
            syn.triggerAttackRelease(f0 / 2, dur, t, accent ? 1 : v * 0.75);
          }
          else if (lv === 'blip') syn.triggerAttackRelease(f0 / 2, Math.min(dur, 0.2), t, v);
          else if (lv === 'vox') syn.triggerAttackRelease(f0 / 2, Math.min(dur, STEP * 1.2), t, v);
          else if (lv === 'pluck') syn.triggerAttackRelease(f0, dur, t, v);
          else if (lv === 'flute') { const d = Math.max(dur, STEP * 1.6); vibrato(vib, t, d); syn.triggerAttackRelease(f0 / 2, d, t, v); }
          else if (lv === 'organ-synth' || lv === 'brass') syn.triggerAttackRelease(f0 / 2, dur, t, v);
          else if (vib) { const d = Math.max(dur, STEP * 1.6); vibrato(vib, t, d); syn.triggerAttackRelease(f0 / 2, d, t, v); }
          else syn.triggerAttackRelease(f0, lv === 'bell' ? Math.max(dur, 0.5) : dur, t, v);
        }, { mul: HALF[lv] || vib ? 0.5 : 1 });
      }
      const bassPlayerOk = !tr.realBass || !!SM[srcOf(tr.realBass)];
      if (tr.realBass) resolved.bass = { want: tr.realBass, played: bassPlayerOk ? tr.realBass : 'synth bass', source: bassPlayerOk ? 'tonejs-instruments' : 'synth', reason: bassPlayerOk ? undefined : 'recordings did not load' };
      /* (tests only: with tr.log an array, every note played is written down - bar, step, part, pitch, level, length) */
      const LOG = Array.isArray(tr.log) ? tr.log : null;
      const logged = (part, fn) => (LOG ? (t, f0, g, dur, ...x) => { LOG.push({ bar: curBar, t: +(t + off).toFixed(3), part, f: Math.round(f0 * (fn.mul || 1)), g: +g.toFixed(4), dur: +dur.toFixed(3) }); return fn(t, f0, g, dur, ...x); } : fn);
      const lead1 = logged('lead', makeLead(tr.leadVoice, 'lead'));
      const lead2 = tr.lead2 && tr.lead2 !== tr.leadVoice ? logged('lead2', makeLead(tr.lead2, 'lead2')) : lead1;
      let lead = lead1;                                  // which one plays, set per bar

      /* ---- the counter-melody: a second instrument with a part of its own ---- */
      /* (a recorded voice whose recordings did not load is played by the
         synth nearest it: a bell by the vibes, a mallet by the marimba) */
      const cv = SAMPLED[tr.counter] && !SM[srcOf(tr.counter)] && tr.counter !== 'piano'
        ? ({ ring: 'vibes', figure: 'kalimba', pluck: 'marimba', keys: 'piano', chop: 'guitar', strum: 'guitar' }[SAMPLED[tr.counter].fam] || 'flute')
        : tr.counter;
      const realCv = SAMPLED[cv] && SM[srcOf(cv)];
      if (tr.counter) resolved.counter = { want: tr.counter, played: cv, source: realCv ? (window.TONE_SAMPLES[srcOf(cv)] || {}).dir || 'tonejs-instruments' : 'synth',
        reason: cv !== tr.counter ? 'recordings did not load' : undefined };
      const formant = (f1, f2, f3) => {
        /* a voice's vowel: three resonances over a buzzing source */
        const inp = new T.Gain(1), sum = new T.Gain(1).connect(keys);
        [[f1, 1, 6], [f2, 0.55, 8], [f3, 0.3, 10]].forEach(([f, gain, q]) =>
          inp.connect(new T.Filter({ type: 'bandpass', frequency: f, Q: q }).connect(new T.Gain(gain * 2.2).connect(sum))));
        return inp;
      };
      /* the Wurlitzer: a reedier electric piano than the Rhodes, a tremolo on it */
      function wurliVoice() {
        return pool(() => new T.FMSynth({ harmonicity: 1, modulationIndex: 6, oscillator: { type: 'sine' },
          envelope: { attack: 0.002, decay: 0.9, sustain: 0.15, release: 0.4 },
          modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0.1, release: 0.3 }, volume: -16 }), 6)
          .connect(sync(new T.Tremolo({ frequency: 4.8, depth: 0.35 }).start(), 4.8).connect(keys));
      }
      const pat = { wurli: 'piano', clav: 'guitar' }[cv] || cv;   // the part each new voice plays
      const counterSyn = !cv || realCv ? null
        : cv === 'piano' ? pool(() => new T.FMSynth({ harmonicity: 3, modulationIndex: 8, oscillator: { type: 'sine' },
            envelope: { attack: 0.002, decay: 1.4, sustain: 0.08, release: 0.9 },
            modulationEnvelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.4 }, volume: -15 }), 6).connect(keys)
        : cv === 'marimba' ? pool(() => new T.FMSynth({ harmonicity: 4, modulationIndex: 2.2, oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.3 },
            modulationEnvelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.1 }, volume: -11 }), 4).connect(keys)
        : cv === 'brass' ? pool(() => new T.MonoSynth({ oscillator: { type: 'sawtooth' }, filter: { type: 'lowpass', Q: 2, rolloff: -24 },
            filterEnvelope: { attack: 0.04, decay: 0.25, sustain: 0.4, release: 0.2, baseFrequency: 350, octaves: 3 },
            envelope: { attack: 0.03, decay: 0.2, sustain: 0.6, release: 0.2 }, volume: -17 }), 6).connect(keys)
        : cv === 'choir' ? pool(() => new T.Synth({ oscillator: { type: 'fatsawtooth', count: 3, spread: 22 },
            envelope: { attack: 0.7, decay: 0.4, sustain: 0.85, release: 1.5 }, volume: -19 }), 6).connect(formant(730, 1090, 2440))
        : cv === 'vox' ? pool(() => new T.Synth({ oscillator: { type: 'sawtooth' },
            envelope: { attack: 0.01, decay: 0.16, sustain: 0.25, release: 0.12 }, volume: -15 }), 4).connect(formant(570, 840, 2410))
        : cv === 'kalimba' ? pool(() => new T.FMSynth({ harmonicity: 5.4, modulationIndex: 3, oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 0.8, sustain: 0, release: 0.4 },
            modulationEnvelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.1 }, volume: -12 }), 4).connect(keys)
        : cv === 'guitar' ? plucks({ attackNoise: 0.8, dampening: 2600, resonance: 0.82, volume: -8 }, 4).connect(keys)
        : cv === 'wurli' ? wurliVoice()
        : cv === 'clav' ? pool(() => new T.Synth({ oscillator: { type: 'pulse', width: 0.18 }, envelope: { attack: 0.001, decay: 0.16, sustain: 0.04, release: 0.05 }, volume: -21 }), 6)
            .connect(new T.Filter({ type: 'highpass', frequency: 320, Q: 0.8 }).connect(new T.AutoWah({ baseFrequency: 400, octaves: 3, sensitivity: -32, Q: 2, wet: 0.6 }).connect(keys)))
        : cv === 'vibes' ? pool(() => new T.FMSynth({ harmonicity: 4, modulationIndex: 1.4, oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 1.8, sustain: 0, release: 1 },
            modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 }, volume: -14 }), 4)
            .connect(sync(new T.Tremolo({ frequency: 5.5, depth: 0.4 }).start(), 5.5).connect(keys))
        : pool(() => new T.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.07, decay: 0.2, sustain: 0.8, release: 0.25 }, volume: -16 }), 3)
            .connect(sync(new T.Vibrato({ frequency: 5.2, depth: 0.08, wet: 1 }), 5.2).connect(keys));     // a flute
      const realCounter = realCv ? sampler(cv, SAMPLED[cv].hold ? { attack: 0.05, release: 1.2 } : SAMPLED[cv].fam === 'ring' ? { release: 1.4 } : SAMPLED[cv].fam === 'bowed' ? { attack: 0.18, release: 1 } : {}) : null;
      if (realCounter) realCounter.chain(...fxOf(cv), keys);
      if (LOG) [realCounter, counterSyn].forEach((o) => {
        if (!o) return;
        const tar = o.triggerAttackRelease.bind(o);
        o.triggerAttackRelease = (n, d, t, v) => { (Array.isArray(n) ? n : [n]).forEach((f) => LOG.push({ bar: curBar, t: +(t + off).toFixed(3), part: 'counter', f: Math.round(f), g: +(v || 0).toFixed(3), dur: +d.toFixed(3) })); return tar(n, d, t, v); };
      });
      /* the counter-melody's line for this bar (its two-bar line, the varied
         one, the line again, the sparse answer) and the comp's rhythm (the
         profile's, one for four bars and another for the next four) */
      const cLine = (barIndex) => { const ph = Math.floor(barIndex / 2) % 4, L = ph === 1 ? tr.cp.A2 : ph === 3 ? tr.cp.B : tr.cp.A, o = (barIndex % 2) * 8; return L.slice(o, o + 8); };
      const cComp = (barIndex) => tr.comp[Math.floor(barIndex / 4) % 2];
      function realCounterAt(t, s16, ch, g, barIndex) {
        const R = SAMPLED[cv], k = R.oct, v = (x) => Math.min(1, x * g);
        const tones = ch.notes.concat([ch.top]).map((h) => h * k), line = cLine(barIndex);
        if (R.fam === 'keys') {
          const hits = R.hold ? [0] : cComp(barIndex);
          if (has(hits, s16)) realCounter.triggerAttackRelease(ch.notes.map((h) => h * k), R.hold ? BAR * 0.98 : STEP * 3, t, v(0.75));
        } else if (R.fam === 'pluck') {
          if (s16 % 2 === 0 && line[s16 / 2] >= 0) realCounter.triggerAttackRelease(tones[line[s16 / 2]], STEP * 2, t, v(s16 % 4 ? 0.7 : 0.82));
        } else if (R.fam === 'strum') {
          /* down, down-up: the strings a few milliseconds apart, the up-strokes reversed */
          const hits = { 0: 1, 6: -1, 8: 1, 12: -1, 14: 1 };
          if (hits[s16]) (hits[s16] > 0 ? ch.notes : ch.notes.slice().reverse()).forEach((h, i) => realCounter.triggerAttackRelease(h * k, STEP * 2, t + i * 0.012, v(hits[s16] > 0 ? 0.75 : 0.55)));
        } else if (R.fam === 'chop') {
          if (has(cComp(barIndex), s16)) realCounter.triggerAttackRelease(tones[line[s16 >> 1] >= 0 ? line[s16 >> 1] : (s16 >> 1) % 3], STEP * 0.8, t, v(0.75));
        } else if (R.fam === 'stab') {
          if (has(cComp(barIndex), s16)) realCounter.triggerAttackRelease(ch.notes.map((h) => h * k), STEP * 1.4, t, v(0.8));
        } else if (R.fam === 'ring') {
          /* bells and vibes: chord tones on the beat, left to ring - and
             damped as the chord changes, so the last one does not ring on
             under the new */
          if (s16 === 0 && barIndex % tr.bpc === 0) realCounter.releaseAll(t);
          if (s16 % 4 === 0 && line[s16 / 2] >= 0) realCounter.triggerAttackRelease(tones[line[s16 / 2]], BEAT * 1.5, t, v(0.7));
        } else if (R.fam === 'figure') {
          /* a thumb piano's or a zither's little figure of its own over two beats, repeating */
          const FIG = Math.floor(barIndex / 2) % 4 === 3 ? [0, 3, 6, 10, 12] : [0, 3, 6, 8, 11];
          if (has(FIG, s16)) { const n = line[FIG.indexOf(s16) + 1]; if (n >= 0) realCounter.triggerAttackRelease(tones[n], STEP * 2, t, v(0.8)); }
        } else if (R.fam === 'bowed') {
          /* long notes, two beats each, along the counter line */
          if (s16 % 8 === 0) { const n = line[s16 / 2]; if (n >= 0) realCounter.triggerAttackRelease(tones[n], BEAT * 2, t, v(0.8)); }
        } else if (s16 % 2 === 0) {
          /* a wind answers the lead, in the gaps of its hook, notes held a little */
          const n = line[s16 / 2], hook = tr.hook[s16 / 2];
          if (n >= 0 && (hook < 0 || !tr.lead)) realCounter.triggerAttackRelease(tones[n], STEP * 2.6, t, v(0.8));
        }
      }
      function counterAt(t, s16, ch, g, barIndex) {
        if (realCounter) { realCounterAt(t, s16, ch, g, barIndex); return; }
        if (!counterSyn) return;
        const tones = ch.notes.concat([ch.top]);
        const line = cLine(barIndex);
        const v = (x) => Math.min(1, x * g);
        if (pat === 'piano') {
          const hits = cComp(barIndex);
          if (has(hits, s16)) counterSyn.triggerAttackRelease(ch.notes, STEP * 3, t, v(0.75));
        } else if (pat === 'vibes') {
          /* the vibraphone: chord tones on the beat, left to ring */
          if (s16 % 4 === 0 && line[s16 / 2] >= 0) counterSyn.triggerAttackRelease(tones[line[s16 / 2]] * 2, BEAT * 1.5, t, v(0.7));
        } else if (pat === 'marimba') {
          if (s16 % 2 === 0 && line[s16 / 2] >= 0) counterSyn.triggerAttackRelease(tones[line[s16 / 2]] * 2, STEP * 1.5, t, v(s16 % 4 ? 0.7 : 0.82));
        } else if (pat === 'brass') {
          if (has(cComp(barIndex), s16)) counterSyn.triggerAttackRelease(ch.notes.map((h) => h * 2), STEP * 1.4, t, v(0.8));
        } else if (pat === 'choir') {
          if (s16 === 0 && barIndex % 2 === 0) counterSyn.triggerAttackRelease(ch.notes.map((h) => h * 2), BAR * 2, t, v(0.8));
        } else if (pat === 'kalimba') {
          /* a little figure of its own over two beats, repeating */
          const FIG = Math.floor(barIndex / 2) % 4 === 3 ? [0, 3, 6, 10, 12] : [0, 3, 6, 8, 11];
          if (has(FIG, s16)) { const n = line[FIG.indexOf(s16) + 1]; if (n >= 0) counterSyn.triggerAttackRelease(tones[n] * 2, STEP * 2, t, v(0.8)); }
        } else if (pat === 'guitar') {
          /* muted guitar: a funk chop on the chord tones */
          if (has(cComp(barIndex), s16)) counterSyn.triggerAttackRelease(tones[line[s16 >> 1] >= 0 ? line[s16 >> 1] : (s16 >> 1) % 3], STEP, t, v(0.75));
        } else if (pat === 'vox') {
          if (has([2, 7, 11, 14], s16)) { const n = line[(s16 >> 1) % 8]; if (n >= 0) counterSyn.triggerAttackRelease(tones[n] * 2, STEP * 1.2, t, v(0.85)); }
        } else if (s16 % 2 === 0) {
          /* the flute answers: it plays where the lead's hook rests */
          const n = line[s16 / 2], hook = tr.hook[s16 / 2];
          if (n >= 0 && (hook < 0 || !tr.lead)) counterSyn.triggerAttackRelease(tones[n] * 2, STEP * 1.8, t, v(0.8));
        }
      }

      /* ---- the answer: an instrument replying to the hook ----------------
         at the end of a phrase, where the melody holds or rests: the horns'
         stab, the strings' stab, a guitar's or a sax's lick on the hook's own
         notes a third up, or a vocal chop stuttering one note */
      const RV = tr.resp;
      const tp = RV === 'brass-hit' ? sampler('trumpet', { volume: -15, release: 0.25 }) : null;
      const tb = RV === 'brass-hit' ? sampler('trombone', { volume: -15, release: 0.25 }) : null;
      const vs = RV === 'string-stab' ? sampler('violin', { volume: -14, release: 0.2 }) : null;
      [tp, tb, vs].forEach((x) => { if (x) x.connect(keys); });
      const lick = RV === 'guitar-lick' ? makeLead('guitar-electric') : RV === 'sax-lick' ? makeLead('saxophone') : null;
      const chopV = RV === 'vox-chop' ? pool(() => new T.Synth({ oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.004, decay: 0.09, sustain: 0.2, release: 0.05 }, volume: -16 }), 4).connect(formant(660, 1700, 2600)) : null;
      function respondAt(t, s16, ch, g, slot0, phrase) {
        if (!RV || slot0 % 16 !== 8 || s16 < 12) return;
        if (typeof phrase[slot0 + 6] === 'number' || typeof phrase[slot0 + 7] === 'number') return;   // the melody is still talking
        const v = Math.min(1, g);
        if (RV === 'brass-hit' && s16 === 14) {
          const n = ch.notes.map((h) => h * 2);
          if (tp) tp.triggerAttackRelease(n, STEP * 1.3, t, v);
          if (tb) tb.triggerAttackRelease(n.map((h) => h / 2), STEP * 1.3, t, v * 0.8);
        } else if (RV === 'string-stab' && (s16 === 12 || s16 === 14)) {
          if (vs) vs.triggerAttackRelease(ch.notes.map((h) => h * 2), STEP * 0.9, t, v * (s16 === 14 ? 1 : 0.8));
        } else if (lick && s16 % 1 === 0 && s16 <= 14) {
          const ps = phrase.slice(0, 8).filter((x) => typeof x === 'number'), d = ps[(s16 - 12) % ps.length] + 2;
          if (ps.length && (s16 === 12 || s16 === 13 || s16 === 14)) lick(t, melHz(d, ch, s16 !== 13), 0.034 * g, STEP * (s16 === 14 ? 1.8 : 0.85));
        } else if (chopV && s16 <= 14 && s16 !== 13) {
          const d = (phrase.find((x) => typeof x === 'number') || 0) + 4;
          chopV.triggerAttackRelease(melHz(d, ch, true), STEP * 0.5, t, Math.min(1, 0.85 * v));
        }
      }

      /* ---- the layers: which parts are in, phrase by phrase ---------------
         Each family brings its parts in in its own order and number: funk
         most of them early and talking to each other; evolve one at a time to
         a payoff; minimal one or two, a different one each phrase; texture
         few. A later drop has one more than the first. */
      const ORDERS = { funk: ['perc', 'counter', 'resp', 'beds', 'ride'], evolve: ['beds', 'counter', 'perc', 'ride', 'resp'],
        minimal: ['perc', 'counter', 'ride'], texture: ['counter', 'beds', 'perc', 'ride', 'resp'], groove: ['perc', 'counter', 'resp', 'ride', 'beds'] };
      const COUNTS = { funk: [3, 4, 5, 4], evolve: [1, 2, 4, 5], minimal: [1, 2, 1, 2], texture: [1, 2, 3, 2], groove: [2, 3, 4, 3] };
      const FAM = tr.family || 'groove', ORDER = ORDERS[FAM] || ORDERS.groove, CNT = COUNTS[FAM] || COUNTS.groove;
      function layerOn(name, sec, rel, inGroove) {
        let i = ORDER.indexOf(name);
        if (i < 0) return false;
        /* a long section (progressive house: 24 bars and more) moves in eight-bar
           phrases: a part in each phrase, and from the third on, every other
           phrase the newest one resting - taking away is a change too */
        if (sec.len >= 24) {
          const p8 = Math.floor(rel / 8), n8 = Math.min(ORDER.length, 1 + p8 + (inGroove ? 0 : 1));
          if (p8 >= 2 && p8 % 2 === 1 && i === n8 - 1) return false;
          return i < n8;
        }
        const ph = Math.floor(rel / 4);
        let n = inGroove ? Math.min(ph + (FAM === 'funk' ? 1 : 0), 3) : ph < CNT.length ? CNT[ph] : CNT[CNT.length - 2 + (ph % 2)];
        if (!inGroove && sec.n >= 1) n += 1;
        if (FAM === 'minimal' && ph % 2 === 1) i = (i + 1) % ORDER.length;      // a different part in: a small change
        return i < n;
      }
      /* a fill at the end of four bars only now and then (the eight-bar ones always) */
      const FILL4 = { funk: 0.6, evolve: 0.35, minimal: 0.25, texture: 0.4, groove: 0.45 }[FAM] || 0.45;
      const chance = (k, salt) => ((((tr.seed ^ Math.imul(k + 1, 0x9E3779B1) ^ salt) >>> 0) % 1000) / 1000);

      /* ---- the sections: strings, horns, woodwinds, a harmonium ---- */
      const violins = tr.strings ? sampler('violin', { attack: 0.35, release: 1.4, volume: -17 }) : null;
      const cellos = tr.strings ? sampler('cello', { attack: 0.3, release: 1.4, volume: -14 }) : null;
      [violins, cellos].forEach((x) => { if (x) x.connect(keys); });
      function stringsAt(t, s16, ch, g, barIndex) {
        if (!violins || s16 !== 0 || barIndex % tr.bpc) return;
        const dur = BAR * tr.bpc;
        violins.triggerAttackRelease(ch.notes.slice(-2).map((h) => h * 2), dur, t, Math.min(1, 0.8 * g));
        if (cellos) cellos.triggerAttackRelease([ch.root * 2, ch.notes[0] / 2], dur, t, Math.min(1, 0.8 * g));
      }
      const hornSec = tr.horns ? ['french-horn', 'trombone', 'tuba'].map((n) => sampler(n, { attack: 0.5, release: 1.6 })) : [];
      hornSec.forEach((x) => { if (x) x.connect(keys); });
      function hornsAt(t, s16, ch, g, barIndex) {
        if (!hornSec.length || s16 !== 0 || barIndex % 2) return;
        const [horn, bone, tuba] = hornSec, dur = BAR * 2, v = Math.min(1, 0.85 * g);
        if (horn) horn.triggerAttackRelease(ch.notes, dur, t, v);
        if (bone) bone.triggerAttackRelease(ch.notes.slice(0, 2).map((h) => h / 2), dur, t, v);
        if (tuba) tuba.triggerAttackRelease(ch.root, dur, t, v);
      }
      const clarinet = tr.wood ? sampler('clarinet', { release: 0.4 }) : null, bassoon = tr.wood ? sampler('bassoon', { release: 0.4 }) : null;
      [clarinet, bassoon].forEach((x) => { if (x) x.connect(keys); });
      function woodAt(t, s16, ch, g, barIndex) {
        if (!clarinet && !bassoon) return;
        const line = cLine(barIndex), tones = ch.notes.concat([ch.top]);
        /* the clarinet sings a line, the bassoon walks under it */
        if (clarinet && s16 % 4 === 2) { const n = line[s16 >> 1]; if (n >= 0) clarinet.triggerAttackRelease(tones[n], STEP * 3, t, Math.min(1, 0.75 * g)); }
        if (bassoon && s16 % 8 === 0) bassoon.triggerAttackRelease(s16 ? ch.notes[0] / 2 : ch.root * 2, BEAT * 1.8, t, Math.min(1, 0.7 * g));
      }
      const harmonium = tr.harmonium ? sampler('harmonium', { attack: 0.25, release: 1.2, volume: -18 }) : null;
      if (harmonium) harmonium.connect(keys);
      function harmoniumAt(t, s16, ch, g, barIndex) {
        if (harmonium && s16 === 0 && barIndex % tr.bpc === 0) harmonium.triggerAttackRelease(ch.notes, BAR * tr.bpc, t, Math.min(1, 0.7 * g));
      }

      /* ---- the added percussion and the transitions ---- */
      const PERC_LINES = {
        conga: [[3, 'congaLo'], [6, 'congaHi'], [10, 'congaLo'], [13, 'congaHi'], [14, 'congaLo']],
        bongo: [[2, 'bongoHi'], [5, 'bongoLo'], [7, 'bongoHi'], [10, 'bongoHi'], [14, 'bongoLo']],
        cowbell: [[2, 'cowbell'], [10, 'cowbell']],
        woodblock: [[4, 'woodblock'], [7, 'woodblock'], [11, 'woodblock'], [14, 'woodblock']],
        snap: [[4, 'snap'], [12, 'snap']]
      };
      /* the hand drums and shakers, recorded (VCSL); where they did not load,
         the machine's nearest: an agogo by the cowbell, a cajon by the congas */
      const PERC_FALL = { agogo: 'cowbell', cajon: 'conga', darbuka: 'bongo', frame: 'conga', triangle: 'cowbell', slit: 'woodblock', claps: 'snap', finger: 'snap', guiro: 'woodblock' };
      const realPerc = PERC_REAL[tr.percLayer] && SM[PERC_REAL[tr.percLayer][0]];
      const shakeSet = SHAKE_REAL[tr.shake] && SM[SHAKE_REAL[tr.shake][0]];
      const shakeIn = shakeSet ? lane((K.percPan || 0.3) * 1.3) : null;
      /* each recorded stroke brought to a level (dB, its first 150 ms): the
         recordings are each as loud as they go, so a muted slap would
         otherwise come out over the open tone. Hand drums sit with the
         machine's congas, the bells and woods under them, the shakers
         under the hats; a soft stroke is softer */
      const strokeDb = new WeakMap();
      const levelOf = (b) => {
        if (!strokeDb.has(b)) {
          const d = b.getChannelData(0), n = Math.min(d.length, Math.round(0.15 * b.sampleRate));
          let ss = 0; for (let i = 0; i < n; i++) ss += d[i] * d[i];
          strokeDb.set(b, 10 * Math.log10(ss / Math.max(1, n) + 1e-12));
        }
        return strokeDb.get(b);
      };
      const toDb = (b, db) => Math.min(8, Math.pow(10, (db - levelOf(b)) / 20));     // (a near-silent take is not dragged up into its noise)
      const SOFT = { mute: 1, muted: 1, soft: 1, himute: 1, lomute: 1, tek: 1, ka: 1 };
      function layerAt(t, s16, g, barIndex) {
        if (shakeSet) {
          /* the shaker: every sixteenth, pushed and pulled with the groove's accents */
          const nm = SHAKE_REAL[tr.shake][1][s16 % 4], b = shakeSet[nm];
          if (b) hit(b, nudge(drift(t), G.hat), toDb(b, -43) * g * G.acc[s16] * loose(), shakeIn, shade());
        }
        if (realPerc) {
          /* the line, and the phrase's last bar turned round: its second half an answer from the low drum */
          const line = PERC_REAL[tr.percLayer][1], turn = barIndex % 4 === 3 && s16 >= 8;
          line.forEach(([st, nm]) => {
            if (st !== s16 || (turn && rnd() < 0.3)) return;
            const b = realPerc[nm] || realPerc[Object.keys(realPerc)[0]];
            hit(b, drift(t), toDb(b, PERC_REAL[tr.percLayer][2] - (SOFT[nm] ? 5 : 0)) * g * loose(), layerIn, shade());
          });
          return;
        }
        const p = PERC_FALL[tr.percLayer] || tr.percLayer;
        if (!p) return;
        if (p === 'clave') {
          /* son clave, three against two across two bars */
          if (has(barIndex % 2 ? [4, 8] : [0, 6, 12], s16)) hit(E.clave, t, 0.7 * g, layerIn, shade());
          return;
        }
        (PERC_LINES[p] || []).forEach(([st, name]) => { if (st === s16) hit(E[name], drift(t), 0.85 * g * loose(), layerIn, shade()); });
      }
      const ride = (t, g) => hit(E.ride, t, g, rideIn, shade());
      const tom = (name, t, g) => hit(E[name], t, g, tomIn[name], shade());
      const impact = (t) => hit(E.impact, t, 0.9, drums);
      const swellInto = (t) => hit(E.swell, t - E.swell.duration, 0.75, tailBus);      // ends on t
      const revSnareInto = (t) => hit(E.revSnare, t - E.revSnare.duration, 0.7, tailBus);
      const whoosh = (t) => hit(E.whoosh, t, 0.6, crashIn);
      /* a piano chord played backwards, swelling up to the drop's downbeat */
      const revPiano = SM[tr.piano] || SM.piano;
      const revPianoInto = revPiano && (tr.revPiano || tr.moves.some((m) => m.principal === 'revPiano')) ? (() => {
        const names = Object.keys(revPiano), hzOf = (n) => { const m = /^([A-G]#?)(-?\d)$/.exec(n); return 440 * Math.pow(2, (['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(m[1]) + 12 * (Number(m[2]) + 1) - 69) / 12); };
        const back = new Map();
        return (t, ch2) => {
          ch2.notes.slice(0, 3).forEach((f, i) => {
            const want = f * 2, n = names.reduce((a, b) => (Math.abs(Math.log(hzOf(b) / want)) < Math.abs(Math.log(hzOf(a) / want)) ? b : a));
            if (!back.has(n)) back.set(n, reversed(revPiano[n]));
            const buf = back.get(n), rate = want / hzOf(n), dur = buf.duration / rate;
            hit(buf, t - dur + 0.02 * i, 0.32, tailBus, rate);
          });
        };
      })() : null;
      const boom = (t) => hit(E.boom, t, 0.8, drums);
      const riserTone = tr.moves.some((m) => m.principal === 'riserTone') ? new T.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.1, sustain: 1, release: 0.03 }, volume: -22 })
        .connect(sync(new T.Vibrato({ frequency: 6, depth: 0.05, wet: 1 }), 6).connect(new T.Filter({ type: 'highpass', frequency: 200 }).connect(tailBus))) : null;
      /* the rising tone over the last bars of a build only (never the whole of a long one) */
      function riserBar(t, sec, g, bars) {
        if (!riserTone) return;
        const k0 = sec.len - bars, f = (k) => 220 * Math.pow(2, 2.6 * Math.max(0, k - k0) / bars);
        if (sec.bar < k0) return;
        riserTone.triggerAttack(f(sec.bar), t, Math.min(1, (g || 1) * (0.35 + 0.65 * (sec.bar + 1) / sec.len)));
        riserTone.frequency.exponentialRampToValueAtTime(f(sec.bar + 1), t + BAR * 0.99);
        riserTone.triggerRelease(t + BAR * 0.995);
      }
      /* ---- playing it ---- */
      const RH = RHYTHMS[tr.rhythm];
      const leadOct = S.leadOct || 4;
      const has = (list, s) => list.indexOf(s) >= 0;
      /* a hand on the sticks: hats and percussion a few milliseconds either
         side of the grid and never twice at the same strength; the kick and
         snare stay put. In a drop, now and then a ghost hat where there was none. */
      const loose = () => 0.95 + rnd() * 0.1;
      const drift = (t) => Math.max(0, t + (rnd() - 0.5) * 0.003);
      /* the groove: where each player sits against the beat (hats ahead, the
         snare behind, by the style's feel) and how hard each sixteenth is
         played - the same every bar, as a drummer's hands are */
      const G = GROOVES[GROOVE_OF[tr.style] || 'even'];
      const nudge = (t, d) => Math.max(0, t + d);
      function drumsAt(t, s16, lvl, on, busy) {
        if (on.k && has(BT.k, s16)) kick(t, 0.95 * lvl);
        const acc = G.acc[s16];
        /* minimal: one sixteenth of the hats different every four bars, so the loop is never quite the same */
        if (FAM === 'minimal' && on.g && s16 === 1 + 2 * Math.floor(chance(curBar >> 2, 0x3c) * 8)) hat(nudge(drift(t), G.hat), 0.04 * lvl);
        if (on.s && has(BT.s, s16)) snare(nudge(t, G.snare), 0.5 * lvl);
        if (on.s && has(BT.gs, s16)) snare(nudge(drift(t), G.ghost), 0.13 * lvl * loose(), true);
        if (on.h && has(BT.h, s16)) hat(nudge(drift(t), G.hat), 0.11 * lvl * acc * loose());
        if (on.g && has(BT.g, s16)) hat(nudge(drift(t), G.hat), 0.045 * lvl * acc * loose());
        else if (busy && on.g && s16 % 2 === 1 && rnd() < 0.12) hat(nudge(drift(t), G.hat), 0.035 * lvl);
        if (on.o && has(BT.o, s16)) openHat(nudge(drift(t), G.open), 0.1 * lvl * loose());
        if (on.p && has(BT.p, s16)) perc(nudge(drift(t), G.perc), 0.12 * lvl * acc * loose());
      }
      /* a fill from the drummer's book (toms played on the snare when the track has none) */
      function fillAt(t, s16, f) {
        FILLS[f].forEach(([st, w, g]) => {
          if (st !== s16) return;
          if (w === 'kick') kick(t, g);
          else if (w === 'open') openHat(t, g);
          else if (w === 'snare' || !tr.toms) snare(t, w === 'snare' ? g : g * 0.7, true);
          else tom(w, t, g);
        });
      }
      function bassAt(t, s16, ch, g, barIndex, lineName) {
        const turn = barIndex % 4 === 3;                   // the last bar of a phrase turns it round
        const name = lineName || tr.bassLine;
        if (name === 'acidseq') {
          /* the 303's own line: its steps, its accents, its slides */
          const st = tr.acidSeq[s16];
          if (st.on) bass(t, ch.root * 2 * Math.pow(2, (st.iv - 12) / 12), g, STEP * (st.slide ? 1.6 : 0.85), st.acc, st.slide);
          return;
        }
        /* the track's own bass hook (tech house): two bars, written for it */
        const LINE = name === 'hook' ? tr.bassHook[barIndex % 2] : BASS[name] || BASS.off;
        LINE.forEach(([st, len, iv]) => {
          if (st !== s16) return;
          const up = turn && s16 >= 12 && name !== 'hook' ? 12 : 0;
          bass(t, ch.root * 2 * Math.pow(2, (iv + up - 12) / 12), g, STEP * len);
        });
        if (turn && s16 === 15 && !LINE.some(([st]) => st === 15)) bass(t, ch.root * 2 * Math.pow(2, 7 / 12) / 2, g * 0.7, STEP * 0.9);
      }
      /* chords played on a piano or a Wurlitzer rather than a synth, where the style's rhythm asks */
      const chordVoice = RH.voice === 'piano' ? (sampler(tr.piano || 'piano', { release: 0.35, volume: -17 }) || sampler('piano', { release: 0.35, volume: -17 })) : RH.voice === 'wurli' ? wurliVoice() : null;
      if (chordVoice && RH.voice === 'piano') chordVoice.connect(keys);
      function chordsAt(t, s16, barIndex, ch0, g, invert) {
        /* the same chord, voiced up: its lowest note taken an octave higher */
        let ch = invert ? Object.assign({}, ch0, { notes: ch0.notes.slice(1).concat([ch0.notes[0] * 2]) }) : ch0;
        if (RH.held && tr.voicing === 'open' && !invert) ch = openOf(ch);
        if (RH.held) {
          if (s16 === 0 && barIndex % tr.bpc === 0) {
            const dur = BAR * tr.bpc * 1.02;
            if (RH.keys) ch.notes.forEach((f0, i) => keysNote(t + i * 0.018, f0, RH.g * g, dur));   // strummed
            else if (RH.gated && gateSyn) gateSyn.triggerAttackRelease(ch.notes.map((h) => h * 2), dur, t, Math.min(1, RH.g * g / 0.07));
            else chord(t, ch.notes, RH.g * g, dur, RH.attack || 0.5);
          }
          return;
        }
        if (RH.stabs && has(RH.stabs, s16)) {
          if (chordVoice) chordVoice.triggerAttackRelease(ch.notes.map((h) => h * 2), STEP * RH.len, t, Math.min(1, (RH.g * g) / 0.05));
          else chord(t, ch.notes.map(h => (RH.up ? h * 2 : h)), RH.g * g, STEP * RH.len, 0.005);
        }
        if (RH.pad && s16 === 0 && barIndex % tr.bpc === 0) chord(t, ch.notes, 0.03 * g, BAR * tr.bpc, 0.8, 'sawtooth', 'strings');
      }
      /* the written melody: a degree in the key (on the beat, the nearest of
         the chord's own tones), in the lead's register, the key lifted with
         the chords */
      const SC = SCALES[tr.scale], chordTones = tr.sevenths ? [0, 2, 4, 6] : [0, 2, 4];
      const regOf = 12 * Math.log2(leadOct);
      function melHz(d, ch, strong) {
        if (strong) {
          let best = d, bd = 99;
          for (let x = d - 3; x <= d + 3; x++) {
            if (chordTones.indexOf((((x - ch.deg) % 7) + 7) % 7) >= 0 && Math.abs(x - d) < bd) { bd = Math.abs(x - d); best = x; }
          }
          d = best;
        }
        return hz(57 + tr.key + (ch.shift || 0) + SC[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7) + regOf);
      }
      /* one eighth of a phrase (two bars, sixteen eighths): a note held for as
         long as the phrase holds it, louder on the beat and towards the
         phrase's middle */
      function melodyAt(t, s16, ch, g, slot0, phrase, voice, lift) {
        if (s16 % 2) return;
        const k = slot0 + s16 / 2, ev = phrase[k];
        if (typeof ev !== 'number') return;
        let len = 1;
        while (k + len < phrase.length && phrase[k + len] === 'h') len++;
        /* the bar's downbeat leaned on, the beats firmer than what is between them, the phrase's middle fuller */
        const strong = k % 2 === 0;
        let shape = (k % 8 === 0 ? 1.08 : strong ? 1 : 0.84) * (0.9 + 0.12 * Math.sin(Math.PI * k / phrase.length));
        if (FAM === 'texture') { t = Math.max(0, t + (rnd() - 0.35) * 0.024); shape *= 0.84 + rnd() * 0.3; }   // lo-fi: played behind the beat, by hand
        voice(t, melHz(ev, ch, strong) * (lift || 1), 0.04 * g * shape, STEP * 2 * len * (len > 1 ? 0.96 : PRF.gate || 0.94));
      }
      /* which telling of the theme a phrase is: in a drop the motif, its
         question, the motif, the close - and then developed: the altered
         ending, the motif a step late, in another register; a later drop
         starts from the developed ones. A section's last phrase closes. */
      const PLANS = [['hook', 'answer', 'hook', 'close'], ['alt', 'answer', 'disp', 'close'], ['hook', 'reg', 'alt', 'close']];
      function phraseAt(sec) {
        const M = tr.mel, p = Math.floor(sec.bar / ML), lastP = Math.floor((sec.len - 1) / ML);
        if (sec.name !== 'drop') return p % 2 ? M.answer : M.hook;
        if (p === lastP && p > 0) return M.close;
        const order = sec.n === 0 ? [0, 1, 2] : [1, 2, 0], plan = PLANS[order[Math.floor(p / 4) % 3]];
        return M[plan[p % 4]] || M.hook;
      }
      function leadAt(t, s16, ch, g, barIndex, lift) {
        /* the chord's notes, up an octave or two by the style's taste (and one
           more late in a later drop) */
        const tone = (n) => (n >= ch.notes.length ? ch.top : ch.notes[n]) * leadOct * (lift || 1);
        if (tr.leadPat === 'arp') {
          /* two bars of arpeggio, shaped; every fourth phrase turned round */
          const AL = tr.arpLine, line = Math.floor(barIndex / 2) % 4 === 3 ? AL.B : AL.A, st = line[(barIndex % 2) * 16 + s16];
          if (st.n >= 0) lead(t, tone(st.n % 4) * (st.n >= 4 ? 2 : 1), (st.acc ? 0.042 : 0.031) * g, STEP * st.len);
        } else if (tr.leadPat === 'acid') {
          /* the 303 line, and what a player does to it: the phrase's last bar
             answers (its accented steps an octave up, a step dropped), and
             every other eight bars its second half moves to other notes */
          const st = tr.line[s16], sq = tr.acidSeq[s16], turn = barIndex % 4 === 3, other = Math.floor(barIndex / 8) % 2 === 1 && s16 >= 8;
          const on = st.on && !(turn && s16 % 5 === 3), n = other ? (st.n + 1) % 4 : st.n, up = st.up || (turn && (st.acc || sq.acc));
          if (on) lead(t, tone(n) * (up ? 2 : 1), 0.04 * g, STEP * (sq.slide ? 1.6 : 0.95), st.acc || sq.acc, sq.slide);
        } else {
          const sec = sectionAt(tr, barIndex);
          melodyAt(t, s16, ch, g, (sec.bar % ML) * 8, phraseAt(sec), lead, lift);
        }
      }
      function pump(t) {
        if (!FX.pump) return;
        [low.gain, keys.gain].forEach((p) => { p.setValueAtTime(1 - FX.pump, t); p.linearRampToValueAtTime(1, t + BEAT * 0.55); });
      }
      const buildOf = (sec) => tr.builds[Math.min(sec.n, tr.builds.length - 1)];
      const dropOf = (sec) => tr.drops[Math.min(sec.n, tr.drops.length - 1)];
      /* a fake drop spends its first four bars pretending */
      const fakeBars = (sec) => (dance && sec.len >= 8 && dropOf(sec).type === 'fake' ? 4 : 0);
      const gapBar = (sec, D, dlen) => (D.gap && dlen >= 8 ? Math.round(dlen * D.gap) - 1 : -1);
      const targetOf = (sec) => {
        const C = FX.bright, prog = (sec.bar + 1) / sec.len;
        if (sec.name === 'drop' && dance) {
          const D = dropOf(sec), f0 = fakeBars(sec), db = sec.bar - f0;
          if (db < 0) return db === -1 ? 1200 + (C - 1200) * 0.5 : Math.min(C, 2000);
          return db === gapBar(sec, D, sec.len - f0) ? C * 0.3 : C * (0.8 + 0.2 * ((db % 4) + 1) / 4);   // opening through each phrase
        }
        if (sec.name === 'build') return 1200 + Math.pow(prog, buildOf(sec).fcurve) * (C - 1200);
        return sec.name === 'intro' ? Math.min(C, 600 + 1200 * prog)
          : sec.name === 'groove' ? (dance ? Math.min(C, 1000 + 1600 * prog) : C * 0.85)
          : sec.name === 'breakdown' ? Math.min(C, 2200)
          : sec.name === 'outro' ? Math.max(500, C * (1 - prog * 0.9))
          : sec.name === 'drop' && sec.len >= 8 && sec.bar === sec.len / 2 - 1 ? C * 0.3     // the dip before the half-way slam
          : C;
      };
      let lastF = from > 0 ? targetOf(sectionAt(tr, from - 1)) : 800;    // where the bar before left it
      function filterTo(sec, t) {
        const F = filter.frequency, target = targetOf(sec);
        F.setValueAtTime(lastF, t); F.exponentialRampToValueAtTime(target, t + BAR * 0.95);
        lastF = target;
      }

      const moveOf = (sec) => tr.moves[Math.min(sec.n, tr.moves.length - 1)] || { concept: 'perc', principal: 'none', support: 'none', breath: 'none', hit: 'crash', riserBars: 4 };
      /* the hook's first notes only (a teaser): the rest of it rests */
      const fragOf = (phrase, n) => { let c = 0, on = true; return phrase.map((v) => { if (typeof v === 'number') on = ++c <= n; return on ? v : null; }); };
      /* a chord voiced open: the lowest note down, the others spread up */
      const openOf = (c) => Object.assign({}, c, { notes: c.notes.map((h, k) => (k % 2 ? h * 2 : h)) });
      function buildBar(M, stg, t, s16, sub, ch, barIndex, sec, rise, vel, last) {
        const c = M.concept, hook = tr.mel.hook, slot = (sec.bar % ML) * 8;
        const roll = (every, g0, g1) => { if (s16 % every === 0) snare(t, g0 + (g1 - g0) * rise, true); };
        const kicking = (on) => { if (on && has(BT.k, s16)) { kick(t, 0.85 * vel); if (sub === 0) pump(t); } };
        const pad = (g, up, len) => { if (s16 === 0 && barIndex % (len || 2) === 0) chord(t, up ? ch.notes.map((h) => h * 2) : ch.notes, g, BAR * (len || 2), 0.6); };
        if (c === 'bass') {
          /* the bass taken apart: whole, then on the beats only, then the kick
             out under eighths, then no low end at all, then one call */
          if (stg === 1) { drumsAt(t, s16, vel, { k: true, h: true, g: true }); bassAt(t, s16, ch, 0.36 * vel, barIndex); if (has(BT.k, s16) && sub === 0) pump(t); }
          else if (stg === 2) { drumsAt(t, s16, vel, { k: true, h: true, s: true }); if (sub === 0) { bass(t, ch.root, 0.34, STEP * 1.5); pump(t); } }
          else if (stg === 3) { if (s16 % 2 === 0) bass(t, ch.root * (s16 % 4 ? 2 : 1), 0.3, STEP * 0.9); if (sub === 2) hat(drift(t), 0.09 * loose()); roll(4, 0.12, 0.3); }
          else if (stg === 4) { roll(s16 < 8 ? 2 : 1, 0.15, 0.45); if (s16 === 0) chord(t, ch.notes.map((h) => h * 2), 0.03, STEP * 1.5, 0.005); if (sub === 2) hat(drift(t), 0.07); }
          else { if (s16 === 0) bass(t, ch.root, 0.42, STEP * 2); if (s16 === 6) bass(t, ch.root * Math.pow(2, 7 / 12), 0.36, STEP * 1.5); roll(1, 0.3, 0.55); }
          pad(0.022, false, 2);
        } else if (c === 'melodic') {
          /* the hook teased - its first notes, then more of it - while the
             room opens; then everything but it lifted out, then its first
             note stuttering into the drop */
          if (stg <= 3) {
            kicking(true);
            drumsAt(t, s16, vel, { h: true, g: stg >= 2, s: stg >= 2 });
            if (stg === 3) roll(4, 0.06, 0.2);
            bassAt(t, s16, ch, (stg === 1 ? 0.26 : 0.32) * vel, barIndex, stg === 3 ? 'off' : null);
            pad(0.03, stg >= 2, 2);
            if (sec.bar % 2 === 0 || stg >= 2) melodyAt(t, s16, ch, 0.3 + 0.08 * stg, slot, fragOf(hook, stg === 1 ? 3 : stg === 2 ? 5 : 8), lead);
            if (stg === 2) counterAt(t, s16, ch, 0.4, barIndex);
          } else if (stg === 4) {
            pad(0.04, true, 2);
            melodyAt(t, s16, ch, 0.45, slot, hook, lead, 2);
            if (s16 % 2 === 0) hat(drift(t), 0.05 + 0.04 * rise);
            roll(2, 0.08, 0.28);
          } else {
            const n = tr.hook.find((x) => x >= 0) || 0, f0 = (n >= ch.notes.length ? ch.top : ch.notes[n]) * leadOct, every = last ? 1 : 2;
            if (s16 % every === 0) lead(t, f0, 0.03 + 0.02 * rise, STEP * every * 0.45);
            pad(0.04, true, 1);
          }
        } else if (c === 'perc') {
          /* the drums and the percussion talking: in turn, then over each
             other with fills growing, then the kick out and a roll with toms */
          if (stg === 1) {
            kicking(true); drumsAt(t, s16, vel, { h: true, g: true, p: true }); layerAt(t, s16, 0.75 * vel, barIndex); bassAt(t, s16, ch, 0.3 * vel, barIndex);
            if (sec.bar % 2 === 1 && s16 >= 12 && tr.toms) tom(['tomHi', 'tomMid', 'tomMid', 'tomLo'][s16 - 12], t, 0.45);
          } else if (stg === 2) {
            kicking(true);
            if (sec.bar % 2 === 0) drumsAt(t, s16, vel, { s: true, h: true });
            else { layerAt(t, s16, 0.9 * vel, barIndex); if (s16 >= 12) tom(['tomHi', 'tomHi', 'tomMid', 'tomLo'][s16 - 12], t, 0.5); }
            bassAt(t, s16, ch, 0.3 * vel, barIndex);
          } else if (stg === 3) {
            kicking(true); drumsAt(t, s16, vel, { s: true, h: true, g: true }); layerAt(t, s16, 0.85 * vel, barIndex);
            if (s16 >= 12) fillAt(t, s16, tr.fills[sec.bar % 2]);
            bassAt(t, s16, ch, 0.3 * vel, barIndex, 'off');
          } else if (stg === 4) {
            layerAt(t, s16, 0.8 * vel, barIndex); roll(2, 0.15, 0.42);
            if (s16 >= 12 && tr.toms) tom(s16 % 2 ? 'tomLo' : 'tomMid', t, 0.5);
          } else {
            roll(1, 0.3, 0.6); if (s16 >= 8 && tr.toms) tom(['tomHi', 'tomHi', 'tomMid', 'tomMid', 'tomLo', 'tomLo', 'tomLo', 'tomLo'][s16 - 8], t, 0.55);
          }
          pad(0.02, false, 4);
        } else if (c === 'chord') {
          /* the chords: held, then stabbed on the beat, then on the eighths
             with the borrowed chord turning against the key, then sixteenths
             with the low end gone, then one held chord with a ninth in it */
          const tense = tr.borrow != null && sec.bar % 2 === 1 ? chordSet(false, true)[tr.borrow] : ch;
          if (stg === 1) { kicking(true); drumsAt(t, s16, vel, { h: true, g: true }); bassAt(t, s16, ch, 0.3 * vel, barIndex, 'off'); pad(0.05, false, tr.bpc); counterAt(t, s16, ch, 0.35, barIndex); }
          else if (stg === 2) { kicking(true); drumsAt(t, s16, vel, { h: true, s: true }); bassAt(t, s16, ch, 0.3 * vel, barIndex, 'off'); if (sub === 0) chord(t, ch.notes.map((h) => h * 2), 0.045, STEP * 2, 0.005); }
          else if (stg === 3) { kicking(true); drumsAt(t, s16, vel, { h: true, g: true }); roll(4, 0.1, 0.25); if (s16 % 2 === 0) chord(t, tense.notes.slice(1).concat([tense.notes[0] * 2]).map((h) => h * 2), 0.03 + 0.02 * rise, STEP * 0.9, 0.005); if (sub === 0) bass(t, tense.root, 0.3, STEP * 3); }
          else if (stg === 4) { chord(t, tense.notes.map((h) => h * 2), 0.02 + 0.035 * rise, STEP * 0.7, 0.005); roll(2, 0.1, 0.35); }
          else if (s16 === 0) chord(t, ch.notes.concat([ch.top * 9 / 8]).map((h) => h * 2), 0.06, BAR * 1.02, 0.4);
        } else {
          /* stripped: a layer taken away each stage - the percussion and the
             counter, then the hats and snare, then the kick and bass - down
             to one phrase that does not resolve */
          if (stg <= 3) {
            kicking(true);
            drumsAt(t, s16, vel, { s: stg <= 2, h: stg <= 2, g: stg === 1, p: stg === 1 });
            bassAt(t, s16, ch, 0.34 * vel, barIndex);
            chordsAt(t, s16, barIndex, ch, 0.75);
            if (stg === 1) { layerAt(t, s16, 0.7 * vel, barIndex); counterAt(t, s16, ch, 0.45, barIndex); }
          } else if (stg === 4) {
            chordsAt(t, s16, barIndex, ch, 0.65);
            if (sec.bar % 2 === 1) melodyAt(t, s16, ch, 0.4, 0, tr.mel.answer, lead);
          } else {
            if (sec.bar === sec.len - 2 || !last) melodyAt(t, s16, ch, 0.45, 0, tr.mel.answer, lead);
            else if (s16 === 0) chord(t, ch.notes, 0.04, BAR, 0.3);
          }
        }
      }
      /* the downbeat of a drop: each hit its own thing */
      function hitDown(kind, t) {
        if (tr.noFx) return;
        if (kind === 'crash') crash(t);
        else if (kind === 'crashImpact') { crash(t); impact(t); }
        else if (kind === 'impact') impact(t);
        else if (kind === 'boom') boom(t);
        /* (cut: nothing but the music landing) */
      }

      let curBar = 0;
      function playStep(t0, i) {
        const barIndex = Math.floor(i / 16), s16 = i % 16, sub = s16 % 4, beat = s16 >> 2;
        curBar = barIndex;
        const sec = sectionAt(tr, barIndex), ch = chordAt(barIndex);
        /* the drums change every four bars (the style's other beat), the lead
           passes to the second voice for the later drops */
        BT = tr.beatB && barIndex % 8 >= 4 ? tr.beatB : tr.beat;
        const laterDrop = sec.name === 'drop' && sec.n >= 1;
        lead = laterDrop && sec.bar >= sec.len / 2 ? lead2 : lead1;
        /* the feel: swing pushes the offbeats late; lo-fi drifts a little */
        let t = t0;
        if (tr.swing16 && s16 % 2 === 1) t += tr.swing16 * STEP;
        if (tr.swing8 && sub === 2) t += tr.swing8 * STEP;
        let vel = 1;
        if (S.human) { t = Math.max(0, t + (rnd() - 0.5) * 0.012); vel = 0.85 + rnd() * 0.3; }
        if (s16 === 0) filterTo(sec, t0);
        if (barIndex % 4 === 0 && s16 === 0 && FX.crackle) {
          for (let c = 0; c < 3; c++) noise(t0 + rnd() * BAR * 4, 0.003, 0.12 * FX.crackle, 'highpass', 2500, 0.7, null, master);
        }
        const last = sec.bar === sec.len - 1;
        const fill = S.fill && last && s16 >= 12 && sec.name !== 'build' && sec.next && sec.next !== 'build' && sec.next !== sec.name || (S.fill && last && s16 >= 12 && sec.name === 'drop' && sec.next === 'breakdown');
        const kickIn = (n) => has(BT.k, s16) && n;

        if (sec.name === 'intro') {
          const half = sec.bar >= sec.len / 2;
          drumsAt(t, s16, vel * 0.8, { h: true, g: true, k: half && S.form !== 'song', p: half });
          if (half) layerAt(t, s16, 0.6 * vel, barIndex);
          harmoniumAt(t, s16, ch, 0.45, barIndex);
          if (!dance) chordsAt(t, s16, barIndex, ch, 0.6);
          else if (s16 === 0 && barIndex % 2 === 0) chord(t, ch.notes, 0.025, BAR * 2, 0.8);
          if (kickIn(half && S.form !== 'song') && sub === 0) pump(t);
        }
        if (sec.name === 'groove') {
          drumsAt(t, s16, vel, { k: true, s: !dance || tr.style !== 'house' || sec.bar >= sec.len / 2, h: true, g: true, p: true });
          bassAt(t, s16, ch, 0.32 * vel, barIndex);
          chordsAt(t, s16, barIndex, ch, 0.7);
          if (!dance && tr.lead && sec.bar >= sec.len / 2) leadAt(t, s16, ch, 0.6, barIndex);
          /* the hook, early and quiet, before the drop gives it everything. A
             long groove (progressive) unfolds in eight-bar phrases instead:
             the groove alone, the motif's first notes, the counter-melody in
             its place, more of the motif, the beds, the whole hook */
          const p8 = Math.floor(sec.bar / 8), longG = sec.len >= 24;
          const tease = dance && tr.lead && tr.tease && sec.n === 0 && sec.bar >= sec.len / 4 && (!longG || p8 % 2 === 1);
          if (tease && longG) melodyAt(t, s16, ch, 0.36, (sec.bar % ML) * 8, p8 >= 5 ? tr.mel.hook : fragOf(tr.mel.hook, p8 === 1 ? 3 : 6), lead);
          else if (tease) leadAt(t, s16, ch, 0.38, barIndex);
          if (longG && p8 >= 2 && p8 % 2 === 0) counterAt(t, s16, ch, 0.5, barIndex);
          const gon = (name) => layerOn(name, sec, sec.bar, true);
          if (gon('perc') || FAM === 'funk') layerAt(t, s16, 0.8 * vel, barIndex);
          if (tease && gon('resp')) respondAt(t, s16, ch, 0.7, (sec.bar % ML) * 8, tr.mel.hook);
          if (sec.bar >= sec.len / 2) {
            if (!tease && gon('counter')) counterAt(t, s16, ch, 0.55, barIndex);
            if (gon('beds')) { stringsAt(t, s16, ch, 0.6, barIndex); woodAt(t, s16, ch, 0.7, barIndex); }
          }
          if (gon('beds')) harmoniumAt(t, s16, ch, 0.55, barIndex);
          if (tr.toms && last && s16 >= 12) tom(['tomHi', 'tomMid', 'tomMid', 'tomLo'][s16 - 12], t, 0.55 + (s16 - 12) * 0.08);
          if (kickIn(true)) pump(t);
        }
        if (sec.name === 'build') {
          /* a build carries its one idea (the concept) through five stages -
             over thirty-two bars: tease (1-8), develop (9-16), urgency
             (17-24), focus (25-30), the set-up (31-32); a shorter build the
             same stages in fewer bars. Its effects come only near the end. */
          const M = moveOf(sec), stg = stageOf(sec), toDrop = sec.next === 'drop';
          const rise = (sec.bar * 16 + s16) / (sec.len * 16);
          /* the breath: from here to the downbeat everything is hushed, the
             returns too - a tail breath keeps its effect, ringing on its bus */
          const breathFrom = M.breathLen === 'half' ? 8 : M.breathLen === 'beat' ? 12 : 14;
          const breathing = toDrop && last && M.breath !== 'none' && s16 >= breathFrom;
          if (toDrop && last && s16 === 0 && M.breath !== 'none') hushFor(t0 + breathFrom * STEP, t0 + BAR);
          if (!breathing) buildBar(M, stg, t, s16, sub, ch, barIndex, sec, rise, vel, last);
          /* (tr.noFx, for testing: a drop must still land with every transition effect muted) */
          const fx = tr.noFx ? [] : [M.principal, M.support];
          if (last && s16 === 0 && toDrop) {
            if (fx.indexOf('swell') >= 0) swellInto(t0 + BAR);
            if (fx.indexOf('revSnare') >= 0) revSnareInto(t0 + BAR);
            if (fx.indexOf('revPiano') >= 0 && revPianoInto) revPianoInto(t0 + BAR, chordAt(barIndex + 1));
          }
          const nB = Math.min(sec.len, M.riserBars);
          if (s16 === 0 && fx.indexOf('riserTone') >= 0) riserBar(t0, sec, 1, nB);
          if (s16 === 0 && fx.indexOf('whoosh') >= 0 && sec.bar === sec.len - nB) whoosh(t0);
          if (s16 === 0 && fx.indexOf('noise') >= 0 && sec.bar >= sec.len - nB) {
            /* the noise riser over the last few bars only, on its own curve */
            const k = sec.bar - (sec.len - nB), B = buildOf(sec), f = (x) => B.lo * Math.pow(B.hi / B.lo, Math.pow(x, B.curve));
            noise(t0, BAR * 0.98, 0.05 + 0.25 * Math.pow((k + 1) / nB, 1.5), 'bandpass', f(k / nB), 1.2, f((k + 1) / nB));
          }
        }
        if (sec.name === 'drop') {
          /* a drop is four phrases, not one loop: the bass moves to its second
             line and the chords to another voicing on alternate phrases, open
             hats come in for the second half, every phrase ends on a fill. How
             it arrives, where its gap falls (the floor out, the filter dipping,
             back in on a crash), where the lead comes in and lifts, are the
             drop's own (see compose) */
          const D = dance ? dropOf(sec) : { type: 'slam', hit: 'crash', gap: 0.5, gapBeats: 2, lift: laterDrop ? 0.75 : null, leadIn: 0 };
          const f0 = fakeBars(sec), db = sec.bar - f0, dlen = sec.len - f0;
          if (db < 0) {
            /* the fake: a hit, then the breakdown's chords and the hook, then a roll into the real one */
            if (sec.bar === 0 && s16 === 0) hitDown(D.hit === 'cut' ? 'crash' : D.hit, t);
            if (s16 === 0 && sec.bar < 3 && (sec.bar > 0 || beat === 0)) chord(t + (sec.bar === 0 ? BEAT * 2 : 0), ch.notes, 0.06, BAR * (sec.bar === 0 ? 0.5 : 1.02), 0.6);
            if (sec.bar === 0 && s16 === 8) bass(t, ch.root, 0.16, BAR * 0.5);
            if (sec.bar > 0 && sec.bar < 3 && s16 === 0) bass(t, ch.root, 0.16, BAR * 0.95);
            if (tr.lead && sec.bar > 0 && sec.bar < 3) melodyAt(t, s16, ch, 0.6, ((sec.bar - 1) % 2) * 8, tr.mel.hook, lead);
            if (sec.bar === 3 && s16 < 12) { snare(t, 0.15 + 0.04 * s16, true); if (s16 % 2) snare(t + STEP / 2, 0.3, true); }
            if (sec.bar === 3 && s16 === 0) noise(t, BAR * 0.75, 0.3, 'bandpass', 800, 1.2, 8000);
            counterAt(t, s16, ch, 0.5, barIndex);
          } else {
          const phraseN = Math.floor(db / 4), alt = phraseN % 2 === 1;
          const half = dlen >= 8 && db >= dlen / 2;
          const gb = gapBar(sec, D, dlen);
          const P = D.concept;
          /* percussive drops leave room: the last beat of each phrase to the hand drums alone */
          const space = P === 'perc' && db % 4 === 3 && beat === 3 && !last && db !== gb;
          const gap = (db === gb && beat >= 4 - D.gapBeats) || space;
          const phraseEnd = db % 4 === 3 && s16 >= 12 && !last && db !== gb;
          /* what plays, by the kind of drop */
          const bassOnly = D.type === 'bassfirst' && db < 4;
          const halfTime = D.type === 'half' && !half;
          const step = (n) => D.type !== 'gradual' || db >= n;          // the beat coming in a piece at a time
          if (!gap) {
            if (halfTime) {
              if (s16 === 0 || s16 === 10) kick(t, 0.95 * vel);
              if (s16 === 8) snare(t, 0.5 * vel);
              if (s16 % 2 === 0) hat(drift(t), 0.1 * loose());
              if (s16 === 0 || s16 === 8) pump(t);
            } else {
              drumsAt(t, s16, vel, { k: true, s: !bassOnly && step(4), h: step(2), g: !bassOnly && step(2), o: !bassOnly && step(6) && (half || laterDrop), p: !bassOnly && step(6) }, step(6));
              if (kickIn(true)) pump(t);
            }
            /* the payoff the build set up: the bass answering (its other line, harder) for the bass;
               an open voicing over the returning bass for the chords */
            const answer = P === 'bass' && phraseN === 0;
            bassAt(t, s16, ch, (answer ? 0.46 : 0.42) * vel, barIndex, answer || alt ? tr.bassLine2 : tr.bassLine);
            if (!bassOnly) chordsAt(t, s16, barIndex, P === 'chord' && phraseN === 0 ? openOf(ch) : ch, 1, alt && !(P === 'chord' && phraseN === 0));
          } else if (space) {
            if (sub === 2) hat(drift(t), 0.07 * loose());
          } else {
            hat(drift(t), 0.09 * loose());
            if (s16 === 12 && tr.toms) tom('tomHi', t, 0.5);
            if (s16 >= 13 && tr.toms) tom(s16 === 15 ? 'tomLo' : 'tomMid', t, 0.5 + (s16 - 13) * 0.1);
          }
          /* the lead: in where this drop brings it, lifted an octave where it lifts; in a call
             and response it takes two bars and the counter-melody the next two */
          const leadIn = !bassOnly && db >= dlen * D.leadIn, call = Math.floor(db / 2) % 2 === 0;
          const lift = D.lift && db >= dlen * D.lift ? 2 : 1;
          /* (a melodic build promised the hook: it comes, whole, whether or not the track leads with it elsewhere) */
          /* a long drop: in every third eight bars the lead
             rests and the theme is stated by the other voice (with the counter
             under it) - taking the lead away for a while is development too */
          const rest8 = dance && sec.len >= 24 && Math.floor(db / 8) % 3 === 2;
          if (rest8 && (tr.lead || P === 'melodic')) melodyAt(t, s16, ch, 0.75, (sec.bar % ML) * 8, phraseAt(sec), lead2 === lead1 ? lead1 : lead2);
          if (rest8) counterAt(t, s16, ch, 0.7, barIndex);
          else if ((tr.lead || P === 'melodic') && (!dance || leadIn) && (D.type !== 'callresp' || call)) leadAt(t, s16, ch, db < dlen / 2 ? 0.8 : 1, barIndex, lift);
          /* the downbeat: a crash and an impact, a crash, a boom, or just the kick; and a crash out of the gap */
          if (dance && s16 === 0) {
            if (db === 0) hitDown(D.hit, t);
            if (db > 0 && (gb >= 0 ? db === gb + 1 : db === dlen / 2 && dlen >= 8)) crash(t);
            if (db === 4 && (D.type === 'bassfirst' || D.type === 'gradual')) crash(t);
            if (halfTime === false && D.type === 'half' && db === dlen / 2) impact(t);
          }
          if (!dance && (sec.bar === 0 || (sec.len >= 8 && sec.bar === sec.len / 2)) && s16 === 0) crash(t);
          const on = (name) => layerOn(name, sec, db, false);
          if (!bassOnly && (on('perc') || P === 'perc')) layerAt(t, s16, vel, barIndex);
          if (!bassOnly && tr.lead && leadIn && on('resp') && (FAM === 'funk' ? db % 4 === 3 || db % 4 === 1 : db % 8 === 3)) {
            const M = tr.mel, ph = Math.floor(sec.bar / 2) % 4;
            respondAt(t, s16, ch, 0.9, (sec.bar % ML) * 8, ph === 1 ? M.answer : M.hook);
          }
          /* the counter-melody: where the lead rests (a few strong parts, not all at once) */
          if (!bassOnly && on('counter') && (db >= dlen / 4 || laterDrop)) {
            if (D.type === 'callresp') { if (!call || !tr.lead) counterAt(t, s16, ch, 0.9, barIndex); }
            else if (!tr.lead || alt || !leadIn) counterAt(t, s16, ch, half ? 0.75 : 0.6, barIndex);
          }
          if (!gap && !bassOnly && on('beds')) { stringsAt(t, s16, ch, 0.8, barIndex); harmoniumAt(t, s16, ch, 0.55, barIndex); }
          if (half && on('beds')) woodAt(t, s16, ch, 0.8, barIndex);
          if (laterDrop && half && on('beds')) hornsAt(t, s16, ch, 0.7, barIndex);
          if (tr.ride && (laterDrop || half || FAM === 'texture') && on('ride') && s16 % 2 === 0) ride(drift(t), (sub === 0 ? 0.55 : 0.4) * loose());
          if (phraseEnd && !gap && (db % 8 === 7 || chance(barIndex, 0x51) < FILL4)) fillAt(t, s16, db % 8 === 7 ? tr.fills[1] : tr.fills[0]);
          if (tr.toms && last && s16 >= 12 && sec.next) tom(['tomHi', 'tomMid', 'tomLo', 'tomLo'][s16 - 12], t, 0.6);
          }
        }
        if (sec.name === 'breakdown') {
          /* how it is entered: mostly nothing, now and then the air let out, or a boom */
          const entry = (tr.entries || [])[sec.n] || 'none';
          if (sec.bar === 0 && s16 === 0 && entry === 'air') noise(t, BAR * 2, 0.22, 'bandpass', 6000, 1.1, 350);
          if (sec.bar === 0 && s16 === 0 && entry === 'boom') boom(t);
          /* (a long breakdown opens in steps: the counter alone over the chords, then the beds, then the hook) */
          const pb = sec.len >= 24 ? Math.floor(sec.bar / 8) : 9;
          if (pb !== 2) counterAt(t, s16, ch, 0.85, barIndex);
          if (pb >= 1) { stringsAt(t, s16, ch, 1, barIndex); hornsAt(t, s16, ch, 0.9, barIndex); woodAt(t, s16, ch, 0.9, barIndex); }
          harmoniumAt(t, s16, ch, 0.65, barIndex);
          if (sec.bar >= sec.len / 2) layerAt(t, s16, 0.45 * vel, barIndex);
          if (s16 === 0 && barIndex % tr.bpc === 0) {
            if (RH.keys) ch.notes.forEach((f0, k) => keysNote(t + k * 0.03, f0, 0.05, BAR * tr.bpc));
            else chord(t, ch.notes, 0.07, BAR * tr.bpc * 1.05, 0.9);
            bass(t, ch.root, 0.18, BAR * tr.bpc * 0.9);
          }
          drumsAt(t, s16, vel * 0.7, { g: !dance, h: dance && sub === 2 });
          /* the hook comes back, softly, on the other voice */
          if (tr.lead && sec.bar >= sec.len / 2) melodyAt(t, s16, ch, 0.6, (sec.bar % ML) * 8, pb === 3 ? tr.mel.answer : tr.mel.hook, lead2);
        }
        if (sec.name === 'outro') {
          if (sec.bar === 0 && s16 === 0 && tr.trans.boom) boom(t);
          drumsAt(t, s16, vel * 0.9, { k: sec.bar < sec.len - 1, h: true, g: true, s: !dance });
          if (sec.bar < sec.len - 1) bassAt(t, s16, ch, 0.3 * vel, barIndex);
          if (!dance) chordsAt(t, s16, barIndex, ch, 0.5);
          if (kickIn(sec.bar < sec.len - 1)) pump(t);
        }
        /* a fill to turn into the next section */
        if (fill) {
          if (S.fill === 'snare') snare(t, (0.2 + (s16 - 12) * 0.1) * vel, true);
          else if (s16 === 14) openHat(t, 0.16);
        }
      }

      if (!tr.resolved) tr.resolved = resolved;          // (the first segment rendered says; every one resolves alike)
      play = playStep;
    }
    const writeBar = (k) => {
      T.setContext(ctx);
      reseed(k);
      for (let i = k * 16; i < (k + 1) * 16; i++) play(i * STEP - off, i);
      if (pressWatch) pressWatch((k - from + 1) / (end - from));      // the loader, told how far the press has got
    };
    const end = Math.min(b + 1, tr.bars);
    writeBar(from);
    let chunked = true;
    for (let k = from + 1; k < end && chunked; k++) {
      const pause = Math.floor(((k - from) * BAR - 0.05) * SR / 128) * 128 / SR;
      try {
        /* a real pause between bars (a macrotask, by message): the graph stays the size of a bar */
        raw.suspend(pause).then(() => later(() => { writeBar(k); raw.resume(); }));
      } catch (e) {
        chunked = false;
        for (let j = k; j < end; j++) writeBar(j);
      }
    }
    /* any audio-worklet processors (the plucked string's comb filter) loaded
       and wired in before the render starts, so the first note sounds */
    return Promise.resolve(ctx.workletsAreReady ? ctx.workletsAreReady() : null).catch(() => {})
      .then(() => new Promise((res) => later(res))).then(() => raw.startRendering()).then((buf) => {
      const l = buf.getChannelData(0), r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
      /* the last of the headroom: Tone's limiter is a fast compressor, and a
         kick, the bass and an impact landing together can still pass full
         scale - above 0.9 the peaks are rounded off, never past 1 (sample by
         sample, so two segments meet the same either way) */
      const knee = (x) => { const a = Math.abs(x); return a <= 0.9 ? x : Math.sign(x) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1)); };
      const L = l.slice(skip, skip + want), R = r.slice(skip, skip + want);
      for (let i = 0; i < L.length; i++) { L[i] = knee(L[i]); R[i] = knee(R[i]); }
      return { l: L, r: R };
    });
    });
  }

  /* ---- the deck ---------------------------------------------------------- */
  let ctx = null, node = null, out = null, clickOut = null, clickNoise = null, ready = null, analyser = null, bg = null;
  let playing = false, holding = false, lifted = false;
  let belt = 33, vol = 0.7, pos = 0, cur = null, token = 0;
  /* the speed to read a record at: the belt's over the record's own */
  const baseFor = (tr) => RPM(belt) / RPM(tr ? tr.rpm : belt);
  const base = () => baseFor(cur);
  const level = () => Math.max(0.0001, vol * vol);                  // a fader is not linear to the ear
  let onchange = null;
  const changed = () => { if (onchange) { try { onchange(cur); } catch (e) { /* the page's problem */ } } };
  const newSeed = () => (Math.random() * 0xffffffff) >>> 0;

  function setup() {
    if (ctx) return ready;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
    /* a tap on what is heard, for the deck's spectrum display */
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.72;
    analyser.minDecibels = -100; analyser.maxDecibels = -24;
    out.connect(analyser);
    clickOut = ctx.createGain(); clickOut.gain.value = 0.5; clickOut.connect(ctx.destination);
    /* on a phone, played on with the screen off (vinyl-player.js) */
    bg = window.VinylPlayer && window.VinylPlayer.background ? window.VinylPlayer.background(ctx, [out, clickOut]) : null;
    clickNoise = ctx.createBuffer(1, Math.round(ctx.sampleRate / 4), ctx.sampleRate);
    const cd = clickNoise.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = Math.random() * 2 - 1;
    ready = ctx.audioWorklet.addModule(near('../stylus.js')).then(() => {
      node = new AudioWorkletNode(ctx, 'vinyl', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      node.connect(out);
      node.port.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === 'pos') pos = m.at;
        else if (m.type === 'track') {
          if (deckPress) deckPress.kill();
          deckPress = nextPress; nextPress = null;
          if (deckPress) deckPress.role = 'deck';
          cur = cur && cur.next; pos = 0; changed();
          if (playing && !holding) rateTo(base(), 0.05);   // the new record at its own speed
          queueNext(cur);
        }
      };
    });
    return ready;
  }
  const rateParam = () => node.parameters.get('rate');
  function rateTo(v, tc) {
    if (!node) return;
    const p = rateParam(), now = ctx.currentTime;
    p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.setTargetAtTime(v, now, tc);
  }
  const post = (m, transfer) => { if (node) node.port.postMessage(m, transfer || []); };
  const stepOf = (tr) => ((tr && tr.sr) || SR) / ctx.sampleRate;

  /* ---- pressing: a record made a segment at a time, and streamed ----------
     A track is pressed in segments - two bars first (so the needle has
     something within moments), then four, then eight at a time - each
     crossfaded onto the last over its overlap, turned to 16-bit and handed
     to whoever is listening: the deck, if the record is on it. One render
     runs at a time, the most needed first: the record on the deck while it
     is less than half a minute ahead of the needle, then the B-side once it
     is offered, then the next track, then the one waiting on the shelf. */
  let pressId = 0;
  const HEAD_CAP = 48;                             // bars a waiting record is pressed ahead (about a minute and a half)
  const pressings = new Set();
  /* the renders running now (a render cannot be stopped mid-way); a second
     may start beside one only for a record already taken off, or when the
     needle has been dropped where nothing is pressed yet */
  const inflight = new Set();
  /* A record is pressed in parts, from wherever the needle wants sound next:
     from the start, and from where it is dropped if that is not pressed yet
     (a short part first there, so it sounds at once, then longer ones), the
     gaps left behind filled in after. Each part is its own render, so any
     order works; where two meet, the one rendered second crossfades over
     the other's edge. */
  function Pressing(tr, role) {
    this.id = ++pressId; this.tr = tr; this.total = totalOf(tr); this.role = role;
    this.done = []; this.taken = []; this.want = 0; this.run = 0; this.lastEnd = -1;
    this.heads = {}; this.tails = {}; this.parts = []; this.filled = 0; this.count = 0;
    this.dead = false; this.sink = null; this.waiters = [];
    pressings.add(this);
    later(work);
  }
  const inRanges = (list, x) => list.some(([a, b]) => x >= a && x < b);
  Pressing.prototype.has = function (bar) { return inRanges(this.done, bar) || inRanges(this.taken, bar); };
  Pressing.prototype.headBars = function () { let e = 0; while (e < this.tr.bars && this.has(e)) e++; return e; };   // pressed (or pressing) from the start, unbroken
  Pressing.prototype.complete = function () { return this.done.length === 1 && this.done[0][0] === 0 && this.done[0][1] >= this.tr.bars; };
  Pressing.prototype.needleBar = function () { return Math.min(this.tr.bars - 1, Math.floor(pos * this.tr.bars)); };
  /* the next part to press: from the bar wanted (or the first gap), growing 2, 4, 8 bars */
  Pressing.prototype.nextPart = function () {
    const bars = this.tr.bars;
    let at = -1;
    for (let x = this.want; x < bars && at < 0; x++) if (!this.has(x)) at = x;
    for (let x = 0; x < this.want && at < 0; x++) if (!this.has(x)) at = x;
    if (at < 0) return null;
    if (at !== this.lastEnd) this.run = 0;
    /* from the start: 2, 4, then 8 bars; from a dropped needle: a single bar first, to sound at once */
    const len = (at === 0 ? [2, 4] : [1, 2, 4])[this.run] || 8;
    let end = at + 1;
    while (end < Math.min(bars, at + len) && !this.has(end)) end++;
    this.run++; this.lastEnd = end;
    return [at, end];
  };
  Pressing.prototype.urgency = function () {
    if (this.role === 'deck') {
      /* the needle on silence: nothing matters more; else while it is less
         than half a minute ahead, and then on to the end, before the next record */
      const nb = this.needleBar();
      if (!inRanges(this.done, nb)) return 5;
      let e = nb;
      while (e < this.tr.bars && inRanges(this.done, e)) e++;
      const ahead = (at(this.tr, e) - pos * this.total) / ((this.tr && this.tr.sr) || SR);
      return ahead < 30 ? 4 : 2.5;
    }
    return { b: 3, next: 2, shelf: 1 }[this.role] || 0;
  };
  Pressing.prototype.kill = function () { this.dead = true; pressings.delete(this); this.parts = []; };
  /* the first sound is ready */
  Pressing.prototype.started = function () {
    return this.parts.length || this.count ? Promise.resolve(this) : new Promise((res) => this.waiters.push(res));
  };
  const merge = (list, a, b) => {
    const all = list.concat([[a, b]]).sort((x, y) => x[0] - y[0]), out = [];
    all.forEach(([x, y]) => { const l = out[out.length - 1]; if (l && x <= l[1]) l[1] = Math.max(l[1], y); else out.push([x, y]); });
    return out;
  };
  const toPcm16 = (l, r, from, len) => {
    const L = new Int16Array(len), R = new Int16Array(len);
    for (let i = 0; i < len; i++) {
      L[i] = Math.max(-1, Math.min(1, l[from + i])) * 32767;
      R[i] = Math.max(-1, Math.min(1, r[from + i])) * 32767;
    }
    return { l: L, r: R };
  };
  Pressing.prototype.add = function (seg, a, b) {
    const tr = this.tr, n = at(tr, b) - at(tr, a), F = Math.min(FADE, n);
    const send = (part) => { if (this.sink) this.sink(part); else this.parts.push(part); };
    /* this part's own edges, kept for whichever neighbour comes second */
    const head = { l: seg.l.slice(0, F), r: seg.r.slice(0, F) };
    const tail = b < tr.bars ? { l: seg.l.slice(n, n + FADE), r: seg.r.slice(n, n + FADE) } : null;
    /* the part before is in: crossfade out of its tail into this */
    const before = this.tails[a];
    if (before) {
      for (let i = 0; i < F; i++) {
        const w = i / FADE;
        seg.l[i] = seg.l[i] * w + before.l[i] * (1 - w);
        seg.r[i] = seg.r[i] * w + before.r[i] * (1 - w);
      }
      delete this.tails[a];
    } else if (a > 0) this.heads[a] = head;
    const len = Math.min(n, seg.l.length);
    send(Object.assign({ offset: at(tr, a) }, toPcm16(seg.l, seg.r, 0, len)));
    /* the part after is in already (pressed first, from a dropped needle):
       its first moment again, crossfaded out of this one's tail */
    if (tail) {
      const after = this.heads[b];
      if (after) {
        const k = Math.min(after.l.length, tail.l.length), l = new Float32Array(k), r = new Float32Array(k);
        for (let i = 0; i < k; i++) { const w = i / FADE; l[i] = after.l[i] * w + tail.l[i] * (1 - w); r[i] = after.r[i] * w + tail.r[i] * (1 - w); }
        send(Object.assign({ offset: at(tr, b) }, toPcm16(l, r, 0, k)));
        delete this.heads[b];
      } else this.tails[b] = tail;
    }
    this.done = merge(this.done, a, b);
    this.filled = this.done[0] && this.done[0][0] === 0 ? at(tr, this.done[0][1]) : 0;   // pressed from the start, unbroken
    this.count++;
    this.waiters.splice(0).forEach((f) => f(this));
  };
  /* hand the record to a listener: what is pressed so far, then each part as it comes */
  Pressing.prototype.feed = function (fn) {
    this.sink = fn;
    this.parts.splice(0).forEach(fn);
  };
  function work() {
    const busy = [...inflight].filter((j) => !j.p.dead);
    if (busy.length >= 2) return;
    /* the needle on silence may jump the queue, beside a render already going */
    const rescue = deckPress && !deckPress.dead && deckPress.urgency() === 5 && !deckPress.has(deckPress.needleBar());
    if (busy.length && !rescue) return;
    let best = null, u = 0;
    pressings.forEach((p) => {
      if (p.dead || p.complete()) return;
      if (!armed && p.headBars() >= Math.min(Math.ceil(p.tr.bars / 2), HEAD_CAP)) return;   // on the poster: the opening, ready for START
      /* a record waiting (on the shelf, or next) is pressed only so far ahead: a
         long one whole would be tens of megabytes before it is even playing */
      if ((p.role === 'shelf' || p.role === 'next') && p.headBars() >= Math.min(p.tr.bars, HEAD_CAP)) return;
      if (rescue && p !== deckPress) return;
      const v = p.urgency();
      if (v > u) { best = p; u = v; }
    });
    if (!best) return;
    if (best === deckPress && best.role === 'deck' && !inRanges(best.done, best.needleBar())) best.want = best.needleBar();
    const part = best.nextPart();
    if (!part) return;
    const [a, b] = part, job = { p: best, a, b };
    best.taken.push(part);
    inflight.add(job);
    const untake = () => { best.taken = best.taken.filter((x) => x !== part); };
    renderSegment(best.tr, a, b).then((seg) => { untake(); if (!best.dead) best.add(seg, a, b); }, (e) => {
      untake();
      if (window.console) console.warn('[soon] a segment did not render:', e && e.message);
      if (!best.retried) { best.retried = true; return; }      // once more (the part is free again)
      const wasDeck = best === deckPress;
      best.kill();
      if (wasDeck && playing) replaceDeck();           // never left silent: another record goes on
    })
      .then(() => {
        if (best.complete() && best.role !== 'shelf' && best.role !== 'b') pressings.delete(best);
        inflight.delete(job);
        later(work);
      });
  }


  /* a record ready on the shelf: one pressed while the page loads (no tap
     needed to render), and another after each is used */
  /* ---- the critic ---------------------------------------------------------
     Six tracks are written for every one that is pressed, and the best of
     them made: a melody that moves mostly by step with a leap or two, over a
     range of a fifth or so, not too busy or too bare; unlike the last few
     records (another lead, other builds and drops, another key and tempo);
     and leaning towards what this visitor has liked before. */
  const recent = [];
  let likes = {};
  try { likes = JSON.parse(localStorage.getItem(LIKES) || '{}') || {}; } catch (e) { likes = {}; }
  const featuresOf = (tr) => ({ style: tr.style, lead: tr.leadVoice, counter: tr.counter, rhythm: tr.rhythm, bass: tr.bassLine,
    build: tr.builds[0] && tr.builds[0].type, drop: tr.drops[0] && tr.drops[0].type, scale: tr.scale });
  /* what the ear tells apart, for not repeating ourselves: the lead's kind
     of instrument (not just its name), the motif's rhythm and its shape (up,
     down, same), the progression, how its builds and drops are made */
  const famOf = (v) => (!v ? 'none' : SAMPLED[v] ? SAMPLED[v].fam : v === 'pluck' || v === 'blip' ? 'pluck' : v === 'bell' ? 'ring' : v === 'keys' || v === 'wurli' ? 'keys' : 'synth');
  const contourOf = (mel) => { const ns = (mel.hook || []).filter((v) => typeof v === 'number'); return ns.slice(1).map((v, i) => Math.sign(v - ns[i])).join(''); };
  const earOf = (tr) => ({ fam: famOf(tr.lead ? tr.leadVoice : null), motif: tr.mel.rhythm || '', contour: contourOf(tr.mel), prog: tr.prog.join(''),
    moves: (tr.moves || []).map((m) => m.concept).join(',') + (tr.plan ? '|' + tr.plan.form + '|' + tr.scripts.map((x) => x.v).join(',') : ''), counterFam: famOf(tr.counter), bpm: tr.bpm });
  function melodyScore(mel) {
    const notes = mel.hook.concat(mel.answer).filter((v) => typeof v === 'number');
    if (notes.length < 4) return -2;
    let steps = 0, leaps = 0, repeats = 0, run = 0;
    for (let i = 1; i < notes.length; i++) {
      const d = Math.abs(notes[i] - notes[i - 1]);
      if (d <= 1) steps++;
      if (d >= 4) leaps++;
      if (d === 0) { if (++run >= 2) repeats++; } else run = 0;
    }
    const ratio = steps / (notes.length - 1), range = Math.max(...notes) - Math.min(...notes), perBar = notes.length / 4;
    return 1.5 - Math.abs(ratio - 0.62) * 2.5 - leaps * 0.25 - repeats * 0.3
      - (range < 4 ? (4 - range) * 0.3 : range > 9 ? (range - 9) * 0.3 : 0)
      - (perBar < 2.5 ? 0.5 : perBar > 6.5 ? 0.4 : 0);
  }
  function scoreTrack(tr) {
    let s = melodyScore(tr.mel);
    const f = featuresOf(tr);
    const e = earOf(tr);
    recent.forEach((p, i) => {
      const g = featuresOf(p), h = earOf(p), w = 1 / (i + 1);
      ['lead', 'counter', 'rhythm'].forEach((k) => { if (f[k] === g[k]) s -= 0.2 * w; });
      /* the same kind of lead, the same motif, the same shape, chords or arrangement: heard as the same record */
      if (tr.style === p.style) s -= 0.2 * w;
      if (e.fam === h.fam) s -= 0.3 * w;
      if (e.motif && e.motif === h.motif) s -= 0.35 * w;
      if (e.contour === h.contour) s -= 0.3 * w;
      if (e.prog === h.prog) s -= 0.2 * w;
      if (e.moves === h.moves) s -= 0.2 * w;
      if (e.counterFam === h.counterFam) s -= 0.1 * w;
      if (Math.abs(h.bpm - e.bpm) < 2) s -= 0.1 * w;
      /* (the key is left alone: two records in one key in a row is fine) */
    });
    Object.entries(f).forEach(([k, v]) => { s += 0.2 * Math.min(3, likes[k + ':' + v] || 0) / 3; });
    return s;
  }
  function pickTrack(rpm) {
    let best = null;
    for (let i = 0; i < 6; i++) {
      const tr = compose(newSeed(), 'a', rpm), sc = scoreTrack(tr);
      if (!best || sc > best.sc) best = { tr, sc };
    }
    recent.unshift(best.tr);
    if (recent.length > 4) recent.length = 4;
    return best.tr;
  }
  /* a like: this record's choices remembered, for the critic to lean towards */
  function like() {
    if (!cur) return false;
    Object.entries(featuresOf(cur)).forEach(([k, v]) => { if (v != null) likes[k + ':' + v] = (likes[k + ':' + v] || 0) + 1; });
    try { localStorage.setItem(LIKES, JSON.stringify(likes)); } catch (e) { /* this visit only, then */ }
    return true;
  }

  const shelf = {};                                // by rpm
  let armed = false;                               // until START, only the opening of one record is pressed
  function setStyle(name) {
    chosen = STYLES[name] && name !== 'bside' ? name : null;
    Object.keys(shelf).forEach((k) => { if (shelf[k] && chosen && shelf[k].tr.style !== chosen) { shelf[k].kill(); shelf[k] = null; } });
  }
  function press(rpm) {
    if (!shelf[rpm] || shelf[rpm].dead) shelf[rpm] = new Pressing(pickTrack(rpm), 'shelf');
    return shelf[rpm];
  }
  function take(rpm) {
    const p = shelf[rpm] && !shelf[rpm].dead ? shelf[rpm] : new Pressing(pickTrack(rpm), 'shelf');
    shelf[rpm] = null;
    setTimeout(() => { if (armed) press(rpm); }, 3000);
    return p;
  }

  /* on the deck: the worklet is given the record's length, then its parts as they are pressed */
  let deckPress = null, nextPress = null;
  function onDeck(p, at, asNext) {
    p.role = asNext ? 'next' : 'deck';
    post(asNext ? { type: 'next', id: p.id, total: p.total, step: stepOf(p.tr) } : { type: 'track', id: p.id, total: p.total, step: stepOf(p.tr), at });
    p.feed((part) => post({ type: 'append', id: p.id, offset: part.offset, l: part.l, r: part.r }, [part.l.buffer, part.r.buffer]));
    later(work);
  }
  function replaceDeck() {
    const p = take(belt);
    deckPress = p; cur = p.tr; pos = 0;
    changed();
    onDeck(p, 0);
  }
  function clearDeck() {
    if (deckPress) deckPress.kill();
    if (nextPress) nextPress.kill();
    deckPress = nextPress = null;
  }

  /* the track after this one, streamed in behind it */
  function queueNext(track) {
    if (!track) return;
    const t = token;
    setTimeout(() => {
      if (t !== token || !playing || cur !== track || nextPress) return;
      const p = take(belt);                          // the next record matches the belt
      track.next = p.tr;
      nextPress = p;
      onDeck(p, 0, true);
    }, 2000);
  }

  async function start(delay, at) {
    setup();
    if (bg) bg.play();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* stays silent */ } }
    if (playing) return;
    playing = true; holding = false;
    const t = ++token;
    at = Math.max(0, Math.min(0.98, at || 0));
    pos = at;
    try { await ready; } catch (e) { playing = false; return; }
    if (t !== token) return;
    clearDeck();
    const p = take(belt);
    deckPress = p; cur = p.tr;
    changed();
    onDeck(p, at);
    const now = ctx.currentTime, when = now + Math.max(0, (delay || 0) - 0.3);
    out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(lifted ? 0.0001 : level(), now);
    /* the motor: up to speed in a moment, the pitch rising with it (the
       deck waits in place until the first sound is pressed) */
    const r = rateParam();
    r.cancelScheduledValues(now); r.setValueAtTime(0, now); r.setTargetAtTime(holding ? 0 : base(), when, 0.12);
    queueNext(cur);
  }

  /* the B-side: pressed as soon as someone could ask for it (the page calls
     prepareB when it is offered), so the flip has sound at once */
  let bPress = null;
  function pressB() {
    if (!bPress || bPress.dead) bPress = new Pressing(compose(B_SEED, 'b'), 'b');
    return bPress;
  }

  /* the record turned over: whatever is on comes to a stop under the
     hand, and the B-side goes on from its first groove */
  async function flip() {
    setup();
    if (bg) bg.play();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* stays silent */ } }
    const t = ++token;
    rateTo(0, 0.12);
    playing = true; holding = false;
    try { await ready; } catch (e) { playing = false; return; }
    if (t !== token) return;
    clearDeck();
    const p = pressB(); bPress = null;               // this copy goes on the deck; another is pressed if wanted again
    deckPress = p; cur = p.tr; pos = 0;
    changed();
    onDeck(p, 0);
    const now = ctx.currentTime, r = rateParam();
    out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(lifted ? 0.0001 : level(), now);
    r.cancelScheduledValues(now); r.setValueAtTime(0, now); r.setTargetAtTime(base(), now + 0.05, 0.12);
    queueNext(cur);
  }

  /* a stop is a brake: the platter slows under it, the pitch sinking */
  function stop() {
    if (!ctx || !playing) return;
    playing = false; holding = false;
    if (bg) bg.pause();
    const t = ++token;
    rateTo(0, 0.3);
    setTimeout(() => { if (t === token) { post({ type: 'clear' }); clearDeck(); } }, 2500);
  }

  /* a hand on the record: it stops under the hand, then goes where it is pushed */
  function hold() { if (playing) { holding = true; rateTo(0, 0.05); } }
  function scratch(r) { if (playing && holding) rateTo(r, 0.012); }
  function release() { if (holding) { holding = false; if (playing) rateTo(base(), 0.09); } }

  /* the needle dropped anywhere: if that stretch is not pressed yet, the
     press starts there (beside whatever it was doing), and the needle waits
     on it for the moment that takes */
  function seek(at) {
    pos = Math.max(0, Math.min(1, at));
    post({ type: 'seek', at: pos });
    if (deckPress && !deckPress.dead) {
      deckPress.want = deckPress.needleBar();
      later(work);
    }
  }
  /* the arm in the air: no sound, though the record turns on underneath */
  function lift(up) {
    if (!ctx || lifted === up) return;
    lifted = up;
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(up ? 0.0001 : level(), ctx.currentTime, up ? 0.02 : 0.05);
  }
  function volume(v) {
    vol = Math.min(1, Math.max(0, v));
    if (ctx && !lifted) out.gain.setTargetAtTime(level(), ctx.currentTime, 0.04);
  }
  /* the belt: the record on it speeds up or slows down to it, the pitch
     sliding, as a belt does when it changes pulleys */
  function speed(rpm) {
    belt = rpm === 45 ? 45 : 33;
    /* a record of this speed on the shelf for the next needle drop (made only
       now, when someone has asked for this speed: two in memory is plenty) */
    if (armed && !shelf[belt]) press(belt);
    if (playing && !holding) rateTo(base(), 0.25);
  }

  /* a switch's tick: a short bright noise burst with a little body under
     it, on its own output so it sounds with the record stopped too */
  function click(heavy) {
    setup();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime + 0.005, g = (heavy ? 0.5 : 0.32) * (0.35 + 0.65 * vol);
    const s = ctx.createBufferSource(); s.buffer = clickNoise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = heavy ? 2600 : 4200; f.Q.value = 1.4;
    const v = ctx.createGain(); v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.035 : 0.018));
    s.connect(f); f.connect(v); v.connect(clickOut); s.start(t, Math.random() * 0.15); s.stop(t + 0.05);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(heavy ? 180 : 320, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.03);
    const b = ctx.createGain(); b.gain.setValueAtTime(g * 0.6, t); b.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    o.connect(b); b.connect(clickOut); o.start(t); o.stop(t + 0.05);
  }

  return {
    start, stop, hold, scratch, release, seek, lift, volume, speed, click,
    /* the first record, for the loader; then one of the other speed */
    prepare() {
      armed = true;
      const first = press(belt).started();
      first.then(() => setTimeout(loadModel, 6000), () => {});    // the model's melodies, once the first record is going
      return first;
    },
    get modelMelodies() { return modelPool.length; },
    prefetch,
    like,
    /* the styles to pick from, and the pick: every A-side record from now on
       is of it ('' or an unknown name: the rotation) */
    styles: ROTATION.map((k) => [k, STYLES[k].label]),
    style: setStyle,
    /* progressive house's length: 'full' (6-8.5 minutes, the default) or
       'short' (the old radio edit); for records pressed from now on */
    edit(mode) { edit = mode === 'short' ? 'short' : 'full'; },
    /* on the poster: from the moment the page opens, the first half of a
       record in this style pressed ahead, so START has nothing to wait for
       and the needle can be dropped anywhere in it (a new pick throws it away) */
    warm(name) { setStyle(name); press(belt); },
    flip,
    prepareB: () => { pressB(); },
    /* what failed to load (development): [{ kind, name, detail, at }] */
    diagnostics: () => diag.slice(),
    set onchange(fn) { onchange = fn; },
    /* the preloader's ear: told (done, more) as instrument notes are fetched */
    set onsamples(fn) { sampleWatch = fn; },
    set onpressing(fn) { pressWatch = fn; },
    position: () => pos,
    rate: () => (node ? rateParam().value : 0),
    /* the spectrum of what is heard now, into a byte array (false until there is sound) */
    levels(into) { if (!analyser) return false; analyser.getByteFrequencyData(into); return true; },
    get bins() { return analyser ? analyser.frequencyBinCount : 0; },
    get sampleRate() { return ctx ? ctx.sampleRate : 48000; },
    /* the platter's turn, against 33 1/3: how fast the record reads, times its own speed */
    spin: () => (node ? rateParam().value * RPM(cur ? cur.rpm : belt) / 33.33 : 0),
    get recordRpm() { return RPM(cur ? cur.rpm : belt); },
    get playing() { return playing; },
    get track() { return cur; }
  };
})();
