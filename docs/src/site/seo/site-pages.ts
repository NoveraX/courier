import { CONSENT_PATH, PRIVACY_PATH } from "@/site/legal/legal-paths"

/** A page of the site besides the docs: what its tab, search result and social card say. */
export interface SitePage {
  /** The page's address, which is also its canonical URL. */
  path: string
  /** The title, whole: a tab and a search result show it as written, with no suffix. */
  title: string
  description: string
  /** What the page's social card says: a line above, and a headline. */
  card: { eyebrow: string; headline: string }
}

/** The landing pages, the API reference and the legal pages, by name. */
export const SITE_PAGES = {
  home: {
    path: "/",
    title: "Courier — type-safe HTTP client for TypeScript",
    description:
      "Define your API once in plain TypeScript and call it from any framework: end-to-end types, one proxy route for every endpoint, React Query hooks, any REST API.",
    card: { eyebrow: "Courier", headline: "Type-safe HTTP for any framework" },
  },
  studio: {
    path: "/studio",
    title: "Courier Studio — API debugger and mock server for TypeScript",
    description:
      "A visual debugger for your API layer: inspect live traffic, replay calls, mock backends, inject failures and audit quality — in one tab beside your dev server.",
    card: { eyebrow: "Courier Studio", headline: "See every request your app makes" },
  },
  mcp: {
    path: "/mcp",
    title: "Courier MCP server — your REST API as tools for AI agents",
    description:
      "Courier serves the endpoints you mark over MCP to Claude Code, Cursor and any client: typed from your schemas, a person confirming what cannot be undone.",
    card: { eyebrow: "Courier MCP server", headline: "Your API, as tools for AI agents" },
  },
  reference: {
    path: "/reference",
    title: "API reference — Courier Docs",
    description:
      "Every export the docs describe: where to import it from, its signature, the fields it takes and an example.",
    card: { eyebrow: "API reference", headline: "Every export, its signature and an example" },
  },
  privacy: {
    path: PRIVACY_PATH,
    title: "Privacy notice — Courier",
    description: "What this site collects, why, and the choices you have.",
    card: { eyebrow: "Courier", headline: "Privacy notice" },
  },
  consent: {
    path: CONSENT_PATH,
    title: "Consent to analytics — Courier",
    description: "What you agree to by choosing Accept, and how to withdraw.",
    card: { eyebrow: "Courier", headline: "Consent to analytics" },
  },
} as const satisfies Record<string, SitePage>
