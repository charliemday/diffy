# Diffy

Visual PR review for marketing websites. Paste a **base URL** (live page) and a **preview URL** (PR deploy). Diffy fetches both, diffs the HTML, and opens a review with the page on the left and a timeline of copy, image, and layout changes on the right. Step with ↑ / ↓ to jump to each change.

A hardcoded Northline demo still lives at `/review/demo` for offline walkthroughs.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3456](http://localhost:3456).

### Compare two fixture pages

With the dev server running:

- Base: `http://127.0.0.1:3456/fixtures/base.html`
- Preview: `http://127.0.0.1:3456/fixtures/preview.html`

Localhost fetches are allowed only in development.

## How it works

1. **Home** — submit base + preview URLs  
2. **`POST /api/compare`** — SSRF-safe fetch, DOM diff, inject `data-diffy-id`, store the run  
3. **`/review/[runId]`** — timeline + before/after panel  
4. **`GET /api/proxy`** — same-origin HTML of the after page so Diffy can scroll/highlight  

Runs are kept in memory (~1 hour). They do not survive cold starts on Cloudflare Workers — compare again if a run 404s.

Optional: set `OPENAI_API_KEY` to polish change labels. The DOM diff is always the source of truth.

Works best on **SSR / static HTML**. Client-rendered shells with empty first HTML will often show no changes.

## Deploy to Cloudflare

```bash
npm run deploy
```

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Pushing to `main` can also run [`.github/workflows/deploy-cloudflare.yml`](.github/workflows/deploy-cloudflare.yml) when those secrets are set.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, `node-html-parser`, OpenNext on Cloudflare Workers.
