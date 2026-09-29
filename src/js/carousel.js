// Horizontal carousels: native scroll-snap for touch, plus arrow buttons,
// arrow keys, mouse drag, a progress bar, and (for projects) dimming the
// slides that aren't in focus.

export function initCarousel(track) {
  const section = track.closest('section');
  const [prev, next] = section.querySelectorAll('.nav-btn');
  const bar = section.querySelector('.progress span');
  const count = section.querySelector('.count');
  const slides = [...track.children];
  const smooth = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  // Scroll to the neighbouring slide in the given direction.
  const go = (dir) => {
    const x = track.scrollLeft;
    const starts = slides.map((s) => s.offsetLeft - track.offsetLeft);
    const target = dir > 0
      ? starts.find((s) => s > x + 4) ?? track.scrollWidth
      : [...starts].reverse().find((s) => s < x - 4) ?? 0;
    track.scrollTo({ left: target, behavior: smooth });
  };
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });

  const update = () => {
    const max = track.scrollWidth - track.clientWidth;
    const p = max > 0 ? track.scrollLeft / max : 1;
    if (bar) bar.style.width = `${Math.max(p, track.clientWidth / track.scrollWidth) * 100}%`;
    if (count) {
      const starts = slides.map((sl) => sl.offsetLeft - track.offsetLeft);
      const i = track.scrollLeft >= max - 2 ? slides.length - 1
        : starts.reduce((best, st, j) => (Math.abs(st - track.scrollLeft) < Math.abs(starts[best] - track.scrollLeft) ? j : best), 0);
      count.textContent = `${i + 1} / ${slides.length}`;
    }
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= max - 2;
  };
  track.addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();

  // The slide that is mostly in view gets `.current`; CSS dims the others.
  if (track.classList.contains('projects-track')) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      e.target.classList.toggle('current', e.intersectionRatio > 0.6);
    }), { root: track, threshold: [0, 0.6, 1] });
    slides.forEach((s) => io.observe(s));
    requestAnimationFrame(() => track.classList.add('ready'));
    slides.forEach((s) => s.addEventListener('click', () => {
      if (!s.classList.contains('current')) s.scrollIntoView({ behavior: smooth, block: 'nearest', inline: 'start' });
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
    if (scrolled !== 0) go(Math.sign(scrolled)); // finish the move to the next slide that way
  });
}
