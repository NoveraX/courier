import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

/* The site's own logic — what pages read as, what search finds — tested
   from the repository's test run. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { name: "docs", include: ["tests/**/*.test.ts"], environment: "node" },
})
