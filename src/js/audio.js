// Shared audio: a small synth, and microphone pitch tracking (YIN).
// Everything else on the page listens for `note` events on `bus`.

export const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const bus = new EventTarget();

let ctx = null;
let master = null;
export let analyser = null;

export function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    master.connect(analyser);
    analyser.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);
export const hzToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const noteName = (m) => NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);

// A soft electric-piano-ish tone: sine + a quiet octave triangle, lowpassed, with a pluck envelope.
export function play(midi, { dur = 0.9, gain = 0.35, source = 'synth', emit = true } = {}) {
  const ac = audio();
  const t = ac.currentTime;
  const f = midiToHz(midi);
  const env = ac.createGain();
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(8000, f * 8), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), t + dur);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  env.gain.exponentialRampToValueAtTime(gain * 0.35, t + 0.25);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  for (const [type, mult, g] of [['sine', 1, 1], ['triangle', 2, 0.18], ['sine', 3, 0.06]]) {
    const o = ac.createOscillator();
    const og = ac.createGain();
    o.type = type;
    o.frequency.value = f * mult;
    og.gain.value = g;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  lp.connect(env).connect(master);
  if (emit) bus.dispatchEvent(new CustomEvent('note', { detail: { midi, source } }));
}

// ---------- microphone ----------

let mic = null;

export async function startMic() {
  const ac = audio();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const src = ac.createMediaStreamSource(stream);
  const an = ac.createAnalyser();
  an.fftSize = 2048;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  mic = { stream, an, buf, raf: 0, stable: { midi: null, since: 0, emitted: null } };

  const tick = () => {
    an.getFloatTimeDomainData(buf);
    const f = yin(buf, ac.sampleRate);
    const detail = f ? { hz: f, midi: hzToMidi(f) } : null;
    bus.dispatchEvent(new CustomEvent('pitch', { detail }));
    trackStable(detail);
    mic.raf = requestAnimationFrame(tick);
  };
  tick();
}

export function stopMic() {
  if (!mic) return;
  cancelAnimationFrame(mic.raf);
  mic.stream.getTracks().forEach((t) => t.stop());
  mic = null;
  bus.dispatchEvent(new CustomEvent('pitch', { detail: null }));
}

export const micOn = () => !!mic;

// Turn a jittery pitch track into discrete note events: a note counts once it is held ~120ms.
function trackStable(detail) {
  const s = mic.stable;
  const now = performance.now();
  const m = detail ? Math.round(detail.midi) : null;
  if (m !== s.midi) { s.midi = m; s.since = now; return; }
  if (m !== null && m !== s.emitted && now - s.since > 120) {
    s.emitted = m;
    bus.dispatchEvent(new CustomEvent('note', { detail: { midi: m, source: 'mic' } }));
  }
  if (m === null && now - s.since > 250) s.emitted = null;
}

// YIN pitch estimator (de Cheveigné & Kawahara, 2002), restricted to the singing range.
function yin(x, sr, threshold = 0.12) {
  let rms = 0;
  for (let i = 0; i < x.length; i++) rms += x[i] * x[i];
  if (Math.sqrt(rms / x.length) < 0.01) return null; // silence

  const minLag = Math.floor(sr / 1100);
  const maxLag = Math.min(Math.floor(sr / 70), (x.length >> 1) - 1);
  const W = x.length >> 1;
  const d = new Float32Array(maxLag + 2);
  for (let tau = 1; tau <= maxLag + 1; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const v = x[i] - x[i + tau]; s += v * v; }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  let run = 0;
  d[0] = 1;
  for (let tau = 1; tau <= maxLag + 1; tau++) { run += d[tau]; d[tau] = d[tau] * tau / (run || 1); }

  let tau = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= maxLag && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  // parabolic interpolation around the minimum
  const a = d[tau - 1], b = d[tau], c = d[tau + 1];
  const shift = (a - c) / (2 * (a - 2 * b + c)) || 0;
  return sr / (tau + shift);
}
