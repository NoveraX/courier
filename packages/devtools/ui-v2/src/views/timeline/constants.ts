import type { RequestStatus } from "@/store/types";

// ── Status visual config ───────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  dot: string;
  text: string;
  bg: string;
}

export const STATUS_CONFIG: Record<RequestStatus, StatusConfig> = {
  pending: {
    label: "Pending",
    dot: "bg-amber-400 animate-pulse",
    text: "text-amber-400",
    bg: "bg-amber-400/10",
  },
  success: {
    label: "Success",
    dot: "bg-emerald-400",
    text: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
  error: {
    label: "Error",
    dot: "bg-rose-400",
    text: "text-rose-400",
    bg: "bg-rose-400/10",
  },
  aborted: {
    label: "Aborted",
    dot: "bg-zinc-400",
    text: "text-zinc-400",
    bg: "bg-zinc-400/10",
  },
  validation_error: {
    label: "Validation",
    dot: "bg-orange-400",
    text: "text-orange-400",
    bg: "bg-orange-400/10",
  },
};

// ── HTTP Method colors (for non-badge inline usage) ────────────────────────

export const HTTP_METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-400",
  POST: "text-sky-400",
  PUT: "text-amber-400",
  PATCH: "text-violet-400",
  DELETE: "text-rose-400",
  HEAD: "text-cyan-400",
  OPTIONS: "text-orange-400",
};

// ── Detail panel tab keys ──────────────────────────────────────────────────

export const DETAIL_TABS = [
  { key: "general", label: "General" },
  { key: "headers", label: "Headers" },
  { key: "payload", label: "Payload" },
  { key: "response", label: "Response" },
  { key: "timing", label: "Timing" },
  { key: "error", label: "Error" },
  { key: "proxy", label: "Proxy" },
] as const;

export type DetailTabKey = (typeof DETAIL_TABS)[number]["key"];

// ── Virtual list ───────────────────────────────────────────────────────────

export const ROW_HEIGHT = 36;
export const OVERSCAN = 15;
