import { githubAuthHeaders, type PullRequestInfo } from "@/lib/github-pr";
import { assertSafePublicUrl } from "@/lib/ssrf";

export type ResolvedPrSiteUrls = {
  previewUrl: string;
  baseUrl: string;
  pagePath: string;
  previewSource: string;
  baseSource: string;
};

export type ResolvePrSiteUrlsOptions = {
  token?: string;
  pagePath?: string;
  previewUrl?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

type DeploymentJson = {
  id: number;
  environment?: string;
  production_environment?: boolean;
};

type DeploymentStatusJson = {
  state?: string;
  environment_url?: string;
  target_url?: string;
};

type CommitStatusJson = {
  state?: string;
  context?: string;
  target_url?: string;
  description?: string;
};

type RepoJson = {
  homepage?: string | null;
};

const SKIP_HOSTS = new Set([
  "github.com",
  "www.github.com",
  "api.github.com",
  "gist.github.com",
  "vercel.com",
  "www.vercel.com",
  "app.netlify.com",
]);

export function normalizePagePath(raw: string | undefined): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "/";
  const withoutOrigin = trimmed.replace(/^https?:\/\/[^/]+/i, "");
  const path = withoutOrigin.startsWith("/")
    ? withoutOrigin
    : `/${withoutOrigin}`;
  const noQuery = path.split("?")[0].split("#")[0];
  if (noQuery === "/" || noQuery === "") return "/";
  return noQuery.replace(/\/+$/, "") || "/";
}

