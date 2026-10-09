/** A column of the landing page's footer: its heading and links. */
export interface FooterColumn {
  heading: string
  /** A page of the site (`/docs/…`), a section of the landing page (`/#…`) or an outside address. */
  links: readonly { label: string; href: string }[]
}

const REPO = "https://github.com/NoveraX/courier"

/**
 * The footer links of the landing page, in four columns: Courier's
 * products, the docs most read, the frameworks, and the project's places
 * on GitHub and npm. The product pages have footers of their own.
 *
 * @example
 * ```ts
 * FOOTER_COLUMNS.map((c) => c.heading) // ["PRODUCT", "DOCUMENTATION", "FRAMEWORKS", "COMMUNITY"]
 * ```
 */
export const FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    heading: "PRODUCT",
    links: [
      { label: "Courier Studio", href: "/studio" },
      { label: "MCP server", href: "/mcp" },
      { label: "Studio in your editor", href: "/docs/studio/editor" },
      { label: "Compare", href: "/#compare" },
    ],
  },
  {
    heading: "DOCUMENTATION",
    links: [
      { label: "Quick start", href: "/docs/quick-start" },
      { label: "Middleware", href: "/docs/middleware/overview" },
      { label: "AI agents", href: "/docs/agents/overview" },
      { label: "Testing", href: "/docs/testing/test-client" },
      { label: "Security model", href: "/docs/security/overview" },
      { label: "API reference", href: "/reference" },
    ],
  },
  {
    heading: "FRAMEWORKS",
    links: [
      { label: "Next.js", href: "/docs/frameworks/nextjs" },
      { label: "Nuxt", href: "/docs/frameworks/nuxt" },
      { label: "SvelteKit", href: "/docs/frameworks/sveltekit" },
      { label: "Express", href: "/docs/frameworks/express" },
      { label: "Hono", href: "/docs/frameworks/hono" },
      { label: "React Native", href: "/docs/frameworks/react-native" },
      { label: "All frameworks", href: "/docs/frameworks/overview" },
    ],
  },
  {
    heading: "COMMUNITY",
    links: [
      { label: "GitHub", href: REPO },
      { label: "npm", href: "https://www.npmjs.com/package/@noverax/courier" },
      { label: "Changelog", href: `${REPO}/releases` },
      { label: "Issues", href: `${REPO}/issues` },
      { label: "Discussions", href: `${REPO}/discussions` },
      { label: "Contributing", href: `${REPO}/blob/master/CONTRIBUTING.md` },
    ],
  },
]
