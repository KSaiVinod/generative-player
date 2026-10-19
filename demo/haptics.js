  const ua = document.getElementById('ua');
  ua.textContent = navigator.userAgent + ' · vibrate: ' + ('vibrate' in navigator ? 'yes' : 'no') +
    ' · switch supported: ' + ('switch' in HTMLInputElement.prototype ? 'yes' : 'no');
  /* 2: the deck's way, a label kept in the page off-screen */
  const lab = document.createElement('label');
  lab.setAttribute('aria-hidden', 'true');
  lab.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  const sw = document.createElement('input'); sw.type = 'checkbox'; sw.tabIndex = -1; sw.setAttribute('switch', '');
  lab.appendChild(sw); document.body.appendChild(lab);
  document.getElementById('b2').addEventListener('click', () => lab.click());
  /* 3 and 4: a fresh hidden switch each time, as the ios-haptics library does */
  const fresh = () => {
    const l = document.createElement('label'); l.ariaHidden = 'true'; l.style.display = 'none';
    const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', '');
    l.appendChild(i); document.head.appendChild(l); l.click(); l.remove();
  };
  document.getElementById('b3').addEventListener('click', fresh);
  document.getElementById('b4').addEventListener('pointerdown', fresh);
  document.getElementById('b5').addEventListener('click', () => { if (navigator.vibrate) navigator.vibrate(20); });
