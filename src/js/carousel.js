// Horizontal carousels: native scroll-snap for touch, plus side arrows, arrow
// keys, mouse drag, an eased glide between slides, and a row of position bars
// underneath that shows which slides are in view (click one to jump there).

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2); // easeInOutCubic

export function initCarousel(track) {
  const section = track.closest('section');
  const prev = section.querySelector('.nav-btn.prev');
  const next = section.querySelector('.nav-btn.next');
  const pager = section.querySelector('.pager');
  const slides = [...track.children];
  const isProjects = track.classList.contains('projects-track');

  const starts = () => slides.map((s) => s.offsetLeft - track.offsetLeft);
  const max = () => track.scrollWidth - track.clientWidth;

  // Glide to an x position. Snapping is paused while we animate, or the
  // browser would fight every frame.
  let anim = 0;
  const glideTo = (x) => {
    const to = Math.max(0, Math.min(max(), x));
    cancelAnimationFrame(anim);
    if (reduceMotion) { track.scrollLeft = to; return; }
    const from = track.scrollLeft;
    const dur = Math.min(900, 420 + Math.abs(to - from) * 0.35);
    const t0 = performance.now();
    track.classList.add('gliding');
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      track.scrollLeft = from + (to - from) * ease(t);
      if (t < 1) anim = requestAnimationFrame(step);
      else track.classList.remove('gliding');
    };
    anim = requestAnimationFrame(step);
  };

  const go = (dir) => {
    const x = track.scrollLeft;
    const s = starts();
    const target = dir > 0
      ? s.find((v) => v > x + 4) ?? max()
      : [...s].reverse().find((v) => v < x - 4) ?? 0;
    glideTo(target);
  };
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });

  // Position bars: one per slide.
  const bars = slides.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `${i + 1}: ${s.querySelector('h3')?.textContent ?? `item ${i + 1}`}`);
    b.addEventListener('click', () => glideTo(starts()[i]));
    pager.append(b);
    return b;
  });

  // A slide counts as "in view" when most of it is visible. For projects,
  // only the first such slide is current; the others dim.
  const visible = new Set();
  const refresh = () => {
    const inView = slides.filter((s) => visible.has(s));
    const current = isProjects ? (track.scrollLeft >= max() - 2 ? inView.at(-1) : inView[0]) : null;
    slides.forEach((s, i) => {
      const on = isProjects ? s === current : visible.has(s);
      bars[i].classList.toggle('on', on);
      bars[i].setAttribute('aria-current', on ? 'true' : 'false');
      if (isProjects) s.classList.toggle('current', on);
    });
    prev.classList.toggle('hide', track.scrollLeft <= 2);
    next.classList.toggle('hide', track.scrollLeft >= max() - 2);
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.intersectionRatio > 0.6 ? visible.add(e.target) : visible.delete(e.target)));
    refresh();
  }, { root: track, threshold: [0, 0.6, 1] });
  slides.forEach((s) => io.observe(s));
  track.addEventListener('scroll', refresh, { passive: true });
  addEventListener('resize', refresh);
  if (isProjects) {
    requestAnimationFrame(() => track.classList.add('ready'));
    slides.forEach((s, i) => s.addEventListener('click', () => {
      if (!s.classList.contains('current')) glideTo(starts()[i]);
    }));
  }

  // Drag with a mouse (touch and trackpads already scroll natively).
  let drag = null;
  let swallowClickUntil = 0;
  track.addEventListener('click', (e) => {
    if (performance.now() < swallowClickUntil) { e.stopPropagation(); e.preventDefault(); }
  }, { capture: true });
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('button, a, canvas, input')) return;
    cancelAnimationFrame(anim);
    drag = { x: e.clientX, left: track.scrollLeft, moved: false };
  });
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 5) { drag.moved = true; track.classList.add('dragging'); }
    if (drag.moved) track.scrollLeft = drag.left - dx;
  });
  addEventListener('pointerup', () => {
    if (!drag) return;
    const { moved } = drag;
    const scrolled = track.scrollLeft - drag.left; // > 0 means dragged towards later slides
    drag = null;
    track.classList.remove('dragging');
    if (!moved) return;
    swallowClickUntil = performance.now() + 80;
    // Finish the move to the next slide in the drag direction.
    const s = starts();
    const x = track.scrollLeft;
    glideTo(scrolled > 0 ? s.find((v) => v > x) ?? max() : [...s].reverse().find((v) => v < x) ?? 0);
  });
}
