/** A column of the landing page's footer: its heading and links. */
export interface FooterColumn {
  heading: string
  /** A page of the site (`/docs/…`), a section of this page (`#…`) or an outside address. */
  links: readonly { label: string; href: string }[]
}

const REPO = "https://github.com/NoveraX/courier"

/**
 * The footer links of the landing page and the MCP server's page, in four columns.
 *
 * @example
 * ```ts
 * FOOTER_COLUMNS.map((c) => c.heading) // ["DOCUMENTATION", "FRAMEWORKS", "RESOURCES", "COMMUNITY"]
 * ```
 */
export const FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    heading: "DOCUMENTATION",
    links: [
      { label: "Quick start", href: "/docs/quick-start" },
      { label: "API reference", href: "/reference" },
      { label: "Middleware", href: "/docs/middleware/overview" },
      { label: "AI agents", href: "/docs/agents/overview" },
      { label: "Testing", href: "/docs/testing/test-client" },
    ],
  },
  {
    heading: "FRAMEWORKS",
    links: [
      { label: "Next.js", href: "/docs/frameworks/nextjs" },
      { label: "Nuxt", href: "/docs/frameworks/nuxt" },
      { label: "Hono", href: "/docs/frameworks/hono" },
      { label: "Express", href: "/docs/frameworks/express" },
      { label: "Fastify", href: "/docs/frameworks/fastify" },
      { label: "NestJS", href: "/docs/frameworks/nestjs" },
    ],
  },
  {
    heading: "RESOURCES",
    links: [
      { label: "Changelog", href: `${REPO}/releases` },
      { label: "Issues", href: `${REPO}/issues` },
      { label: "Discussions", href: `${REPO}/discussions` },
      { label: "Compare", href: "/#compare" },
    ],
  },
  {
    heading: "COMMUNITY",
    links: [
      { label: "GitHub", href: REPO },
      { label: "npm", href: "https://www.npmjs.com/package/@noverax/courier" },
      { label: "Contributing", href: `${REPO}/blob/main/CONTRIBUTING.md` },
    ],
  },
]
