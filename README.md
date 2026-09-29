# jaaklipp.github.io

My portfolio. Plain HTML/CSS/JS, no framework, no dependencies. It's built by a ~200-line Node script and deployed to GitHub Pages by Actions.

```
src/                 the site (index.html is a template; the build fills in the <!--MARKERS-->)
  js/audio.js        synth + YIN pitch detector (mic) for the ScoreGen demo
  js/visuals.js      the staff the demo draws notes on
  js/main.js         wiring
  assets/fonts/      self-hosted IBM Plex (OFL), so there are no third-party requests
content/
  profile.json       name, role, education, skills: feeds the page, JSON-LD and llms.txt
  projects.json      projects + hackathons: edit this to change the work sections
  posts/*.md         log posts (frontmatter: title, date, summary, draft)
scripts/build.mjs    src + content + GitHub API → dist/
.github/workflows/deploy.yml
```

## Run locally

```bash
npm run dev          # build + serve on http://localhost:8080
```

`GITHUB_TOKEN=$(gh auth token) npm run build` pulls real activity and issue posts. Without a token the build still works and just skips them.

## How updates get posted

The **Log** section and `feed.xml` (RSS) are rebuilt from three sources:

| Source | How to post | When it appears |
|---|---|---|
| `content/posts/*.md` | commit a markdown file | on push |
| GitHub issue labelled **`log`** in this repo | open an issue (works from the GitHub mobile app); close it to unpublish | within ~1 min (the `issues` trigger) |
| Public GitHub activity: releases, new repos, pushes | ship things | daily cron, or ping (below) |

Only issues opened by the repo owner are published, so other people can't post to your site. Anyone can still *open* issues on a public repo. If that gets noisy, turn off Issues for others or use Settings → Moderation → Interaction limits.

### Ping from another repo when it ships

Add this to any project's release workflow so the site rebuilds right away instead of waiting for the daily cron. It needs a fine-grained PAT with *Contents: read & write* on this repo, saved as `SITE_DISPATCH_TOKEN`:

```yaml
- name: Tell the portfolio
  run: |
    curl -sf -X POST https://api.github.com/repos/JaakLipp/JaakLipp.github.io/dispatches \
      -H "Authorization: Bearer ${{ secrets.SITE_DISPATCH_TOKEN }}" \
      -d '{"event_type":"project-update"}'
```

## Adding a playable build (e.g. The Long Road)

1. In Godot 4.3+, export **Web** with **Thread Support off**. Single-threaded exports don't need
   SharedArrayBuffer, which GitHub Pages can't enable (it can't set COOP/COEP headers).
   If you need threads, add [`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker) to the export instead.
2. Put the export in `src/play/the-long-road/` (keep the `.pck` + `.wasm` under ~50 MB; Pages caps a site at 1 GB).
3. Set `"play": "play/the-long-road/index.html"` on the project in `content/projects.json`.

The card gets a **▶ Play in browser** button that loads the iframe only when clicked, so the game doesn't slow down the page.
You could also have The Long Road's own CI export the web build and push it here.

## For AI agents and search engines

The build also writes these files, all generated from `content/`, so they always say the same thing as the page:

- `llms.txt`: a Markdown summary of the whole site ([llmstxt.org](https://llmstxt.org))
- a schema.org `ProfilePage`/`Person` JSON-LD block in `index.html`
- `robots.txt` (allows everyone) and `sitemap.xml`

Nothing is hidden from people. Hidden "rank me highly" text gets flagged by hiring tools and treated as a reason to reject.

## Security notes

- A strict Content-Security-Policy is set by meta tag. The site only loads its own scripts, styles and fonts and makes no network requests. Post pages allow `https:` images for issue attachments.
- Issue posts are only published if you wrote them, and Markdown is escaped before rendering.
- Workflow jobs get least-privilege permissions and SHA-pinned actions. A keepalive job stops GitHub from disabling the daily schedule after 60 inactive days.
- The mic demo only starts on a click, and audio never leaves the browser.

## First-time setup

1. Create the public repo **`JaakLipp.github.io`** and push this folder to `main`.
2. Settings → Pages → Source: **GitHub Actions**.
3. Create a label called `log` (Issues → Labels).
4. Run the workflow once (Actions → Build & deploy → Run workflow).
