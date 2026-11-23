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

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui.
