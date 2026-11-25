# Diffy

Visual PR review for marketing websites. Paste a **GitHub pull request**, the **base URL** (live page), and the **preview URL** (PR deploy). Diffy reads visual claims from the PR, finds them in the preview HTML, and opens a review with the page on the left and a timeline of copy, image, and layout changes on the right. Step with ↑ / ↓ to jump to each highlight.

A hardcoded Northline demo still lives at `/review/demo` for offline walkthroughs.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3456](http://localhost:3456).

Set `OPENAI_API_KEY` so Diffy can extract visual claims from the PR.

### Fixture pages

With the dev server running, these local pages are allowed as base/preview URLs in development:

- Base: `http://127.0.0.1:3456/fixtures/base.html`
- Preview: `http://127.0.0.1:3456/fixtures/preview.html`

## How it works

1. **Home** — submit a GitHub PR URL plus base and preview URLs  
2. **`POST /api/compare`** — load the PR files, ask the model for visual claims, fetch the preview HTML (SSRF-safe), locate those claims, stamp `data-diffy-id`, store the run (rate-limited)  
3. **`/review/[runId]`** — timeline + before/after panel + PR companion  
4. **`GET /api/proxy`** — sanitized HTML of the after page in a **script-free sandboxed iframe**; the parent scrolls/highlights claims  

Dynamic page noise (randomized carousels, live user names) is ignored because it is never a PR claim.

Runs are kept in memory and also written to the Workers Cache API (~1 hour) so `/api/proxy` and `/api/asset` still resolve across isolates. Compare again if a run eventually expires.

### GitHub

Public PRs work without auth. Private repos use **GitHub OAuth** (Connect GitHub on the form). Create a GitHub OAuth App and set:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- Optional: `DIFFY_SESSION_SECRET` (cookie sealing; falls back to the client secret)
- Optional: `GITHUB_OAUTH_REDIRECT_URI` (defaults to `{origin}/api/auth/github/callback`)

Callback URL example: `https://diffy.charliemday31.workers.dev/api/auth/github/callback`  
Local: `http://localhost:3456/api/auth/github/callback`  
Requested scopes: `read:user`, `repo`.

### Vercel auth-gated previews

If the preview uses **Deployment Protection**, paste the project’s **Protection Bypass for Automation** secret on the compare form. Diffy sends it as `x-vercel-protection-bypass` on server fetches and proxies same-host assets through `/api/asset` so the secret never appears in the iframe HTML. Without a bypass secret, stylesheet and image URLs stay pointed at the origin so the browser loads them directly.

Create the secret in Vercel → Project → Settings → Deployment Protection.

Works best on **SSR / static HTML**. Client-rendered shells with empty first HTML will often show no located claims.

## Deploy to Cloudflare

Diffy deploys to **Cloudflare Workers** via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).

```bash
npm run deploy
```

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Pushing to `main` on GitHub runs [`.github/workflows/deploy-cloudflare.yml`](.github/workflows/deploy-cloudflare.yml) when those values are set as repository Actions secrets.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, `node-html-parser`, OpenNext on Cloudflare Workers.
