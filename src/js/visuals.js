// Small live visuals inside the featured project cards.
import { bus, noteName } from './audio.js';

function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  canvas.width = r.width * dpr; canvas.height = r.height * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, W: r.width, H: r.height };
}

function whenVisible(el, cb) {
  let on = false;
  new IntersectionObserver(([e]) => { on = e.isIntersecting; }).observe(el);
  const loop = (t) => { requestAnimationFrame(loop); if (on) cb(t); };
  requestAnimationFrame(loop);
}

// ---------- ScoreGen: every note you play or sing lands on a staff ----------
const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // pitch class -> C D E F G A B
const SHARP = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

export function scoreStaff(canvas) {
  let { g, W, H } = fit(canvas);
  addEventListener('resize', () => ({ g, W, H } = fit(canvas)));
  const notes = [];
  const SPACING = 34;

  bus.addEventListener('note', (e) => {
    let m = Math.round(e.detail.midi);
    while (m < 55) m += 12; // fold into a comfortable treble range
    while (m > 83) m -= 12;
    notes.push({ m, x: null, born: performance.now(), src: e.detail.source });
    if (notes.length > 40) notes.shift();
  });

  whenVisible(canvas, (t) => {
    const gap = Math.min(14, H / 12);
    const bottom = H / 2 + gap * 2; // E4 line
    const left = 70;
    g.clearRect(0, 0, W, H);

    g.strokeStyle = 'rgba(241,235,227,0.28)';
    g.lineWidth = 1;
    for (let i = 0; i < 5; i++) { const y = bottom - i * gap; g.beginPath(); g.moveTo(16, y); g.lineTo(W - 16, y); g.stroke(); }
    g.fillStyle = 'rgba(241,235,227,0.7)';
    g.font = `${gap * 5.6}px "Segoe UI Symbol", "Noto Music", serif`;
    g.textBaseline = 'alphabetic';
    g.fillText('𝄞', 20, bottom + gap * 1.2);

    if (!notes.length) {
      g.fillStyle = 'rgba(184,173,161,0.8)';
      g.font = '12px "JetBrains Mono", monospace';
      g.fillText('sing or tap a key; notes land here', left + 10, bottom + gap * 3.2);
    }

    // newest note sits at the right; older ones glide left
    const right = W - 40;
    notes.forEach((n, i) => {
      const target = right - (notes.length - 1 - i) * SPACING;
      n.x = n.x === null ? target + 20 : n.x + (target - n.x) * 0.18;
      if (n.x < left) return;
      const oct = Math.floor(n.m / 12) - 1;
      const pc = n.m % 12;
      const diat = oct * 7 + LETTER[pc];
      const y = bottom - (diat - 30) * gap / 2;
      const age = (t - n.born) / 600;
      const fresh = Math.max(0, 1 - age);
      // ledger lines
      g.strokeStyle = 'rgba(241,235,227,0.28)';
      for (let d = 28; d >= diat; d -= 2) { const ly = bottom - (d - 30) * gap / 2; g.beginPath(); g.moveTo(n.x - 11, ly); g.lineTo(n.x + 11, ly); g.stroke(); }
      for (let d = 40; d <= diat; d += 2) { const ly = bottom - (d - 30) * gap / 2; g.beginPath(); g.moveTo(n.x - 11, ly); g.lineTo(n.x + 11, ly); g.stroke(); }
      const col = n.src === 'mic' ? '88,196,184' : '255,138,61';
      g.fillStyle = fresh > 0 ? `rgba(${col},1)` : 'rgba(241,235,227,0.85)';
      g.save();
      g.translate(n.x, y); g.rotate(-0.35);
      g.beginPath(); g.ellipse(0, 0, gap * 0.62, gap * 0.44, 0, 0, Math.PI * 2); g.fill();
      g.restore();
      // stem
      g.strokeStyle = g.fillStyle; g.lineWidth = 1.4;
      const up = diat < 34;
      g.beginPath();
      g.moveTo(n.x + (up ? gap * 0.56 : -gap * 0.56), y);
      g.lineTo(n.x + (up ? gap * 0.56 : -gap * 0.56), y + (up ? -gap * 3.3 : gap * 3.3));
      g.stroke();
      if (SHARP[pc]) { g.font = `${gap * 1.5}px serif`; g.textBaseline = 'middle'; g.fillText('♯', n.x - gap * 1.7, y); }
      if (fresh > 0) {
        g.font = '11px "JetBrains Mono", monospace'; g.textBaseline = 'alphabetic';
        g.fillStyle = `rgba(${col},${fresh})`;
        g.fillText(noteName(n.m), n.x - 8, H - 12);
      }
    });
  });
}

// ---------- The Long Road: a painterly low-poly valley with a campfire ----------
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

