/**
 * The site's server as its container runs it, put together after `next
 * build` from its standalone output: the backend the live examples call,
 * bundled with its dependencies into one file Node runs alone; the launcher
 * that starts both servers; and the assets Next's server serves from
 * beside it. `npm run build` runs it, and both the image and the examples'
 * end-to-end tests run what it makes, so they run the same server.
 */
import { cp } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { build } from "esbuild"

const at = (path) => fileURLToPath(new URL(path, import.meta.url))
const standalone = at("../.next/standalone/")

await build({
  entryPoints: [at("./index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  logLevel: "warning",
  outfile: `${standalone}backend.cjs`,
})
await cp(at("./launch.mjs"), `${standalone}launch.mjs`)
await cp(at("../.next/static"), `${standalone}docs/.next/static`, { recursive: true })
await cp(at("../public"), `${standalone}docs/public`, { recursive: true })
