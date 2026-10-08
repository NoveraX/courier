import type { LucideIcon } from "lucide-react"
import { Activity, Flame, Network, ShieldCheck } from "lucide-react"

import { STUDIO_DEMO_URL } from "@/site/site-url"

/** A chapter of a product page: what one part does, three things it does well, and where to go next. */
export interface ChapterContent {
  id: string
  eyebrow: string
  icon: LucideIcon
  tone: "blue" | "teal" | "red" | "amber" | "violet" | "green"
  title: string
  text: string
  points: readonly { title: string; detail: string }[]
  /** Where to go next: another site — the live demo — opens in a tab of its own. */
  cta: { label: string; href: string; external?: boolean }
  /** Which side the visual sits on, from 900 px. */
  visual: "right" | "left"
}

/** One of Studio's chapters: what a group of its views does, and where to see it in the live demo. */
export interface Chapter extends ChapterContent {
  id: "inspect" | "explore" | "mock" | "audit"
  tone: "blue" | "teal" | "red" | "amber"
}

/**
 * Studio's four chapters, in the page's order.
 *
 * @example
 * ```ts
 * CHAPTERS.map((c) => c.id) // ["inspect", "explore", "mock", "audit"]
 * ```
 */
export const CHAPTERS: readonly Chapter[] = [
  {
    id: "inspect",
    eyebrow: "INSPECT",
    icon: Activity,
    tone: "blue",
    title: "Every call, live, with its full story",
    text: "Timeline streams requests as they happen — HTTP, SSE and WebSockets. Waterfall shows how they overlap, down to middleware, fetch and validation.",
    points: [
      {
        title: "Live stream",
        detail: "with pause, pinning and filters by status, source and transport.",
      },
      {
        title: "One detail panel",
        detail: "for response trees, headers, timing, snippets and errors.",
      },
      { title: "Replay and copy", detail: "any call as cURL, fetch or a typed Courier call." },
    ],
    cta: { label: "Open Timeline", href: `${STUDIO_DEMO_URL}/timeline` },
    visual: "right",
  },
  {
    id: "explore",
    eyebrow: "EXPLORE",
    icon: Network,
    tone: "teal",
    title: "Your whole API surface on one map",
    text: "Explorer turns courier.config.ts into a live graph of sources, groups and endpoints — colored by latency, errors or traffic.",
    points: [
      { title: "Health at a glance", detail: "with animated edges wherever traffic is flowing." },
      { title: "Heatmaps", detail: "show which endpoints degrade and when." },
      { title: "Playground", detail: "sends typed requests straight from any endpoint." },
    ],
    cta: { label: "Open Explorer", href: `${STUDIO_DEMO_URL}/explorer` },
    visual: "left",
  },
  {
    id: "mock",
    eyebrow: "MOCK & CHAOS",
    icon: Flame,
    tone: "red",
    title: "Build against a backend that isn’t there yet",
    text: "Generate mock servers from your schemas, script scenarios like “checkout fails”, then dial in latency and faults to see how the UI copes.",
    points: [
      {
        title: "Schema-driven mocks",
        detail: "with a stateful store you can edit, kept between restarts.",
      },
      {
        title: "Scenarios",
        detail: "swap handlers for empty states, auth expiry or payment errors.",
      },
      { title: "Chaos presets", detail: "from Degraded to Down, plus a custom fault mix." },
    ],
    cta: { label: "Open Mocks", href: `${STUDIO_DEMO_URL}/mocks` },
    visual: "right",
  },
  {
    id: "audit",
    eyebrow: "QUALITY",
    icon: ShieldCheck,
    tone: "amber",
    title: "A code review for your network layer",
    text: "Audit scores the session across performance, reliability, security and best practices — with the exact fix for each finding.",
    points: [
      {
        title: "Pattern detection",
        detail: "for N+1 calls, duplicates and sequential waterfalls.",
      },
      {
        title: "Middleware profiler",
        detail: "shows what every auth, retry and logger step costs.",
      },
      { title: "Compare", detail: "diffs two calls to pinpoint what changed." },
    ],
    cta: { label: "Open Audit", href: `${STUDIO_DEMO_URL}/audit` },
    visual: "left",
  },
]
