import type { SegmentKey } from "@/features/waterfall/bar-segments";

/** How a part of a bar looks and what it stands for. */
export interface SegmentStyle {
  label: string;
  /** Where the time went, as the tooltip says it. */
  hop: string;
  fill: string;
}

const KEYWORD_SOFT = "bg-[color-mix(in_srgb,var(--color-syntax-keyword)_55%,var(--color-bg))]";
const TYPE_SOFT = "bg-[color-mix(in_srgb,var(--color-syntax-type)_55%,var(--color-bg))]";

/** Each part of a request's bar, as the Waterfall draws and names it. */
export const SEGMENT_STYLE: Readonly<Record<SegmentKey, SegmentStyle>> = {
  "client-to-proxy": {
    label: "Client → Proxy",
    hop: "Caller → Courier proxy",
    fill: "bg-syntax-type",
  },
  "middleware-in": { label: "Middleware in", hop: "Before the fetch", fill: "bg-syntax-keyword" },
  middleware: { label: "Middleware", hop: "Around the fetch", fill: "bg-syntax-keyword" },
  fetch: { label: "Fetch", hop: "To the upstream and back", fill: "bg-brand" },
  validation: { label: "Validation", hop: "Schema check", fill: "bg-syntax-number" },
  "middleware-out": { label: "Middleware out", hop: "After the fetch", fill: KEYWORD_SOFT },
  checks: { label: "Checks", hop: "A webhook's signature and schema", fill: "bg-syntax-number" },
  handler: { label: "Handler", hop: "The app's webhook handler", fill: "bg-brand" },
  other: { label: "Other", hop: "Time no phase accounts for", fill: "bg-fg-subtle/45" },
  "proxy-to-client": { label: "Proxy → Client", hop: "Courier proxy → caller", fill: TYPE_SOFT },
  "in-flight": {
    label: "In flight",
    hop: "Awaiting the response",
    fill: "bg-warn animate-pulse-live",
  },
  aborted: { label: "Aborted", hop: "Cancelled by the caller", fill: "bg-fg-subtle" },
};

/** The parts the legend names, in the order a proxied request goes through them. */
export const LEGEND_SEGMENTS = [
  "client-to-proxy",
  "middleware-in",
  "fetch",
  "validation",
  "middleware-out",
  "proxy-to-client",
] as const satisfies readonly SegmentKey[];

/** The parts a webhook delivered to the app adds to the legend while one is in view. */
export const WEBHOOK_LEGEND_SEGMENTS = [
  "checks",
  "handler",
] as const satisfies readonly SegmentKey[];
