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
    bside:   [[0, 3, 0], [10, 3, 0]]
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
                 leads: ['organ', 'pluck', 'keys', 'saxophone', 'trumpet', 'sawlead'], leadPats: ['hook', 'arp'], leadChance: 0.8, form: 'edm', roll: 'roll', fill: 'hat',
                 fx: { verb: 0.3, verbLen: 2, delay: 3, fb: 0.3, dmix: 0.2, pump: 0.3, bright: 13000 } },
    deep:      { label: 'deep house', bpm: [118, 124], swing16: 0.12, kit: 'deep', beats: 'house', bass: ['off', 'house'],
                 tones: ['sub', 'saw'], harmony: 'minor', scales: ['minor', 'dorian'], sevenths: 0.9, bpc: [1, 2],
                 rhythms: ['stab', 'keys', 'pad', 'wurli'], pads: ['dark'], waves: ['sawtooth'],
                 leads: ['keys', 'bell', 'saxophone', 'flute', 'guitar-electric'], leadPats: ['hook'], leadChance: 0.7, form: 'edm', roll: 'roll', fill: 'hat',
                 fx: { verb: 0.4, verbLen: 2.6, delay: 3, fb: 0.35, dmix: 0.25, pump: 0.3, sat: 0.1, bright: 9000 } },
    prog:      { label: 'progressive house', bpm: [122, 128], kit: 'k909', beats: 'tech', bass: ['roll', 'trance'],
                 tones: ['saw', 'reese'], harmony: 'minor', scales: ['minor', 'dorian'], sevenths: 0.3, bpc: [2, 4],
                 rhythms: ['pad', 'stabpad'], pads: ['strings', 'dark'], waves: ['sawtooth'],
                 leads: ['pluck', 'bell', 'sawlead', 'violin', 'harp'], leadPats: ['arp'], leadChance: 1, form: 'prog', roll: 'roll', fill: 'hat',
                 fx: { verb: 0.42, verbLen: 3, delay: 3, fb: 0.42, dmix: 0.3, pump: 0.32, chorus: 0.25, bright: 13500 } },
    melodic:   { label: 'melodic house', bpm: [120, 124], kit: 'organic', beats: 'tech', bass: ['off', 'roll'],
                 tones: ['sub', 'reese'], harmony: 'minor', scales: ['minor'], sevenths: 0.4, bpc: [2],
                 rhythms: ['pad'], pads: ['strings', 'dark'], waves: ['sawtooth'], leadOct: 2,
                 leads: ['bell', 'pluck', 'violin', 'flute', 'sawlead', 'xylophone'], leadPats: ['arp', 'hook'], leadChance: 1, form: 'prog', roll: 'roll', fill: 'hat',
                 fx: { verb: 0.55, verbLen: 3.6, delay: 3, fb: 0.48, dmix: 0.35, pump: 0.28, chorus: 0.35, bright: 11000 } },
    uplift:    { label: 'uplifting trance', bpm: [138, 142], kit: 'rumble', beats: 'trance', bass: ['trance'],
                 tones: ['saw', 'reese'], harmony: 'trance', scales: ['minor', 'major'], sevenths: 0, bpc: [2],
                 rhythms: ['pad', 'gate'], pads: ['strings', 'bright'], waves: ['sawtooth'],
                 leads: ['supersaw', 'sawlead', 'violin'], leadPats: ['hook', 'arp'], leadChance: 1, form: 'trance', roll: 'roll', fill: 'snare',
                 fx: { verb: 0.5, verbLen: 3.2, delay: 3, fb: 0.4, dmix: 0.28, pump: 0.4, chorus: 0.3, bright: 15000 } },
    trance:    { label: 'classic trance', bpm: [130, 138], kit: 'rumble', beats: 'trance', bass: ['trance', 'roll'],
                 tones: ['saw', 'square'], harmony: 'minor', scales: ['minor', 'phrygian'], sevenths: 0, bpc: [2, 4],
                 rhythms: ['gate', 'pad'], pads: ['dark', 'strings'], waves: ['sawtooth', 'square'],
                 leads: ['supersaw', 'pluck', 'acid', 'sawlead', 'violin'], leadPats: ['arp', 'acid'], leadChance: 1, form: 'trance', roll: 'roll', fill: 'snare',
                 fx: { verb: 0.42, verbLen: 2.8, delay: 3, fb: 0.45, dmix: 0.3, pump: 0.35, sat: 0.15, bright: 13500 } },
    lofi:      { label: 'lo-fi', bpm: [72, 90], swing8: 0.38, human: true, kit: 'dusty', beats: 'lofi', bass: ['lofi'],
                 tones: ['sub', 'saw'], harmony: 'jazz', scales: ['major', 'dorian'], sevenths: 1, bpc: [1, 2],
                 rhythms: ['keys'], pads: ['dark'], waves: ['triangle'], leadOct: 2,
                 leads: ['keys', 'saxophone', 'guitar-nylon', 'flute', 'muted-trumpet'], leadPats: ['hook'], leadChance: 0.7, form: 'song', roll: 'none', fill: 'snare',
                 fx: { verb: 0.3, verbLen: 1.6, sat: 0.35, wobble: 1, crackle: 1, bright: 4200 } },
    disco:     { label: 'disco house', bpm: [118, 125], swing16: 0.06, kit: 'disco', beats: 'disco', bass: ['octave', 'disco'],
                 tones: ['saw', 'square'], harmony: 'major', scales: ['major', 'mixo', 'dorian'], sevenths: 0.6, bpc: [1, 2],
                 rhythms: ['pump', 'chop', 'stabpad'], pads: ['bright', 'strings'], waves: ['sawtooth', 'square'],
                 leads: ['organ', 'keys', 'trumpet', 'saxophone', 'violin', 'guitar-electric'], leadPats: ['hook'], leadChance: 0.8, form: 'edm', roll: 'roll', fill: 'snare',
                 fx: { verb: 0.3, verbLen: 1.8, delay: 2, fb: 0.25, dmix: 0.15, pump: 0.45, sat: 0.2, chorus: 0.35, bright: 12500 } },
    acid:      { label: 'acid house', bpm: [120, 128], kit: 'k909', beats: 'house', bass: ['roll', 'off'],
                 tones: ['acid'], harmony: 'minor', scales: ['minor', 'phrygian', 'dorian'], sevenths: 0, bpc: [4],
                 rhythms: ['lone', 'organ'], pads: ['dark'], waves: ['square'],
                 leads: ['acid'], leadPats: ['acid'], leadChance: 1, form: 'edm', roll: 'roll', fill: 'hat',
                 fx: { verb: 0.25, verbLen: 2, delay: 3, fb: 0.4, dmix: 0.25, pump: 0.25, sat: 0.4, bright: 14000 } },
    chicago:   { label: 'chicago house', bpm: [118, 125], swing16: 0.16, kit: 'k909t', beats: 'house', bass: ['house', 'octave'],
                 tones: ['square', 'saw'], harmony: 'both', scales: ['dorian', 'major', 'minor'], sevenths: 0.75, bpc: [1, 2],
                 rhythms: ['stab', 'keys', 'piano', 'organ'], pads: ['bright'], waves: ['square'],
                 leads: ['organ', 'keys', 'saxophone', 'trumpet', 'squarelead'], leadPats: ['hook'], leadChance: 0.7, form: 'edm', roll: 'roll', fill: 'snare',
                 fx: { verb: 0.22, verbLen: 1.6, delay: 2, fb: 0.25, dmix: 0.15, pump: 0.2, sat: 0.35, bright: 12000 } },
    minimal:   { label: 'minimal house', bpm: [120, 126], swing16: 0.1, kit: 'soft', beats: 'minimal', bass: ['off', 'dub'],
                 tones: ['sub'], harmony: 'one', scales: ['minor', 'dorian'], sevenths: 0.8, bpc: [4],
                 rhythms: ['lone', 'dubstab', 'wurli'], pads: ['dark'], waves: ['sawtooth'], leadOct: 2,
                 leads: ['pluck', 'bell', 'squarelead', 'xylophone'], leadPats: ['hook'], leadChance: 0.35, form: 'edm', roll: 'sweep', fill: 'hat',
                 fx: { verb: 0.38, verbLen: 2.6, delay: 3, fb: 0.5, dmix: 0.35, pump: 0.18, sat: 0.12, bright: 8500 } },
    tech:      { label: 'tech house', bpm: [124, 128], swing16: 0.08, kit: 'k2step', beats: 'tech', bass: ['roll', 'garage'],
                 tones: ['saw', 'square', 'reese'], harmony: 'minor', scales: ['minor', 'phrygian'], sevenths: 0.3, bpc: [2, 4],
                 rhythms: ['chop', 'lone'], pads: ['dark'], waves: ['square', 'sawtooth'],
                 leads: ['acid', 'pluck', 'organ', 'trumpet', 'squarelead', 'guitar-electric'], leadPats: ['acid', 'hook'], leadChance: 0.55, form: 'edm', roll: 'sweep', fill: 'hat',
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
    const arr = arrange(S, rpm, r);
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
    tr.mel = writeMelody(r, pick);
    /* or the model's: a melody MusicVAE wrote (learned from real music),
       put into this key and developed the same way */
    if (side !== 'b' && modelPool.length && r() < 0.65) {
      const m = fromModel(modelPool[Math.floor(r() * modelPool.length)], tr.scale, pick);
      if (m) { tr.mel = m; tr.melBy = 'model'; }
    }
    /* (the hook's first bar, as chord tones and rests, for the parts that
       only need to know where it rests) */
    tr.hook = tr.mel.hook.slice(0, 8).map((v) => (typeof v === 'number' ? ((v % 4) + 4) % 4 : -1));
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
    /* harmony with a turn in it: one chord borrowed from the parallel key for
       the breakdown and the later phrases, and (some dance tracks) the last
       drop lifted a whole step */
    tr.borrow = tr.prog.length > 1 && r() < 0.55 ? Math.floor(r() * tr.prog.length) : null;
    tr.keyUp = !!DANCE[S.form] && count('drop') >= 2 && r() < 0.4;
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
    /* every sampled instrument this track will need loaded */
    const synthLead = { pluck: 1, supersaw: 1, bell: 1, acid: 1, keys: 1, sawlead: 1, squarelead: 1 };
    const RESP_SAMPLES = { 'brass-hit': ['trumpet', 'trombone'], 'string-stab': ['violin'], 'guitar-lick': ['guitar-electric'], 'sax-lick': ['saxophone'] };
    tr.samples = [...new Set([
      ...(RESP_SAMPLES[tr.resp] || []), tr.revPiano || tr.rhythm === 'piano' ? tr.piano : null,
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
  const totalOf = (tr) => Math.ceil(tr.bars * barSec(tr) * SR);
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
  const at = (tr, bar) => Math.round(bar * barSec(tr) * SR);          // a bar's first sample
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

  function renderSegment(tr, a, b) {
    const T = tone();
    if (!T) return Promise.reject(new Error('Tone.js not loaded'));
    const S = STYLES[tr.style], FX = S.fx, KIT = KITS[S.kit];
    let BT = tr.beat;                                  // the beat this bar (two alternate by phrase)
    const dance = !!DANCE[S.form];                     // a form that builds and drops
    const STEP = 60 / tr.bpm / 4, BAR = STEP * 16, BEAT = STEP * 4;
    const from = Math.max(0, a - LEAD), off = from * BAR;
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
      const filter = new T.Filter({ type: 'lowpass', frequency: 800, Q: 0.7, rolloff: -12 }).connect(head);

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
        const send = new T.Gain(FX.dmix);
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
      function bass(t, f0, g, dur) {
        const v = Math.min(1, g / 0.42);
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
          return (t, f0, g, dur) => {
            const d = Math.max(dur, STEP * 2);
            if (vib) vibrato(vib, t, d);
            sm.triggerAttackRelease(f0 * k, d, t, Math.min(1, g / 0.04));
          };
        }
        if (role && !resolved[role]) resolved[role] = { want: lv, played: lv, source: 'synth' };
        if (lv === 'keys') return (t, f0, g, dur) => rhodes.triggerAttackRelease(f0, Math.max(dur, 0.6), t, Math.min(1, (g / 0.04) * 0.8));
        const syn = lv === 'pluck' ? plucks({ attackNoise: 1.2, dampening: 4200, resonance: 0.92, volume: -6 }, 3)
          /* the organ without its recordings: drawbars (a fundamental, the octave and twelfth), a slow rotor */
          : lv === 'organ-synth' ? pool(() => new T.Synth({ oscillator: { type: 'custom', partials: [1, 0.7, 0.45, 0, 0.25, 0, 0, 0.12] }, envelope: { attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.12 }, volume: -20 }), 4)
          /* a flute's breath: a sine, a little air, vibrato late */
          : lv === 'flute' ? pool(() => new T.Synth({ oscillator: { type: 'custom', partials: [1, 0.12, 0.05] }, envelope: { attack: 0.06, decay: 0.2, sustain: 0.8, release: 0.25 }, volume: -16 }), 3)
          /* brass: a saw opening through its filter as it is blown */
          : lv === 'brass' ? pool(() => new T.MonoSynth({ oscillator: { type: 'sawtooth' }, filter: { type: 'lowpass', Q: 2, rolloff: -24 },
              filterEnvelope: { attack: 0.04, decay: 0.25, sustain: 0.4, release: 0.2, baseFrequency: 350, octaves: 3 },
              envelope: { attack: 0.03, decay: 0.2, sustain: 0.6, release: 0.2 }, volume: -18 }), 4)
          : lv === 'supersaw' ? pool(() => new T.Synth({ oscillator: { type: 'fatsawtooth', count: 5, spread: 40 }, envelope: { attack: 0.004, decay: 0.2, sustain: 0.3, release: 0.15 }, volume: -22 }), 4)
          : lv === 'bell' ? pool(() => new T.FMSynth({ harmonicity: 3.5, modulationIndex: 12, envelope: { attack: 0.002, decay: 0.9, sustain: 0, release: 0.6 },
              modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.4 }, volume: -16 }), 4)
          /* held leads, not struck ones: a saw gliding note to note through a
             filter that opens on each, and a hollow square with a singer's vibrato */
          : lv === 'sawlead' ? new T.MonoSynth({ portamento: 0.045, oscillator: { type: 'fatsawtooth', count: 2, spread: 14 },
              filter: { type: 'lowpass', Q: 3, rolloff: -24 },
              filterEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.5, release: 0.3, baseFrequency: 700, octaves: 2.6 },
              envelope: { attack: 0.02, decay: 0.2, sustain: 0.85, release: 0.25 }, volume: -19 })
          : lv === 'squarelead' ? new T.MonoSynth({ portamento: 0.03, oscillator: { type: 'square' },
              filter: { type: 'lowpass', Q: 1.5, rolloff: -12 },
              filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.2, baseFrequency: 900, octaves: 2 },
              envelope: { attack: 0.015, decay: 0.15, sustain: 0.8, release: 0.2 }, volume: -22 })
          : lv === 'acid' ? new T.MonoSynth({ oscillator: { type: 'sawtooth' }, filter: { type: 'lowpass', Q: 12, rolloff: -24 },
              filterEnvelope: { attack: 0.003, decay: 0.18, sustain: 0.1, release: 0.1, baseFrequency: 260, octaves: 3.4 },
              envelope: { attack: 0.003, decay: 0.15, sustain: 0.5, release: 0.05 }, volume: -16 })
          : pool(() => new T.Synth({ oscillator: { type: 'custom', partials: [1, 0.45, 0.2, 0.1] }, envelope: { attack: 0.005, decay: 0.1, sustain: 0.8, release: 0.08 }, volume: -18 }), 4);
        const vib = lv === 'sawlead' || lv === 'squarelead' || lv === 'flute' ? sync(new T.Vibrato({ frequency: 5.5, depth: 0, wet: 1 }), 5.5) : null;
        if (lv === 'supersaw') syn.connect(new T.Filter({ type: 'lowpass', frequency: 3200 }).connect(keys));
        else if (vib) syn.chain(vib, keys);
        else syn.connect(keys);
        return (t, f0, g, dur, accent) => {
          const v = Math.min(1, (g / 0.04) * (accent ? 1.15 : 1));
          if (lv === 'acid') syn.triggerAttackRelease(f0 / 2, dur, t, accent ? 1 : v * 0.75);
          else if (lv === 'pluck') syn.triggerAttackRelease(f0, dur, t, v);
          else if (lv === 'flute') { const d = Math.max(dur, STEP * 1.6); vibrato(vib, t, d); syn.triggerAttackRelease(f0 / 2, d, t, v); }
          else if (lv === 'organ-synth' || lv === 'brass') syn.triggerAttackRelease(f0 / 2, dur, t, v);
          else if (vib) { const d = Math.max(dur, STEP * 1.6); vibrato(vib, t, d); syn.triggerAttackRelease(f0 / 2, d, t, v); }
          else syn.triggerAttackRelease(f0, lv === 'bell' ? Math.max(dur, 0.5) : dur, t, v);
        };
      }
      const bassPlayerOk = !tr.realBass || !!SM[srcOf(tr.realBass)];
      if (tr.realBass) resolved.bass = { want: tr.realBass, played: bassPlayerOk ? tr.realBass : 'synth bass', source: bassPlayerOk ? 'tonejs-instruments' : 'synth', reason: bassPlayerOk ? undefined : 'recordings did not load' };
      const lead1 = makeLead(tr.leadVoice, 'lead');
      const lead2 = tr.lead2 && tr.lead2 !== tr.leadVoice ? makeLead(tr.lead2, 'lead2') : lead1;
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
      function realCounterAt(t, s16, ch, g, barIndex) {
        const R = SAMPLED[cv], k = R.oct, v = (x) => Math.min(1, x * g);
        const tones = ch.notes.concat([ch.top]).map((h) => h * k), line = tr.counterLine;
        if (R.fam === 'keys') {
          const hits = R.hold ? [0] : tr.compVariant ? [3, 8, 14] : [0, 6, 10];
          if (has(hits, s16)) realCounter.triggerAttackRelease(ch.notes.map((h) => h * k), R.hold ? BAR * 0.98 : STEP * 3, t, v(0.75));
        } else if (R.fam === 'pluck') {
          if (s16 % 2 === 0) realCounter.triggerAttackRelease(tones[[0, 1, 2, 3, 2, 1, 2, 3][s16 / 2]], STEP * 2, t, v(0.8));
        } else if (R.fam === 'strum') {
          /* down, down-up: the strings a few milliseconds apart, the up-strokes reversed */
          const hits = { 0: 1, 6: -1, 8: 1, 12: -1, 14: 1 };
          if (hits[s16]) (hits[s16] > 0 ? ch.notes : ch.notes.slice().reverse()).forEach((h, i) => realCounter.triggerAttackRelease(h * k, STEP * 2, t + i * 0.012, v(hits[s16] > 0 ? 0.75 : 0.55)));
        } else if (R.fam === 'chop') {
          if (has(tr.compVariant ? [2, 6, 9, 13] : [1, 4, 7, 10, 14], s16)) realCounter.triggerAttackRelease(tones[(s16 >> 1) % 3], STEP * 0.8, t, v(0.75));
        } else if (R.fam === 'stab') {
          const hits = tr.compVariant ? [2, 10, 14] : [0, 3, 6, 12];
          if (has(hits, s16)) realCounter.triggerAttackRelease(ch.notes.map((h) => h * k), STEP * 1.4, t, v(0.8));
        } else if (R.fam === 'ring') {
          /* bells and vibes: chord tones on the beat, left to ring - and
             damped as the chord changes, so the last one does not ring on
             under the new */
          if (s16 === 0 && barIndex % tr.bpc === 0) realCounter.releaseAll(t);
          if (s16 % 4 === 0) realCounter.triggerAttackRelease(tones[[0, 2, 1, 3][s16 / 4]], BEAT * 1.5, t, v(0.7));
        } else if (R.fam === 'figure') {
          /* a thumb piano's or a zither's little figure of its own over two beats, repeating */
          if (has([0, 3, 6, 8, 11], s16)) { const n = line[[0, 3, 6, 8, 11].indexOf(s16) + (barIndex % 2) * 3]; if (n >= 0) realCounter.triggerAttackRelease(tones[n], STEP * 2, t, v(0.8)); }
        } else if (R.fam === 'bowed') {
          /* long notes, two beats each, along the counter line */
          if (s16 % 8 === 0) { const n = line[(s16 / 8) + (barIndex % 4) * 2]; if (n >= 0) realCounter.triggerAttackRelease(tones[n], BEAT * 2, t, v(0.8)); }
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
        const line = tr.counterLine;
        const v = (x) => Math.min(1, x * g);
        if (pat === 'piano') {
          const hits = tr.compVariant ? [3, 8, 14] : [0, 6, 10];
          if (has(hits, s16)) counterSyn.triggerAttackRelease(ch.notes, STEP * 3, t, v(0.75));
        } else if (pat === 'vibes') {
          /* the vibraphone: chord tones on the beat, left to ring */
          if (s16 % 4 === 0) counterSyn.triggerAttackRelease(tones[[0, 2, 1, 3][s16 / 4]] * 2, BEAT * 1.5, t, v(0.7));
        } else if (pat === 'marimba') {
          if (s16 % 2 === 0) { const k = [0, 1, 2, 3, 2, 1, 2, 3][s16 / 2]; counterSyn.triggerAttackRelease(tones[k] * 2, STEP * 1.5, t, v(0.8)); }
        } else if (pat === 'brass') {
          const hits = tr.compVariant ? [2, 10, 14] : [0, 3, 6, 12];
          if (has(hits, s16)) counterSyn.triggerAttackRelease(ch.notes.map((h) => h * 2), STEP * 1.4, t, v(0.8));
        } else if (pat === 'choir') {
          if (s16 === 0 && barIndex % 2 === 0) counterSyn.triggerAttackRelease(ch.notes.map((h) => h * 2), BAR * 2, t, v(0.8));
        } else if (pat === 'kalimba') {
          /* a little figure of its own over two beats, repeating */
          if (has([0, 3, 6, 8, 11], s16)) { const n = line[[0, 3, 6, 8, 11].indexOf(s16) + (barIndex % 2) * 3]; if (n >= 0) counterSyn.triggerAttackRelease(tones[n] * 2, STEP * 2, t, v(0.8)); }
        } else if (pat === 'guitar') {
          /* muted guitar: a funk chop on the chord tones */
          if (has(tr.compVariant ? [2, 6, 9, 13] : [1, 4, 7, 10, 14], s16)) counterSyn.triggerAttackRelease(tones[(s16 >> 1) % 3], STEP, t, v(0.75));
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
        if (!RV || slot0 !== 8 || s16 < 12) return;
        if (typeof phrase[14] === 'number' || typeof phrase[15] === 'number') return;   // the melody is still talking
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
        const line = tr.counterLine, tones = ch.notes.concat([ch.top]);
        /* the clarinet sings a line, the bassoon walks under it */
        if (clarinet && s16 % 4 === 2) { const n = line[((s16 >> 2) + barIndex) % 8]; if (n >= 0) clarinet.triggerAttackRelease(tones[n], STEP * 3, t, Math.min(1, 0.75 * g)); }
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
      const swellInto = (t) => hit(E.swell, t - E.swell.duration, 0.75, crashIn);      // ends on t
      const revSnareInto = (t) => hit(E.revSnare, t - E.revSnare.duration, 0.7, snareIn);
      const whoosh = (t) => hit(E.whoosh, t, 0.6, crashIn);
      /* a piano chord played backwards, swelling up to the drop's downbeat */
      const revPiano = SM[tr.piano] || SM.piano;
      const revPianoInto = tr.revPiano && revPiano ? (() => {
        const names = Object.keys(revPiano), hzOf = (n) => { const m = /^([A-G]#?)(-?\d)$/.exec(n); return 440 * Math.pow(2, (['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(m[1]) + 12 * (Number(m[2]) + 1) - 69) / 12); };
        const back = new Map();
        return (t, ch2) => {
          ch2.notes.slice(0, 3).forEach((f, i) => {
            const want = f * 2, n = names.reduce((a, b) => (Math.abs(Math.log(hzOf(b) / want)) < Math.abs(Math.log(hzOf(a) / want)) ? b : a));
            if (!back.has(n)) back.set(n, reversed(revPiano[n]));
            const buf = back.get(n), rate = want / hzOf(n), dur = buf.duration / rate;
            hit(buf, t - dur + 0.02 * i, 0.32, keys, rate);
          });
        };
      })() : null;
      const boom = (t) => hit(E.boom, t, 0.8, drums);
      const riserTone = tr.trans.riserTone || tr.builds.some((x) => x.type === 'strip') ? new T.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.1, sustain: 1, release: 0.03 }, volume: -22 })
        .connect(sync(new T.Vibrato({ frequency: 6, depth: 0.05, wet: 1 }), 6).connect(keys)) : null;
      function riserBar(t, sec, g) {
        if (!riserTone) return;
        const f = (k) => 220 * Math.pow(2, 2.6 * k / sec.len);          // two and a half octaves over the build
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
        const LINE = BASS[lineName || tr.bassLine];
        LINE.forEach(([st, len, iv]) => {
          if (st !== s16) return;
          const up = turn && s16 >= 12 ? 12 : 0;
          bass(t, ch.root * 2 * Math.pow(2, (iv + up - 12) / 12), g, STEP * len);
        });
        if (turn && s16 === 15 && !LINE.some(([st]) => st === 15)) bass(t, ch.root * 2 * Math.pow(2, 7 / 12) / 2, g * 0.7, STEP * 0.9);
      }
      /* chords played on a piano or a Wurlitzer rather than a synth, where the style's rhythm asks */
      const chordVoice = RH.voice === 'piano' ? (sampler(tr.piano || 'piano', { release: 0.35, volume: -17 }) || sampler('piano', { release: 0.35, volume: -17 })) : RH.voice === 'wurli' ? wurliVoice() : null;
      if (chordVoice && RH.voice === 'piano') chordVoice.connect(keys);
      function chordsAt(t, s16, barIndex, ch0, g, invert) {
        /* the same chord, voiced up: its lowest note taken an octave higher */
        const ch = invert ? Object.assign({}, ch0, { notes: ch0.notes.slice(1).concat([ch0.notes[0] * 2]) }) : ch0;
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
        while (k + len < 16 && phrase[k + len] === 'h') len++;
        const strong = k % 2 === 0;
        let shape = (strong ? 1 : 0.86) * (0.9 + 0.12 * Math.sin(Math.PI * k / 16));
        if (FAM === 'texture') { t = Math.max(0, t + (rnd() - 0.35) * 0.024); shape *= 0.84 + rnd() * 0.3; }   // lo-fi: played behind the beat, by hand
        voice(t, melHz(ev, ch, strong) * (lift || 1), 0.04 * g * shape, STEP * 2 * len * 0.94);
      }
      function leadAt(t, s16, ch, g, barIndex, lift) {
        /* the chord's notes, up an octave or two by the style's taste (and one
           more late in a later drop) */
        const tone = (n) => (n >= ch.notes.length ? ch.top : ch.notes[n]) * leadOct * (lift || 1);
        if (tr.leadPat === 'arp') lead(t, tone(tr.arp[s16 % 4]), 0.035 * g, STEP * 0.9);
        else if (tr.leadPat === 'acid') {
          const st = tr.line[s16];
          if (st.on) lead(t, tone(st.n) * (st.up ? 2 : 1), 0.04 * g, STEP * 0.95, st.acc);
        } else {
          /* the melody across four phrases of a drop: the hook, its question,
             the hook again, and the answer home */
          const sec = sectionAt(tr, barIndex), ph = Math.floor(sec.bar / 2) % 4, M = tr.mel;
          const phrase = ph === 1 ? M.answer : ph === 3 && sec.name === 'drop' ? M.close : ph === 2 ? M.hook : Math.floor(barIndex / 2) % 2 ? M.answer : M.hook;
          melodyAt(t, s16, ch, g, (sec.bar % 2) * 8, phrase, lead, lift);
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
          if (sec.bar === 0 && s16 === 0 && sec.n >= 1 && tr.trans.whoosh) whoosh(t);
          drumsAt(t, s16, vel, { k: true, s: !dance || tr.style !== 'house' || sec.bar >= sec.len / 2, h: true, g: true, p: true });
          bassAt(t, s16, ch, 0.32 * vel, barIndex);
          chordsAt(t, s16, barIndex, ch, 0.7);
          if (!dance && tr.lead && sec.bar >= sec.len / 2) leadAt(t, s16, ch, 0.6, barIndex);
          /* the hook, early and quiet, before the drop gives it everything */
          const tease = dance && tr.lead && tr.tease && sec.n === 0 && sec.bar >= sec.len / 4;
          if (tease) leadAt(t, s16, ch, 0.38, barIndex);
          const gon = (name) => layerOn(name, sec, sec.bar, true);
          if (gon('perc') || FAM === 'funk') layerAt(t, s16, 0.8 * vel, barIndex);
          if (tease && gon('resp')) respondAt(t, s16, ch, 0.7, (sec.bar % 2) * 8, tr.mel.hook);
          if (sec.bar >= sec.len / 2) {
            if (!tease && gon('counter')) counterAt(t, s16, ch, 0.55, barIndex);
            if (gon('beds')) { stringsAt(t, s16, ch, 0.6, barIndex); woodAt(t, s16, ch, 0.7, barIndex); }
          }
          if (gon('beds')) harmoniumAt(t, s16, ch, 0.55, barIndex);
          if (tr.toms && last && s16 >= 12) tom(['tomHi', 'tomMid', 'tomMid', 'tomLo'][s16 - 12], t, 0.55 + (s16 - 12) * 0.08);
          if (kickIn(true)) pump(t);
        }
        if (sec.name === 'build') {
          const B = buildOf(sec), toDrop = sec.next === 'drop';
          const rise = (sec.bar * 16 + s16) / (sec.len * 16);
          /* the held breath before the drop: a beat, half a bar, an eighth, or none */
          const silent = toDrop && last && (B.breath === 'beat' ? beat === 3 : B.breath === 'half' ? beat >= 2 : B.breath === 'eighth' ? s16 >= 14 : false);
          const every = sec.bar < sec.len / 2 ? 4 : sec.bar < sec.len - 2 ? 2 : 1;     // quarters, eighths, sixteenths
          if (!silent) {
            if (B.type === 'snare') {
              if (S.roll === 'sweep' || !tr.trans.roll) drumsAt(t, s16, vel, { k: !last, s: true, h: true, g: true });
              else {
                if (has(BT.k, s16) && sec.bar < sec.len - 2) kick(t, 0.75);
                if (s16 % every === 0) snare(t, 0.14 + 0.5 * rise * rise, true);
                if (last && sub % 2 === 1) snare(t + STEP / 2, 0.6, true);
                if (sub === 2) hat(t, 0.1);
              }
            } else if (B.type === 'kick') {
              /* the kick doubling up, the claps holding the backbeat */
              if (s16 % every === 0) kick(t, 0.5 + 0.45 * rise);
              if (has(BT.s, s16) && !last) snare(t, 0.4 * vel);
              if (sub === 2) hat(drift(t), 0.1 * loose());
            } else if (B.type === 'half') {
              /* half time: the kick on one (and the and of three), the snare on three, rolling at the end */
              if (s16 === 0 || (s16 === 10 && sec.bar >= sec.len / 2)) kick(t, 0.85);
              if (s16 === 8) snare(t, 0.5 * vel);
              if (s16 % 2 === 0) hat(drift(t), 0.08 * loose());
              if (sec.bar >= sec.len - 2 && s16 % (last ? 1 : 2) === 0) snare(t, 0.15 + 0.4 * rise, true);
            } else if (B.type === 'stabs') {
              /* the drums gone; the chords stabbing faster and faster */
              if (s16 % every === 0) chord(t, ch.notes.map((h) => h * 2), 0.02 + 0.035 * rise, STEP * 0.8, 0.005);
              if (sec.bar < sec.len / 2 && sub === 2) hat(drift(t), 0.05 * loose());
            } else if (B.type === 'stutter') {
              /* the lead chopped: one note, faster and faster, to thirty-seconds in the last bar */
              const n = tr.hook.find((x) => x >= 0) || 0, f0 = (n >= ch.notes.length ? ch.top : ch.notes[n]) * leadOct;
              if (s16 % every === 0) lead(t, f0, 0.025 + 0.02 * rise, STEP * every * 0.45);
              if (last) lead(t + STEP / 2, f0, 0.045, STEP * 0.22);
              if (has(BT.k, s16) && sec.bar < sec.len - 2) kick(t, 0.7);
              if (has(BT.s, s16)) snare(t, 0.35 * vel);
            }
            /* (strip: nothing but the rising synth) */
          }
          if (B.type !== 'stabs' && B.type !== 'strip' && sec.bar < sec.len / 2) counterAt(t, s16, ch, 0.45, barIndex);
          if (tr.toms && last && s16 >= 8 && s16 < 12 && (B.type === 'snare' || B.type === 'kick')) tom(['tomHi', 'tomHi', 'tomMid', 'tomLo'][s16 - 8], t, 0.6 + (s16 - 8) * 0.08);
          if (last && s16 === 0 && toDrop) {
            if (revPianoInto) revPianoInto(t + BAR, chordAt(barIndex + 1));
            if (tr.trans.swell) swellInto(t + BAR);
            if (tr.trans.revSnare) revSnareInto(t + BAR);
          }
          if (s16 === 0 && (tr.trans.riserTone || B.type === 'strip')) riserBar(t, sec, B.type === 'strip' ? 2.4 : 1);
          if (sec.bar === 0 && s16 === 0 && tr.trans.whoosh) whoosh(t);
          if (s16 === 0) {
            /* the noise riser on its own curve, from its own floor to its own top */
            if (B.noise) {
              const f = (x) => B.lo * Math.pow(B.hi / B.lo, Math.pow(x, B.curve));
              noise(t, BAR * 0.98, 0.06 + 0.3 * Math.pow((sec.bar + 1) / sec.len, 1 + B.curve * 0.5), 'bandpass', f(sec.bar / sec.len), 1.2, f((sec.bar + 1) / sec.len));
            }
            if (B.type === 'strip') chord(t, ch.notes, 0.03, BAR, 0.6);
            else if (B.type !== 'stabs') chord(t, ch.notes.map(h => h * 2), 0.02 + 0.02 * (sec.bar / sec.len), BAR, 0.3, 'square');
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
            if (sec.bar === 0 && s16 === 0) { if (D.hit === 'boom') boom(t); else crash(t); }
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
          const gap = db === gb && beat >= 4 - D.gapBeats;
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
            bassAt(t, s16, ch, 0.42 * vel, barIndex, alt ? tr.bassLine2 : tr.bassLine);
            if (!bassOnly) chordsAt(t, s16, barIndex, ch, 1, alt);
          } else {
            hat(drift(t), 0.09 * loose());
            if (s16 === 12 && tr.toms) tom('tomHi', t, 0.5);
            if (s16 >= 13 && tr.toms) tom(s16 === 15 ? 'tomLo' : 'tomMid', t, 0.5 + (s16 - 13) * 0.1);
          }
          /* the lead: in where this drop brings it, lifted an octave where it lifts; in a call
             and response it takes two bars and the counter-melody the next two */
          const leadIn = !bassOnly && db >= dlen * D.leadIn, call = Math.floor(db / 2) % 2 === 0;
          const lift = D.lift && db >= dlen * D.lift ? 2 : 1;
          if (tr.lead && (!dance || leadIn) && (D.type !== 'callresp' || call)) leadAt(t, s16, ch, db < dlen / 2 ? 0.8 : 1, barIndex, lift);
          /* the downbeat: a crash and an impact, a crash, a boom, or just the kick; and a crash out of the gap */
          if (dance && s16 === 0) {
            if (db === 0 && D.hit !== 'cut') { crash(t); if (D.hit === 'crashImpact') impact(t); if (D.hit === 'boom') boom(t); }
            if (db > 0 && (gb >= 0 ? db === gb + 1 : db === dlen / 2 && dlen >= 8)) crash(t);
            if (db === 4 && (D.type === 'bassfirst' || D.type === 'gradual')) crash(t);
            if (halfTime === false && D.type === 'half' && db === dlen / 2) impact(t);
          }
          if (!dance && (sec.bar === 0 || (sec.len >= 8 && sec.bar === sec.len / 2)) && s16 === 0) crash(t);
          const on = (name) => layerOn(name, sec, db, false);
          if (!bassOnly && on('perc')) layerAt(t, s16, vel, barIndex);
          if (!bassOnly && tr.lead && leadIn && on('resp') && (FAM === 'funk' ? db % 4 === 3 || db % 4 === 1 : db % 8 === 3)) {
            const M = tr.mel, ph = Math.floor(sec.bar / 2) % 4;
            respondAt(t, s16, ch, 0.9, (sec.bar % 2) * 8, ph === 1 ? M.answer : M.hook);
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
          if (sec.bar === 0 && s16 === 0) noise(t, BAR * 2, 0.22, 'bandpass', 6000, 1.1, 350);   // the air let out
          if (sec.bar === 0 && s16 === 0 && tr.trans.boom) boom(t);
          counterAt(t, s16, ch, 0.85, barIndex);
          stringsAt(t, s16, ch, 1, barIndex); hornsAt(t, s16, ch, 0.9, barIndex);
          woodAt(t, s16, ch, 0.9, barIndex); harmoniumAt(t, s16, ch, 0.65, barIndex);
          if (sec.bar >= sec.len / 2) layerAt(t, s16, 0.45 * vel, barIndex);
          if (s16 === 0 && barIndex % tr.bpc === 0) {
            if (RH.keys) ch.notes.forEach((f0, k) => keysNote(t + k * 0.03, f0, 0.05, BAR * tr.bpc));
            else chord(t, ch.notes, 0.07, BAR * tr.bpc * 1.05, 0.9);
            bass(t, ch.root, 0.18, BAR * tr.bpc * 0.9);
          }
          drumsAt(t, s16, vel * 0.7, { g: !dance, h: dance && sub === 2 });
          /* the hook comes back, softly, on the other voice */
          if (tr.lead && sec.bar >= sec.len / 2) melodyAt(t, s16, ch, 0.6, (sec.bar % 2) * 8, tr.mel.hook, lead2);
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
      return { l: l.slice(skip, skip + want), r: r.slice(skip, skip + want) };
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
  const stepOf = () => SR / ctx.sampleRate;

  /* ---- pressing: a record made a segment at a time, and streamed ----------
     A track is pressed in segments - two bars first (so the needle has
     something within moments), then four, then eight at a time - each
     crossfaded onto the last over its overlap, turned to 16-bit and handed
     to whoever is listening: the deck, if the record is on it. One render
     runs at a time, the most needed first: the record on the deck while it
     is less than half a minute ahead of the needle, then the B-side once it
     is offered, then the next track, then the one waiting on the shelf. */
  let pressId = 0;
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
      const ahead = (at(this.tr, e) - pos * this.total) / SR;
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
      if (!armed && p.headBars() >= Math.ceil(p.tr.bars / 2)) return;   // on the poster: the first half, ready for START
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
     Four tracks are written for every one that is pressed, and the best of
     them made: a melody that moves mostly by step with a leap or two, over a
     range of a fifth or so, not too busy or too bare; unlike the last few
     records (another lead, other builds and drops, another key and tempo);
     and leaning towards what this visitor has liked before. */
  const recent = [];
  let likes = {};
  try { likes = JSON.parse(localStorage.getItem(LIKES) || '{}') || {}; } catch (e) { likes = {}; }
  const featuresOf = (tr) => ({ style: tr.style, lead: tr.leadVoice, counter: tr.counter, rhythm: tr.rhythm, bass: tr.bassLine,
    build: tr.builds[0] && tr.builds[0].type, drop: tr.drops[0] && tr.drops[0].type, scale: tr.scale });
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
    recent.forEach((p, i) => {
      const g = featuresOf(p), w = 1 / (i + 1);
      ['lead', 'counter', 'build', 'drop', 'rhythm'].forEach((k) => { if (f[k] === g[k]) s -= 0.25 * w; });
      if (Math.abs(p.bpm - tr.bpm) < 2) s -= 0.1 * w;
      if (p.key === tr.key) s -= 0.1 * w;
    });
    Object.entries(f).forEach(([k, v]) => { s += 0.2 * Math.min(3, likes[k + ':' + v] || 0) / 3; });
    return s;
  }
  function pickTrack(rpm) {
    let best = null;
    for (let i = 0; i < 4; i++) {
      const tr = compose(newSeed(), 'a', rpm), sc = scoreTrack(tr);
      if (!best || sc > best.sc) best = { tr, sc };
    }
    recent.unshift(best.tr);
    if (recent.length > 3) recent.length = 3;
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
    post(asNext ? { type: 'next', id: p.id, total: p.total, step: stepOf() } : { type: 'track', id: p.id, total: p.total, step: stepOf(), at });
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