export function applyPagePath(siteUrl: string, pagePath: string): string {
  const url = new URL(siteUrl);
  url.pathname = normalizePagePath(pagePath);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function toRouteSegment(seg: string): string {
  if (!seg || seg.startsWith("[") || seg.startsWith("(") || seg.startsWith("@")) {
    return seg;
  }
  return seg.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function toRoutePath(segments: string[]): string {
  const segs = segments.map(toRouteSegment).filter(Boolean);
  return segs.length ? `/${segs.join("/")}` : "/";
}

/** Paths added in the PR patch (React Router, routes-manifest, PAGE_PATH). */
export function inferRoutesFromPatches(
  files: { filename: string; patch?: string }[],
): string[] {
  const fromRouter = new Set<string>();
  const fromManifest = new Set<string>();

  for (const file of files) {
    const patch = file.patch;
    if (!patch) continue;
    const name = file.filename.replace(/\\/g, "/");

    for (const rawLine of patch.split("\n")) {
      if (!rawLine.startsWith("+") || rawLine.startsWith("+++")) continue;
      const line = rawLine.slice(1);

      if (/(?:^|\/)(App|router)\.(t|j)sx$/i.test(name)) {
        const route = line.match(/<Route\s+path=["'`](\/[^"'`*]*)["'`]/);
        if (route && !/element=\{<Navigate\b/.test(line)) {
          fromRouter.add(normalizePagePath(route[1].toLowerCase()));
        }
      }

      if (/routes-manifest\.json$/i.test(name)) {
        const quoted = line.match(/^\s*"(\/[-a-zA-Z0-9_/]*)"\s*,?\s*$/);
        if (quoted) fromManifest.add(normalizePagePath(quoted[1].toLowerCase()));
      }
    }
  }

  if (fromRouter.size === 1) return [...fromRouter];
  if (fromManifest.size === 1) return [...fromManifest];
  return [];
}

export function inferPagePath(
  files: { filename: string; patch?: string }[],
): string {
  const fromPatch = inferRoutesFromPatches(files);
  if (fromPatch.length === 1) return fromPatch[0];

  const routes = new Set<string>();
  for (const file of files) {
    const route = routeFromFilename(file.filename);
    if (route) routes.add(route);
  }
  if (routes.size === 1) return [...routes][0];
  return "/";
}

export function routeFromFilename(filename: string): string | null {
  const n = filename.replace(/\\/g, "/");

  const appPage = n.match(/(?:^|\/)app\/((?:[^/]+\/)*)page\.(?:t|j)sx$/);
  if (appPage) {
    const segs = appPage[1]
      .split("/")
      .filter((s) => s && !s.startsWith("(") && !s.startsWith("@"));
    return toRoutePath(segs);
  }

  const pagesFile = n.match(/(?:^|\/)pages\/(.+)\.(?:t|j)sx$/);
  if (pagesFile) {
    let p = pagesFile[1];
    if (p.startsWith("api/") || p.startsWith("_")) return null;
    if (/^index$/i.test(p) || /\/index$/i.test(p)) {
      p = p.replace(/\/index$/i, "").replace(/^index$/i, "");
      return p ? toRoutePath(p.split("/")) : "/";
    }
    return toRoutePath(p.split("/"));
  }

  return null;
}

export function isVercelPreviewUrl(raw: string | undefined | null): boolean {
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === "vercel.app" || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

export function pickSiteUrl(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    const host = url.hostname.toLowerCase();
    if (SKIP_HOSTS.has(host) || host.endsWith(".github.com")) return undefined;
    url.hash = "";
    url.search = "";
    if (url.pathname === "/") url.pathname = "";
    return url.toString().replace(/\/$/, "") || url.origin;
  } catch {
    return undefined;
  }
}

function isPreviewHint(value: string | undefined): boolean {
  const v = (value || "").toLowerCase();
  return (
    v.includes("preview") ||
    v.includes("staging") ||
    v.includes("-git-") ||
    v.includes("pr-")
  );
}

function isProductionHint(value: string | undefined): boolean {
  const v = (value || "").toLowerCase();
  return (
    v === "production" ||
    v === "prod" ||
    v.includes("production") ||
    (!v.includes("preview") && !v.includes("staging") && v.includes("prod"))
  );
}

function apiUrl(owner: string, repo: string, path: string): string {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`;
}

async function githubJson<T>(
  url: string,
  headers: HeadersInit,
  fetchImpl: typeof fetch,
  label: string,
): Promise<T | null> {
  const res = await fetchImpl(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${label} failed (${res.status})${body ? `: ${body.slice(0, 180)}` : ""}`,
    );
  }
  return (await res.json()) as T;
}

export async function resolvePrSiteUrls(
  pr: Pick<PullRequestInfo, "owner" | "repo" | "headSha"> & {
    files: { filename: string }[];
  },
  opts: ResolvePrSiteUrlsOptions = {},
): Promise<ResolvedPrSiteUrls> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const pagePath = opts.pagePath?.trim()
    ? normalizePagePath(opts.pagePath)
    : inferPagePath(pr.files);

  const overridePreview = pickSiteUrl(opts.previewUrl);
  const overrideBase = pickSiteUrl(opts.baseUrl);

  let previewUrl = overridePreview;
  let previewSource = overridePreview ? "override" : "";
  let baseUrl = overrideBase;
  let baseSource = overrideBase ? "override" : "";

  if (!previewUrl || !baseUrl) {
    const resolved = await fetchGithubSiteUrls(pr, opts.token, fetchImpl);
    if (!previewUrl && resolved.previewUrl) {
      previewUrl = resolved.previewUrl;
      previewSource = resolved.previewSource;
    }
    if (!baseUrl && resolved.baseUrl) {
      baseUrl = resolved.baseUrl;
      baseSource = resolved.baseSource;
    }
  }

  if (!previewUrl) {
    throw new Error(
      "Could not find a preview URL for this PR. Wait for the deploy, or paste a preview URL.",
    );
  }

  if (!baseUrl) {
    baseUrl = previewUrl;
    baseSource = baseSource || "preview";
  }

  const previewWithPath = applyPagePath(previewUrl, pagePath);
  const baseWithPath = applyPagePath(baseUrl, pagePath);
  assertSafePublicUrl(previewWithPath);
  assertSafePublicUrl(baseWithPath);

  return {
    previewUrl: previewWithPath,
    baseUrl: baseWithPath,
    pagePath,
    previewSource: previewSource || "github",
    baseSource: baseSource || "github",
  };
}

async function fetchGithubSiteUrls(
  pr: Pick<PullRequestInfo, "owner" | "repo" | "headSha">,
  token: string | undefined,
  fetchImpl: typeof fetch,
): Promise<{
  previewUrl?: string;
  previewSource: string;
  baseUrl?: string;
  baseSource: string;
}> {
  const headers = githubAuthHeaders(token);
  const sha = pr.headSha;

  const [headDeployments, productionDeployments, commitStatuses, repo] =
    await Promise.all([
      sha
        ? githubJson<DeploymentJson[]>(
            apiUrl(pr.owner, pr.repo, `/deployments?sha=${encodeURIComponent(sha)}&per_page=15`),
            headers,
            fetchImpl,
            "GitHub deployments",
          )
        : Promise.resolve(null),
      githubJson<DeploymentJson[]>(
        apiUrl(pr.owner, pr.repo, `/deployments?per_page=20`),
        headers,
        fetchImpl,
        "GitHub production deployments",
      ),
      sha
        ? githubJson<CommitStatusJson[]>(
            apiUrl(pr.owner, pr.repo, `/commits/${encodeURIComponent(sha)}/statuses?per_page=100`),
            headers,
            fetchImpl,
            "GitHub commit statuses",
          )
        : Promise.resolve(null),
      githubJson<RepoJson>(
        apiUrl(pr.owner, pr.repo, ""),
        headers,
        fetchImpl,
        "GitHub repository",
      ),
    ]);

  const headUrls = await collectDeploymentUrls(
    pr,
    headDeployments ?? [],
    headers,
    fetchImpl,
  );
  const productionOnly = (productionDeployments ?? [])
    .filter(
      (d) =>
        Boolean(d.production_environment) || isProductionHint(d.environment),
    )
    .slice(0, 5);
  const prodUrls = await collectDeploymentUrls(
    pr,
    productionOnly,
    headers,
    fetchImpl,
  );

  const statusUrls = (commitStatuses ?? [])
    .map((s) => ({
      url: pickSiteUrl(s.target_url),
      preview: isPreviewHint(s.context) || isPreviewHint(s.description),
      production: isProductionHint(s.context),
      context: s.context || "",
    }))
    .filter((s): s is typeof s & { url: string } => Boolean(s.url));

  const previewUrl =
    headUrls.find((u) => u.preview)?.url ||
    statusUrls.find((u) => u.preview)?.url ||
    headUrls[0]?.url ||
    statusUrls[0]?.url;

  const homepage = pickSiteUrl(repo?.homepage ?? undefined);
  const baseUrl =
    homepage ||
    prodUrls.find((u) => u.production)?.url ||
    prodUrls[0]?.url ||
    statusUrls.find((u) => u.production)?.url;

  return {
    previewUrl,
    previewSource: previewUrl
      ? headUrls.some((u) => u.url === previewUrl)
        ? "deployment"
        : "commit-status"
      : "",
    baseUrl,
    baseSource: homepage
      ? "homepage"
      : prodUrls.some((u) => u.url === baseUrl)
        ? "production-deployment"
        : baseUrl
          ? "commit-status"
          : "",
  };
}

async function collectDeploymentUrls(
  pr: Pick<PullRequestInfo, "owner" | "repo">,
  deployments: DeploymentJson[],
  headers: HeadersInit,
  fetchImpl: typeof fetch,
): Promise<Array<{ url: string; preview: boolean; production: boolean }>> {
  const slice = deployments.slice(0, 8);
  const rows = await Promise.all(
    slice.map(async (dep) => {
      const statuses = await githubJson<DeploymentStatusJson[]>(
        apiUrl(pr.owner, pr.repo, `/deployments/${dep.id}/statuses?per_page=8`),
        headers,
        fetchImpl,
        "GitHub deployment statuses",
      );
      const withUrl =
        (statuses ?? []).find(
          (s) =>
            s.state === "success" && (s.environment_url || s.target_url),
        ) ||
        (statuses ?? []).find((s) => s.environment_url || s.target_url);
      const url =
        pickSiteUrl(withUrl?.environment_url) ||
        pickSiteUrl(withUrl?.target_url);
      if (!url) return null;
      const env = dep.environment || "";
      return {
        url,
        preview: isPreviewHint(env) || isPreviewHint(url),
        production: Boolean(dep.production_environment) || isProductionHint(env),
      };
    }),
  );
  return rows.filter((row): row is NonNullable<typeof row> => Boolean(row));
}
