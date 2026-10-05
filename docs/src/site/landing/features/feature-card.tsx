import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/site/cn"
import { CodeLines } from "@/site/code/code-lines"
import type { CodeToken } from "@/site/code/highlight-tokens"

/** A feature's colour, as the landing page's tones name them. */
export type FeatureTone = "blue" | "green" | "teal" | "violet" | "amber" | "red"

interface FeatureCardProps {
  tone: FeatureTone
  icon: LucideIcon
  eyebrow: string
  title: string
  text: string
  /** The code that turns the feature on, highlighted. */
  snippet: readonly CodeToken[][]
  /** How many of the grid's columns it spans: two from two columns on, or only at three. */
  span: "one" | "two" | "two-at-three"
  /** The feature, running. */
  children: ReactNode
}

const SPAN = {
  one: "",
  two: "min-[700px]:col-span-2",
  "two-at-three": "min-[1000px]:col-span-2",
} as const

/**
 * One feature as a card: the feature running on a dotted stage lit in its
 * colour, then what it is and the code that turns it on. Hovering lifts it
 * and rings it in its colour.
 *
 * @param props - The feature's colour, words, code and demo
 * @returns The card
 * @example
 * ```tsx
 * <FeatureCard tone="blue" icon={CloudUpload} eyebrow="UPLOADS" title="…" text="…" snippet={snippet} span="two">
 *   <UploadDemo />
 * </FeatureCard>
 * ```
 */
export function FeatureCard({
  tone,
  icon: Icon,
  eyebrow,
  title,
  text,
  snippet,
  span,
  children,
}: FeatureCardProps) {
  return (
    <article
      data-tone={tone}
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-[linear-gradient(180deg,var(--color-panel),var(--color-bg-subtle))] transition-[border-color,transform,box-shadow] duration-250 hover:-translate-y-0.5 hover:border-[rgb(var(--tone-rgb)/0.42)] hover:shadow-[0_24px_60px_-34px_rgb(var(--tone-rgb)/0.55)]",
        SPAN[span]
      )}
    >
      <div className="dots relative flex min-h-57.5 items-center justify-center overflow-hidden border-b border-line p-5.5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_90%_at_50%_0%,rgb(var(--tone-rgb)/0.15),transparent_70%)]"
        />
        <div className="relative w-full min-w-0">{children}</div>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 px-6 pt-5.5 pb-6">
        <p className="m-0 flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] text-(--tone)">
          <Icon aria-hidden="true" className="size-3.5" />
          {eyebrow}
        </p>
        <h3 className="m-0 text-[19px] leading-[1.25] font-semibold tracking-[-0.022em]">
          {title}
        </h3>
        <p className="m-0 max-w-[52ch] text-callout text-fg-muted">{text}</p>
        <div className="mt-auto pt-2">
          <CodeLines
            lines={snippet}
            className="m-0 overflow-x-auto rounded-[9px] border border-line bg-bg px-3 py-2.5 text-[11.8px] leading-[1.6] text-code-plain"
          />
        </div>
      </div>
    </article>
  )
}
