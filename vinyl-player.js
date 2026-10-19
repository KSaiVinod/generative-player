/* ============================================================
   vinyl-player — a turntable you can put in any page

     <link rel="stylesheet" href="vinyl-player/vinyl-player.css">
     <script src="vinyl-player/vinyl-player.js"></script>
     <script src="vinyl-player/file-source.js"></script>
     <vinyl-player src="/music/track.mp3" hint></vinyl-player>

   The record is the play button. Drag the arm onto the record and it
   plays from where the needle lands; carry it off and the record stops.
   A hand on a playing record brakes it; move it and the music goes with
   the hand, back and forth: a scratch. START·STOP, 33/45 (the pitch
   slides as the belt changes), a fader with ten detents that tick, a
   spectrum of what is heard. On a phone the switches tap back.

   What it plays is its source (player.source = ...): anything with the
   source interface in README.md. Two come with it: VinylPlayer.FileSource
   (file-source.js: any audio file) and VinylPlayer.Generative
   (engine/generative.js: a new track made in the browser every time).
   With analog.js loaded it adds the surface noise, the needle drop and
   the scratch over whatever plays.

   Attributes: src, controls ("start speed like volume spectrum"), rpm,
   volume (0-10), layout (auto | wide | stacked), model (the line
   engraved on the plinth), label-top / label-title / label-sub, hint,
   storage (a localStorage prefix: the speed and the volume remembered),
   analog ("off" to go without the analog layer even when it is loaded),
   portrait (a phone on its side is asked to turn back upright),
   media-artist / media-album / media-art (the lock screen's lines and
   picture; the title is the track's). On a phone the record plays on with
   the screen locked or the page in the background.
   Children with slot="label" are put on the record's label.

   Events (bubbling): vp-play, vp-stop, vp-end, vp-change (detail: the
   source's track), vp-hint (detail: text), vp-scratch (detail: { flips },
   each time a scratch turns direction at speed), vp-like, vp-error
   (detail: { error }: the source could not start).
   ============================================================ */
