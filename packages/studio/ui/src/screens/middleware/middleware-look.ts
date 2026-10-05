import type { LucideIcon } from "lucide-react";
import { DatabaseZap, Gauge, KeyRound, RotateCcw, ScrollText, Tags, Workflow } from "lucide-react";

import type { MiddlewarePhase } from "@/features/middleware/middleware-phase";

/** How a middleware is drawn: its icon, its colour, and a line on what it does. */
export interface MiddlewareLook {
  icon: LucideIcon;
  /** A text colour class; its tile, bar and swatches take it as `currentColor`. */
  tone: string;
  description: string;
}

/* Colours handed out in chain order, so a middleware keeps its colour across the page. */
const PALETTE = [
  "text-syntax-keyword",
  "text-syntax-type",
  "text-ok",
  "text-warn",
  "text-brand",
  "text-syntax-number",
  "text-method-post",
  "text-err",
] as const;

/* Courier's own middleware, by the name it reports. */
const BUILT_IN = new Map<string, { icon: LucideIcon; description: string }>([
  [
    "auth",
    { icon: KeyRound, description: "Sets the authorization header; renews the token on a 401" },
  ],
  ["cache", { icon: DatabaseZap, description: "Answers reads from a response it stored" }],
  ["retry", { icon: RotateCcw, description: "Sends a failed call again, with backoff" }],
  ["log", { icon: ScrollText, description: "Logs each call and how it ended" }],
  ["rateLimit", { icon: Gauge, description: "Holds calls to a number per time window" }],
  ["headerVariables", { icon: Tags, description: "Sends variables as headers" }],
]);

const PHASE_LINE: Readonly<Record<MiddlewarePhase, string>> = {
  before: "Runs before the fetch",
  after: "Runs after the fetch",
  wrap: "Runs around the fetch",
};

/**
 * How a middleware is drawn: Courier's own by their icon and what they
 * do, any other by where it runs — each in the colour of its place in the
 * chain.
 *
 * @param name - Its name
 * @param place - Its place in the chain, from 0
 * @param phase - Where it runs
 * @returns Its look
 * @example
 * ```ts
 * lookOf("retry", 3, "wrap").description; // "Sends a failed call again, with backoff"
 * ```
 */
export function lookOf(name: string, place: number, phase: MiddlewarePhase): MiddlewareLook {
  const known = BUILT_IN.get(name);
  return {
    icon: known?.icon ?? Workflow,
    tone: PALETTE[place % PALETTE.length] ?? "text-brand",
    description: known?.description ?? PHASE_LINE[phase],
  };
}
