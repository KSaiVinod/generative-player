/* the demo: a file you choose, the generative engine, and a small deck */
(() => {
  'use strict';
  const VP = window.VinylPlayer;

  /* a file chosen, or dropped on the deck */
  const fileDeck = document.getElementById('fileDeck');
  const name = document.getElementById('fileName');
  const useFile = (f) => {
    if (!f) return;
    fileDeck.source = VP.FileSource(f);
    fileDeck.setAttribute('label-title', f.name.replace(/\.[^.]+$/, '').slice(0, 24));
    name.textContent = f.name;
  };
  document.getElementById('file').addEventListener('change', (ev) => useFile(ev.target.files[0]));
  fileDeck.addEventListener('dragover', (ev) => ev.preventDefault());
  fileDeck.addEventListener('drop', (ev) => { ev.preventDefault(); useFile(ev.dataTransfer.files[0]); });
  fileDeck.addEventListener('vp-end', () => { name.textContent += ' · played to the end'; });

  /* the engine: armed and its first record pressed as the page opens */
  const gen = document.getElementById('genDeck');
  const note = document.getElementById('genNote');
  gen.source = VP.Generative;
  VP.Generative.prepare().then(() => { note.textContent = 'Ready. Drop the needle.'; }, () => { note.textContent = 'The engine could not start here.'; });
  gen.addEventListener('vp-change', (ev) => {
    const tr = ev.detail;
    if (tr && tr.style) note.textContent = 'Now: ' + tr.style + (tr.rpm === 45 ? ' · a 45' : '');
  });

  /* the small one plays whatever the first one has, as a second source of its own */
  const small = document.getElementById('smallDeck');
  document.getElementById('file').addEventListener('change', (ev) => { if (ev.target.files[0]) small.source = VP.FileSource(ev.target.files[0]); });
})();
