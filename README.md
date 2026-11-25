# Diffy

Visual PR review for marketing websites. Paste a **GitHub pull request**. Diffy resolves the **preview** (PR deploy) and **live** URLs from GitHub deployments, reads visual claims from the PR, finds them in the preview HTML, and opens a review with the page on the left and a timeline of copy, image, and layout changes on the right. Step with ↑ / ↓ to jump to each highlight.

A hardcoded Northline demo still lives at `/review/demo` for offline walkthroughs.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3456](http://localhost:3456).

Set `OPENAI_API_KEY` so Diffy can extract visual claims from the PR.

To log those calls in **Pretty Radar**, also set `OPENAI_BASE_URL` and `PRETTY_RADAR_API_KEY` (see [Cloudflare env](#cloudflare-env) below). Diffy sends `Pretty-Radar-Auth` on the claims request. `OPENAI_API_KEY` stays the upstream OpenAI key (`Authorization`). Without the Radar URL/key, claims go straight to `api.openai.com` and will not show up in the Diffy workspace. Claim extraction waits up to 90s by default (`DIFFY_CLAIMS_TIMEOUT_MS`).

### Fixture pages

With the dev server running, `POST /api/compare` still accepts optional `baseUrl` / `previewUrl` overrides for local fixtures:

- Base: `http://127.0.0.1:3456/fixtures/base.html`
- Preview: `http://127.0.0.1:3456/fixtures/preview.html`

## How it works

1. **Home** — submit a GitHub PR URL (optional page path)  
2. **Progress dialog** — `POST /api/compare/prepare` resolves preview/live URLs; if the preview is on Vercel, Diffy asks for a protection bypass. Then `POST /api/compare` streams the remaining steps (claims, fetch, locate), stamps `data-diffy-id`, and stores the run (rate-limited)  
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

Preview and live URLs come from GitHub **deployments** for the PR head SHA (`environment_url`), then commit statuses (`target_url`), then the repo **homepage** for production. An optional page path is joined onto those origins (`/` by default, or inferred when the PR only changes one Next.js route).

### Vercel auth-gated previews

After you click **Review PR**, Diffy opens a full-screen progress dialog. If the deploy is a Vercel preview, it pauses and asks for the project’s **Protection Bypass for Automation** secret (or you can skip if the preview is public). Diffy sends it as `x-vercel-protection-bypass` on server fetches and proxies same-host assets through `/api/asset` so the secret never appears in the iframe HTML. Without a bypass secret, stylesheet and image URLs stay pointed at the origin so the browser loads them directly.

Create the secret in Vercel → Project → Settings → Deployment Protection (the dialog links to [Vercel’s bypass docs](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)).

Works best on **SSR / static HTML**. Client-rendered shells with empty first HTML will often show no located claims.

## Deploy to Cloudflare

Diffy deploys to **Cloudflare Workers** via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).

```bash
npm run deploy
```

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Pushing to `main` on GitHub runs [`.github/workflows/deploy-cloudflare.yml`](.github/workflows/deploy-cloudflare.yml) when those values are set as repository Actions secrets.

### Cloudflare env

Worker **secrets** persist across deploys. They are not GitHub Actions secrets.

| Name | Kind | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | secret | Upstream OpenAI key (`Authorization`) |
| `PRETTY_RADAR_API_KEY` | secret | Workspace key from Pretty Radar → Settings → API keys (`Pretty-Radar-Auth`) |
| `OPENAI_BASE_URL` | plaintext var | `https://helicone-light.charliemday31.workers.dev/v1` (also in `wrangler.jsonc`) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | secret | OAuth |

**Dashboard:** [Workers & Pages → `diffy` → Settings → Variables and Secrets](https://dash.cloudflare.com/?to=/:account/workers/services/view/diffy/production/settings). Add `OPENAI_BASE_URL` as a **text** variable. Add or rotate `PRETTY_RADAR_API_KEY` as an **encrypted secret**. Do not paste the key into chat.

**CLI** (from this repo; uses `CLOUDFLARE_API_TOKEN`):

```bash
npx wrangler secret put PRETTY_RADAR_API_KEY --name diffy
# paste the Pretty Radar workspace key when prompted

# plaintext vars live in wrangler.jsonc and upload on the next `npm run deploy`
```

`wrangler secret put` updates the live worker immediately. `OPENAI_BASE_URL` in `wrangler.jsonc` applies on the next deploy to `main`. Production still hits `api.openai.com` until this branch is merged.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, `node-html-parser`, OpenNext on Cloudflare Workers.
