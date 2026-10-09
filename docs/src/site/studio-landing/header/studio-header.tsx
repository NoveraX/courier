import { PageHeader } from "@/site/landing/header/page-header"
import { STUDIO_DEMO_URL } from "@/site/site-url"
import { STUDIO_INSTALL } from "@/site/studio-landing/hero/studio-hero"
import { StudioWordmark } from "./studio-wordmark"

/**
 * The bar across the top of Studio's page: its name, the docs and
 * Courier's two products with Studio marked as this page, the way back to
 * the Courier library, the menu on a narrow screen, the colour theme, the
 * repository and the live demo.
 *
 * @returns The header and its menu
 * @example
 * ```tsx
 * <StudioHeader />
 * ```
 */
export function StudioHeader() {
  return (
    <PageHeader
      page="/studio"
      brand={<StudioWordmark />}
      brandLabel="Courier Studio"
      action={{ label: "Open demo", href: STUDIO_DEMO_URL }}
      install={STUDIO_INSTALL}
    />
  )
}
