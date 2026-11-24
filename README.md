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
2. **`POST /api/compare`** — SSRF-safe fetch (manual redirects + DNS checks), DOM diff, sanitize + store the run (rate-limited)  
3. **`/review/[runId]`** — timeline + before/after panel  
4. **`GET /api/proxy`** — sanitized HTML of the after page in a **script-free sandboxed iframe**; the parent scrolls/highlights changes  

Runs are kept in memory (~1 hour). They do not survive cold starts on Cloudflare Workers — compare again if a run 404s.

### Vercel auth-gated previews

If the preview uses **Deployment Protection**, paste the project’s **Protection Bypass for Automation** secret on the compare form. Diffy sends it as `x-vercel-protection-bypass` on server fetches and proxies same-host assets through `/api/asset` so the secret never appears in the iframe HTML.

Create the secret in Vercel → Project → Settings → Deployment Protection.

### Optional AI labels

Check **Improve labels with AI** on the form to send truncated change text to OpenAI (`OPENAI_API_KEY`). Off by default; the DOM diff is always the source of truth.

Works best on **SSR / static HTML**. Client-rendered shells with empty first HTML will often show no changes.

## Deploy to Cloudflare

Diffy deploys to **Cloudflare Workers** via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).

```bash
npm run deploy
```

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Pushing to `main` on GitHub runs [`.github/workflows/deploy-cloudflare.yml`](.github/workflows/deploy-cloudflare.yml) when those values are set as repository Actions secrets.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, `node-html-parser`, OpenNext on Cloudflare Workers.
