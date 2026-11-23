import { parse } from "node-html-parser";

const HIGHLIGHT_SCRIPT = `
<script data-diffy-injected="1">
(function () {
  var STYLE_ID = "diffy-highlight-style";
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = "[data-diffy-id].diffy-focus{outline:3px solid #0f6b57;outline-offset:4px;box-shadow:0 0 0 8px rgba(15,107,87,0.18);border-radius:4px;transition:outline-color .2s,box-shadow .2s;}";
    document.head.appendChild(style);
  }
  var last = null;
  function focusSelector(selector) {
    if (last) last.classList.remove("diffy-focus");
    if (!selector) return;
    var el = document.querySelector('[data-diffy-id="' + selector.replace(/"/g, '') + '"]');
    if (!el) return;
    last = el;
    el.classList.add("diffy-focus");
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "diffy:focus") return;
    focusSelector(data.selector || null);
  });
  try { window.parent.postMessage({ type: "diffy:ready" }, "*"); } catch (e) {}
})();
</script>
`;

function absolutize(attrValue: string, base: URL): string {
  const v = attrValue.trim();
  if (!v) return v;
  if (
    v.startsWith("data:") ||
    v.startsWith("blob:") ||
    v.startsWith("mailto:") ||
    v.startsWith("tel:") ||
    v.startsWith("javascript:") ||
    v.startsWith("#")
  ) {
    return v;
  }
  try {
    return new URL(v, base).toString();
  } catch {
    return v;
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
      return rest ? `${abs} ${rest}` : abs;
    })
    .join(", ");
}

/**
 * Make relative asset URLs absolute against the page origin, strip frame
 * blockers, inject Diffy highlight listener.
 */
export function prepareProxiedHtml(html: string, pageUrl: string): string {
  const base = new URL(pageUrl);
  const doc = parse(html, {
    comment: true,
    blockTextElements: { script: true, style: true, noscript: true },
  });

  // <base> can confuse absolute rewriting — remove and rely on rewritten attrs
  for (const el of doc.querySelectorAll("base")) {
    el.remove();
  }

  for (const el of doc.querySelectorAll("*")) {
    for (const attr of URL_ATTRS) {
      const val = el.getAttribute(attr);
      if (!val) continue;
      if (attr === "srcset" || attr === "data-srcset") {
        el.setAttribute(attr, rewriteSrcset(val, base));
      } else {
        el.setAttribute(attr, absolutize(val, base));
      }
    }
  }

  // Inline style url(...) — best effort for common cases
  for (const el of doc.querySelectorAll("[style]")) {
    const style = el.getAttribute("style");
    if (!style || !/url\(/i.test(style)) continue;
    el.setAttribute(
      "style",
      style.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (_m, _q, u) => {
        return `url("${absolutize(u, base)}")`;
      }),
    );
  }

  // Inject script before </body> or at end
  const body = doc.querySelector("body");
  if (body) {
    body.insertAdjacentHTML("beforeend", HIGHLIGHT_SCRIPT);
  } else {
    doc.insertAdjacentHTML("beforeend", HIGHLIGHT_SCRIPT);
  }

  return doc.toString();
}

export function proxyResponseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    // Allow embedding in Diffy only via same-origin iframe; strip blockers
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "frame-ancestors 'self'; default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
  };
}
