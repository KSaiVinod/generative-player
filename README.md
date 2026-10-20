# vinyl-player

A turntable you can drop into any page, as a `<vinyl-player>` element.

- **The record is the play button.** Tap it to start or stop.
- **The arm is the seek control.** Drag it onto the record and the music plays from where the needle lands. Carry it off the record and the record stops.
- **A hand on a playing record brakes it.** Move your hand and the music follows it, forwards and backwards: a scratch.
- **The switches:**
  - START·STOP.
  - 33/45. Changing belt slides the pitch, as a real belt does.
  - A volume fader with ten clicking detents.
  - A spectrum display of what is playing.
- **On a phone, the switches tap back.**

It has no dependencies and needs no build step. It is plain scripts and one stylesheet.

## The files

| File | What it is | Needed |
|---|---|---|
| `vinyl-player.js` | The element | yes |
| `vinyl-player.css` | Its look | yes |
| `stylus.js` | The AudioWorklet that plays a record at any speed, either way. The sources load it themselves. | yes |
| `file-source.js` | `VinylPlayer.FileSource`: any audio file | to play files |
| `analog.js` | `VinylPlayer.Analog`: surface noise, the needle drop and the scratch sound, over whatever plays | optional |
| `engine/` | `VinylPlayer.Generative`: a new track made in the browser every time, plus a few recorded instruments (VCSL); a record fetches only the ones it plays, about 1 MB | optional |
| `demo/` | A page with all three. Serve the folder and open `demo/`. | no |

Every script finds its own files next to itself, so the folder can be served from any path. To use it in another app, copy the folder into that app. Loading the files from another site needs that site to send CORS headers for all of them: the worklet, the instruments and the melody model.

`VinylPlayer.Generative` is a single engine, so only one deck on a page can play it. Any number of decks can play files.

## A deck that plays a file

```html
<link rel="stylesheet" href="/vinyl-player/vinyl-player.css">
<script src="/vinyl-player/vinyl-player.js"></script>
<script src="/vinyl-player/file-source.js"></script>
<script src="/vinyl-player/analog.js"></script>   <!-- optional: the crackle -->

<vinyl-player src="/music/side-a.mp3" label-title="Side A" hint></vinyl-player>
```

To play something else, or a file chosen by the visitor:

```js
const deck = document.querySelector('vinyl-player');
deck.source = VinylPlayer.FileSource(fileInput.files[0]);        // a File or Blob
deck.source = VinylPlayer.FileSource('/music/b.mp3', { rpm: 45 }); // a 45
```

A file from another origin needs CORS headers.

## A deck that makes its own music

```html
<script src="/vinyl-player/engine/vendor/vcsl/manifest.js"></script>
<script src="/vinyl-player/engine/generative.js" data-likes-key="my-app.likes"></script>
<script src="/vinyl-player/vinyl-player.js"></script>

<vinyl-player id="deck" controls="start speed like volume spectrum"></vinyl-player>
<script type="module">
  const deck = document.getElementById('deck');
  deck.source = VinylPlayer.Generative;
  await VinylPlayer.Generative.prepare();            // arms it and presses the first record
</script>
```

The engine's extras:

- `styles`: a list of `[key, label]` pairs. Progressive house is the only style now (`prog`).
- `style(key)`: `'prog'`, or `''` for the rotation (which is progressive house too).
- `edit(mode)`: progressive house is full length by default (6–8.5 minutes, about 192–256 bars, at either speed). `edit('short')` gives the old short edit for records pressed from then on; `edit('full')` goes back.
- `diagnostics()`: what failed to load: a missing manifest entry, a failed download or a file that would not decode, as `{ kind, name, detail, at }`. Each failure is also reported once in the console.
- `track.resolved`: for the record playing, each part's chosen instrument, what actually played, and where it came from (`vcsl` or `synth`), with the reason when a fallback stood in.
- `warm(key)`: presses the first half of a record ahead of time.
- `like()`: the LIKE key calls this, so later records lean towards the liked one.
- `replay(seed, side)` puts a record back on by its seed, and `skip()` puts the next one on now.
- Every progressive record ends in its run-out groove: about five seconds after the music (three bars at 123 BPM) of the locked groove's click and pop, once a turn of the platter, before the next record drops (`track.runout`).
- `flip()` and `prepareB()`: the hidden B-side. It is one fixed record, the same for everyone: deep, melodic progressive in the style of Guy J, made by the progressive renderer. It runs 7.8 minutes at 123 BPM, with one long piano breakdown, a rolling bass, a soft pluck lead and an arpeggio through a dotted-eighth echo.
- `onsamples` and `onpressing`: progress hooks for a loader.

## Attributes

