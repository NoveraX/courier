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

/** The landing pages and the API reference, by name. */
export const SITE_PAGES = {
  home: {
    path: "/",
    title: "@noverax/courier — type-safe HTTP for any framework, any REST backend",
    description:
      "Define your API once in plain TypeScript. Get end-to-end inference, one proxy route for every endpoint, React Query bindings and middleware — against any REST backend, which needs zero changes.",
    card: { eyebrow: "Courier", headline: "Type-safe HTTP for any framework" },
  },
  studio: {
    path: "/studio",
    title: "Courier Studio — see every request your app makes",
    description:
      "Courier Studio is a visual debugger for your API layer. Inspect live traffic, replay calls, mock backends, inject failures and audit quality — from one tab next to your dev server.",
    card: { eyebrow: "Courier Studio", headline: "See every request your app makes" },
  },
  mcp: {
    path: "/mcp",
    title: "Courier MCP server — your API, as tools for AI agents",
    description:
      "Mark the endpoints an agent may call. Courier serves them over MCP to Claude Code, Cursor and every MCP client — typed from your schemas, run through your middleware, confirmed by a person before anything is undone.",
    card: { eyebrow: "Courier MCP server", headline: "Your API, as tools for AI agents" },
  },
  reference: {
    path: "/reference",
    title: "API reference — Courier Docs",
    description:
      "Every export the docs describe: where to import it from, its signature, the fields it takes and an example.",
    card: { eyebrow: "API reference", headline: "Every export, its signature and an example" },
  },
} as const satisfies Record<string, SitePage>
