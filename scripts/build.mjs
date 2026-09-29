// Builds the site into dist/.
//   node scripts/build.mjs            (uses GITHUB_TOKEN if set; works offline too)
//
// Log entries come from three places:
//   1. content/posts/*.md             notes written in the repo
//   2. open issues labelled `log`     written from anywhere, even a phone; only the owner's count
//   3. public GitHub activity         releases, new repos, and pushes to your repos

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { md, esc, frontmatter, excerpt } from './md.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const CONTENT = path.join(ROOT, 'content');

const OWNER = process.env.SITE_OWNER || 'JaakLipp';
const REPO = process.env.GITHUB_REPOSITORY || `${OWNER}/${OWNER}.github.io`;
const SITE_URL = process.env.SITE_URL || `https://${OWNER.toLowerCase()}.github.io`;
const TOKEN = process.env.GITHUB_TOKEN || '';
const IGNORE_REPOS = new Set([REPO, `${OWNER}/${OWNER}`]); // the site itself and the profile README

const fmtDate = (d) => new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- GitHub ----------
async function gh(pathname) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `${OWNER}-site-build`,
      ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${pathname}`);
  return res.json();
}

async function issueNotes() {
  try {
    const issues = await gh(`/repos/${REPO}/issues?labels=log&state=open&per_page=50`);
    return issues
      .filter((i) => !i.pull_request && i.user?.login === OWNER)
      .map((i) => ({
        kind: 'note',
        date: i.created_at,
        title: i.title,
        summary: excerpt(i.body || ''),
        slug: `${i.created_at.slice(0, 10)}-${slugify(i.title)}`,
        html: md(i.body || ''),
      }));
  } catch (e) {
    console.warn(`  ! issues skipped (${e.message})`);
    return [];
  }
}

async function activity() {
  try {
    const events = await gh(`/users/${OWNER}/events/public?per_page=100`);
    const out = [];
    const pushes = new Map(); // repo+day -> entry, so a day of commits is one line
    for (const ev of events) {
      const repo = ev.repo.name;
      if (IGNORE_REPOS.has(repo)) continue;
      const short = repo.split('/')[1];
      const url = `https://github.com/${repo}`;
      if (ev.type === 'ReleaseEvent' && ev.payload.action === 'published') {
        const r = ev.payload.release;
        out.push({ kind: 'release', date: ev.created_at, title: `${short} ${r.tag_name}${r.name && r.name !== r.tag_name ? ` · ${r.name}` : ''}`, summary: excerpt(r.body || ''), href: r.html_url });
      } else if (ev.type === 'CreateEvent' && ev.payload.ref_type === 'repository') {
        out.push({ kind: 'new repo', date: ev.created_at, title: `Started ${short}`, summary: ev.payload.description || '', href: url });
      } else if (ev.type === 'PushEvent') {
        const key = repo + ev.created_at.slice(0, 10);
        const n = ev.payload.size ?? ev.payload.commits?.length ?? 1;
        const msg = ev.payload.commits?.at(-1)?.message?.split('\n')[0];
        const e = pushes.get(key);
        if (e) { e.count += n; continue; }
        const entry = { kind: 'code', date: ev.created_at, repo: short, count: n, summary: msg || '', href: url };
        pushes.set(key, entry);
        out.push(entry);
      }
    }
    for (const e of out) if (e.kind === 'code') e.title = `${e.count} commit${e.count === 1 ? '' : 's'} to ${e.repo}`;
    return out;
  } catch (e) {
    console.warn(`  ! activity skipped (${e.message})`);
    return [];
  }
}

function fileNotes() {
  const dir = path.join(CONTENT, 'posts');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const { data, body } = frontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    const slug = f.replace(/\.md$/, '');
    return {
      kind: 'note',
      date: new Date(data.date || slug.slice(0, 10)).toISOString(),
      title: data.title || slug,
      summary: data.summary || excerpt(body),
      slug,
      html: md(body),
      draft: data.draft === 'true',
    };
  }).filter((p) => !p.draft);
}

// ---------- templates ----------
// The one hands-on demo on the page: sing (or tap a key) and the note lands on a staff.
const WHITE = [['C', 60], ['D', 62], ['E', 64], ['F', 65], ['G', 67], ['A', 69], ['B', 71], ['C', 72]];
const scoregenDemo = `<div class="visual demo">
  <canvas data-visual="scoregen" aria-label="Staff showing the notes you sing or play"></canvas>
  <div class="demo-bar">
    <button class="btn primary" id="mic-btn" aria-pressed="false"><span class="dot" aria-hidden="true"></span><span class="label">Sing a note</span></button>
    <div class="mini-keys" role="group" aria-label="Play a note">${WHITE.map(([n, m]) => `<button data-midi="${m}">${n}</button>`).join('')}</div>
    <output class="readout" id="readout" aria-live="polite"><span id="readout-note">–</span> <span id="readout-cents"></span></output>
  </div>
</div>`;

