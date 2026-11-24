import { parse, type HTMLElement } from "node-html-parser";
import { toDiffyAssetUrl } from "@/lib/vercel-bypass";

const STRIP_TAGS = new Set([
  "script",
  "noscript",
  "iframe",
  "object",
  "embed",
  "applet",
  "base",
]);

const KEEP_LINK_REL = new Set(["stylesheet", "preload", "icon", "shortcut icon"]);
const KEEP_META_NAME = new Set(["viewport", "charset"]);

function absolutize(attrValue: string, base: URL): string | null {
  const v = attrValue.trim();
  if (!v) return v;
  const lower = v.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:text/html")
  ) {
    return null;
  }
  if (
    v.startsWith("data:") ||
    v.startsWith("blob:") ||
    v.startsWith("mailto:") ||
    v.startsWith("tel:") ||
    v.startsWith("#")
  ) {
    return v;
  }
  try {
    return new URL(v, base).toString();
  } catch {
    return null;
  }
}

function maybeProxyAsset(
  abs: string,
  pageUrl: string,
  runId: string | undefined,
  useAssetProxy: boolean,
): string {
  if (!useAssetProxy || !runId) return abs;
  if (
    abs.startsWith("data:") ||
    abs.startsWith("blob:") ||
    abs.startsWith("mailto:") ||
    abs.startsWith("tel:") ||
    abs.startsWith("#") ||
    abs.startsWith("/api/asset?")
  ) {
    return abs;
  }
  return toDiffyAssetUrl(abs, runId, pageUrl);
}

const URL_ATTRS = [
  "href",
  "src",
  "srcset",
  "poster",
  "action",
  "data-src",
  "data-srcset",
  "formaction",
  "xlink:href",
] as const;

function rewriteSrcset(
  value: string,
  base: URL,
  pageUrl: string,
  runId: string | undefined,
  useAssetProxy: boolean,
): string {
  return value
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return trimmed;
      const bits = trimmed.split(/\s+/);
      const url = bits[0];
      const rest = bits.slice(1).join(" ");
      const abs = absolutize(url, base);
      if (abs == null) return "";
      const next = maybeProxyAsset(abs, pageUrl, runId, useAssetProxy);
      return rest ? `${next} ${rest}` : next;
    })
    .filter(Boolean)
    .join(", ");
}

function stripEventHandlers(el: HTMLElement) {
  const attrs = el.attributes as Record<string, string>;
  for (const name of Object.keys(attrs)) {
    if (name.toLowerCase().startsWith("on")) {
      el.removeAttribute(name);
    }
  }
}

export type PrepareProxyOptions = {
  runId?: string;
  /** Route same-host assets through /api/asset (keeps Vercel bypass server-side) */
  useAssetProxy?: boolean;
};

/**
 * Sanitize fetched HTML for same-origin embedding.
 * Highlighting is done by the parent (sandboxed iframe has no scripts).
 */
export function prepareProxiedHtml(
  html: string,
  pageUrl: string,
  opts: PrepareProxyOptions = {},
): string {
  const base = new URL(pageUrl);
  const useAssetProxy = Boolean(opts.useAssetProxy && opts.runId);
  const doc = parse(html, {
    comment: false,
    blockTextElements: { script: true, style: true, noscript: true },
  });

  for (const el of doc.querySelectorAll("*")) {
    const tag = el.tagName?.toLowerCase() ?? "";

    if (tag === "link") {
      const rel = (el.getAttribute("rel") ?? "").toLowerCase();
      const relParts = rel.split(/\s+/);
      if (!relParts.some((r) => KEEP_LINK_REL.has(r))) {
        el.remove();
        continue;
      }
    } else if (tag === "meta") {
      const charset = el.getAttribute("charset");
      const name = (el.getAttribute("name") ?? "").toLowerCase();
      const httpEquiv = (el.getAttribute("http-equiv") ?? "").toLowerCase();
      if (
        !charset &&
        !KEEP_META_NAME.has(name) &&
        httpEquiv !== "content-type"
      ) {
        el.remove();
        continue;
      }
    } else if (STRIP_TAGS.has(tag)) {
      el.remove();
      continue;
    }

    stripEventHandlers(el);
    el.removeAttribute("srcdoc");
    if (el.getAttribute("contenteditable")) {
      el.removeAttribute("contenteditable");
    }

    for (const attr of URL_ATTRS) {
      const val = el.getAttribute(attr);
      if (!val) continue;
      if (attr === "srcset" || attr === "data-srcset") {
        const next = rewriteSrcset(
          val,
          base,
          pageUrl,
          opts.runId,
          useAssetProxy,
        );
        if (next) el.setAttribute(attr, next);
        else el.removeAttribute(attr);
      } else {
        const abs = absolutize(val, base);
        if (abs == null) el.removeAttribute(attr);
        else {
          el.setAttribute(
            attr,
            maybeProxyAsset(abs, pageUrl, opts.runId, useAssetProxy),
          );
        }
      }
    }

    const style = el.getAttribute("style");
    if (style) {
      let cleaned = style
        .replace(/expression\s*\(/gi, "invalid(")
        .replace(/-moz-binding\s*:/gi, "invalid:")
        .replace(/behavior\s*:/gi, "invalid:");
      cleaned = cleaned.replace(
        /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi,
        (_m, _q, u) => {
          const abs = absolutize(u, base);
          if (!abs) return "url(about:blank)";
          const next = maybeProxyAsset(abs, pageUrl, opts.runId, useAssetProxy);
          return `url("${next}")`;
        },
      );
      el.setAttribute("style", cleaned);
    }
  }

  const styleTag =
    '<style data-diffy-injected="1">[data-diffy-id].diffy-focus{outline:3px solid #0f6b57!important;outline-offset:4px;box-shadow:0 0 0 8px rgba(15,107,87,0.18);border-radius:4px;}</style>';
  const head = doc.querySelector("head");
  if (head) {
    head.insertAdjacentHTML("beforeend", styleTag);
  } else {
    const body = doc.querySelector("body");
    if (body) body.insertAdjacentHTML("afterbegin", styleTag);
    else doc.insertAdjacentHTML("beforeend", styleTag);
  }

  return doc.toString();
}

export function proxyResponseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": [
      "default-src 'none'",
      "img-src 'self' https: http: data: blob:",
      "media-src 'self' https: http: data: blob:",
      "font-src 'self' https: http: data:",
      "style-src 'self' 'unsafe-inline' https: http:",
      "frame-ancestors 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "script-src 'none'",
    ].join("; "),
  };
}
