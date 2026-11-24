/** GitHub pull request companion — public API, optional token for private repos. */

export type PrFileChange = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  /** Raw unified diff patch when GitHub provides it */
  patch?: string;
  /** Basename, e.g. hero.webp */
  basename: string;
  /** Likely web path if under public/ or similar */
  webPaths: string[];
  isMedia: boolean;
};

export type PullRequestInfo = {
  url: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  state: string;
  headRef: string;
  baseRef: string;
  files: PrFileChange[];
};

export type ParsedPrRef = {
  owner: string;
  repo: string;
  number: number;
  url: string;
};

const MEDIA_EXT = /\.(avif|bmp|gif|jpe?g|png|svg|webp|mp4|webm|mov|ico)$/i;
const MAX_FILES = 100;

export function parseGithubPrUrl(raw: string): ParsedPrRef {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("PR URL is required");
  if (trimmed.length > 500) throw new Error("PR URL is too long");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Invalid PR URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("PR URL must be http(s)");
  }

  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    throw new Error("Only github.com pull request URLs are supported for now");
  }

  // /owner/repo/pull/123 or /owner/repo/pulls/123
  const m = url.pathname.match(
    /^\/([^/]+)\/([^/]+)\/pulls?\/(\d+)(?:\/|$)/i,
  );
  if (!m) {
    throw new Error(
      "Expected a URL like https://github.com/owner/repo/pull/123",
    );
  }

  const owner = m[1];
  const repo = m[2].replace(/\.git$/i, "");
  const number = Number(m[3]);
  if (!Number.isFinite(number) || number < 1) {
    throw new Error("Invalid pull request number");
  }

  return {
    owner,
    repo,
    number,
    url: `https://github.com/${owner}/${repo}/pull/${number}`,
  };
}

function basenameOf(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function webPathsFor(filename: string): string[] {
  const out = new Set<string>();
  const base = basenameOf(filename);
  out.add(base);

  const normalized = filename.replace(/^\/+/, "");
  out.add("/" + normalized);
  out.add(normalized);

  // Next.js / static site convention
  if (normalized.startsWith("public/")) {
    const rest = normalized.slice("public/".length);
    out.add("/" + rest);
    out.add(rest);
  }
  if (normalized.startsWith("static/")) {
    const rest = normalized.slice("static/".length);
    out.add("/" + rest);
    out.add(rest);
  }
  // src/assets/foo.png → still match basename + full path suffixes
  out.add(filename);

  return [...out];
}

function authHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "DiffyBot/0.1 (+https://diffy.app; visual-review)",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const envToken =
    token ||
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    undefined;
  if (envToken) {
    headers.Authorization = `Bearer ${envToken}`;
  }
  return headers;
}

export async function fetchPullRequestInfo(
  prUrl: string,
  opts: { token?: string } = {},
): Promise<PullRequestInfo> {
  const ref = parseGithubPrUrl(prUrl);
  const headers = authHeaders(opts.token);
  const base = `https://api.github.com/repos/${ref.owner}/${ref.repo}`;

  const [prRes, filesRes] = await Promise.all([
    fetch(`${base}/pulls/${ref.number}`, { headers }),
    fetch(`${base}/pulls/${ref.number}/files?per_page=${MAX_FILES}`, {
      headers,
    }),
  ]);

  if (prRes.status === 404 || filesRes.status === 404) {
    throw new Error(
      "Pull request not found (private repo? connect GitHub on the home page)",
    );
  }
  if (prRes.status === 401 || filesRes.status === 401) {
    throw new Error(
      "GitHub authentication failed — reconnect GitHub on the home page",
    );
  }
  if (prRes.status === 403 || filesRes.status === 403) {
    throw new Error(
      "GitHub API rate limit or permission denied — reconnect GitHub or try again",
    );
  }
  if (!prRes.ok) {
    throw new Error(`GitHub PR lookup failed (${prRes.status})`);
  }
  if (!filesRes.ok) {
    throw new Error(`GitHub PR files lookup failed (${filesRes.status})`);
  }

  const pr = (await prRes.json()) as {
    title?: string;
    state?: string;
    html_url?: string;
    head?: { ref?: string };
    base?: { ref?: string };
  };
  const filesJson = (await filesRes.json()) as Array<{
    filename?: string;
    status?: string;
    additions?: number;
    deletions?: number;
    patch?: string;
  }>;

  if (!Array.isArray(filesJson)) {
    throw new Error("Unexpected GitHub files response");
  }

  const files: PrFileChange[] = filesJson
    .filter((f) => typeof f.filename === "string" && f.filename.length > 0)
    .map((f) => {
      const filename = f.filename as string;
      return {
        filename,
        status: f.status || "modified",
        additions: f.additions ?? 0,
        deletions: f.deletions ?? 0,
        patch: typeof f.patch === "string" ? f.patch : undefined,
        basename: basenameOf(filename),
        webPaths: webPathsFor(filename),
        isMedia: MEDIA_EXT.test(filename),
      };
    });

  return {
    url: pr.html_url || ref.url,
    owner: ref.owner,
    repo: ref.repo,
    number: ref.number,
    title: pr.title || `Pull request #${ref.number}`,
    state: pr.state || "open",
    headRef: pr.head?.ref || "",
    baseRef: pr.base?.ref || "",
    files,
  };
}
