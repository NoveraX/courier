import { ArrowRight, Check } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/site/cn"
import { PageLink } from "@/site/landing/page-link"
import type { Chapter } from "./chapters"

/**
 * One of Studio's chapters: what it does, three things it does well and
 * where to read on, beside a visual of it running — the sides swapping
 * from one chapter to the next.
 *
 * @param props - The chapter, and its visual
 * @returns The section
 * @example
 * ```tsx
 * <ChapterSection chapter={CHAPTERS[0]}><WaterfallViz /></ChapterSection>
 * ```
 */
export function ChapterSection({ chapter, children }: { chapter: Chapter; children: ReactNode }) {
  const Icon = chapter.icon
  const left = chapter.visual === "left"
  return (
    <section id={chapter.id} data-tone={chapter.tone} className="pt-[clamp(72px,12vw,120px)]">
      <div
        className={cn(
          "mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-10 px-5",
          left
            ? "min-[900px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
            : "min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
        )}
      >
        <div className={cn("flex min-w-0 flex-col gap-4", left && "min-[900px]:order-2")}>
          <p className="m-0 flex items-center gap-2 font-mono text-[11px] tracking-[0.1em] text-(--tone)">
            <Icon aria-hidden="true" className="size-3.25" />
            {chapter.eyebrow}
          </p>
          <h2 className="m-0 max-w-[17ch] text-[clamp(28px,3.4vw,42px)] leading-[1.06] font-semibold tracking-[-0.035em]">
            {chapter.title}
          </h2>
          <p className="m-0 max-w-[46ch] text-[16px] leading-[1.62] text-fg-muted">
            {chapter.text}
          </p>
          <ul className="m-0 mt-1.5 flex list-none flex-col gap-2.5 p-0">
            {chapter.points.map((point) => (
              <li key={point.title} className="flex items-start gap-2.75">
                <span className="mt-px grid size-5 shrink-0 place-items-center rounded-chip bg-[color-mix(in_srgb,var(--tone)_14%,transparent)] text-(--tone)">
                  <Check aria-hidden="true" className="size-2.75" strokeWidth={2.6} />
                </span>
                <span className="text-[14px] leading-[1.55] text-fg-muted">
                  <span className="font-[550] text-fg">{point.title}</span> {point.detail}
                </span>
              </li>
            ))}
          </ul>
          <PageLink
            href={chapter.cta.href}
            className="mt-2 flex items-center gap-1.75 self-start text-[14px] font-[550] text-(--tone) hover:text-(--tone) hover:underline"
          >
            {chapter.cta.label}
            <ArrowRight aria-hidden="true" className="size-3.25" />
          </PageLink>
        </div>
        <div className="relative min-w-0">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-[10%] inset-x-[5%] bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--tone)_16%,transparent),transparent_70%)] blur-[30px]"
          />
          {children}
        </div>
      </div>
    </section>
  )
}
