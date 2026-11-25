import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchPageHtml, lowercasePathname } from "./fetch-page";

describe("lowercasePathname", () => {
  it("lowercases a mixed-case path", () => {
    assert.equal(
      lowercasePathname("https://site.vercel.app/About"),
      "https://site.vercel.app/about",
    );
  });

  it("returns null when the path is already lowercase", () => {
    assert.equal(lowercasePathname("https://site.vercel.app/about"), null);
  });
});

describe("fetchPageHtml", () => {
  it("retries a 404 with the lowercase path", async () => {
    const seen: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      seen.push(new URL(url).pathname);
      if (url.endsWith("/About")) {
        return new Response("not found", {
          status: 404,
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response("<html><body>about</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    };

    const page = await fetchPageHtml(
      "https://example.com/About",
      {},
      fakeFetch,
    );
    assert.deepEqual(seen, ["/About", "/about"]);
    assert.match(page.html, /about/);
  });

  it("includes the full URL in a persistent 404", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response("missing", {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });

    await assert.rejects(
      () => fetchPageHtml("https://example.com/About", {}, fakeFetch),
      /https:\/\/example.com\/About/,
    );
  });
});
