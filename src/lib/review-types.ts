export type ChangeKind = "copy" | "image" | "layout";

export type ChangeContent = {
  text?: string;
  imageSrc?: string;
  imageAlt?: string;
};

export type ReviewChange = {
  id: string;
  kind: ChangeKind;
  label: string;
  description: string;
  /** Matches data-diffy-id injected into proxied after HTML */
  selector: string;
  before: ChangeContent;
  after: ChangeContent;
};

export type ReviewRun = {
  id: string;
  createdAt: string;
  baseUrl: string;
  previewUrl: string;
  pageUrl: string;
  pageTitle?: string;
  changes: ReviewChange[];
  status: "ready" | "error";
  error?: string;
  /** Stored for same-origin proxy; not always sent to the client */
  beforeHtml?: string;
  afterHtml?: string;
  /** Vercel Protection Bypass — server-only, never sent to the client */
  protectionBypass?: string;
};

export type ReviewRunPublic = Omit<
  ReviewRun,
  "beforeHtml" | "afterHtml" | "protectionBypass"
>;
