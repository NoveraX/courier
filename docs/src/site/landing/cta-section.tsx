import { PageLink } from "./page-link"

/**
 * The landing page's last word: one line, and the two ways in.
 *
 * @returns The section
 * @example
 * ```tsx
 * <CtaSection />
 * ```
 */
export function CtaSection() {
  return (
    <section className="pt-27.5">
      <div className="relative mx-auto max-w-[1200px] px-5 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-15 left-1/2 h-90 w-[820px] max-w-[140vw] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgb(125_185_255/0.09),transparent_65%)]"
        />
        <h2 className="relative mx-auto my-0 max-w-[17ch] animate-rise text-[clamp(29px,4.2vw,52px)] leading-[1.04] font-semibold tracking-[-0.04em]">
          Your next API call could be the last one you type by hand
        </h2>
        <div className="relative mt-7 flex flex-wrap justify-center gap-2.5">
          <PageLink
            href="/docs/quick-start"
            className="flex h-10.5 items-center rounded-[9px] bg-fg px-5 text-[14.5px] font-medium text-bg hover:text-bg hover:opacity-86"
          >
            Quick start
          </PageLink>
          <PageLink
            href="/reference"
            className="flex h-10.5 items-center rounded-[9px] border border-line bg-panel px-5 text-[14.5px] text-fg-muted hover:border-line-strong hover:text-fg"
          >
            API reference
          </PageLink>
        </div>
      </div>
    </section>
  )
}
