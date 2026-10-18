/* ============================================================
   vinyl-player — a source for any audio file

     player.source = VinylPlayer.FileSource('/music/track.mp3');
     player.source = VinylPlayer.FileSource(file);          // a File or Blob
     player.source = VinylPlayer.FileSource(arrayBuffer, { rpm: 45 });

   The file is decoded whole and handed to the stylus (stylus.js, beside
   this file), which reads it the way a needle reads a groove: at any
   speed, either way. So a file brakes, scratches and changes belt as the
   generated records do. A file from another origin needs CORS.

   Options: rpm (33 or 45: the speed the record was cut at; on the other
   belt it plays at the wrong pitch, as a real one would), title (passed
   on in the track, for vp-change).
   ============================================================ */
(() => {
  'use strict';
  const VP = window.VinylPlayer = window.VinylPlayer || {};
  const ME = document.currentScript;
  const STYLUS = new URL('stylus.js', (ME && ME.src) || location.href).href;
  const RPM = (n) => (n === 45 ? 45 : 33.33);
  let n = 0;

  VP.FileSource = function FileSource(input, opts) {
    opts = opts || {};
    const rec = opts.rpm === 45 ? 45 : 33;
    const track = { rpm: rec, title: opts.title || (typeof input === 'string' ? decodeURIComponent(input.split('/').pop()) : (input && input.name) || '') };
    let ctx = null, out = null, analyser = null, node = null, ready = null, clickOut = null, clickNoise = null;
    let decoded = null;
    const id = ++n;
    let playing = false, holding = false, lifted = false, vol = 0.7, belt = 33, pos = 0, token = 0;
    let onchange = null, onend = null;

    function setup() {
      if (ctx) return ready;
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
      analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.72;
      analyser.minDecibels = -100; analyser.maxDecibels = -24;
      out.connect(analyser);
      clickOut = ctx.createGain(); clickOut.gain.value = 0.5; clickOut.connect(ctx.destination);
      clickNoise = ctx.createBuffer(1, Math.round(ctx.sampleRate / 4), ctx.sampleRate);
      const cd = clickNoise.getChannelData(0);
      for (let i = 0; i < cd.length; i++) cd[i] = Math.random() * 2 - 1;
      ready = ctx.audioWorklet.addModule(STYLUS).then(() => {
        node = new AudioWorkletNode(ctx, 'vinyl', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
        node.connect(out);
        node.port.onmessage = (ev) => {
          if (ev.data.type !== 'pos') return;
          pos = ev.data.at;
          /* the run-out: the record is over */
          if (playing && !holding && pos >= 0.9995) { stop(); if (onend) onend(); }
        };
      });
      return ready;
    }
    /* the file, decoded (once) */
    let decoding = null;
    function decode() {
      if (decoding) return decoding;
      const bytes = typeof input === 'string' ? fetch(input).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        : input instanceof ArrayBuffer ? Promise.resolve(input.slice(0))
        : input && input.arrayBuffer ? input.arrayBuffer()
        : Promise.reject(new Error('FileSource: a URL, a File, a Blob or an ArrayBuffer'));
      decoding = bytes.then((ab) => ctx.decodeAudioData(ab)).then((buf) => { decoded = buf; return buf; });
      return decoding;
    }
    const level = () => Math.max(0.0001, vol * vol);                  // a fader is not linear to the ear
    const base = () => RPM(belt) / RPM(rec);
    const rateParam = () => node.parameters.get('rate');
    function rateTo(v, tc) {
      if (!node) return;
      const p = rateParam(), now = ctx.currentTime;
      p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.setTargetAtTime(v, now, tc);
    }
    const toPcm = (data) => {
      const o = new Int16Array(data.length);
      for (let i = 0; i < data.length; i++) { const v = Math.max(-1, Math.min(1, data[i])); o[i] = v < 0 ? v * 32768 : v * 32767; }
      return o;
    };
    /* the record on the deck: its length, then all of it */
    function load(at) {
      const b = decoded;
      node.port.postMessage({ type: 'track', id, total: b.length, step: b.sampleRate / ctx.sampleRate, at });
      const l = toPcm(b.getChannelData(0)), r = toPcm(b.numberOfChannels > 1 ? b.getChannelData(1) : b.getChannelData(0));
      node.port.postMessage({ type: 'append', id, offset: 0, l, r }, [l.buffer, r.buffer]);
      if (onchange) onchange(track);
    }

    async function start(delay, at) {
      setup();
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* stays silent */ } }
      if (playing) return;
      playing = true; holding = false;
      const t = ++token;
      at = Math.max(0, Math.min(0.98, at || 0));
      pos = at;
      try { await ready; await decode(); } catch (e) { playing = false; throw e; }
      if (t !== token) return;
      load(at);
      const now = ctx.currentTime, when = now + Math.max(0, (delay || 0) - 0.3);
      out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(lifted ? 0.0001 : level(), now);
      /* the motor: up to speed in a moment, the pitch rising with it */
      const r = rateParam();
      r.cancelScheduledValues(now); r.setValueAtTime(0, now); r.setTargetAtTime(holding ? 0 : base(), when, 0.12);
    }
    /* a stop is a brake: the platter slows under it, the pitch sinking */
    function stop() {
      if (!ctx || !playing) return;
      playing = false; holding = false;
      const t = ++token;
      rateTo(0, 0.3);
      setTimeout(() => { if (t === token && node) node.port.postMessage({ type: 'clear' }); }, 2500);
    }
    function hold() { if (playing) { holding = true; rateTo(0, 0.05); } }
    function scratch(r) { if (playing && holding) rateTo(r, 0.012); }
    function release() { if (holding) { holding = false; if (playing) rateTo(base(), 0.09); } }
    function seek(at) { pos = Math.max(0, Math.min(1, at)); if (node) node.port.postMessage({ type: 'seek', at: pos }); }
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
    function speed(r) { belt = r === 45 ? 45 : 33; if (playing && !holding) rateTo(base(), 0.25); }
    /* a switch's tick: a short bright noise burst with a little body under it */
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
      /* the file decoded ahead (before the first tap is fine: it waits for one to play) */
      prepare() { setup(); return decode(); },
      position: () => pos,
      rate: () => (node ? rateParam().value : 0),
      levels(into) { if (!analyser) return false; analyser.getByteFrequencyData(into); return true; },
      get bins() { return analyser ? analyser.frequencyBinCount : 0; },
      get sampleRate() { return ctx ? ctx.sampleRate : 48000; },
      spin: () => (node ? rateParam().value * RPM(rec) / 33.33 : 0),
      get recordRpm() { return RPM(rec); },
      get playing() { return playing; },
      get duration() { return decoded ? decoded.duration : 0; },
      get track() { return track; },
      set onchange(fn) { onchange = fn; },
      set onend(fn) { onend = fn; }
    };
  };
})();
