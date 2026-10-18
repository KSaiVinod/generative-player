/* ============================================================
   vinyl-player — before Tone.js loads (optional)

   Tone builds a live audio context the moment it loads, and that context
   starts its clock in a Worker made from a blob: URL. The engine only ever
   renders offline, and a strict CSP refuses blob: workers, so the attempt
   just logs an error. Refused here first, and synchronously, Tone falls
   back to its timer clock quietly, as it is written to. Load this before
   vendor/tone/Tone.js on a page whose CSP has no blob: for workers.
   ============================================================ */
(() => {
  'use strict';
  const W = window.Worker;
  if (!W) return;
  function Worker(url, options) {
    if (String(url).indexOf('blob:') === 0) throw new Error('no blob: workers on this page');
    return new W(url, options);
  }
  Worker.prototype = W.prototype;
  window.Worker = Worker;
})();
