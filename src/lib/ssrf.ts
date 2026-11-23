const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

function isPrivateIpv4(hostname: string): boolean {
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
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

function isPrivateIpv6(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "::1") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA
  if (h.startsWith("fe80")) return true;
  return false;
}

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
  const allowLocal =
    process.env.NODE_ENV === "development" ||
    process.env.DIFFY_ALLOW_LOCAL === "1";

  if (!allowLocal) {
    if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
      throw new Error("That host is not allowed");
    }
    if (host === "0.0.0.0" || isPrivateIpv4(host) || isPrivateIpv6(host)) {
      throw new Error("Private or local network addresses are not allowed");
    }
    // Block bare IPv6 literals in brackets already stripped by URL.hostname
    if (host.includes(":")) {
      throw new Error("IPv6 addresses are not allowed");
    }
  }

  return url;
}
