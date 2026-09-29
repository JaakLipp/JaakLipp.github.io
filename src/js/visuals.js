// The ScoreGen demo's staff: every note you play or sing lands on it.
import { bus, noteName } from './audio.js';

const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // pitch class -> C D E F G A B
const SHARP = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
const SPACING = 34;

function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  canvas.width = r.width * dpr; canvas.height = r.height * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, W: r.width, H: r.height };
}

// Canvas can't read CSS variables directly, so pull the theme colours when it changes.
function themeColors() {
  const css = getComputedStyle(document.documentElement);
  return { ink: css.getPropertyValue('--ink').trim(), ink3: css.getPropertyValue('--ink-3').trim(), accent: css.getPropertyValue('--accent').trim() };
}

export function scoreStaff(canvas) {
  let { g, W, H } = fit(canvas);
  let c = themeColors();
  addEventListener('resize', () => ({ g, W, H } = fit(canvas)));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { c = themeColors(); });

  const notes = [];
  bus.addEventListener('note', (e) => {
    let m = Math.round(e.detail.midi);
    while (m < 55) m += 12; // fold into a comfortable treble range
    while (m > 83) m -= 12;
    notes.push({ m, x: null, born: performance.now() });
    if (notes.length > 40) notes.shift();
  });

  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  const draw = (t) => {
    requestAnimationFrame(draw);
    if (!visible) return;
    const gap = Math.min(12, H / 12);
    const bottom = H / 2 + gap * 2; // the E4 line
    const left = 64;
    g.clearRect(0, 0, W, H);

    g.strokeStyle = c.ink3; g.globalAlpha = 0.6; g.lineWidth = 1;
    for (let i = 0; i < 5; i++) { const y = bottom - i * gap; g.beginPath(); g.moveTo(12, y); g.lineTo(W - 12, y); g.stroke(); }
    g.globalAlpha = 1;
    g.fillStyle = c.ink;
    g.font = `${gap * 5.6}px "Segoe UI Symbol", "Noto Music", serif`;
    g.textBaseline = 'alphabetic';
    g.fillText('𝄞', 16, bottom + gap * 1.2);

    if (!notes.length) {
      g.fillStyle = c.ink3;
      g.font = '13px "IBM Plex Sans", system-ui, sans-serif';
      g.fillText('Notes you sing or play show up here.', left + 8, bottom + gap * 3.4);
    }

    // The newest note sits at the right and older ones slide left.
    const right = W - 36;
    notes.forEach((n, i) => {
      const target = right - (notes.length - 1 - i) * SPACING;
      n.x = n.x === null ? target + 20 : n.x + (target - n.x) * 0.18;
      if (n.x < left) return;
      const pc = n.m % 12;
      const diat = (Math.floor(n.m / 12) - 1) * 7 + LETTER[pc];
      const y = bottom - (diat - 30) * gap / 2;
      const fresh = Math.max(0, 1 - (t - n.born) / 700);

      g.strokeStyle = c.ink3; g.globalAlpha = 0.6;
      for (let d = 28; d >= diat; d -= 2) { const ly = bottom - (d - 30) * gap / 2; g.beginPath(); g.moveTo(n.x - 10, ly); g.lineTo(n.x + 10, ly); g.stroke(); }
      for (let d = 40; d <= diat; d += 2) { const ly = bottom - (d - 30) * gap / 2; g.beginPath(); g.moveTo(n.x - 10, ly); g.lineTo(n.x + 10, ly); g.stroke(); }
      g.globalAlpha = 1;

      const col = fresh > 0 ? c.accent : c.ink;
      g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 1.4;
      g.save(); g.translate(n.x, y); g.rotate(-0.35);
      g.beginPath(); g.ellipse(0, 0, gap * 0.62, gap * 0.44, 0, 0, Math.PI * 2); g.fill();
      g.restore();
      const up = diat < 34, sx = n.x + (up ? gap * 0.56 : -gap * 0.56);
      g.beginPath(); g.moveTo(sx, y); g.lineTo(sx, y + (up ? -gap * 3.3 : gap * 3.3)); g.stroke();
      if (SHARP[pc]) { g.font = `${gap * 1.5}px serif`; g.textBaseline = 'middle'; g.fillText('♯', n.x - gap * 1.7, y); }
      if (fresh > 0) {
        g.globalAlpha = fresh;
        g.font = '11px "IBM Plex Mono", monospace'; g.textBaseline = 'alphabetic';
        g.fillText(noteName(n.m), n.x - 8, H - 10);
        g.globalAlpha = 1;
      }
    });
  };
  requestAnimationFrame(draw);
}
