import { SITE_PAGES } from "@/site/seo/site-pages"
import type { PackageFacts } from "./site-nodes"

/** Courier itself: the core package, which the home page is about. */
export const COURIER_PACKAGE = {
  path: SITE_PAGES.home.path,
  name: "Courier",
  packageName: "@noverax/courier",
  description: SITE_PAGES.home.description,
  directory: "packages/core",
  runtimes: ["Node.js", "Bun", "Deno", "Cloudflare Workers", "Web browsers", "React Native"],
} as const satisfies PackageFacts

/** Courier Studio, which its page is about. */
export const STUDIO_PACKAGE = {
  path: SITE_PAGES.studio.path,
  name: "Courier Studio",
  packageName: "@noverax/courier-studio",
  description: SITE_PAGES.studio.description,
  directory: "packages/studio",
} as const satisfies PackageFacts

/** Courier's MCP server, which its page is about. */
export const MCP_PACKAGE = {
  path: SITE_PAGES.mcp.path,
  name: "Courier MCP server",
  packageName: "@noverax/courier-mcp",
  description: SITE_PAGES.mcp.description,
  directory: "packages/mcp",
} as const satisfies PackageFacts
