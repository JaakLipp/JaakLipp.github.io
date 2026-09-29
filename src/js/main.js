import { bus, play, startMic, stopMic, micOn, noteName } from './audio.js';
import { scoreStaff, longRoad } from './visuals.js';
import { initCarousel } from './carousel.js';

document.documentElement.classList.add('js'); // reveal animations only hide content once JS is running
document.querySelectorAll('[data-visual="scoregen"]').forEach(scoreStaff);
document.querySelectorAll('[data-visual="the-long-road"]').forEach(longRoad);
document.querySelectorAll('.carousel').forEach(initCarousel);

// ---------- scroll reveals ----------
document.querySelectorAll('.hack').forEach((el, i) => {
  el.classList.add('reveal');
  el.style.setProperty('--i', i % 6);
});
const revealer = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('in'); revealer.unobserve(e.target); }
}), { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.reveal').forEach((el) => revealer.observe(el));
// The project carousel fades in as one piece.
const work = document.getElementById('work-track');
work.classList.add('reveal');
revealer.observe(work);

// On phones, fold each project's "What I did" list so the cards stay short.
if (matchMedia('(max-width: 700px)').matches) document.querySelectorAll('.did-wrap').forEach((d) => { d.open = false; });

// ---------- mobile menu ----------
const menuBtn = document.querySelector('.menu-btn');
const nav = document.getElementById('site-nav');
const setMenu = (open) => { menuBtn.setAttribute('aria-expanded', open); nav.classList.toggle('open', open); };
menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

// ---------- highlight the nav link for the section in view ----------
const navLinks = [...document.querySelectorAll('.topbar nav a')];
const spy = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) navLinks.forEach((a) => a.classList.toggle('active', a.hash === `#${e.target.id}`));
}), { rootMargin: '-40% 0px -55% 0px' });
document.querySelectorAll('main section[id], footer[id]').forEach((s) => spy.observe(s));

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
