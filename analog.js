/* ============================================================
   vinyl-player — the analog layer (optional)

   Not the music: what a turntable adds over it. Surface noise, the
   needle drop, the needle lifting, the scratch. <vinyl-player> plays
   it when this file is loaded (VinylPlayer.Analog), and goes without
   it when it is not.
   ============================================================ */

const Analog = (() => {
  'use strict';

  let ctx = null;
  let master = null;      // analog layer only
  let bedGain = null;     // surface-noise level
  let lifted = false;     // the needle clear of the record: no surface under it
  let bedTone = null;     // surface-noise colour
  let analyser = null;
  let noiseBuffer = null;

  let running = false;
  let noiseEnabled = true;
  let volume = 0.65;
  let groove = 0;         // 0 = lead-in, 1 = run-out

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---- surface noise: hiss and pops in a looping buffer (the drops' and
     scratches' bursts are made from it); the bed under the record is the
     pops alone, with no hiss between them ---- */
  function makeSurfaceBuffer(popsOnly) {
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.028 * white) / 1.028;   // brown-ish hiss
        d[i] = popsOnly ? 0 : last * 2.4;
        if (Math.random() < 0.00016) {           // sparse pops
          const amp = 0.28 + Math.random() * 0.45;
          for (let k = 0; k < 90 && i + k < len; k++) {
            d[i + k] += amp * Math.exp(-k / 14) * (Math.random() * 2 - 1);
          }
        }
      }
    }
    return buf;
  }

  /* ---- one-shot noise burst, used for drops and scratches ---- */
  function burst({ dur = 0.14, gain = 0.3, freq = 900, q = 2, sweep = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;

    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(clamp(freq + sweep, 60, 12000), t + dur);
    f.Q.value = q;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(gain * volume, 0.0002), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function ensureContext() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;                       // no analog layer; the record still plays
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = volume * 0.9;

    analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.72;
    master.connect(analyser);
    analyser.connect(ctx.destination);

    noiseBuffer = makeSurfaceBuffer();

    bedGain = ctx.createGain();
    bedGain.gain.value = 0;
    bedTone = ctx.createBiquadFilter();
    bedTone.type = 'bandpass';
    bedTone.frequency.value = 2600;
    bedTone.Q.value = 0.55;
    bedGain.connect(bedTone).connect(master);

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = makeSurfaceBuffer(true);
    noiseSrc.loop = true;
    noiseSrc.connect(bedGain);
    noiseSrc.start();
  }

  /* Inner grooves sit closer to the spindle, so the bed darkens
     toward the run-out. */
  function applyGroove() {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (bedTone) bedTone.frequency.setTargetAtTime(2600 - groove * 1100, t, 0.25);
    if (bedGain && running) {
      bedGain.gain.setTargetAtTime(noiseEnabled && !lifted ? 0.035 + groove * 0.03 : 0, t, lifted ? 0.03 : 0.3);
    }
  }

  const api = {
    get isRunning() { return running; },

    /* The analog layer needs a gesture; the record does not. */
    async unlock() {
      ensureContext();
      if (ctx && ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
      return !!ctx && ctx.state === 'running';
    },

    /* ---- the platter and the analog layer ---------------------- */

    async start() {
      running = true;
      await api.unlock();
      if (!ctx) return true;
      bedGain.gain.cancelScheduledValues(ctx.currentTime);
      bedGain.gain.setTargetAtTime(noiseEnabled ? 0.035 : 0, ctx.currentTime, 0.5);
      applyGroove();
      return true;
    },

    stop() {
      running = false;
      if (!ctx) return;
      bedGain.gain.cancelScheduledValues(ctx.currentTime);
      bedGain.gain.setTargetAtTime(0, ctx.currentTime, 0.65);
    },

    needleDrop() {
      burst({ dur: 0.11, gain: 0.5, freq: 320, q: 1.1, sweep: -180 });
      burst({ dur: 0.05, gain: 0.28, freq: 2400, q: 0.8 });
    },
    needleLift() { burst({ dur: 0.07, gain: 0.26, freq: 1500, q: 1.4, sweep: 900 }); },
    /* the arm held up while the platter turns: the surface noise goes with the needle */
    lift(up) { lifted = !!up; applyGroove(); },
    scratch(intensity) {
      if (!running) return;
      const i = clamp(intensity, 0, 1);
      burst({ dur: 0.05 + i * 0.07, gain: 0.12 + i * 0.3, freq: 700 + i * 1800, q: 1.2, sweep: -400 });
    },

    /* The analog layer. Spotify's embed exposes no volume command, so the
       music itself answers to the system volume. */
    setVolume(pct) {
      volume = clamp(pct / 100, 0, 1);
      if (master && ctx) master.gain.setTargetAtTime(volume * 0.9, ctx.currentTime, 0.03);
    },
    getVolume() { return Math.round(volume * 100); },

    setNoise(on) {
      noiseEnabled = !!on;
      applyGroove();
      if (ctx && bedGain && !running) bedGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      return noiseEnabled;
    },
    getNoise() { return noiseEnabled; },

    /* Where the stylus sits, 0..100 across the side. */
    seek(pct) { groove = clamp(pct / 100, 0, 1); applyGroove(); },

    levels(out) {
      if (!analyser) return false;
      analyser.getByteFrequencyData(out);
      return true;
    }
  };

  return api;
})();

window.VinylPlayer = window.VinylPlayer || {};
window.VinylPlayer.Analog = Analog;