const featuredHTML = (p) => {
  const visual = p.id === 'scoregen' ? scoregenDemo : p.play
    ? `<div class="visual"><canvas data-visual="${p.id}"></canvas><button class="btn primary play-btn" data-play="${esc(p.play)}" data-title="${esc(p.title)}">▶ Play in browser</button></div>`
    : p.id === 'perfect-pitch'
      ? `<div class="visual"><img src="assets/projects/perfect-pitch-identification.png" alt="Identification curves: the recurrent model switches label abruptly at 50 cents, the control model gradually" style="filter: invert(.92) hue-rotate(180deg); object-fit: contain; padding: 10px"><div class="overlay"><span>results/h3_seed0 · identification curves</span></div></div>`
      : `<div class="visual"><canvas data-visual="${p.id}"></canvas><div class="overlay"><span>procedural · move your mouse</span>${p.status ? `<span>${esc(p.status)}</span>` : ''}</div></div>`;
  const links = [
    ...p.links.map((l) => `<a class="btn" href="${esc(l.href)}">${esc(l.label)} ↗</a>`),
  ].filter(Boolean).join('');
  return `<article class="project card" id="p-${p.id}">
  <div>
    <div class="meta"><span>${esc(p.year)}</span><span>${esc(p.role)}</span>${p.status ? `<span class="status">${esc(p.status)}</span>` : ''}</div>
    <h3>${esc(p.title)}</h3>
    <p class="tagline">${esc(p.tagline)}</p>
    <p class="summary">${esc(p.summary)}</p>
    <ul class="chips">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    <div class="links">${links}</div>
  </div>
  ${visual}
</article>`;
};

const archiveHTML = (h) => `<a class="hack" href="${esc(h.href)}">
  <img src="assets/projects/${esc(h.img)}" alt="${esc(h.event)} ${h.year}" loading="lazy" width="800" height="600">
  <div class="body">
    <div class="when"><span>${esc(h.event)} · ${h.year}</span>${h.award ? `<span class="award">★ ${esc(h.award)}</span>` : ''}</div>
    <h3>${esc(h.title)}</h3>
    <p>${esc(h.blurb)}</p>
  </div>
</a>`;

const logHTML = (e) => {
  const href = e.slug ? `log/${e.slug}.html` : e.href;
  return `<li>
  <time datetime="${e.date}">${fmtDate(e.date)}</time>
  <span class="kind" data-kind="${e.kind}">${e.kind}</span>
  <div class="entry"><a href="${esc(href)}">${esc(e.title)}</a>${e.summary ? `<p>${esc(e.summary)}</p>` : ''}</div>
</li>`;
};

const postPage = (p) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(p.title)} · Jackson Lippert</title>
  <meta name="description" content="${esc(p.summary)}">
  <meta property="og:title" content="${esc(p.title)}">
  <meta property="og:description" content="${esc(p.summary)}">
  <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
  <link rel="alternate" type="application/rss+xml" href="../feed.xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../styles.css">
</head>
<body>
  <article class="post">
    <a class="back" href="../#log">← Jackson Lippert / log</a>
    <h1>${esc(p.title)}</h1>
    <time datetime="${p.date}">${fmtDate(p.date)}</time>
    <div class="prose">${p.html}</div>
  </article>
</body>
</html>`;

const rss = (entries) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Jackson Lippert — Log</title>
<link>${SITE_URL}/</link>
<description>Notes, releases and shipped work.</description>
${entries.map((e) => {
  const link = e.slug ? `${SITE_URL}/log/${e.slug}.html` : e.href;
  return `<item><title>${esc(e.title)}</title><link>${esc(link)}</link><guid>${esc(link + '#' + e.date)}</guid><pubDate>${new Date(e.date).toUTCString()}</pubDate><description>${esc(e.summary || '')}</description></item>`;
}).join('\n')}
</channel></rss>`;

// ---------- build ----------
console.log(`Building ${REPO} → dist/`);
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(SRC, DIST, { recursive: true });

const projects = JSON.parse(fs.readFileSync(path.join(CONTENT, 'projects.json'), 'utf8'));
const [issues, events] = await Promise.all([issueNotes(), activity()]);
const notes = [...fileNotes(), ...issues];
const log = [...notes, ...events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 24);
console.log(`  ${notes.length} notes (${issues.length} from issues), ${events.length} activity items`);

const builtAt = new Date();
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
html = html
  .replace('<!--FEATURED-->', projects.featured.map(featuredHTML).join('\n'))
  .replace('<!--ARCHIVE-->', projects.archive.map(archiveHTML).join('\n'))
  .replace('<!--LOG-->', log.length ? log.map(logHTML).join('\n') : '<li><span></span><span></span><div class="entry"><p>Nothing here yet.</p></div></li>')
  .replace('<time id="built-at"><!--BUILT_AT--></time>', `<time id="built-at" datetime="${builtAt.toISOString()}">${fmtDate(builtAt)}</time>`);
fs.writeFileSync(path.join(DIST, 'index.html'), html);

fs.mkdirSync(path.join(DIST, 'log'), { recursive: true });
for (const n of notes) fs.writeFileSync(path.join(DIST, 'log', `${n.slug}.html`), postPage(n));
fs.writeFileSync(path.join(DIST, 'feed.xml'), rss(log));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
fs.writeFileSync(path.join(DIST, '404.html'), postPage({ title: 'Lost the thread', date: builtAt.toISOString(), summary: '', html: '<p>That page doesn’t exist. Maybe it was a C♯ and you heard a D. <a href="/">Back home</a>.</p>' }).replaceAll('../', '/'));
console.log('Done.');
