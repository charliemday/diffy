import { parse, type HTMLElement } from "node-html-parser";

const STRIP_TAGS = new Set([
  "script",
  "noscript",
  "iframe",
  "object",
  "embed",
  "applet",
  "base",
]);

// Keep stylesheet / icon links only
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
    return null; // drop dangerous URLs
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

function rewriteSrcset(value: string, base: URL): string {
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
      return rest ? `${abs} ${rest}` : abs;
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

/**
 * Sanitize fetched HTML for same-origin embedding:
 * remove executable markup, neutralize javascript: URLs, absolutize assets.
 * Highlighting is done by the parent (sandboxed iframe has no scripts).
 */
export function prepareProxiedHtml(html: string, pageUrl: string): string {
  const base = new URL(pageUrl);
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

    // Remove dangerous form/control attrs
    el.removeAttribute("srcdoc");
    if (el.getAttribute("contenteditable")) {
      el.removeAttribute("contenteditable");
    }

    for (const attr of URL_ATTRS) {
      const val = el.getAttribute(attr);
      if (!val) continue;
      if (attr === "srcset" || attr === "data-srcset") {
        const next = rewriteSrcset(val, base);
        if (next) el.setAttribute(attr, next);
        else el.removeAttribute(attr);
      } else {
        const abs = absolutize(val, base);
        if (abs == null) el.removeAttribute(attr);
        else el.setAttribute(attr, abs);
      }
    }

    const style = el.getAttribute("style");
    if (style) {
      // Drop expression()/behavior and rewrite url()
      let cleaned = style
        .replace(/expression\s*\(/gi, "invalid(")
        .replace(/-moz-binding\s*:/gi, "invalid:")
        .replace(/behavior\s*:/gi, "invalid:");
      cleaned = cleaned.replace(
        /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi,
        (_m, _q, u) => {
          const abs = absolutize(u, base);
          return abs ? `url("${abs}")` : "url(about:blank)";
        },
      );
      el.setAttribute("style", cleaned);
    }
  }

  // Inject a tiny non-script style hook for parent-applied .diffy-focus
  const styleTag =
    "<style data-diffy-injected=\"1\">[data-diffy-id].diffy-focus{outline:3px solid #0f6b57!important;outline-offset:4px;box-shadow:0 0 0 8px rgba(15,107,87,0.18);border-radius:4px;}</style>";
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
    // No scripts; assets from original origins only via rewritten absolute URLs
    "Content-Security-Policy": [
      "default-src 'none'",
      "img-src https: http: data: blob:",
      "media-src https: http: data: blob:",
      "font-src https: http: data:",
      "style-src 'unsafe-inline' https: http:",
      "frame-ancestors 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "script-src 'none'",
    ].join("; "),
  };
}