| Attribute | Default | What it does |
|---|---|---|
| `src` | — | Plays this file. Needs `file-source.js`. |
| `controls` | `start speed volume spectrum like` | The switches on the plinth, in any order. LIKE shows only when the source can `like()`. |
| `layout` | `auto` | `wide` is the classic deck (platter left, fader and spectrum on the right). `stacked` puts the platter on top and the switches below. `auto` is `wide` from 600px of the element's own width. |
| `model` | `vinyl-player · direct drive` | The line engraved on the plinth. |
| `label-top`, `label-title`, `label-sub` | `side a`, `—`, — | The words on the label. |
| `rpm` | `33` | The starting belt. |
| `volume` | `7` | The fader, from 0 to 10. |
| `storage` | — | A localStorage prefix. With it, the belt and the volume are remembered. |
| `hint` | — | Shows a line under the deck saying what to do. The same text is sent in `vp-hint` events either way. |
| `analog` | — | `off` turns off the analog layer even when `analog.js` is loaded. |

Your own label: give the element children with `slot="label"`, such as an `<svg>` or an `<img>`. They are placed on the label and turn with the record.

```html
<vinyl-player><img slot="label" src="/cover.jpg" alt=""></vinyl-player>
```

## Properties and methods

- `deck.source`: what plays. Set it at any time.
- `deck.play(from?)`: puts the needle down. `from` runs from 0 (the outer groove) to 1.
- `deck.play(from, how)`: the same, but `how()` starts the sound instead of the source's own `start()`. The soon page uses this for its B-side flip.
- `deck.stop()`: a brake, not a cut.
- `deck.toggle()`: plays or stops.
- `deck.playing`: whether it is playing (read-only).
- `deck.speed`: 33 or 45.
- `deck.volume`: 0 to 10.
- `deck.parts`: the element's pieces, for a page that animates them: `plinth`, `deck`, `drop`, `zone`, `platter`, `record`, `label`, `arm`, `controls`, `start`, `like`, `fader`, `eq` and `hint`.
- `VinylPlayer.haptic(ms)`: the same phone tap the deck uses, for a page's own switches.

## Events

All events bubble.

| Event | When | `detail` |
|---|---|---|
| `vp-play` | the needle goes down | `{ from }` |
| `vp-stop` | the record is stopped | — |
| `vp-end` | a file has played to the end | — |
| `vp-change` | a new record is on the platter | the source's track (it has `rpm`; the engine's tracks also have `style`, `side` and more) |
| `vp-hint` | what the deck would say | the text (`''` while it is playing) |
| `vp-scratch` | a scratch turns direction at speed | `{ flips }`, counted from when the hand went down |
| `vp-like` | the LIKE key took | — |
| `vp-speed` | 33 or 45 pressed | `{ rpm, playing }` |
| `vp-spin` | a hand turned the record a quarter turn or more and let go | `{ turns }`, below zero for backwards |
| `vp-dial` | the dial beside the arm was pressed (it does nothing itself) | — |
| `vp-error` | the source could not start (a missing file, CORS, a file that will not decode) | `{ error }` |

## Writing your own source

A source is an object with these members. Look at `file-source.js`, which is short.

```
start(delay, at) → Promise   put the needle down at `at` (0..1); the motor runs up over `delay` seconds
stop()                       a brake: slow to a halt
hold() / scratch(rate) / release()   a hand on the record: still, moved at `rate` (negative = backwards), let go
seek(at)                     the needle dropped somewhere else
lift(up)                     the needle in the air (silent) or back down
volume(0..1), speed(33|45)
position() → 0..1            where the needle is
spin() → number              how fast the platter turns, relative to 33⅓ (it draws the record)
recordRpm                    the record's own speed (33.33 or 45)
levels(Uint8Array) → bool, bins, sampleRate   the spectrum: byte frequency data, like an AnalyserNode
playing
click(heavy)                 optional: the switches' tick
like()                       optional: shows the LIKE key
onchange = fn(track), onend = fn()   set by the deck
```

## Theming

Set custom properties on `vinyl-player` or on `:root`:

- `--vp-accent`, `--vp-accent-rgb`, `--vp-accent-hot`, `--vp-accent-hot-rgb`: the hover colour, the focus rings and the arm's highlight while it is dragged.
- `--vp-label-ink`: the label's colour.
- `--vp-lamp` and `--vp-lamp-glow`: the switches' lamps.
- `--vp-cream`, `--vp-dim` and `--vp-print-ink`: the text colours.
- `--vp-mono` and `--vp-display`: the fonts.
- `--vp-ease` and `--vp-dur`: the motion.

The element sizes itself from its own width, so to make it bigger or smaller, give it a width.

## Content Security Policy

- **`stylus.js` is an AudioWorklet module.** It is loaded from the same place as the other files, so `script-src 'self'` covers it when the files are on your own origin.
- **The generative engine needs nothing more.** It renders on the page's own audio context and loads no other scripts, so a strict policy (`script-src 'self'`, no `blob:`) is enough.

