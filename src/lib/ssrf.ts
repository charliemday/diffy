const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

export function isPrivateIpv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

export function isPrivateIpv6(ip: string): boolean {
  const h = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "::1") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA
  if (h.startsWith("fe80")) return true;
  if (h.startsWith("::ffff:")) {
    const v4 = h.slice("::ffff:".length);
    if (isPrivateIpv4(v4)) return true;
  }
  return false;
}

function allowLocalHosts(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.DIFFY_ALLOW_LOCAL === "1"
  );
}

/** Synchronous hostname checks (literal IP / blocked names). */
export function assertSafePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const allowLocal = allowLocalHosts();

  if (!allowLocal) {
    if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
      throw new Error("That host is not allowed");
    }
    if (host === "0.0.0.0" || isPrivateIpv4(host) || isPrivateIpv6(host)) {
      throw new Error("Private or local network addresses are not allowed");
    }
    if (host.includes(":")) {
      throw new Error("IPv6 addresses are not allowed");
    }
  }

  return url;
}

/**
 * Resolve DNS and reject private addresses. Best-effort: if DNS APIs are
 * unavailable (some Workers runtimes), skip resolution — Cloudflare's
 * global_fetch_strictly_public still blocks private targets on deploy.
 */
export async function assertSafeResolvedHost(hostname: string): Promise<void> {
  if (allowLocalHosts()) return;

  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new Error("Private or local network addresses are not allowed");
  }

  try {
    const dns = await import("node:dns/promises");
    const results = await dns.lookup(host, { all: true, verbatim: true });
    for (const r of results) {
      if (r.family === 4 && isPrivateIpv4(r.address)) {
        throw new Error("Host resolves to a private address");
      }
      if (r.family === 6 && isPrivateIpv6(r.address)) {
        throw new Error("Host resolves to a private address");
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("private")) throw err;
    // Module missing or lookup failure — fall through; fetch path still guarded
  }
}
