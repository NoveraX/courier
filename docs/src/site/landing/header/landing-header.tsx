import { CourierMark } from "@/site/courier-mark"
import { START_COMMAND } from "@/site/landing/install-button"
import { PageHeader } from "./page-header"

/**
 * The bar across the top of the landing page: Courier's mark and version,
 * the docs and Courier's two products with pages of their own — Studio and
 * the MCP server, marked new — the menu on a narrow screen, the colour
 * theme, the repository and the way in.
 *
 * @param props - The version of Courier released
 * @returns The header and its menu
 * @example
 * ```tsx
 * <LandingHeader version="0.0.0" />
 * ```
 */
export function LandingHeader({ version }: { version: string }) {
  return (
    <PageHeader
      page="/"
      brand={
        <>
          <CourierMark width={19} />
          <span className="text-[14.5px] font-semibold tracking-[-0.02em]">courier</span>
          <span className="rounded-[5px] border border-line px-1.25 py-0.5 font-mono text-micro text-fg-subtle">
            {version}
          </span>
        </>
      }
      action={{ label: "Get started", href: "/docs/quick-start" }}
      install={START_COMMAND}
    />
  )
}