## How the engine composes

- **Each build has one concept:** bass, melodic, percussive, chord-driven or stripped. It runs through five stages; for 32 bars these are tease, develop, urgency, focus and set-up.
  - There is one main transition effect and at most one supporting effect, and often none.
  - The breath before the drop is either true silence (the reverb and echo returns are cut too) or keeps one effect's tail.
  - The drop opens with a crash, a boom, an impact, a crash with an impact, or a clean cut, then pays off the concept.
- **Progressive house uses the genre's own sounds.**
  - **Synthesised:** supersaw pads, a synth pluck whose filter snaps on each note, a sub-and-saw (or reese, or square) bass, a supersaw, saw or pluck lead, a drum machine's kick, clap and hats, and noise risers and sweeps, and a string section (four bowed players a note, each with its own vibrato, through a body resonance) under the pad in breakdowns.
  - **Recorded:** used only where progressive uses them: a piano for the keys (sometimes the hook or the arpeggio), a shaker, a ride and a crash, and sometimes real claps or congas.
  - **Production:** it has its own renderer at 44.1 kHz, with smooth filter curves, each part ducking under the kick by its own amount, a hall, a room and an echo, a soft clip on the loudest peaks, and a look-ahead limiter that watches the true peak (between samples), at −1 dBTP. The synth arpeggio and lead are set by their loudness rather than their peak, so a dense supersaw sits where a piano would. The pad carries a faint noise breath, 20 dB under its chord.
  - **Variety:** each record draws its own sound for every part: voices, detune, waves, filter bite, kick tone, which lead and which keys.
  - **Structure:** each record writes its own plan. It picks one of five song forms (classic, early drop, one long breakdown, bridge, groove-led), and each section is arranged its own way, with parts entering and leaving in their own order. Patterns run two bars or longer: arpeggio variations, eight bass lines with turnarounds, hat, clap and percussion patterns, and a fill library. The harmony uses 2, 4 or 8 chords at 1, 2 or 4 bars each, with re-harmonised breakdowns. The hook has its own plan and shape, and a guide-tone counter-melody joins in later drops. Across 300 records, no two shared a section plan.
  - **Eight-bar moves:** every eight-bar block of a drop or a long groove takes its own shape, never the same twice running: everything; the top end out but for the offbeat hat; the bass out under the kick; the pad out; stripped to drums and bass; or, once in a record, the kick out for four bars. The first drop keeps its first sixteen bars whole. Builds often lose the kick and bass for the last eight bars, leaving the roll alone. One section gain, applied after the limiter (which would otherwise level it), puts the intro, grooves, builds and outro 1–3 dB under the drops and the breakdowns 2.5–3.5 dB under, so the drops are the loudest part of the record. Measured over eight records against the ten references, nothing falls outside their range: loudness −10.0 to −10.7 LUFS, loudness range 3.7–4.4, change from one block to the next 4.0–6.3 dB (references 3.1–11.7, median 5.5), pump 7.0–10.3 dB, true peak −1.0 dBTP, and every drop's octave balance.
- **The next record is chosen against the last four.** It avoids the same lead family, motif rhythm, contour, progression and build concepts. The key is not penalised.

## Phones

- **Rotation:** with the `portrait` attribute, a phone turned on its side gets a full-screen card asking for it upright. A web page cannot lock the rotation itself, except on Android in fullscreen or as an installed app. The card is `.vp-turn` in the stylesheet.
- **Background play:** on a touch screen, the sources send their sound through a hidden `<audio>` element as well as straight out. The sound goes out directly while the page is in view, so scratching has no added delay. When the page is hidden or the screen locks, the element carries it, which phones treat as media playback. On iOS 17 and later the page also asks for playback audio, so the silent switch does not mute it. Your own source can do the same: `const bg = VinylPlayer.background(ctx, [outputs])`, then call `bg.play()` and `bg.pause()` with the record.
- **Lock screen:** the lock screen and the notification shade show the track and offer play and pause. Set the title, artist, album and artwork with `media-title` (otherwise the track's own name), `media-artist`, `media-album` and `media-art`; the artwork defaults to the page's apple-touch-icon.
- **Haptics:** the switches tap back, using `navigator.vibrate` on Android and a hidden switch toggle on iOS 18 and later.

## Credits

The recorded instruments (a grand and an upright piano, an acoustic kit's ride and crash, a shaker, claps and congas) come from the [Versilian Community Sample Library](https://github.com/sgossner/VCSL) (Versilian Studios, CC0: no credit required, given anyway). `scripts/pack-vcsl.js` packs them into `engine/vendor/vcsl/`; without its manifest the engine plays synth voices in their place. Everything else is synthesised.

