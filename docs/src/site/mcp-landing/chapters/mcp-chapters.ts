import { Activity, ListChecks, ShieldAlert, ShieldCheck } from "lucide-react"

import type { ChapterContent } from "@/site/studio-landing/chapters/chapters"

/** One of the MCP server's chapters. */
export interface McpChapter extends ChapterContent {
  id: "scope" | "policy" | "confirm" | "record"
}

/**
 * The MCP server's four chapters, in the page's order: what becomes a
 * tool, who may do what, the person's confirmation, and the record.
 *
 * @example
 * ```ts
 * MCP_CHAPTERS.map((c) => c.id) // ["scope", "policy", "confirm", "record"]
 * ```
 */
export const MCP_CHAPTERS: readonly McpChapter[] = [
  {
    id: "scope",
    eyebrow: "SCOPE",
    icon: ListChecks,
    tone: "teal",
    title: "Only what you offer becomes a tool",
    text: "An agent sees the endpoints you offered — each marked .agent(), or every read in one line of config — and never what your config denies: not the export your nightly job calls, not the admin purge.",
    points: [
      { title: "Typed tools", detail: "from the schemas each endpoint already has." },
      {
        title: "Hints a client acts on:",
        detail: "read, write or destructive, so it knows when to ask.",
      },
      {
        title: "Checked at start:",
        detail: "a policy it cannot read, or a write offered as a read, stops the server, not a model.",
      },
    ],
    cta: {
      label: "What agents may call",
      href: "/docs/agents/overview#what-agents-may-call",
      external: false,
    },
    visual: "right",
  },
  {
    id: "policy",
    eyebrow: "POLICY",
    icon: ShieldCheck,
    tone: "blue",
    title: "Your middleware decides who may do what",
    text: "An agent's call runs through the middleware your app's calls run through, with ctx.agent saying which agent asked and for whom. There is no second path to forget to protect.",
    points: [
      {
        title: "One set of rules",
        detail: "— auth, rate limits and audit apply to agents as written.",
      },
      {
        title: "Tools per caller:",
        detail: "one a principal may not use is absent from its list.",
      },
      {
        title: "No borrowed sessions:",
        detail: "an agent carries no browser's cookies, only what you grant.",
      },
    ],
    cta: {
      label: "Write an agent policy",
      href: "/docs/agents/overview#who-may-do-what-middleware",
      external: false,
    },
    visual: "left",
  },
  {
    id: "confirm",
    eyebrow: "CONFIRMATION",
    icon: ShieldAlert,
    tone: "red",
    title: "A person says yes before anything is undone",
    text: "A destructive tool runs only once the person at the client has confirmed that exact call. The question goes to the person — text an API returns to the model cannot answer it.",
    points: [
      {
        title: "The exact call,",
        detail: "its arguments checked by the schema before anyone is asked.",
      },
      {
        title: "Signed and bound:",
        detail: "a yes counts for one tool, those arguments, five minutes.",
      },
      {
        title: "Stateless:",
        detail: "under MCP 2026-07-28 it travels with the call, so any replica finishes it.",
      },
    ],
    cta: {
      label: "How confirmation works",
      href: "/docs/agents/overview#a-person-confirms-what-cannot-be-undone",
      external: false,
    },
    visual: "right",
  },
  {
    id: "record",
    eyebrow: "STUDIO",
    icon: Activity,
    tone: "violet",
    title: "Every agent call, on the record",
    text: "Studio shows an agent's calls beside your app's own — the tool, the client, the variables, the middleware, the answer. A refusal is a row, not a gap.",
    points: [
      { title: "Marked agent,", detail: "with one filter to see them alone." },
      {
        title: "Refusals included:",
        detail: "a declined confirmation, a policy's 403, bad arguments.",
      },
      {
        title: "The principal stays home:",
        detail: "Studio is told the tool and the client, never who.",
      },
    ],
    cta: {
      label: "Watch it in Studio",
      href: "/docs/agents/editor#watch-it-in-studio",
      external: false,
    },
    visual: "left",
  },
]
