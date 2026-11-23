export type ChangeKind = "copy" | "image" | "layout";

export type ChangeContent = {
  text?: string;
  imageSrc?: string;
  imageAlt?: string;
};

export type DemoChange = {
  id: string;
  kind: ChangeKind;
  label: string;
  description: string;
  selector: string;
  before: ChangeContent;
  after: ChangeContent;
};

export const DEMO_PR = {
  title: "Northline spring landing refresh",
  branch: "marketing/spring-refresh",
  base: "main",
  pageName: "northline.co /",
};

export const DEMO_CHANGES: DemoChange[] = [
  {
    id: "hero-headline",
    kind: "copy",
    label: "Hero headline",
    description: "Sharper seasonal positioning above the fold.",
    selector: "hero-headline",
    before: { text: "Gear built for the long trail." },
    after: { text: "Pack light. Stay out longer." },
  },
  {
    id: "hero-image",
    kind: "image",
    label: "Hero image",
    description: "Swapped stock ridge shot for spring camp photography.",
    selector: "hero-image",
    before: {
      imageSrc: "/demo/hero-before.svg",
      imageAlt: "Muted ridge line at dusk",
    },
    after: {
      imageSrc: "/demo/hero-after.svg",
      imageAlt: "Sunlit alpine camp with pack and tent",
    },
  },
  {
    id: "hero-cta",
    kind: "copy",
    label: "Primary CTA",
    description: "CTA now matches the new campaign offer.",
    selector: "hero-cta",
    before: { text: "Shop packs" },
    after: { text: "Shop the spring kit" },
  },
  {
    id: "feature-body",
    kind: "copy",
    label: "Feature body copy",
    description: "Tightened the weatherproofing story.",
    selector: "feature-body",
    before: {
      text: "Our shells keep you dry when the forecast turns. Layer up and keep moving.",
    },
    after: {
      text: "Three-layer shells that breathe on the climb and seal when the squall hits.",
    },
  },
  {
    id: "press-strip",
    kind: "layout",
    label: "Press strip added",
    description: "New social-proof row under the feature grid.",
    selector: "press-strip",
    before: { text: "(section missing)" },
    after: {
      text: "As seen in Outside, Trail Runner, and Wirecutter.",
    },
  },
];
