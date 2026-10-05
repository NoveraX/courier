import type { LucideIcon } from "lucide-react"
import { ChartColumn, Command, GitCompare, Globe, Play, Workflow } from "lucide-react"

const EXTRAS: readonly { title: string; text: string; icon: LucideIcon; tone: string }[] = [
  {
    title: "Analytics",
    text: "Latency distribution, status breakdown and per-endpoint percentiles for the session.",
    icon: ChartColumn,
    tone: "text-tone-blue bg-tone-blue/13",
  },
  {
    title: "Playground",
    text: "Pick any endpoint, edit typed variables with schema hints, send and subscribe.",
    icon: Play,
    tone: "text-ok bg-ok/13",
  },
  {
    title: "API import",
    text: "Generate typed sources from OpenAPI or Postman and review spec updates as diffs.",
    icon: Globe,
    tone: "text-tone-teal bg-tone-teal/13",
  },
  {
    title: "Middleware",
    text: "Trace the chain for any request and see which step adds the most overhead.",
    icon: Workflow,
    tone: "text-tone-violet bg-tone-violet/13",
  },
  {
    title: "Compare",
    text: "Side-by-side diffs of responses, headers, timing and variables.",
    icon: GitCompare,
    tone: "text-warn bg-warn/13",
  },
  {
    title: "⌘K everywhere",
    text: "Jump to any view, recent request or action from the command palette.",
    icon: Command,
    tone: "text-fg-muted bg-fg-muted/13",
  },
]

/**
 * The rest of Studio's views, a tile each, all reading the same requests.
 *
 * @returns The section
 * @example
 * ```tsx
 * <ExtrasSection />
 * ```
 */
export function ExtrasSection() {
  return (
    <section aria-labelledby="extras" className="pt-[clamp(77px,13vw,128px)]">
      <div className="mx-auto max-w-[1200px] px-5">
        <h2
          id="extras"
          className="m-0 max-w-[20ch] text-[clamp(27px,3.3vw,40px)] leading-[1.08] font-semibold tracking-[-0.035em]"
        >
          And everything around it
        </h2>
        <p className="mt-3.5 mb-8.5 max-w-[54ch] text-[16px] leading-[1.6] text-fg-muted">
          Twelve views that share one request model — click a call anywhere and the same detail
          panel opens.
        </p>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-px overflow-hidden rounded-2xl border border-line bg-line p-0 min-[900px]:grid-cols-3">
          {EXTRAS.map(({ title, text, icon: Icon, tone }) => (
            <li key={title} className="flex min-h-42.5 flex-col gap-3 bg-panel p-5.5">
              <span className={`grid size-8.5 place-items-center rounded-[10px] ${tone}`}>
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <span className="text-[15px] font-semibold tracking-[-0.015em]">{title}</span>
              <span className="text-nav leading-[1.55] text-fg-muted">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
