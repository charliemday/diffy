import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPagePath,
  inferPagePath,
  isVercelPreviewUrl,
  normalizePagePath,
  pickSiteUrl,
  resolvePrSiteUrls,
  routeFromFilename,
} from "./github-preview-urls";

describe("page path helpers", () => {
  it("normalizes blank, relative, and trailing-slash paths", () => {
    assert.equal(normalizePagePath(""), "/");
    assert.equal(normalizePagePath("pricing"), "/pricing");
    assert.equal(normalizePagePath("/pricing/"), "/pricing");
    assert.equal(normalizePagePath("https://example.com/team?x=1"), "/team");
  });

  it("applies a path onto a deployment origin", () => {
    assert.equal(
      applyPagePath("https://site-git-feat.vercel.app", "/pricing"),
      "https://site-git-feat.vercel.app/pricing",
    );
    assert.equal(
      applyPagePath("https://site-git-feat.vercel.app/old", "/"),
      "https://site-git-feat.vercel.app/",
    );
  });

  it("infers Next.js routes from changed files", () => {
    assert.equal(routeFromFilename("src/app/page.tsx"), "/");
    assert.equal(routeFromFilename("src/app/pricing/page.tsx"), "/pricing");
    assert.equal(
      routeFromFilename("src/app/(marketing)/about/page.tsx"),
      "/about",
    );
    assert.equal(routeFromFilename("src/pages/Index.tsx"), "/");
    assert.equal(routeFromFilename("src/pages/team.tsx"), "/team");
    assert.equal(routeFromFilename("src/Hero.tsx"), null);

    assert.equal(
      inferPagePath([{ filename: "src/app/pricing/page.tsx" }]),
      "/pricing",
    );
    assert.equal(
      inferPagePath([
        { filename: "src/app/page.tsx" },
        { filename: "src/app/pricing/page.tsx" },
      ]),
      "/",
    );
  });

  it("drops GitHub and Vercel dashboard URLs", () => {
    assert.equal(pickSiteUrl("https://github.com/acme/site"), undefined);
    assert.equal(pickSiteUrl("https://vercel.com/acme/site"), undefined);
    assert.equal(
      pickSiteUrl("https://site-git-feat.vercel.app/"),
      "https://site-git-feat.vercel.app",
    );
  });

  it("detects Vercel preview hosts", () => {
    assert.equal(
      isVercelPreviewUrl("https://site-git-feat.vercel.app/pricing"),
      true,
    );
    assert.equal(isVercelPreviewUrl("https://www.northline.example/"), false);
    assert.equal(isVercelPreviewUrl("https://vercel.com/acme/site"), false);
  });
});

describe("resolvePrSiteUrls", () => {
  it("uses GitHub deployments and repo homepage", async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/deployments?") && url.includes("sha=")) {
        return json([{ id: 11, environment: "Preview" }]);
      }
      if (url.includes("/deployments?") && !url.includes("sha=")) {
        return json([
          { id: 22, environment: "Production", production_environment: true },
        ]);
      }
      if (url.endsWith("/deployments/11/statuses?per_page=8")) {
        return json([
          {
            state: "success",
            environment_url: "https://site-git-feat.vercel.app/",
          },
        ]);
      }
      if (url.endsWith("/deployments/22/statuses?per_page=8")) {
        return json([
          { state: "success", environment_url: "https://site.vercel.app/" },
        ]);
      }
      if (url.includes("/commits/") && url.includes("/statuses")) {
        return json([]);
      }
      if (url.endsWith("/repos/acme/site")) {
        return json({ homepage: "https://www.northline.example/" });
      }
      throw new Error(`unexpected fetch ${url}`);
    };

    const resolved = await resolvePrSiteUrls(
      {
        owner: "acme",
        repo: "site",
        headSha: "abc123",
        files: [{ filename: "src/app/pricing/page.tsx" }],
      },
      { fetchImpl: fetchImpl as typeof fetch },
    );

    assert.equal(resolved.previewUrl, "https://site-git-feat.vercel.app/pricing");
    assert.equal(resolved.baseUrl, "https://www.northline.example/pricing");
    assert.equal(resolved.pagePath, "/pricing");
    assert.equal(resolved.previewSource, "deployment");
    assert.equal(resolved.baseSource, "homepage");
  });

  it("falls back to commit statuses when deployments have no URL", async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/deployments?")) return json([]);
      if (url.includes("/statuses?per_page=100")) {
        return json([
          {
            state: "success",
            context: "Vercel – site – Preview",
            target_url: "https://site-git-feat.vercel.app",
          },
        ]);
      }
      if (url.endsWith("/repos/acme/site")) {
        return json({ homepage: null });
      }
      throw new Error(`unexpected fetch ${url}`);
    };

    const resolved = await resolvePrSiteUrls(
      {
        owner: "acme",
        repo: "site",
        headSha: "abc123",
        files: [{ filename: "src/Hero.tsx" }],
      },
      { fetchImpl: fetchImpl as typeof fetch },
    );

    assert.equal(resolved.previewUrl, "https://site-git-feat.vercel.app/");
    assert.equal(resolved.baseUrl, "https://site-git-feat.vercel.app/");
    assert.equal(resolved.pagePath, "/");
    assert.equal(resolved.previewSource, "commit-status");
  });

  it("honors explicit URL overrides and a page path", async () => {
    const resolved = await resolvePrSiteUrls(
      {
        owner: "acme",
        repo: "site",
        headSha: "abc123",
        files: [],
      },
      {
        previewUrl: "https://preview.example.com",
        baseUrl: "https://example.com",
        pagePath: "about",
        fetchImpl: async () => {
          throw new Error("should not fetch GitHub");
        },
      },
    );

    assert.equal(resolved.previewUrl, "https://preview.example.com/about");
    assert.equal(resolved.baseUrl, "https://example.com/about");
    assert.equal(resolved.previewSource, "override");
  });

  it("errors when no preview URL can be found", async () => {
    const fetchImpl = async () => json([]);
    await assert.rejects(
      () =>
        resolvePrSiteUrls(
          {
            owner: "acme",
            repo: "site",
            headSha: "abc123",
            files: [],
          },
          { fetchImpl: fetchImpl as typeof fetch },
        ),
      /Could not find a preview URL/,
    );
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
