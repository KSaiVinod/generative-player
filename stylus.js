/* ============================================================
   vinyl-player — the stylus: an AudioWorklet that plays a record

   Plays a track the way a stylus reads a groove: at whatever speed the
   platter turns, forwards or backwards. The `rate` parameter is that speed
   (1 = as recorded, 1.35 = a 33 on the 45 belt, 0 = a hand holding it
   still, below 0 = pulled back). A stylus puts out a signal in proportion
   to how fast the groove passes under it, so the level falls with the
   speed too: a brake sinks in pitch and fades, as a real one does.

   A record arrives as it is pressed: its length first, then its parts
   (stereo, 16-bit), in any order - from the start, and from wherever the
   needle is dropped. The needle plays what has arrived; on a stretch not
   pressed yet it waits there, silent, until it comes - it never skips -
   and a cue anywhere is taken, the press told to start there. Changing
   record crossfades over a few milliseconds.

   In: {type:'track', id, total, step, at}, {type:'next', id, total, step},
   {type:'append', id, offset, l, r}, {type:'seek', at}, {type:'park', on},
   {type:'clear'}. Parked (the arm lifted clear of the record), the platter
   turns on but the needle reads nothing: the side waits where it was.
   Out: {type:'pos', at} a few times a second, {type:'track'} on moving to
   the next record.
   ============================================================ */
const FADE = 1024;
/* a record is kept in chunks of 65536 samples (about a second and a half), each made when its first part arrives:
   a record announced but pressed only so far ahead (the next one, waiting) costs only what is pressed of it */
const CH = 65536, CB = 16, CM = CH - 1;

class Vinyl extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'rate', defaultValue: 0, minValue: -8, maxValue: 8, automationRate: 'a-rate' }];
  }

  constructor() {
    super();
    this.cur = null; this.next = null; this.pos = 0; this.frames = 0;
    this.old = null; this.oldPos = 0; this.fade = 0; this.parked = false;
    this.port.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'track') {
        this.fadeFrom();
        this.cur = Vinyl.record(m);
        this.pos = Math.max(0, Math.min(1, m.at || 0)) * m.total;
        this.next = null;
      } else if (m.type === 'next') {
        this.next = Vinyl.record(m);
      } else if (m.type === 'append') {
        const r = this.cur && this.cur.id === m.id ? this.cur : this.next && this.next.id === m.id ? this.next : null;
        if (!r) return;
        const n = Math.max(0, Math.min(m.l.length, r.total - m.offset));
        Vinyl.put(r.l, m.l, m.offset, n); Vinyl.put(r.r, m.r, m.offset, n);
        Vinyl.cover(r, m.offset, Math.min(r.total, m.offset + m.l.length));
      } else if (m.type === 'seek') {
        if (!this.cur) return;
        /* anywhere: if it is not pressed yet the needle waits on it */
        this.pos = Math.max(0, Math.min(1, m.at)) * this.cur.total;
      } else if (m.type === 'park') {
        this.parked = !!m.on;
      } else if (m.type === 'clear') {
        this.parked = false;
        this.cur = null; this.next = null; this.old = null;
      }
    };
  }

  static record(m) {
    /* have: the stretches pressed, [from, to) in samples, in order, merged */
    return { id: m.id, total: m.total, step: m.step, have: [], at: 0, done: false, l: [], r: [] };
  }

  /* n samples of src into the chunks from sample `at` */
  static put(chunks, src, at, n) {
    let i = 0;
    while (i < n) {
      const k = at + i, c = k >> CB, o = k & CM, len = Math.min(n - i, CH - o);
      (chunks[c] || (chunks[c] = new Int16Array(CH))).set(src.subarray(i, i + len), o);
      i += len;
    }
  }
  static get(chunks, k) { const c = chunks[k >> CB]; return c ? c[k & CM] : 0; }

  static cover(r, a, b) {
    const all = r.have.concat([[a, b]]).sort((x, y) => x[0] - y[0]), out = [];
    for (const [x, y] of all) { const l = out[out.length - 1]; if (l && x <= l[1]) l[1] = Math.max(l[1], y); else out.push([x, y]); }
    r.have = out; r.at = 0;
    r.done = out.length === 1 && out[0][0] === 0 && out[0][1] >= r.total;
  }

  /* is this sample pressed? (the stretch last found is tried first: the
     needle mostly stays in one) */
  static pressed(d, k) {
    if (d.done) return k >= 0 && k < d.total;
    const h = d.have, c = h[d.at];
    if (c && k >= c[0] && k < c[1]) return true;
    for (let i = 0; i < h.length; i++) if (k >= h[i][0] && k < h[i][1]) { d.at = i; return true; }
    return false;
  }

  fadeFrom() {
    if (!this.cur) return;
    this.old = this.cur; this.oldPos = this.pos; this.fade = FADE;
  }

  static read(d, p) {
    const k = Math.floor(p), f = p - k;
    if (!Vinyl.pressed(d, k)) return [0, 0];
    const k1 = Vinyl.pressed(d, k + 1) ? k + 1 : k;
    const G = Vinyl.get, l0 = G(d.l, k), r0 = G(d.r, k);
    return [(l0 + (G(d.l, k1) - l0) * f) / 32768, (r0 + (G(d.r, k1) - r0) * f) / 32768];
  }

  process(inputs, outputs, params) {
    const L = outputs[0][0], R = outputs[0][1] || outputs[0][0];
    const rate = params.rate;
    for (let i = 0; i < L.length; i++) {
      const d = this.cur;
      if (!d || this.parked) { L[i] = 0; R[i] = 0; continue; }
      const r = rate.length > 1 ? rate[i] : rate[0];
      const speed = Math.abs(r);
      const level = speed >= 1 ? 1 : Math.pow(speed, 0.6);
      let [a, b] = Vinyl.read(d, this.pos);
      if (this.fade > 0 && this.old) {
        const w = this.fade / FADE;
        const [oa, ob] = Vinyl.read(this.old, this.oldPos);
        a = a * (1 - w) + oa * w; b = b * (1 - w) + ob * w;
        this.oldPos += r * this.old.step;
        if (--this.fade === 0) this.old = null;
      }
      L[i] = a * level; R[i] = b * level;
      const nextPos = this.pos + r * d.step;
      /* the needle never runs onto what is not pressed: it waits at the edge */
      if (d.done || Vinyl.pressed(d, Math.floor(nextPos) + 1) || nextPos >= d.total) this.pos = nextPos;
      if (this.pos < 0) this.pos = 0;
      if (this.pos >= d.total) {
        if (this.next) {
          /* the run-out: straight on into the next record */
          this.fadeFrom();
          this.pos -= d.total;
          this.cur = this.next; this.next = null;
          this.port.postMessage({ type: 'track' });
          continue;
        }
        this.pos = d.total;
      }
    }
    if ((this.frames += L.length) >= 2048) {
      this.frames = 0;
      if (this.cur) this.port.postMessage({ type: 'pos', at: this.pos / this.cur.total });
    }
    return true;
  }
}
registerProcessor('vinyl', Vinyl);
