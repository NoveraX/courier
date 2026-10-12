import { CourierMark } from "@/site/courier-mark"
import { TopLink } from "@/site/top-link"
import { FOOTER_COLUMNS } from "./footer-columns"
import { InstallButton } from "./install-button"
import { PageLink } from "./page-link"

/* The gap between links is shared out to them, so a finger has more to land on. */
const LINK = "-my-1.25 py-1.25 text-nav text-fg-muted hover:text-fg"

/**
 * The landing page's footer: Courier in a line with its install command,
 * four columns of links, and the licence with what Courier needs to run.
 *
 * @param props - The version of Courier released
 * @returns The footer
 * @example
 * ```tsx
 * <LandingFooter version="0.0.0" />
 * ```
 */
export function LandingFooter({ version }: { version: string }) {
  return (
    <footer className="mt-27.5 border-t border-line bg-bg-subtle">
      <div className="mx-auto max-w-[1200px] px-5 pt-14">
        <div className="grid grid-cols-1 gap-10 min-[900px]:grid-cols-[minmax(0,320px)_minmax(0,1fr)] min-[900px]:gap-16">
          <div className="flex max-w-80 flex-col gap-4">
            <TopLink
              href="/"
              className="-my-1 flex items-center gap-2.25 py-1 text-fg hover:text-fg"
            >
              <CourierMark width={19} />
              <span className="text-[15px] font-semibold tracking-[-0.02em]">courier</span>
            </TopLink>
            <p className="m-0 text-nav leading-[1.6] text-fg-muted">
              Type-safe HTTP for any framework and any REST backend. One definition, every caller.
            </p>
            <InstallButton look="footer" />
          </div>
          <div className="grid grid-cols-2 gap-8 min-[700px]:grid-cols-4">
            {FOOTER_COLUMNS.map((column) => (
              <nav
                key={column.heading}
                aria-label={column.heading.toLowerCase()}
                className="flex min-w-0 flex-col gap-2.75"
              >
                <p className="m-0 mb-0.75 font-mono text-micro tracking-[0.08em] text-fg-subtle">
                  {column.heading}
                </p>
                {column.links.map((link) =>
                  link.href.startsWith("http") ? (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={LINK}
                    >
                      {link.label}
                    </a>
                  ) : (
                    <PageLink key={link.label} href={link.href} className={LINK}>
                      {link.label}
                    </PageLink>
                  )
                )}
              </nav>
            ))}
          </div>
        </div>
        <div className="mt-13 flex flex-wrap items-center justify-between gap-3.5 border-t border-line pt-5.5 pb-6.5 text-small text-fg-subtle">
          <span>© 2026 NoveraX · Released under the MIT licence</span>
          <span className="font-mono text-[11px] tracking-normal">
            v{version} · TypeScript 6.0+ · Node ≥ 22
          </span>
        </div>
      </div>
    </footer>
  )
}
