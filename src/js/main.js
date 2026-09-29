import { bus, play, startMic, stopMic, micOn, noteName } from './audio.js';
import { scoreStaff } from './visuals.js';

document.querySelectorAll('[data-visual="scoregen"]').forEach(scoreStaff);

// ---------- ScoreGen demo: sing or tap a key, the note lands on the staff ----------
const rNote = document.getElementById('readout-note');
const rCents = document.getElementById('readout-cents');
bus.addEventListener('note', (e) => {
  if (e.detail.source === 'mic') return;
  rNote.textContent = noteName(e.detail.midi);
  rCents.textContent = '';
});
bus.addEventListener('pitch', (e) => {
  if (!e.detail) return;
  const cents = Math.round((e.detail.midi - Math.round(e.detail.midi)) * 100);
  rNote.textContent = noteName(e.detail.midi);
  rCents.textContent = `${cents >= 0 ? '+' : ''}${cents}¢`;
});
document.querySelectorAll('.mini-keys [data-midi]').forEach((b) =>
  b.addEventListener('click', () => play(+b.dataset.midi, { source: 'keys' })));

const micBtn = document.getElementById('mic-btn');
micBtn?.addEventListener('click', async () => {
  if (micOn()) {
    stopMic();
    micBtn.setAttribute('aria-pressed', 'false');
    micBtn.textContent = 'Sing a note';
    return;
  }
  try {
    micBtn.textContent = 'Allow the mic…';
    await startMic();
    micBtn.setAttribute('aria-pressed', 'true');
    micBtn.textContent = 'Listening (click to stop)';
  } catch {
    micBtn.textContent = 'No mic, try the keys';
  }
});

// ---------- click-to-load playable builds ----------
document.querySelectorAll('[data-play]').forEach((btn) => btn.addEventListener('click', () => {
  const frame = document.createElement('iframe');
  frame.src = btn.dataset.play;
  frame.title = btn.dataset.title || 'Playable build';
  frame.allow = 'autoplay; fullscreen; gamepad';
  btn.replaceWith(frame);
}));
