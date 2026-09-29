import { bus, play, startMic, stopMic, micOn, noteName } from './audio.js';
import { scoreStaff, longRoad } from './visuals.js';

document.querySelectorAll('[data-visual="scoregen"]').forEach(scoreStaff);
document.querySelectorAll('[data-visual="the-long-road"]').forEach(longRoad);

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
const micLabel = micBtn.querySelector('.label');
async function toggleMic() {
  if (micOn()) {
    stopMic();
    micBtn.setAttribute('aria-pressed', 'false');
    micLabel.textContent = 'Sing a note';
    return;
  }
  try {
    micLabel.textContent = 'Allow the mic…';
    await startMic();
    micBtn.setAttribute('aria-pressed', 'true');
    micLabel.textContent = 'Listening (tap to stop)';
  } catch {
    micLabel.textContent = 'No mic, try the keys';
  }
}
micBtn.addEventListener('click', toggleMic);

// ---------- click-to-load playable builds ----------
document.querySelectorAll('[data-play]').forEach((btn) => btn.addEventListener('click', () => {
  const frame = document.createElement('iframe');
  frame.src = btn.dataset.play;
  frame.title = btn.dataset.title || 'Playable build';
  frame.allow = 'autoplay; fullscreen; gamepad';
  btn.closest('.visual').replaceChildren(frame);
}));

// ---------- scroll reveal + active nav ----------
const io = new IntersectionObserver((entries) => entries.forEach((en) => {
  if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
}), { rootMargin: '0px 0px -10% 0px' });
document.querySelectorAll('.section-head, .project, .hack, .log li').forEach((el) => {
  el.classList.add('reveal'); io.observe(el);
});
const navLinks = [...document.querySelectorAll('.topbar nav a')];
const sectionObserver = new IntersectionObserver((entries) => entries.forEach((en) => {
  if (en.isIntersecting) navLinks.forEach((a) => a.classList.toggle('active', a.hash === '#' + en.target.id));
}), { rootMargin: '-45% 0px -50% 0px' });
document.querySelectorAll('main > section').forEach((s) => sectionObserver.observe(s));

// ---------- command palette ----------
const palette = document.getElementById('palette');
const input = document.getElementById('palette-input');
const list = document.getElementById('palette-list');
const go = (hash) => () => document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' });
const open = (url) => () => window.open(url, '_blank', 'noopener');
const COMMANDS = [
  { label: 'Try the ScoreGen demo', hint: 'demo', run: () => { go('#p-scoregen')(); micBtn.focus({ preventScroll: true }); } },
  { label: 'Selected work', hint: 'section', run: go('#work') },
  { label: 'Hackathon archive', hint: 'section', run: go('#archive') },
  { label: 'Log', hint: 'section', run: go('#log') },
  { label: 'Contact', hint: 'section', run: go('#contact') },
  ...[...document.querySelectorAll('.project')].map((p) => ({ label: p.querySelector('h3').textContent, hint: 'project', run: go('#' + p.id) })),
  { label: 'GitHub', hint: 'link', run: open('https://github.com/JaakLipp') },
  { label: 'LinkedIn', hint: 'link', run: open('https://www.linkedin.com/in/jacksonlippert/') },
  { label: 'Email', hint: 'link', run: () => { location.href = 'mailto:lippert.22j@gmail.com'; } },
  { label: 'RSS feed', hint: 'link', run: open('feed.xml') },
];
let shown = [], sel = 0;
function render() {
  const q = input.value.trim().toLowerCase();
  shown = COMMANDS.filter((c) => !q || (c.label + ' ' + c.hint).toLowerCase().includes(q));
  sel = Math.min(sel, Math.max(0, shown.length - 1));
  list.replaceChildren(...shown.map((c, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', i === sel);
    li.innerHTML = `<span></span><small>${c.hint}</small>`;
    li.firstChild.textContent = c.label;
    li.addEventListener('click', () => runCmd(i));
    li.addEventListener('mousemove', () => { if (sel !== i) { sel = i; render(); } });
    return li;
  }));
}
function runCmd(i) { const c = shown[i]; palette.close(); c?.run(); }
function openPalette() { input.value = ''; sel = 0; render(); palette.showModal(); input.focus(); }
document.getElementById('open-palette').addEventListener('click', openPalette);
addEventListener('keydown', (e) => {
  if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !e.target.closest?.('input, textarea'))) {
    e.preventDefault();
    palette.open ? palette.close() : openPalette();
  }
});
input.addEventListener('input', () => { sel = 0; render(); });
input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { sel = (sel + 1) % shown.length; render(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { sel = (sel - 1 + shown.length) % shown.length; render(); e.preventDefault(); }
  if (e.key === 'Enter') runCmd(sel);
});
palette.addEventListener('click', (e) => { if (e.target === palette) palette.close(); });

// a small hello for anyone who opens devtools
console.log('%cHey! You found the console.', 'font: 20px serif; color: #ff8a3d',
  '\nThis site is plain JS, no framework. Source: https://github.com/JaakLipp/JaakLipp.github.io');
