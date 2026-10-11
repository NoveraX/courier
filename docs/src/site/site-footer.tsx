import Link from "next/link"

/**
 * The foot of every docs and reference page: the licence, and the way
 * home, to the docs, to the API reference, to Studio's and the MCP
 * server's pages, to the VS Code extension and to the repository.
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
      <div className="mx-auto flex max-w-[1520px] flex-wrap justify-between gap-4 px-6 py-6.5 text-control text-fg-subtle">
        <span>© 2026 NoveraX · MIT</span>
        <span className="flex flex-wrap gap-x-5.5 gap-y-2">
          <Link href={"/"} className="hover:text-fg">
            Home
          </Link>
          <Link href={"/docs/introduction"} className="hover:text-fg">
            Docs
          </Link>
          <Link href={"/reference"} className="hover:text-fg">
            API
          </Link>
          <Link href={"/studio"} className="hover:text-fg">
            Studio
          </Link>
          <Link href={"/mcp"} className="hover:text-fg">
            MCP
          </Link>
          <Link href={"/docs/studio/editor"} className="hover:text-fg">
            VS Code
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
