import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GH_TOKEN_COOKIE = "diffy_gh";
export const GH_STATE_COOKIE = "diffy_gh_state";
export const GH_OAUTH_SCOPES = "read:user repo";

const TOKEN_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days
const STATE_MAX_AGE_SEC = 60 * 10;

/** Strip whitespace and accidental markdown/shell quotes from secret values. */
function cleanEnv(value: string | undefined): string {
  return (value ?? "").trim().replace(/^[`'"]+|[`'"]+$/g, "").trim();
}

export function isGithubOAuthConfigured(): boolean {
  return Boolean(cleanEnv(process.env.GITHUB_CLIENT_ID) && cleanEnv(process.env.GITHUB_CLIENT_SECRET));
}

export function githubClientId(): string {
  const id = cleanEnv(process.env.GITHUB_CLIENT_ID);
  if (!id) throw new Error("GITHUB_CLIENT_ID is not configured");
  return id;
}

export function githubClientSecret(): string {
  const secret = cleanEnv(process.env.GITHUB_CLIENT_SECRET);
  if (!secret) throw new Error("GITHUB_CLIENT_SECRET is not configured");
  return secret;
}

function sealKey(): Buffer {
  // Prefer dedicated secret; fall back to client secret for single-env setups.
  const raw =
    cleanEnv(process.env.DIFFY_SESSION_SECRET) ||
    cleanEnv(process.env.GITHUB_CLIENT_SECRET) ||
    "diffy-dev-only-session-secret";
  return createHmac("sha256", "diffy-cookie-key").update(raw).digest();
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

/** HMAC-sealed payload: base64url(payload).base64url(sig) */
export function sealValue(plain: string): string {
  const payload = b64url(plain);
  const sig = createHmac("sha256", sealKey()).update(payload).digest();
  return `${payload}.${b64url(sig)}`;
}

export function unsealValue(sealed: string): string | null {
  const parts = sealed.split(".");
  if (parts.length !== 2) return null;
  const [payload, sigB64] = parts;
  if (!payload || !sigB64) return null;
  const expected = createHmac("sha256", sealKey()).update(payload).digest();
  let actual: Buffer;
  try {
    actual = fromB64url(sigB64);
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  try {
    return fromB64url(payload).toString("utf8");
  } catch {
    return null;
  }
}

export function newOAuthState(): string {
  return b64url(randomBytes(24));
}

export function oauthRedirectUri(requestUrl: string): string {
  const configured = process.env.GITHUB_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;
  const u = new URL(requestUrl);
  return `${u.origin}/api/auth/github/callback`;
}

export function githubAuthorizeUrl(opts: {
  state: string;
  redirectUri: string;
}): string {
  const params = new URLSearchParams({
    client_id: githubClientId(),
    redirect_uri: opts.redirectUri,
    scope: GH_OAUTH_SCOPES,
    state: opts.state,
    allow_signup: "true",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "DiffyBot/0.1 (+https://diffy.app; visual-review)",
    },
    body: JSON.stringify({
      client_id: githubClientId(),
      client_secret: githubClientSecret(),
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub token exchange failed (${res.status})`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!data.access_token) {
    throw new Error(
      data.error_description || data.error || "GitHub did not return a token",
    );
  }
  return data.access_token;
}

export async function fetchGithubLogin(
  token: string,
): Promise<{ login: string; name: string | null; avatarUrl: string | null }> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "DiffyBot/0.1 (+https://diffy.app; visual-review)",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error("Could not load GitHub user");
  }
  const data = (await res.json()) as {
    login?: string;
    name?: string | null;
    avatar_url?: string | null;
  };
  if (!data.login) throw new Error("GitHub user missing login");
  return {
    login: data.login,
    name: data.name ?? null,
    avatarUrl: data.avatar_url ?? null,
  };
}

export function readAccessTokenFromCookie(
  cookieHeader: string | null,
): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${GH_TOKEN_COOKIE}=`));
  if (!match) return null;
  const raw = decodeURIComponent(match.slice(GH_TOKEN_COOKIE.length + 1));
  return unsealValue(raw);
}

export function tokenCookieOptions(maxAge = TOKEN_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function stateCookieOptions(maxAge = STATE_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export { TOKEN_MAX_AGE_SEC };
