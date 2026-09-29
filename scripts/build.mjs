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
const scoregenDemo = `<figure class="figure">
  <div class="demo">
    <canvas data-visual="scoregen" aria-label="Music staff showing the notes you sing or play"></canvas>
    <div class="demo-bar">
      <button class="button" id="mic-btn" type="button" aria-pressed="false">Sing a note</button>
      <div class="mini-keys" role="group" aria-label="Play a note">${WHITE.map(([n, m]) => `<button type="button" data-midi="${m}">${n}</button>`).join('')}</div>
      <output class="readout" aria-live="polite"><span id="readout-note">–</span> <span id="readout-cents"></span></output>
    </div>
  </div>
  <figcaption>Try it: sing or hum a note, or tap a key. This is a small browser version of ScoreGen's first step, pitch detection (YIN). Your audio stays in your browser. Nothing is recorded or sent anywhere.</figcaption>
</figure>`;

const figureHTML = (f) => `<figure class="figure">
  <img src="${esc(f.src)}" alt="${esc(f.alt)}"${f.class ? ` class="${esc(f.class)}"` : ''} loading="lazy">
  ${f.caption ? `<figcaption>${esc(f.caption)}</figcaption>` : ''}
</figure>`;

const featuredHTML = (p) => {
  const media = p.demo ? scoregenDemo
    : p.play ? `<figure class="figure"><button class="button" type="button" data-play="${esc(p.play)}" data-title="${esc(p.title)}">Play in the browser</button></figure>`
    : p.figure || p.image ? figureHTML(p.figure || p.image) : '';
  const did = p.did?.length ? `<ul class="did">${p.did.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '';
  const links = p.links.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join('');
  return `<article class="project" id="p-${p.id}">
  <h3>${esc(p.title)}</h3>
  <p class="meta">${esc(p.year)} · ${esc(p.role)}</p>
  <p>${esc(p.summary)}</p>
  ${did}
  <p class="stack">${p.stack.map(esc).join(' · ')}</p>
  ${links ? `<div class="links">${links}</div>` : ''}
  ${media}
</article>`;
};

const archiveHTML = (h) => `<li>
  <span class="year">${h.year}</span>
  <div><a class="title" href="${esc(h.href)}">${esc(h.title)}</a> <span class="event">at ${esc(h.event)}</span>${h.award ? ` · <span class="award">${esc(h.award)}</span>` : ''}</div>
  <p>${esc(h.blurb)}</p>
</li>`;

const logHTML = (e) => {
  const href = e.slug ? `log/${e.slug}.html` : e.href;
  return `<li>
  <time datetime="${e.date}">${fmtDate(e.date)}</time>
  <div class="entry"><a href="${esc(href)}">${esc(e.title)}</a><span class="kind">${esc(e.kind)}</span>${e.summary ? `<p>${esc(e.summary)}</p>` : ''}</div>
</li>`;
};

// Post pages may show images from GitHub issue attachments, so they allow https images.
const postPage = (p, base = '../') => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' https: data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${esc(p.title)} · Jackson Lippert</title>
  <meta name="description" content="${esc(p.summary)}">
  <meta property="og:title" content="${esc(p.title)}">
  <meta property="og:description" content="${esc(p.summary)}">
  ${p.slug ? `<link rel="canonical" href="${SITE_URL}/log/${p.slug}.html">` : '<meta name="robots" content="noindex">'}
  <link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml">
  <link rel="alternate" type="application/rss+xml" href="${base}feed.xml">
  <link rel="stylesheet" href="${base}styles.css">
</head>
<body>
  <article class="post">
    <a class="back" href="${base}#log">← Jackson Lippert</a>
    <h1>${esc(p.title)}</h1>
    ${p.slug ? `<time datetime="${p.date}">${fmtDate(p.date)}</time>` : ''}
    <div class="prose">${p.html}</div>
  </article>
</body>
</html>`;

const rss = (entries) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Jackson Lippert: log</title>
<link>${SITE_URL}/</link>
<description>Notes, releases and shipped work.</description>
${entries.map((e) => {
  const link = e.slug ? `${SITE_URL}/log/${e.slug}.html` : e.href;
  return `<item><title>${esc(e.title)}</title><link>${esc(link)}</link><guid>${esc(link + '#' + e.date)}</guid><pubDate>${new Date(e.date).toUTCString()}</pubDate><description>${esc(e.summary || '')}</description></item>`;
}).join('\n')}
</channel></rss>`;

// ---------- machine-readable profile ----------
// These state the same facts as the visible page, in formats that search engines
// and AI agents parse reliably. Nothing here is hidden from human visitors.
const jsonLd = (pr, projects) => JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'ProfilePage',
  url: `${SITE_URL}/`,
  mainEntity: {
    '@type': 'Person',
    name: pr.name,
    url: `${SITE_URL}/`,
    email: `mailto:${pr.email}`,
    jobTitle: pr.experience[0]?.role,
    worksFor: pr.experience[0] && { '@type': 'Organization', name: pr.experience[0].org },
    alumniOf: pr.education.map((e) => ({ '@type': 'CollegeOrUniversity', name: e.org })),
    knowsAbout: pr.skills,
    sameAs: pr.sameAs,
  },
  hasPart: projects.featured.map((p) => ({
    '@type': 'CreativeWork',
    name: p.title,
    description: p.summary,
    url: `${SITE_URL}/#p-${p.id}`,
    ...(p.links[0] && { sameAs: p.links[0].href }),
  })),
}).replace(/</g, '\\u003c');

