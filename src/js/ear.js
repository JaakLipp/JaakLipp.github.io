// "Test your ear": a name-that-note game and an interactive categorical-perception curve.
import { NAMES, play } from './audio.js';

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

export function initGame() {
  const keys = document.getElementById('guess-keys');
  const playBtn = document.getElementById('play-mystery');
  const replay = document.getElementById('replay-mystery');
  const verdict = document.getElementById('verdict');
  const streakEl = document.getElementById('streak');
  const bestEl = document.getElementById('best');
  let mystery = null, streak = 0, best = store.get('jl.best', 0);
  bestEl.textContent = best;

  const buttons = NAMES.map((n, i) => {
    const b = document.createElement('button');
    b.textContent = n;
    b.className = n.length > 1 ? 'black' : '';
    b.setAttribute('aria-label', n.replace('♯', ' sharp'));
    b.addEventListener('click', () => guess(i));
    keys.append(b);
    return b;
  });

  playBtn.addEventListener('click', () => {
    buttons.forEach((b) => { b.classList.remove('right', 'wrong'); b.disabled = false; });
    const octave = 3 + Math.floor(Math.random() * 3); // C3..B5 so you can't cheat on register
    mystery = 12 * (octave + 1) + Math.floor(Math.random() * 12);
    play(mystery, { dur: 1.4, source: 'game', emit: false });
    replay.disabled = false;
    verdict.textContent = 'Which note was that?';
    playBtn.textContent = '▶ Next note';
  });
  replay.addEventListener('click', () => mystery !== null && play(mystery, { dur: 1.4, emit: false }));

  function guess(pc) {
    if (mystery === null) { play(60 + pc, { source: 'game' }); return; } // free play before a round
    const answer = mystery % 12;
    const ok = pc === answer;
    buttons[answer].classList.add('right');
    if (!ok) buttons[pc].classList.add('wrong');
    buttons.forEach((b) => (b.disabled = true));
    streak = ok ? streak + 1 : 0;
    if (streak > best) { best = streak; store.set('jl.best', best); }
    streakEl.textContent = streak;
    bestEl.textContent = best;
    verdict.textContent = ok ? `Yes, ${NAMES[answer]}.` : `It was ${NAMES[answer]}. You said ${NAMES[pc]}.`;
    play(mystery, { dur: 1, source: 'game' });
    mystery = null;
  }
}

// ---------- categorical perception ----------
// Softmax over neighbouring note labels with logit -beta*(cents - 100k)^2 / 100.
// The logit difference between neighbours is 2*beta*(cents - midpoint), so beta sets the
// boundary slope. The two betas are chosen so the curves have the same shape as the
// attractor and control identification curves in perfect-pitch (h3, seed 0).
const MODELS = { attractor: 0.28, control: 0.055 };
const LABELS = [
  { k: -1, name: 'B', color: '#7d7369' },
  { k: 0, name: 'C', color: '#ff8a3d' },
  { k: 1, name: 'C♯', color: '#58c4b8' },
  { k: 2, name: 'D', color: '#b8ada1' },
];
const probs = (c, beta) => {
  const l = LABELS.map(({ k }) => -beta * (c - 100 * k) ** 2 / 100);
  const m = Math.max(...l);
  const e = l.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
};

export function initCurve() {
  const svg = document.getElementById('cp-plot');
  const slider = document.getElementById('cents');
  const out = document.getElementById('cents-val');
  const NS = 'http://www.w3.org/2000/svg';
  const box = { x: 36, y: 12, w: 470, h: 180 };
  const X = (c) => box.x + ((c + 50) / 200) * box.w;
  const Y = (p) => box.y + (1 - p) * box.h;
  let model = 'attractor';

  const el = (tag, attrs, parent = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent.append(n);
    return n;
  };

  // axes
  for (const p of [0, 0.5, 1]) {
    el('line', { x1: box.x, x2: box.x + box.w, y1: Y(p), y2: Y(p), stroke: '#2c2723' });
    el('text', { x: box.x - 8, y: Y(p) + 4, 'text-anchor': 'end' }).textContent = p;
  }
  for (const c of [-50, 0, 50, 100, 150]) {
    el('text', { x: X(c), y: box.y + box.h + 20, 'text-anchor': 'middle' }).textContent = `${c > 0 ? '+' : ''}${c}¢`;
  }
  const paths = LABELS.map((L) => el('path', { fill: 'none', stroke: L.color, 'stroke-width': 2.2 }));
  const tags = LABELS.map((L) => { const t = el('text', { fill: L.color }); t.textContent = L.name; t.style.fill = L.color; return t; });
  const marker = el('line', { y1: box.y, y2: box.y + box.h, stroke: '#f1ebe3', 'stroke-dasharray': '3 4', opacity: 0.6 });
  const dots = LABELS.map((L) => el('circle', { r: 4.5, fill: L.color, stroke: '#1a1715', 'stroke-width': 2 }));
  const call = el('text', { y: box.y + 4 });
  call.style.fill = '#f1ebe3';

  function drawCurves() {
    const beta = MODELS[model];
    const pts = LABELS.map(() => []);
    for (let c = -50; c <= 150; c += 1) probs(c, beta).forEach((p, i) => pts[i].push(`${X(c).toFixed(1)},${Y(p).toFixed(1)}`));
    paths.forEach((p, i) => {
      p.setAttribute('d', 'M' + pts[i].join('L'));
      p.style.transition = 'd .5s';
    });
    const labelAt = [-50, 0, 100, 150];
    tags.forEach((t, i) => {
      const c = Math.min(140, Math.max(-44, labelAt[i]));
      t.setAttribute('x', X(c)); t.setAttribute('y', Y(1) - 4);
      t.setAttribute('text-anchor', 'middle');
      t.style.opacity = probs(c, beta)[i] > 0.5 ? 1 : 0;
    });
  }

  function update(sound) {
    const c = +slider.value;
    const beta = MODELS[model];
    const p = probs(c, beta);
    out.textContent = `${c >= 0 ? '+' : ''}${c}¢`;
    marker.setAttribute('x1', X(c)); marker.setAttribute('x2', X(c));
    dots.forEach((d, i) => { d.setAttribute('cx', X(c)); d.setAttribute('cy', Y(p[i])); d.style.opacity = p[i] > 0.01 ? 1 : 0; });
    const top = p.indexOf(Math.max(...p));
    const right = X(c) > box.x + box.w * 0.6;
    call.setAttribute('x', X(c) + (right ? -10 : 10));
    call.setAttribute('text-anchor', right ? 'end' : 'start');
    call.setAttribute('y', box.y + box.h - 10);
    call.textContent = `model hears ${LABELS[top].name} (${Math.round(p[top] * 100)}%)`;
    if (sound) play(60 + c / 100, { dur: 0.5, gain: 0.25, emit: false });
  }

  let last = 0;
  slider.addEventListener('input', () => {
    const now = performance.now();
    update(now - last > 110);
    if (now - last > 110) last = now;
  });
  document.querySelectorAll('.toggle [data-model]').forEach((b) => b.addEventListener('click', () => {
    model = b.dataset.model;
    document.querySelectorAll('.toggle [data-model]').forEach((x) => x.setAttribute('aria-checked', x === b));
    drawCurves(); update(false);
  }));
  drawCurves();
  update(false);
}
