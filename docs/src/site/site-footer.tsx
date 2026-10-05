import Link from "next/link"

/**
 * The foot of a page: the licence, and the way home, to the docs and to
 * the repository.
 *
 * @returns The footer
 * @example
 * ```tsx
 * <SiteFooter />
 * ```
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1400px] flex-wrap justify-between gap-4 px-6 py-6.5 text-control text-fg-subtle">
        <span>© 2026 NoveraX · MIT</span>
        <span className="flex gap-5.5">
          <Link href={"/"} className="hover:text-fg">
            Home
          </Link>
          <Link href={"/docs/introduction"} className="hover:text-fg">
            Docs
          </Link>
          <a
            href="https://github.com/NoveraX/courier"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-fg"
          >
            GitHub
          </a>
        </span>
      </div>
    </footer>
  )
}