(() => {
  'use strict';
  if (window.customElements && customElements.get('vinyl-player')) return;
  const VP = window.VinylPlayer = window.VinylPlayer || {};
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* the deck's own angles, and where the arm's pivot sits in its box */
  const ARM_REST = -62, ARM_IN = -44, ARM_OUT = -14, TUBE_BASE_DEG = 142.8;
  const GEO = { top: 0.08, right: -0.04, w: 0.52, h: 0.62, ox: 0.90, oy: 0.10 };
  const HINT_IDLE = 'Drop the needle: drag the arm onto the record';
  const HINT_DRAG = 'Let go over the record to drop the needle';

  /* a tap you feel, on a phone: vibrate where there is one; iPhone Safari
     has none, but gives a system tap when a switch is toggled, and a
     hidden one, flicked from a real tap, borrows that */
  let hapticFn = null;
  function haptic(ms) {
    if (!hapticFn) {
      if (navigator.vibrate) hapticFn = (n) => { try { navigator.vibrate(n); } catch (e) { /* none */ } };
      else {
        const lab = document.createElement('label');
        lab.setAttribute('aria-hidden', 'true');
        lab.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
        const sw = document.createElement('input');
        sw.type = 'checkbox'; sw.tabIndex = -1; sw.setAttribute('switch', '');
        lab.appendChild(sw); document.body.appendChild(lab);
        hapticFn = () => lab.click();
      }
    }
    hapticFn(ms);
  }

  /* ── playing on with the screen off (phones) ──────────────────────────
     A phone silences a page's sound when it goes to the background or the
     screen locks, unless the page is playing media. So on a touch screen a
     source's output also feeds a stream into a hidden <audio>, started from
     the same tap as the record: in view the sound goes out directly (no
     added delay under a scratching hand); out of view the stream carries
     it. iOS 17+ is told this is playback, so the silent switch leaves it be.
     A source calls VinylPlayer.background(ctx, [its outputs]) once it has a
     context, then .play() and .pause() with the record. */
  const coarse = window.matchMedia('(pointer: coarse)');
  function background(ctx, nodes) {
    if (!coarse.matches || !ctx.createMediaStreamDestination || !window.MediaStream) return null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older iOS */ }
    const dest = ctx.createMediaStreamDestination(), direct = ctx.createGain(), carried = ctx.createGain();
    direct.connect(ctx.destination); carried.connect(dest);
    nodes.forEach((n) => { try { n.disconnect(ctx.destination); } catch (e) { /* was not */ } n.connect(direct); n.connect(carried); });
    const el = document.createElement('audio');
    el.setAttribute('playsinline', ''); el.setAttribute('aria-hidden', 'true'); el.hidden = true;
    el.srcObject = dest.stream;
    document.body.appendChild(el);
    let wanted = false;
    const wake = () => { if (wanted && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {}); };
    const route = () => {
      const away = document.hidden, t = ctx.currentTime;
      direct.gain.setTargetAtTime(away ? 0 : 1, t, 0.02);
      carried.gain.setTargetAtTime(away ? 1 : 0, t, 0.02);
      wake();
    };
    carried.gain.value = 0; route();
    document.addEventListener('visibilitychange', route);
    ctx.addEventListener('statechange', wake);            // a call or Siri over: back on
    return {
      play() { wanted = true; const p = el.play(); if (p && p.catch) p.catch(() => {}); },
      pause() { wanted = false; el.pause(); }
    };
  }
  VP.background = background;

  /* the lock screen and the notification shade: what is on, and play/pause */
  const MS = navigator.mediaSession;
  function mediaMeta(el, tr) {
    if (!MS || !window.MediaMetadata) return;
    const icon = document.querySelector('link[rel="apple-touch-icon"]');
    const art = el.getAttribute('media-art') || (icon && icon.href);
    const named = tr && (tr.title || (tr.label && tr.label.charAt(0).toUpperCase() + tr.label.slice(1) + (tr.side === 'b' ? ' \u00b7 Side B' : '')));
    const title = named || el.getAttribute('label-title') || document.title;
    try {
      MS.metadata = new MediaMetadata({ title, artist: el.getAttribute('media-artist') || el.getAttribute('label-top') || '',
        album: el.getAttribute('media-album') || '', artwork: art ? [{ src: art, sizes: '180x180', type: 'image/png' }] : [] });
    } catch (e) { /* none */ }
  }
  function mediaOwn(el) {
    if (!MS) return;
    const on = (a, fn) => { try { MS.setActionHandler(a, fn); } catch (e) { /* not this one */ } };
    on('play', () => el.play());
    on('pause', () => el.stop());
    on('stop', () => el.stop());
  }

  let uid = 0;
  const ARM_SVG = (u) => `
    <svg class="vp-arm-svg" viewBox="0 0 520 620" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="vpW${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5A5862"/><stop offset=".45" stop-color="#2C2B31"/><stop offset="1" stop-color="#141317"/></linearGradient>
        <linearGradient id="vpS${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B3A41"/><stop offset=".5" stop-color="#1C1B20"/><stop offset="1" stop-color="#0E0E10"/></linearGradient>
        <radialGradient id="vpG${u}" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#E7E3DC"/><stop offset=".45" stop-color="#9A958C"/><stop offset="1" stop-color="#46434A"/></radialGradient>
        <filter id="vpF${u}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
        <radialGradient id="vpL${u}"><stop offset="0" stop-color="#ff3d4c" stop-opacity=".95"/><stop offset=".35" stop-color="#ff2a3a" stop-opacity=".45"/><stop offset="1" stop-color="#ff2a3a" stop-opacity="0"/></radialGradient>
        <linearGradient id="vpB${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff5a66" stop-opacity=".9"/><stop offset="1" stop-color="#ff2a3a" stop-opacity=".15"/></linearGradient>
      </defs>
      <g class="vp-arm-base">
        <circle cx="468" cy="62" r="46" fill="#151418" stroke="#38363E" stroke-width="2"/>
        <circle cx="468" cy="62" r="36" fill="#1F1E23" stroke="#4A4851" stroke-width="1.5"/>
        <circle cx="468" cy="62" r="36" fill="none" stroke="#5B5862" stroke-width="3" stroke-dasharray="2 4" opacity=".55"/>
      </g>
      <g class="vp-arm-body">
        <path d="M468 62 C314.8 190.6 217.1 310.3 149.5 328.4 L72 349" fill="none" stroke="#000" stroke-width="16" stroke-linecap="round" opacity=".45" filter="url(#vpF${u})" transform="translate(5 9)"/>
        <g transform="translate(468 62) rotate(-40)">
          <rect x="0" y="-5" width="46" height="10" rx="3" fill="#8C877E"/>
          <rect x="40" y="-22" width="48" height="44" rx="6" fill="url(#vpW${u})" stroke="#55525B" stroke-width="1.5"/>
          <rect x="40" y="-22" width="9" height="44" rx="3" fill="#C9C4BB"/>
          <path d="M44 -18 v5 M44 -9 v4 M44 -1 v2 M44 5 v4 M44 13 v5" stroke="#3A383F" stroke-width="1.2"/>
          <g fill="#3A383F" font-family="monospace" font-size="4.6" text-anchor="middle"><text x="47" y="-11.5">0</text><text x="47" y="-3">1</text><text x="47" y="5.5">2</text><text x="47" y="14">3</text></g>
          <path d="M58 -21 v42 M64 -21 v42 M70 -21 v42 M76 -21 v42" stroke="#000" stroke-opacity=".35" stroke-width="1.5"/>
          <rect x="86" y="-15" width="6" height="30" rx="2" fill="#2A292E" stroke="#55525B"/>
        </g>
        <path class="vp-arm-hit" d="M468 62 C314.8 190.6 217.1 310.3 149.5 328.4 L72 349" fill="none" stroke="transparent" stroke-width="64" stroke-linecap="round"/>
        <path d="M468 62 C314.8 190.6 217.1 310.3 149.5 328.4" fill="none" stroke="#2B2A30" stroke-width="11" stroke-linecap="round"/>
        <path d="M468 62 C314.8 190.6 217.1 310.3 149.5 328.4" fill="none" stroke="#A7A39B" stroke-width="7.5" stroke-linecap="round"/>
        <path d="M468 62 C314.8 190.6 217.1 310.3 149.5 328.4" fill="none" stroke="#F1EDE6" stroke-width="2" stroke-linecap="round" opacity=".75" transform="translate(-1.2 -1.6)"/>
        <g transform="translate(149.53 328.38) rotate(165)">
          <g class="vp-headshell">
            <rect x="-4" y="-8" width="14" height="16" rx="3" fill="#BDB8AF" stroke="#5E5B62"/>
            <path d="M10 -11 L68 -14 Q84 -13 86 -8 L86 8 Q84 13 68 14 L10 11 Z" fill="url(#vpS${u})" stroke="#55525B" stroke-width="1.5"/>
            <path d="M64 -13 Q70 -26 82 -36" fill="none" stroke="#2B2A30" stroke-width="6" stroke-linecap="round"/>
            <path d="M64 -13 Q70 -26 82 -36" fill="none" stroke="#9E998F" stroke-width="3.5" stroke-linecap="round"/>
            <circle cx="28" cy="-5" r="2.2" fill="#8A857C"/><circle cx="28" cy="5" r="2.2" fill="#8A857C"/>
            <rect x="38" y="-9" width="26" height="18" rx="2.5" fill="#0D0D0F" stroke="#3A383F"/>
            <rect x="38" y="-9" width="5" height="18" rx="1.5" style="fill:var(--vp-accent)" opacity=".9"/>
            <path d="M-1 -8v16 M2 -8v16 M5 -8v16 M8 -8v16" stroke="#7d7870" stroke-width=".8"/>
            <g stroke-width="1.1" fill="none" stroke-linecap="round">
              <path d="M14 -6 C22 -9 30 -8 38 -6" stroke="#d8323f"/><path d="M14 -2 C22 -4 30 -3 38 -2" stroke="#3fae5a"/>
              <path d="M14 2 C22 4 30 3 38 2" stroke="#3d7fd8"/><path d="M14 6 C22 9 30 8 38 6" stroke="#e8e4dc"/>
            </g>
            <g fill="#c9a15a"><circle cx="13.5" cy="-6" r="1.1"/><circle cx="13.5" cy="-2" r="1.1"/><circle cx="13.5" cy="2" r="1.1"/><circle cx="13.5" cy="6" r="1.1"/></g>
            <g fill="#3a383f" stroke="#7a7680" stroke-width=".6"><circle cx="49" cy="-5.2" r="1.7"/><circle cx="49" cy="5.2" r="1.7"/></g>
            <path d="M48.2 -5.2h1.6 M48.2 5.2h1.6" stroke="#9a96a0" stroke-width=".5"/>
            <path d="M60 0 H66.5" stroke="#c9c4bb" stroke-width=".9" stroke-linecap="round"/>
            <circle class="vp-stylus" cx="55" cy="0" r="2.6"/>
            <g class="vp-laser" pointer-events="none">
              <circle class="vp-laser-halo" cx="55" cy="0" r="15" fill="url(#vpL${u})"/>
              <path d="M64.2 -.7 L55.6 -1.6 L55.6 1.6 L64.2 .7 Z" fill="url(#vpB${u})"/>
              <circle cx="64.4" cy="0" r="1.3" fill="#ff4a52"/>
              <circle cx="55" cy="0" r="3.2" fill="#ff2a3a" opacity=".9"/>
              <circle cx="55" cy="0" r="1.4" fill="#fff4f4"/>
            </g>
          </g>
        </g>
      </g>
      <circle cx="468" cy="62" r="21" fill="url(#vpG${u})" stroke="#2A292E" stroke-width="1.5"/>
      <circle cx="468" cy="62" r="7" fill="#1A191D"/>
      <circle cx="468" cy="62" r="2.2" fill="#55525B"/>
      <g fill="#2a292e" stroke="#6c6973" stroke-width=".8"><circle cx="497" cy="62" r="2.6"/><circle cx="439" cy="62" r="2.6"/><circle cx="468" cy="91" r="2.6"/><circle cx="468" cy="33" r="2.6"/></g>
      <path d="M495.5 62h3 M437.5 62h3 M468 89.5v3 M468 31.5v3" stroke="#6c6973" stroke-width=".7"/>
    </svg>`;
  /* fixed to the plinth, outside the arm that turns: the rest it parks in,
     the cue lever and the anti-skate dial (the zone's own 1000-unit square) */
  const ARMBASE_SVG = `
    <svg class="vp-armbase" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">
      <circle cx="988" cy="142" r="58" fill="none" stroke="#1a181d" stroke-width="10"/>
      <circle cx="988" cy="142" r="58" fill="none" stroke="#5b5862" stroke-width="5" stroke-dasharray="1.2 4.9"/>
      <g fill="#6a6670" font-family="monospace" font-size="9" text-anchor="middle"><text x="921" y="182">0</text><text x="934" y="203">1</text><text x="953" y="217">2</text><text x="975" y="224">3</text><text x="999" y="225">4</text></g>
      <g transform="translate(905 66)">
        <circle r="22" fill="none" stroke="#4a4750" stroke-width="3" stroke-dasharray="1 3.6"/>
        <g fill="#6a6670" font-family="monospace" font-size="7" text-anchor="middle"><text x="-27" y="3">0</text><text y="-25">1</text><text x="27" y="3">3</text></g>
        <circle r="17" fill="#1B1A1F" stroke="#47454D" stroke-width="2"/><circle r="11" fill="#2A292F"/>
        <path d="M0 -11 V-4" stroke="#D9D4CC" stroke-width="2.5" stroke-linecap="round"/>
      </g>
      <g transform="translate(1049 432)">
        <circle r="15" fill="#151418" stroke="#38363E" stroke-width="2"/>
        <path d="M-10 -3 Q0 8 10 -3" fill="none" stroke="#6A6770" stroke-width="4" stroke-linecap="round"/>
        <path d="M-13 -7 Q0 -19 13 -7" fill="none" stroke="#8f8a81" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="13" cy="-7" r="2.4" fill="#55525b"/>
      </g>
      <g transform="translate(1030 250)">
        <rect x="-9" y="-9" width="18" height="18" rx="4" fill="#1B1A1F" stroke="#47454D" stroke-width="2"/>
        <rect x="-4" y="-38" width="8" height="34" rx="4" fill="#8F8A81"/><circle cy="-40" r="7" fill="#C9C4BB"/>
      </g>
    </svg>`;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  class VinylPlayerElement extends HTMLElement {
    static get observedAttributes() { return ['src', 'layout', 'model', 'label-top', 'label-title', 'label-sub', 'rpm', 'volume']; }

    constructor() {
      super();
      this._source = null;
      this._playing = false; this._busy = false;
      this._rpm = 33; this._vol = 7;
      this._angle = 0; this._spinRaf = 0; this._spinLast = 0; this._holding = false;
      this._follow = 0; this._lastPos = 0;
      this._dragging = false; this._dragPct = null; this._moved = false; this._lastScratch = 0;
      this._hand = null;
      this._built = false;
    }

    /* ── settings, remembered when the page asked for that ──────────── */
    _get(k, d) {
      const p = this.getAttribute('storage');
      if (!p) return d;
      try { const v = localStorage.getItem(p + k); return v == null ? d : v; } catch (e) { return d; }
    }
    _set(k, v) {
      const p = this.getAttribute('storage');
      if (!p) return;
      try { localStorage.setItem(p + k, String(v)); } catch (e) { /* none */ }
    }
    _emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { bubbles: true, detail })); }
    _analog() { return this.getAttribute('analog') !== 'off' ? VP.Analog : null; }
    _tick(heavy) { try { if (this._source && this._source.click) this._source.click(heavy); } catch (e) { /* silent is fine */ } }
    feel(heavy) { this._tick(heavy); haptic(heavy ? 14 : 6); }

    connectedCallback() {
      if (!this._built) this._build();
      /* portrait: a phone on its side gets a card asking for it upright (vinyl-player.css) */
      if (this.hasAttribute('portrait') && !document.querySelector('.vp-turn')) {
        const c = document.createElement('div');
        c.className = 'vp-turn'; c.setAttribute('role', 'status');
        c.innerHTML = '<span class="vp-turn__phone" aria-hidden="true"></span><p class="vp-turn__title">Turn your phone upright</p><p class="vp-turn__sub">The record plays on</p>';
        document.body.appendChild(c);
      }
      this._ro = new ResizeObserver(() => this._layout());
      this._ro.observe(this);
      this._layout();
      this._eqTimer = setInterval(() => { if (this._source && this._source.playing) this._eqWake(); }, 1000);
      if (!this._source && this.getAttribute('src') && VP.FileSource) this.source = VP.FileSource(this.getAttribute('src'));
    }
    disconnectedCallback() {
      if (this._ro) this._ro.disconnect();
      clearInterval(this._eqTimer);
      cancelAnimationFrame(this._spinRaf); this._spinRaf = 0;
      cancelAnimationFrame(this._eqRaf); this._eqRaf = 0;
    }
    attributeChangedCallback(name, was, now) {
      if (!this._built || was === now) return;
      if (name === 'src' && now && VP.FileSource) {
        if (this._playing) this.stop();
        this.source = VP.FileSource(now);
      } else if (name === 'layout') this._layout();
      else if (name === 'model') this._parts.model.textContent = now || '';
      else if (/^label-/.test(name)) this._paintLabel();
      else if (name === 'rpm') this.speed = Number(now) === 45 ? 45 : 33;
      else if (name === 'volume') this.volume = Number(now);
    }

    /* ── the source: what plays ─────────────────────────────────────── */
    /* a src given before file-source.js had loaded: its source made when wanted */
    get source() {
      if (!this._source && this._built && this.getAttribute('src') && VP.FileSource) this.source = VP.FileSource(this.getAttribute('src'));
      return this._source;
    }
    set source(src) {
      if (this._source && this._source !== src && this._playing) this.stop();
      this._source = src || null;
      if (!src || !this._built) return;
      if (src.speed) src.speed(this._rpm);
      if (src.volume) src.volume(this._vol / 10);
      try { src.onchange = (tr) => this._changed(tr); } catch (e) { /* a source without one */ }
      try { src.onend = () => { if (this._playing) this.stop(); this._emit('vp-end'); }; } catch (e) { /* none */ }
      if (this._parts && this._parts.like) this._parts.like.closest('.vp-ctl').hidden = !src.like;
      this._eqData = null;
    }
    get playing() { return this._playing; }
    get parts() { return this._parts; }

    _changed(tr) {
      const single = !!(tr && tr.rpm === 45);
      this.classList.toggle('is-45', single);
      if (this._parts.rpmtag) this._parts.rpmtag.textContent = single ? '45' : '33⅓';
      if (this._parts.like) this._parts.like.setAttribute('aria-pressed', 'false');     // a new record: not liked yet
      if (this._playing) mediaMeta(this, tr);
      this._emit('vp-change', tr);
    }

    /* ── the build ───────────────────────────────────────────────────── */
    _build() {
      this._built = true;
      const u = ++uid;
      const want = (this.getAttribute('controls') || 'start speed volume spectrum like').split(/[\s,]+/);
      const has = (k) => want.indexOf(k) >= 0;
      const art = Array.from(this.querySelectorAll(':scope > [slot="label"]'));
      art.forEach((el) => el.remove());
      this._rpm = Number(this._get('rpm', this.getAttribute('rpm') || 33)) === 45 ? 45 : 33;
      this._vol = Math.min(10, Math.max(0, Number(this._get('vol', this.getAttribute('volume') || 7)) || 0));
      if (/Win/.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '')) this.classList.add('is-win');

      this.innerHTML =
        '<div class="vp-plinth">' +
          '<p class="vp-model" aria-hidden="true"></p>' +
          '<div class="vp-deck">' +
            '<div class="vp-drop" role="button" tabindex="0" aria-label="Drop the needle" aria-pressed="false">' +
              '<div class="vp-zone">' +
                '<div class="vp-strobe" aria-hidden="true"></div>' +
                '<div class="vp-platter">' +
                  '<div class="vp-record">' +
                    '<div class="vp-grooves"></div><div class="vp-sheen"></div>' +
                    '<div class="vp-label">' +
                      '<span class="vp-label-art" aria-hidden="true"></span>' +
                      '<span class="vp-label-top"></span><span class="vp-label-title"></span><span class="vp-label-sub"></span>' +
                      '<span class="vp-rpmtag" aria-hidden="true">33⅓</span>' +
                      '<span class="vp-spindle"></span>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
                '<div class="vp-arm" role="slider" tabindex="0" aria-label="Tonearm position: drag or use arrow keys to seek"' +
                  ' aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="Tonearm at rest">' + ARM_SVG(u) + '</div>' +
                ARMBASE_SVG +
              '</div>' +
            '</div>' +
          '</div>' +
          (has('spectrum') ? '<div class="vp-eq" aria-hidden="true"><span class="vp-print">spectrum</span><canvas class="vp-eq-screen"></canvas></div>' : '') +
          '<div class="vp-controls" role="group" aria-label="Deck controls">' +
            (has('start') ? '<div class="vp-ctl vp-ctl--start"><span class="vp-print" aria-hidden="true">start·stop</span>' +
              '<button type="button" class="vp-key vp-key--start" aria-pressed="false" aria-label="Start or stop"><b></b></button></div>' : '') +
            (has('speed') ? '<div class="vp-ctl vp-ctl--speed"><span class="vp-print" aria-hidden="true">speed</span>' +
              '<div class="vp-speed" role="radiogroup" aria-label="Speed">' +
                '<button type="button" class="vp-key" role="radio" aria-checked="true" data-rpm="33" aria-label="33 rpm"><i aria-hidden="true"></i>33</button>' +
                '<button type="button" class="vp-key" role="radio" aria-checked="false" data-rpm="45" aria-label="45 rpm"><i aria-hidden="true"></i>45</button>' +
              '</div></div>' : '') +
            (has('like') ? '<div class="vp-ctl vp-ctl--like" hidden><span class="vp-print" aria-hidden="true">like</span>' +
              '<button type="button" class="vp-key vp-key--like" aria-pressed="false" aria-label="Like this record: more like it"><i aria-hidden="true"></i>&#9829;&#xFE0E;</button></div>' : '') +
            (has('volume') ? '<div class="vp-ctl vp-ctl--volume"><label class="vp-print" for="vpVol' + u + '">volume</label>' +
              '<span class="vp-fader"><input type="range" id="vpVol' + u + '" min="0" max="10" step="1"></span></div>' : '') +
          '</div>' +
        '</div>' +
        (this.hasAttribute('hint') ? '<p class="vp-hint" aria-live="polite"></p>' : '');

      const $ = (s) => this.querySelector(s);
      this._parts = {
        plinth: $('.vp-plinth'), model: $('.vp-model'), deck: $('.vp-deck'), drop: $('.vp-drop'), zone: $('.vp-zone'),
        platter: $('.vp-platter'), record: $('.vp-record'), label: $('.vp-label'), art: $('.vp-label-art'), rpmtag: $('.vp-rpmtag'),
        arm: $('.vp-arm'), controls: $('.vp-controls'), start: $('.vp-key--start'), like: $('.vp-key--like'),
        fader: $('.vp-fader input'), eq: $('.vp-eq-screen'), hint: $('.vp-hint')
      };
      this._parts.model.textContent = this.getAttribute('model') || 'vinyl-player · direct drive';
      art.forEach((el) => { el.removeAttribute('slot'); this._parts.art.appendChild(el); });
      this._parts.label.classList.toggle('has-art', art.length > 0);
      this._paintLabel();
      this._wire();
      this._setSpeed(this._rpm, true);
      if (this._parts.fader) {
        this._parts.fader.value = this._vol;
        this._paintVol();
      }
      this._armTo(0, true);
      this._hint(HINT_IDLE);
      this._eqSetup();
      /* a source given before the element was built: wired up now */
      if (this._source) { const s = this._source; this._source = null; this.source = s; }
    }
    _paintLabel() {
      const p = this._parts;
      p.label.querySelector('.vp-label-top').textContent = this.getAttribute('label-top') || 'side a';
      p.label.querySelector('.vp-label-title').textContent = this.getAttribute('label-title') || '—';
      p.label.querySelector('.vp-label-sub').textContent = this.getAttribute('label-sub') || '';
    }
    /* the platter's square, from the element's own width, and which layout */
    _layout() {
      const w = this.clientWidth;
      if (!w) return;
      const mode = this.getAttribute('layout') || 'auto';
      const wide = mode === 'wide' || (mode === 'auto' && w >= 600);
      this.classList.toggle('is-wide', wide);
      this.classList.toggle('is-compact', !wide && w < 600);
      const d = wide ? w / 1.38 : (w - 2) / 1.24;
      this.style.setProperty('--vp-d', d.toFixed(2) + 'px');
      if (this._eqSize) this._eqSize();
    }

    /* ── the hint ───────────────────────────────────────────────────── */
    _hint(t) {
      const h = this._parts.hint;
      if (h) { h.classList.toggle('is-quiet', !t); if (t) h.textContent = t; }
      this._emit('vp-hint', t || '');
    }

    /* ── the arm ────────────────────────────────────────────────────────
       The arm is the seek control: 0 is the outer groove, 1 the run-out. */
    _armTo(pct, rest) {
      const arm = this._parts.arm;
      const deg = rest ? ARM_REST : ARM_IN + (ARM_OUT - ARM_IN) * Math.min(1, Math.max(0, pct));
      arm.style.transform = 'rotate(' + deg.toFixed(2) + 'deg)';
      arm.setAttribute('aria-valuenow', rest ? 0 : Math.round(pct * 100));
      arm.setAttribute('aria-valuetext', rest ? 'Tonearm at rest' : Math.round(pct * 100) + '% through the side');
    }
    /* where a pointer aims the arm: a fraction of the side, or null off the record */
    _aimed(ev) {
      const z = this._parts.zone.getBoundingClientRect();
      const px = z.left + z.width * (1 - GEO.right - GEO.w * (1 - GEO.ox));
      const py = z.top + z.height * (GEO.top + GEO.h * GEO.oy);
      let theta = Math.atan2(ev.clientY - py, ev.clientX - px) * 180 / Math.PI - TUBE_BASE_DEG;
      while (theta > 180) theta -= 360;
      while (theta < -180) theta += 360;
      if (theta < ARM_IN - 5) return null;
      return Math.min(1, Math.max(0, (theta - ARM_IN) / (ARM_OUT - ARM_IN)));
    }
    /* while it plays, the arm tracks inward with the music; past the run-out
       (a source that goes round again) it glides back out with it */
    _track() {
      if (!this._playing || this._dragging || !this._source) { this._follow = 0; return; }
      const pos = this._source.position();
      this._parts.arm.classList.toggle('is-tracking', !(pos < this._lastPos - 0.05));
      this._lastPos = pos;
      this._armTo(pos);
      this._follow = setTimeout(() => this._track(), 400);
    }
    _followIn(ms) { clearTimeout(this._follow); this._follow = setTimeout(() => this._track(), ms); }

    _setPlaying(on) {
      this._playing = on;
      const d = this._parts.drop;
      d.setAttribute('aria-pressed', String(on));
      d.setAttribute('aria-label', on ? 'Lift the needle' : 'Drop the needle');
      if (this._parts.start) this._parts.start.setAttribute('aria-pressed', String(on));
      this.classList.toggle('is-on', on);
      this._hint(on ? '' : HINT_IDLE);
    }

    /* ── play and stop ──────────────────────────────────────────────────
       play(from): the needle down at a place on the side (0 = the outer
       groove). play(from, how): the same, with how() starting the sound in
       place of the source's start (a B-side, a flip). */
    async play(from, how) {
      const src = this.source;
      if (!src || this._busy || (this._playing && !how)) return;
      this._busy = true;
      try {
        const wasOn = this._playing;
        if (!wasOn) { this._setPlaying(true); haptic(14); }
        this._spinOn();
        this._parts.arm.classList.remove('is-tracking');
        this._armTo(from || 0);
        this._lastPos = from || 0;
        /* from rest the arm takes 900ms to land; the music starts as it does */
        const landing = this._dragging || from != null || how ? 0.08 : 0.85;
        const A = this._analog();
        if (how) {
          clearTimeout(this._follow); this._follow = 0;
          if (!wasOn && A) { try { await A.unlock(); await A.start(); } catch (e) { /* the crackle is a bonus */ } }
          await how();
          if (A) { try { A.needleDrop(); } catch (e) { /* none */ } }
          this._followIn(600);
        } else {
          try { await src.start(landing, from || 0); }
          catch (e) {
            /* nothing to play (a missing file, a refused one, one that will
               not decode): the needle goes back to its rest */
            this._setPlaying(false);
            this._parts.arm.classList.remove('is-tracking');
            this._armTo(0, true);
            this._emit('vp-error', { error: e });
            return;
          }
          this._followIn(landing * 1000 + 200);
          if (A) { try { await A.unlock(); await A.start(); setTimeout(() => A.needleDrop(), landing * 1000 - 100); } catch (e) { /* none */ } }
        }
        mediaOwn(this); mediaMeta(this, src.track);
        if (MS) MS.playbackState = 'playing';
        this._emit('vp-play', { from: from || 0 });
        this._eqWake();
      } finally { this._busy = false; }
    }
    stop() {
      if (!this._playing) return;
      this._setPlaying(false);
      haptic(14);
      clearTimeout(this._follow); this._follow = 0;
      if (this._source) this._source.stop();
      const A = this._analog();
      if (A) { try { A.needleLift(); A.stop(); } catch (e) { /* none */ } }
      this._parts.arm.classList.remove('is-tracking');
      this._armTo(0, true);
      this._spinOn();                                   // the platter coasts down with the brake
      if (MS) MS.playbackState = 'paused';
      this._emit('vp-stop');
    }
    toggle() { return this._playing ? this.stop() : this.play(); }

    /* ── the platter: it turns at whatever speed the record is read ───── */
    _spinFrame(now) {
      const dt = Math.min(50, now - (this._spinLast || now));
      this._spinLast = now;
      const r = this._source && this._source.spin ? this._source.spin() : (this._playing ? 1 : 0);
      if (!this._holding && !reduce.matches) this._angle += dt * 0.2 * r;
      this._parts.record.style.transform = 'rotate(' + (this._angle % 360).toFixed(2) + 'deg)';
      if (this._playing || this._holding || Math.abs(r) > 0.002) this._spinRaf = requestAnimationFrame((t) => this._spinFrame(t));
      else { this._spinRaf = 0; this._spinLast = 0; }
    }
    _spinOn() { if (!this._spinRaf) this._spinRaf = requestAnimationFrame((t) => this._spinFrame(t)); }

    /* ── the belt and the fader ─────────────────────────────────────── */
    get speed() { return this._rpm; }
    set speed(r) { this._setSpeed(Number(r) === 45 ? 45 : 33, true); }
    _setSpeed(r, quiet) {
      this._rpm = r;
      if (this._source && this._source.speed) this._source.speed(r);
      this.querySelectorAll('.vp-key[data-rpm]').forEach((k) => {
        const on = Number(k.dataset.rpm) === r;
        k.setAttribute('aria-checked', String(on));
        k.tabIndex = on ? 0 : -1;
      });
      if (!quiet) { this.feel(false); this._set('rpm', r); }
    }
    get volume() { return this._vol; }
    set volume(v) {
      this._vol = Math.min(10, Math.max(0, Math.round(Number(v) || 0)));
      if (this._parts && this._parts.fader) { this._parts.fader.value = this._vol; this._paintVol(); }
      if (this._source && this._source.volume) this._source.volume(this._vol / 10);
    }
    _paintVol() { this._parts.fader.setAttribute('aria-valuetext', this._parts.fader.value * 10 + '%'); }

    /* ── the hands: the arm, the record, the switches ───────────────── */
    _wire() {
      const p = this._parts, arm = p.arm, drop = p.drop;

      /* dragging the arm: picked up, the needle leaves the groove and the
         music goes quiet under it (a scratch as it moves); let go over the
         record and it drops there and plays on from that place; let go off
         the record and the arm goes back to its rest and the record stops */
      arm.addEventListener('pointerdown', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        this._dragging = true; this._moved = false;
        clearTimeout(this._follow); this._follow = 0;
        arm.classList.remove('is-tracking');
        arm.classList.add('is-dragging');
        try { arm.setPointerCapture(ev.pointerId); } catch (e) { /* gone already */ }
        const A = this._analog();
        if (this._playing && this._source) { this._source.lift(true); if (A) { try { A.needleLift(); } catch (e) { /* none */ } } }
        haptic(6);
        this._hint(HINT_DRAG);
        this._dragPct = this._aimed(ev);
      });
      arm.addEventListener('pointermove', (ev) => {
        if (!this._dragging) return;
        const next = this._aimed(ev);
        this._moved = true;
        if (next == null) this._armTo(0, true);
        else {
          this._armTo(next);
          const d = Math.abs(next - (this._dragPct == null ? next : this._dragPct)) * 100;
          const A = this._analog();
          if (d > 0.6 && A && A.scratch) {
            const now = performance.now();
            if (now - this._lastScratch > 40) { try { A.scratch(Math.min(1, Math.max(0.05, d / 14))); } catch (e) { /* none */ } this._lastScratch = now; }
          }
        }
        this._dragPct = next;
      });
      const release = async (ev) => {
        if (!this._dragging) return;
        this._dragging = false;
        arm.classList.remove('is-dragging');
        try { arm.releasePointerCapture(ev.pointerId); } catch (e) { /* none */ }
        const src = this._source;
        const at = this._moved ? this._dragPct : (this._playing && src ? src.position() : 0);
        if (at == null) { if (this._playing) this.stop(); else { this._armTo(0, true); this._hint(HINT_IDLE); } return; }
        if (this._playing && src) {
          /* dropped somewhere new: the music picks up there */
          this._armTo(at);
          src.seek(at);
          src.lift(false);
          haptic(14);
          const A = this._analog();
          if (A) { try { A.needleDrop(); } catch (e) { /* none */ } }
          this._hint('');
          this._lastPos = at;
          this._followIn(300);
        } else await this.play(at);
      };
      arm.addEventListener('pointerup', release);
      arm.addEventListener('pointercancel', release);
      /* the arm is inside the record's button: its taps are its own */
      arm.addEventListener('click', (ev) => ev.stopPropagation());
      /* and from the keyboard: arrows move the needle, Home lifts it */
      arm.addEventListener('keydown', (ev) => {
        const src = this._source;
        const cur = this._playing && src ? src.position() : 0;
        const stepBy = ev.shiftKey ? 0.1 : 0.04;
        let to;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') to = cur + stepBy;
        else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') to = cur - stepBy;
        else if (ev.key === 'End') to = 0.98;
        else if (ev.key === 'Home') { ev.preventDefault(); ev.stopPropagation(); this.stop(); return; }
        else return;
        ev.preventDefault(); ev.stopPropagation();
        to = Math.min(0.98, Math.max(0, to));
        if (!this._playing) { this.play(to); return; }
        this._armTo(to); src.seek(to); this._lastPos = to;
      });

      drop.addEventListener('keydown', (ev) => {
        if (ev.target !== drop) return;
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this.toggle(); }
      });

      /* a hand on the record: down on a playing record and it stops under the
         hand, the music braking with it; moved, the record turns with the
         hand and the music goes with it, at the hand's speed. Let go and the
         motor takes it back up to speed. A quick tap is play or stop. */
      const centre = () => { const b = p.record.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
      const handFrame = (now) => {
        const hand = this._hand;
        if (!hand) return;
        const dt = Math.max(1, now - hand.last);
        hand.last = now;
        /* how fast the hand turned it, against the record's own speed (200deg
           a second for a 33, 270 for a 45) */
        const rpm = (this._source && this._source.recordRpm) || 33.33;
        const r = Math.max(-6, Math.min(6, (hand.acc / dt) / (0.006 * rpm)));
        hand.acc = 0;
        if (this._holding && this._source) this._source.scratch(r);
        /* a scratch is back and forth: count the turns of direction made at speed */
        if (Math.abs(r) > 0.6) {
          const dir = Math.sign(r);
          if (hand.dir && dir !== hand.dir) { hand.flips++; this._emit('vp-scratch', { flips: hand.flips }); }
          hand.dir = dir;
        }
        hand.raf = requestAnimationFrame(handFrame);
      };
      drop.addEventListener('pointerdown', (ev) => {
        if (ev.button > 0 || ev.target.closest('.vp-arm')) return;
        const c = centre();
        this._hand = { id: ev.pointerId, t0: performance.now(), last: performance.now(), c,
                       a: Math.atan2(ev.clientY - c.y, ev.clientX - c.x), turned: 0, acc: 0, dir: 0, flips: 0, raf: 0 };
        try { drop.setPointerCapture(ev.pointerId); } catch (e) { /* none */ }
        if (this._playing && this._source) {
          this._holding = true;
          this._source.hold();
          this.classList.add('is-held');
          haptic(8);
          this._spinOn();
          this._hand.raf = requestAnimationFrame(handFrame);
        }
      });
      drop.addEventListener('pointermove', (ev) => {
        const hand = this._hand;
        if (!hand || ev.pointerId !== hand.id) return;
        const a = Math.atan2(ev.clientY - hand.c.y, ev.clientX - hand.c.x);
        let d = a - hand.a;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        hand.a = a;
        const deg = d * 180 / Math.PI;
        hand.turned += Math.abs(deg);
        if (this._holding) { this._angle += deg; hand.acc += deg; }
      });
      const letGo = (ev) => {
        const hand = this._hand;
        if (!hand || ev.pointerId !== hand.id) return;
        const tap = performance.now() - hand.t0 < 260 && hand.turned < 8;
        cancelAnimationFrame(hand.raf);
        this._hand = null;
        try { drop.releasePointerCapture(ev.pointerId); } catch (e) { /* none */ }
        if (this._holding) { this._holding = false; if (this._source) this._source.release(); this.classList.remove('is-held'); }
        if (tap && ev.type === 'pointerup') this.toggle();
        this._eqWake();
      };
      drop.addEventListener('pointerup', letGo);
      drop.addEventListener('pointercancel', letGo);

      /* START·STOP does what a tap on the record does */
      if (p.start) p.start.addEventListener('click', () => { this._tick(true); this.toggle(); });
      if (p.like) p.like.addEventListener('click', () => {
        if (p.like.getAttribute('aria-pressed') === 'true' || !this._source || !this._source.like) { this.feel(false); return; }
        if (this._source.like()) { p.like.setAttribute('aria-pressed', 'true'); this.feel(true); this._emit('vp-like'); }
      });
      const keys = Array.from(this.querySelectorAll('.vp-key[data-rpm]'));
      keys.forEach((k) => {
        k.addEventListener('click', () => { const r = Number(k.dataset.rpm); if (r !== this._rpm) this._setSpeed(r); else this.feel(false); });
        /* a radio group: the arrows move between the two */
        k.addEventListener('keydown', (ev) => {
          if (!/^Arrow/.test(ev.key)) return;
          ev.preventDefault();
          const next = this._rpm === 33 ? 45 : 33;
          this._setSpeed(next);
          keys.find((x) => Number(x.dataset.rpm) === next).focus();
        });
      });
      /* a key pressed from the keyboard sinks too, briefly, as under a finger */
      this.querySelectorAll('.vp-key').forEach((k) => k.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        k.classList.add('is-down'); setTimeout(() => k.classList.remove('is-down'), 120);
      }));
      /* the fader: ten detents, each one ticks */
      if (p.fader) p.fader.addEventListener('input', () => {
        this._vol = Number(p.fader.value);
        if (this._source && this._source.volume) this._source.volume(this._vol / 10);
        this._paintVol(); this.feel(false);
        this._set('vol', this._vol);
      });
      this.addEventListener('click', () => setTimeout(() => this._eqWake(), 120), true);
    }

    /* ── the spectrum ───────────────────────────────────────────────────
       Ten bands, bass to treble, spaced as the ear hears them (60 Hz to
       12 kHz), each a column of lit segments from what is heard (after the
       fader, so it follows the volume, a brake, a scratch); a peak dot that
       falls back slowly. Drawn only while there is something to show. */
    _eqSetup() {
      const cv = this._parts.eq;
      if (!cv || !cv.getContext) return;
      const g = cv.getContext('2d');
      const BANDS = 10, SEG = 14;
      let w = 0, h = 0, edges = null;
      const peaks = new Array(BANDS).fill(0);
      this._eqSize = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        w = cv.clientWidth; h = cv.clientHeight;
        if (!w || !h) return false;
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(null);
        return true;
      };
      const bandEdges = (src) => {
        const n = src.bins, hzPer = src.sampleRate / 2 / n, e = [];
        for (let i = 0; i <= BANDS; i++) e.push(Math.max(1, Math.round(60 * Math.pow(12000 / 60, i / BANDS) / hzPer)));
        return e;
      };
      const draw = (levels) => {
        g.clearRect(0, 0, w, h);
        const pad = 5, gap = 3, bw = (w - pad * 2 - gap * (BANDS - 1)) / BANDS;
        const sh = (h - pad * 2) / SEG;
        for (let b = 0; b < BANDS; b++) {
          const lit = levels ? levels[b] : 0;
          const x = pad + b * (bw + gap);
          for (let k = 0; k < SEG; k++) {
            const y = h - pad - (k + 1) * sh;
            /* low segments a deep red, rising to a bright red and a hot near-white */
            g.fillStyle = k < lit ? (k > SEG * 0.82 ? '#ffc2c6' : k > SEG * 0.55 ? '#ff4a52' : '#b3121f') : '#1c181d';
            g.fillRect(x, y + 1, bw, sh - 2);
          }
          if (levels && peaks[b] > 0.6) {
            const y = h - pad - Math.ceil(peaks[b]) * sh;
            g.fillStyle = 'rgba(255,170,176,.9)';
            g.fillRect(x, y + 1, bw, 2);
          }
        }
      };
      const frame = () => {
        this._eqRaf = 0;
        if (!w && !this._eqSize()) return;
        const src = this._source;
        if (!src || !src.levels) { draw(null); return; }
        if (!this._eqData && src.bins) { this._eqData = new Uint8Array(src.bins); edges = bandEdges(src); }
        const data = this._eqData;
        const levels = new Array(BANDS).fill(0);
        let any = false;
        if (data && src.levels(data)) {
          for (let b = 0; b < BANDS; b++) {
            let sum = 0, n = 0;
            for (let i = edges[b]; i < Math.max(edges[b] + 1, edges[b + 1]) && i < data.length; i++) { sum += data[i]; n++; }
            /* music is quieter the higher it goes: a gentle tilt lets the
               mids and highs show alongside the bass */
            const v = Math.min(1, (n ? sum / n / 255 : 0) * (0.86 + 0.075 * b));
            levels[b] = Math.round(Math.pow(v, 1.25) * SEG);
            peaks[b] = Math.max(levels[b], peaks[b] - 0.12);
            if (levels[b] || peaks[b] > 0.6) any = true;
          }
        }
        draw(levels);
        if (any || src.playing) this._eqRaf = requestAnimationFrame(frame);
      };
      this._eqWake = () => { if (!this._eqRaf) this._eqRaf = requestAnimationFrame(frame); };
      requestAnimationFrame(() => this._eqSize());
    }
  }
  /* until the spectrum is set up (or where there is none), waking it is nothing */
  VinylPlayerElement.prototype._eqWake = function () {};

  customElements.define('vinyl-player', VinylPlayerElement);
  VP.Element = VinylPlayerElement;
  VP.haptic = haptic;                        // the same tap, for a page's own switches
})();
