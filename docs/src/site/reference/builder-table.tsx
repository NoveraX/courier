import { Hammer } from "lucide-react"

import { cn } from "@/site/cn"
import type { BuilderVerb } from "@/site/content/reference-modules"

const TONE: Readonly<Record<BuilderVerb["tone"], string>> = {
  get: "text-verb-get",
  post: "text-verb-post",
  put: "text-verb-put",
  del: "text-verb-del",
  muted: "text-fg-subtle",
}

/**
 * How an endpoint begins, as the reference's last section: each starter
 * of the builder, the kind of call it makes, and what it is for.
 *
 * @param props - The starters
 * @returns The section
 * @example
 * ```tsx
 * <BuilderTable verbs={BUILDER_VERBS} />
 * ```
 */
export function BuilderTable({ verbs }: { verbs: readonly BuilderVerb[] }) {
  return (
    <section id="builder" className="mt-7 scroll-mt-[70px] border-t border-line pt-11">
      <h2 className="m-0 flex items-center gap-2.5 text-[24px] font-semibold tracking-[-0.03em] text-fg">
        <span className="grid size-7.5 place-items-center rounded-control border border-line bg-bg-subtle text-fg-muted">
          <Hammer aria-hidden="true" className="size-3.75" />
        </span>
        Endpoint builder
      </h2>
      <p className="m-0 mt-3.25 mb-5 max-w-[64ch] text-body text-fg-muted">
        Starters returning a chainable descriptor. <code>.variables()</code> and{" "}
        <code>.response()</code> carry the types to every call site; <code>.via(probe)</code> works
        the address out from the variables.
      </p>
      <div className="overflow-hidden rounded-panel border border-line bg-panel">
        {verbs.map(({ method, call, desc, tone }) => (
          <div
            key={method}
            className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-3.25 last:border-b-0 hover:bg-bg-subtle"
          >
            <span
              className={cn(
                "min-w-17.5 rounded-chip bg-current/12 py-0.75 text-center font-mono text-micro font-semibold tracking-[0.06em]",
                TONE[tone]
              )}
            >
              {method}
            </span>
            <span className="min-w-45 font-mono text-small text-fg">{call}</span>
            <span className="text-[14px] text-fg-muted">{desc}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
