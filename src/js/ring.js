// The chroma ring: twelve pitch classes on a circle, and a field of particles
// that falls into whichever note is sounding. It is a toy version of the
// ring-attractor model in perfect-pitch.
import { NAMES, bus, play } from './audio.js';

const TAU = Math.PI * 2;
const angleOf = (pc) => -Math.PI / 2 + (pc / 12) * TAU; // C at 12 o'clock

export function initRing(canvas) {
  const g = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0, H = 0, cx = 0, cy = 0, R = 0;
  const glow = new Float32Array(12);
  const state = { target: null, strength: 0, sung: null, hover: -1, mouse: { x: -1e4, y: -1e4 } };

  const N = reduce ? 260 : innerWidth < 700 ? 450 : 900;
  const P = Array.from({ length: N }, () => ({
    a: Math.random() * TAU,
    r: 0.55 + Math.random() * 0.9,
    v: (Math.random() - 0.5) * 0.002,
    s: 0.6 + Math.random() * 1.4,
    k: 0.4 + Math.random() * 0.8, // how strongly this particle feels the attractor
  }));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wide = W > 900;
    cx = wide ? W * 0.7 : W * 0.5;
    cy = wide ? H * 0.52 : H * 0.34;
    R = Math.min(wide ? W * 0.24 : W * 0.36, H * (wide ? 0.34 : 0.22));
    g.fillStyle = '#0d0c0b';
    g.fillRect(0, 0, W, H);
  }
  addEventListener('resize', resize);
  resize();

  // ---- inputs ----
  bus.addEventListener('note', (e) => {
    const pc = ((e.detail.midi % 12) + 12) % 12;
    glow[pc] = 1;
    if (e.detail.source !== 'mic') { state.target = angleOf(pc); state.strength = 1; }
  });
  bus.addEventListener('pitch', (e) => {
    state.sung = e.detail;
    if (e.detail) {
      state.target = angleOf(e.detail.midi % 12); // continuous: cents move the target too
      state.strength = Math.max(state.strength, 0.9);
    }
  });

  const nodeAt = (x, y) => {
    for (let i = 0; i < 12; i++) {
      const a = angleOf(i);
      if (Math.hypot(x - (cx + Math.cos(a) * R), y - (cy + Math.sin(a) * R)) < 26) return i;
    }
    return -1;
  };
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    state.mouse.x = e.clientX - r.left; state.mouse.y = e.clientY - r.top;
    state.hover = nodeAt(state.mouse.x, state.mouse.y);
    canvas.style.cursor = state.hover >= 0 ? 'pointer' : 'crosshair';
  });
  canvas.addEventListener('pointerleave', () => { state.mouse.x = -1e4; state.hover = -1; });
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const i = nodeAt(e.clientX - r.left, e.clientY - r.top);
    if (i >= 0) play(60 + i, { source: 'ring' });
  });

  // ---- frame ----
  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(canvas);

  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    g.fillStyle = reduce ? '#0d0c0b' : 'rgba(13,12,11,0.2)';
    g.fillRect(0, 0, W, H);

    state.strength *= state.sung ? 0.995 : 0.985;
    for (let i = 0; i < 12; i++) glow[i] *= 0.965;

    // particles
    const T = state.target, S = state.strength;
    g.globalCompositeOperation = 'lighter';
    for (const p of P) {
      p.a += p.v + 0.0007;
      if (T !== null && S > 0.02) {
        p.a -= Math.sin(p.a - T) * 0.045 * S * p.k; // gradient of a cosine well
        p.r += (1 - p.r) * 0.03 * S;
      } else {
        p.r += (0.55 + p.k * 0.6 - p.r) * 0.004;
      }
      let x = cx + Math.cos(p.a) * p.r * R;
      let y = cy + Math.sin(p.a) * p.r * R;
      const dx = x - state.mouse.x, dy = y - state.mouse.y, dm = dx * dx + dy * dy;
      if (dm < 6400) { const push = (1 - dm / 6400) * 0.02; p.r += (p.r > 1 ? push : -push); }
      const near = T === null ? 0 : Math.max(0, Math.cos(p.a - T)) ** 8 * S;
      g.fillStyle = near > 0.05
        ? `rgba(255,${138 + 60 * (1 - near)},61,${0.25 + 0.6 * near})`
        : `rgba(241,235,227,${0.12 + 0.1 * p.k})`;
      g.fillRect(x, y, p.s, p.s);
    }
    g.globalCompositeOperation = 'source-over';

    // ring + labels
    g.strokeStyle = 'rgba(241,235,227,0.08)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    g.font = '500 13px "JetBrains Mono", monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 12; i++) {
      const a = angleOf(i);
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      const lit = Math.max(glow[i], state.hover === i ? 0.5 : 0);
      if (lit > 0.02) {
        const grad = g.createRadialGradient(x, y, 0, x, y, 46);
        grad.addColorStop(0, `rgba(255,138,61,${0.45 * lit})`);
        grad.addColorStop(1, 'rgba(255,138,61,0)');
        g.fillStyle = grad; g.fillRect(x - 46, y - 46, 92, 92);
      }
      g.fillStyle = '#0d0c0b';
      g.beginPath(); g.arc(x, y, 16, 0, TAU); g.fill();
      g.strokeStyle = lit > 0.02 ? `rgba(255,138,61,${0.4 + 0.6 * lit})` : 'rgba(241,235,227,0.18)';
      g.stroke();
      g.fillStyle = lit > 0.1 ? '#ff8a3d' : NAMES[i].length > 1 ? '#7d7369' : '#b8ada1';
      g.fillText(NAMES[i], x, y + 1);
    }

    // sung pitch: a needle from the centre
    if (state.sung) {
      const a = angleOf(state.sung.midi % 12);
      g.strokeStyle = 'rgba(88,196,184,0.9)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2);
      g.lineTo(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86);
      g.stroke();
    }
  }
  frame();
}