export function longRoad(canvas) {
  let { g, W, H } = fit(canvas);
  addEventListener('resize', () => ({ g, W, H } = fit(canvas)));
  const R = rng(7);
  const layers = [
    { y: 0.46, amp: 0.10, col: '#5d6f8f', n: 9, par: 4 },
    { y: 0.55, amp: 0.08, col: '#4a5a6e', n: 12, par: 8 },
    { y: 0.64, amp: 0.07, col: '#6b7a5a', n: 14, par: 14 },
    { y: 0.76, amp: 0.05, col: '#4f5e3d', n: 16, par: 22 },
  ].map((l) => ({ ...l, pts: Array.from({ length: l.n + 1 }, () => R()) }));
  const trees = Array.from({ length: 26 }, () => ({ x: R(), y: 0.72 + R() * 0.22, s: 0.6 + R() * 0.8 }));
  let mx = 0, my = 0, tx = 0, ty = 0;
  canvas.parentElement.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    tx = (e.clientX - r.left) / r.width - 0.5; ty = (e.clientY - r.top) / r.height - 0.5;
  });
  canvas.parentElement.addEventListener('pointerleave', () => { tx = ty = 0; });

  whenVisible(canvas, (t) => {
    mx += (tx - mx) * 0.06; my += (ty - my) * 0.06;
    const sky = g.createLinearGradient(0, 0, 0, H * 0.7);
    sky.addColorStop(0, '#2b2f4a'); sky.addColorStop(0.55, '#b86a5a'); sky.addColorStop(1, '#f2b27a');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // sun
    const sx = W * 0.68 - mx * 6, sy = H * 0.4 - my * 4;
    const sun = g.createRadialGradient(sx, sy, 0, sx, sy, W * 0.25);
    sun.addColorStop(0, 'rgba(255,226,170,0.95)'); sun.addColorStop(0.08, 'rgba(255,214,150,0.8)'); sun.addColorStop(1, 'rgba(255,200,140,0)');
    g.fillStyle = sun; g.fillRect(0, 0, W, H);

    layers.forEach((l, li) => {
      const ox = -mx * l.par, oy = -my * l.par * 0.4;
      g.fillStyle = l.col;
      g.beginPath(); g.moveTo(-40 + ox, H);
      l.pts.forEach((p, i) => g.lineTo(-40 + ox + (i / l.n) * (W + 80), H * (l.y - p * l.amp) + oy));
      g.lineTo(W + 40 + ox, H); g.closePath(); g.fill();
      // facet shading: every other triangle a touch lighter, for the low-poly look
      g.fillStyle = 'rgba(255,220,180,0.06)';
      for (let i = 0; i < l.n; i += 2) {
        const x0 = -40 + ox + (i / l.n) * (W + 80), x1 = -40 + ox + ((i + 1) / l.n) * (W + 80);
        g.beginPath();
        g.moveTo(x0, H * (l.y - l.pts[i] * l.amp) + oy);
        g.lineTo(x1, H * (l.y - l.pts[i + 1] * l.amp) + oy);
        g.lineTo(x0 + (x1 - x0) * 0.3, H * (l.y + 0.08) + oy);
        g.fill();
      }
      if (li === 2) { // the road, winding to the horizon
        g.fillStyle = '#c9a77a';
        g.beginPath();
        const steps = 30;
        const road = (s, side) => {
          const k = s / steps;
          const y = H * (0.6 + 0.4 * k * k) + oy * (0.5 + k);
          const x = W * (0.55 + 0.12 * Math.sin(k * 5.2)) - mx * (10 + k * 20) + side * (2 + k * k * W * 0.16);
          return [x, y];
        };
        for (let s = 0; s <= steps; s++) g.lineTo(...road(s, -1));
        for (let s = steps; s >= 0; s--) g.lineTo(...road(s, 1));
        g.closePath(); g.fill();
      }
    });

    trees.forEach((tr) => {
      const x = tr.x * W - mx * 26 * tr.s, y = tr.y * H - my * 8, s = tr.s * H * 0.06;
      g.fillStyle = '#2e3a26';
      g.beginPath(); g.moveTo(x, y - s * 1.8); g.lineTo(x - s * 0.5, y); g.lineTo(x + s * 0.5, y); g.fill();
    });

    // campfire
    const fx = W * 0.3 - mx * 24, fy = H * 0.86 - my * 8;
    const flick = 0.8 + 0.2 * Math.sin(t / 90) * Math.sin(t / 37);
    const glow = g.createRadialGradient(fx, fy, 0, fx, fy, H * 0.22 * flick);
    glow.addColorStop(0, 'rgba(255,170,80,0.55)'); glow.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = glow; g.fillRect(fx - H * 0.3, fy - H * 0.3, H * 0.6, H * 0.6);
    g.fillStyle = '#ffcf7a';
    g.beginPath(); g.moveTo(fx, fy - H * 0.05 * flick); g.lineTo(fx - H * 0.018, fy); g.lineTo(fx + H * 0.018, fy); g.fill();
    // the party: four little silhouettes around the fire
    g.fillStyle = '#1f1c1a';
    [-0.07, -0.035, 0.04, 0.075].forEach((d, i) => {
      const px = fx + d * W * 0.6, py = fy + (i % 2 ? 2 : -1), h = H * 0.045;
      g.fillRect(px - 3, py - h, 6, h);
      g.beginPath(); g.arc(px, py - h - 3, 3.5, 0, Math.PI * 2); g.fill();
    });
  });
}