const when = (x) => (x.when ? ` (${x.when})` : '');
const llmsTxt = (pr, projects, notes) => `# ${pr.name}

> ${pr.summary}

This is the plain-text version of ${SITE_URL}/, the personal site of ${pr.name}. It has the same facts as the web page. Code links go to public repositories where the work can be checked.

## Profile

- Current role: ${pr.experience.map((e) => `${e.role}, ${e.org}${when(e)}`).join('; ')}
- Education: ${pr.education.map((e) => `${e.degree}, ${e.org}${when(e)}`).join('; ')}
- Skills: ${pr.skills.join(', ')}
- Email: ${pr.email}
- Links: ${pr.sameAs.join(', ')}

## Projects

${projects.featured.map((p) => `### ${p.title}

${p.year} · ${p.role} · ${p.stack.join(', ')}

${p.summary}
${p.did?.length ? '\n' + p.did.map((d) => `- ${d}`).join('\n') + '\n' : ''}${p.links.length ? '\nLinks: ' + p.links.map((l) => `[${l.label}](${l.href})`).join(', ') + '\n' : ''}`).join('\n')}
## Hackathons

${projects.archive.map((h) => `- ${h.year}, ${h.event}: [${h.title}](${h.href})${h.award ? ` (${h.award})` : ''}. ${h.blurb}`).join('\n')}

## Optional

${notes.map((n) => `- [${n.title}](${SITE_URL}/log/${n.slug}.html): ${n.summary}`).join('\n') || '- No posts yet.'}
- [RSS feed](${SITE_URL}/feed.xml)
`;

const robots = () => `# Everyone is welcome, including search engines and AI agents.
User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;

const sitemap = (notes, builtAt) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE_URL}/</loc><lastmod>${builtAt.toISOString().slice(0, 10)}</lastmod></url>
<url><loc>${SITE_URL}/llms.txt</loc></url>
${notes.map((n) => `<url><loc>${SITE_URL}/log/${n.slug}.html</loc><lastmod>${n.date.slice(0, 10)}</lastmod></url>`).join('\n')}
</urlset>`;

// ---------- build ----------
console.log(`Building ${REPO} → dist/`);
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(SRC, DIST, { recursive: true });

const projects = JSON.parse(fs.readFileSync(path.join(CONTENT, 'projects.json'), 'utf8'));
const profile = JSON.parse(fs.readFileSync(path.join(CONTENT, 'profile.json'), 'utf8'));
const [issues, events] = await Promise.all([issueNotes(), activity()]);
const notes = [...fileNotes(), ...issues].sort((a, b) => b.date.localeCompare(a.date));
const log = [...notes, ...events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 24);
console.log(`  ${notes.length} notes (${issues.length} from issues), ${events.length} activity items`);

const builtAt = new Date();
const facts = [
  ...profile.experience.map((e) => ['Now', esc(`${e.role}, ${e.org}${when(e)}`)]),
  ...profile.education.map((e) => ['Studied', esc(`${e.degree}, ${e.org}${when(e)}`)]),
  ['Email', `<a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a>`],
].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('\n        ');

let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
html = html
  .replaceAll('<!--DESCRIPTION-->', esc(profile.summary))
  .replaceAll('<!--URL-->', SITE_URL)
  .replaceAll('<!--EMAIL-->', esc(profile.email))
  .replace('<!--JSONLD-->', jsonLd(profile, projects))
  .replace('<!--SUMMARY-->', esc(profile.summary))
  .replace('<!--FACTS-->', facts)
  .replace('<!--FEATURED-->', projects.featured.map(featuredHTML).join('\n'))
  .replace('<!--ARCHIVE-->', projects.archive.map(archiveHTML).join('\n'))
  .replace('<!--LOG-->', log.length ? log.map(logHTML).join('\n') : '<li><span></span><div class="entry"><p>Nothing here yet.</p></div></li>')
  .replace('<!--BUILT_AT-->', `<time datetime="${builtAt.toISOString()}">${fmtDate(builtAt)}</time>`);
if (html.includes('<!--')) throw new Error('Unfilled template marker in index.html');
fs.writeFileSync(path.join(DIST, 'index.html'), html);

fs.mkdirSync(path.join(DIST, 'log'), { recursive: true });
for (const n of notes) fs.writeFileSync(path.join(DIST, 'log', `${n.slug}.html`), postPage(n));
fs.writeFileSync(path.join(DIST, 'feed.xml'), rss(log));
fs.writeFileSync(path.join(DIST, 'llms.txt'), llmsTxt(profile, projects, notes));
fs.writeFileSync(path.join(DIST, 'robots.txt'), robots());
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap(notes, builtAt));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
fs.writeFileSync(path.join(DIST, '404.html'), postPage({ title: 'Page not found', date: builtAt.toISOString(), summary: '', html: '<p>That page doesn’t exist. <a href="/">Back to the homepage</a>.</p>' }, '/'));
console.log('Done.');
