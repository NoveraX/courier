import { highlightTokens } from "@/site/code/highlight-tokens"
import { CourierMark } from "@/site/courier-mark"
import { InstallButton } from "@/site/landing/install-button"
import { PageLink } from "@/site/landing/page-link"
import { CALLS_FILE, SOURCES_FILE } from "./hero-code"
import { HeroEditor } from "./hero-editor"

const RING =
  "relative animate-rise rounded-[15px] bg-[linear-gradient(180deg,rgb(125_185_255/0.45),rgb(255_255_255/0.08)_38%,rgb(255_255_255/0.04))] p-px shadow-[0_50px_120px_-50px_rgb(var(--site-shadow-rgb)/calc(0.95*var(--site-shadow-alpha)))]"

/**
 * The top of the landing page: what Courier is in one line, the two ways
 * in, and an editor where calls are typed against a definition.
 *
 * @returns The section
 * @example
 * ```tsx
 * <HeroSection />
 * ```
 */
export async function HeroSection() {
  const [sources, calls] = await Promise.all([
    highlightTokens(SOURCES_FILE.join("\n"), "ts"),
    highlightTokens(CALLS_FILE.join("\n"), "ts"),
  ])
  return (
    <section className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-50 left-1/2 h-155 w-[1100px] max-w-[150vw] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgb(125_185_255/0.1),transparent_62%)]"
      />
      <div className="relative mx-auto max-w-[1200px] px-5 pt-18 text-center">
        <div className="inline-flex h-7 items-center gap-2.25 rounded-full border border-line bg-panel px-3 text-small text-fg-muted">
          <span className="text-brand">
            <CourierMark width={13} />
          </span>
          <span aria-hidden="true" className="h-3 w-px bg-line-strong" />
          Inferred types · no schema files · any backend
        </div>
        <h1 className="mx-auto mt-6 mb-0 max-w-[17ch] animate-rise text-[clamp(38px,5.8vw,72px)] leading-[1.02] font-semibold tracking-[-0.042em]">
          Type-safe HTTP for <span className="text-brand">any</span> framework
        </h1>
        <p className="mx-auto mt-5 mb-0 max-w-[58ch] animate-rise text-[clamp(15.5px,1.5vw,18.5px)] leading-[1.58] text-fg-muted">
          Define your API once in plain TypeScript. Get end-to-end inference, one proxy route for
          every endpoint, React Query bindings and middleware — against any REST backend, which
          needs zero changes.
        </p>
        <div className="mt-7.5 flex animate-rise flex-wrap justify-center gap-2.5">
          <PageLink
            href="/docs/quick-start"
            className="flex h-10.5 items-center rounded-[9px] bg-fg px-5 text-[14.5px] font-medium text-bg hover:text-bg hover:opacity-86"
          >
            Start in 60 seconds
          </PageLink>
          <InstallButton look="hero" />
        </div>
      </div>
      <div className="relative mx-auto mt-13 max-w-[1100px] px-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-15 left-1/2 h-55 w-4/5 -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgb(125_185_255/0.16),transparent_70%)] blur-[20px]"
        />
        <div className={RING}>
          <HeroEditor sources={sources} calls={calls} />
        </div>
      </div>
    </section>
  )
}
