# Diffy

Visual PR review for marketing websites. Diffy shows the page on the left and a timeline of copy, image, and layout changes on the right. Step with ↑ / ↓ to jump to each change and compare before and after.

This repo ships a **demo-first** experience with a sample Northline landing page refresh — no live URL fetching yet.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3456](http://localhost:3456), then **Open demo review**.

## How to use the demo

1. Open `/review`
2. Use **↑ / ↓** (or **k / j**) to move through changes
3. The site preview scrolls to and highlights the active change
4. The panel under the timeline shows before → after for that change

## Deploy to Cloudflare

Diffy deploys to **Cloudflare Workers** via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).

```bash
npm run deploy
```

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment (Workers Edit permission is enough for deploy).

Pushing to `main` also runs [`.github/workflows/deploy-cloudflare.yml`](.github/workflows/deploy-cloudflare.yml) when those values are set as GitHub Actions secrets.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, OpenNext on Cloudflare Workers.
