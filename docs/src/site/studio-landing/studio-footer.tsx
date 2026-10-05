import { PageLink } from "@/site/landing/page-link"
import { STUDIO_DEMO_URL } from "@/site/site-url"
import { StudioWordmark } from "./header/studio-wordmark"

const REPO = "https://github.com/NoveraX/courier"

const COLUMNS = [
  {
    heading: "Studio",
    links: [
      { label: "Live demo", href: STUDIO_DEMO_URL },
      { label: "Setup", href: "#setup" },
      { label: "Mock servers", href: "/docs/studio/mock-servers" },
      { label: "Import an API", href: "/docs/studio/import-api" },
    ],
  },
  {
    heading: "Courier",
    links: [
      { label: "Overview", href: "/" },
      { label: "Docs", href: "/docs/introduction" },
      { label: "API reference", href: "/reference" },
    ],
  },
  {
    heading: "Project",
    links: [
      { label: "GitHub", href: REPO },
      { label: "npm", href: "https://www.npmjs.com/package/@noverax/courier-studio" },
      { label: "MIT License", href: `${REPO}/blob/main/LICENSE` },
    ],
  },
]

/**
 * Studio's page's footer: its name and licence, and three columns of
 * links.
 *
 * @returns The footer
 * @example
 * ```tsx
 * <StudioFooter />
 * ```
 */
export function StudioFooter() {
  return (
    <footer className="mt-[clamp(72px,12vw,120px)] border-t border-line bg-bg-subtle">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-9 px-5 pt-13 pb-10 min-[600px]:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
        <div className="flex flex-col gap-3">
          <StudioWordmark />
          <span className="max-w-[34ch] text-control leading-[1.55] text-fg-subtle">
            The visual debugger for @noverax/courier. MIT licensed.
          </span>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.heading} aria-label={column.heading} className="flex flex-col gap-2.5">
            <span className="text-label font-semibold text-fg-muted">{column.heading}</span>
            {column.links.map((link) =>
              link.href.startsWith("http") ? (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-control text-fg-subtle hover:text-fg"
                >
                  {link.label}
                </a>
              ) : (
                <PageLink
                  key={link.label}
                  href={link.href}
                  className="text-control text-fg-subtle hover:text-fg"
                >
                  {link.label}
                </PageLink>
              )
            )}
          </nav>
        ))}
      </div>
    </footer>
  )
}
