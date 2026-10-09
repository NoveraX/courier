/**
 * Studio's setup on its page, for the package manager picked: the words
 * that install it, start it — by the package's full name wherever the
 * runner would fetch from npm, the project's own copy otherwise — and start
 * the app beside it.
 */
import { describe, expect, it } from "vitest"

import { managerOf, PACKAGE_MANAGERS } from "@/site/studio-landing/setup/setup-data"

describe("Studio's setup for a package manager", () => {
  it("installs, starts Studio and starts the app as that manager does", () => {
    expect(managerOf("pnpm")).toMatchObject({
      add: "pnpm add -D",
      run: ["pnpm exec", "courier-studio"],
      dev: "pnpm dev",
    })
    expect(managerOf("bun").run.join(" ")).toBe("bunx @noverax/courier-studio")
  })

  it("starts Studio by its full package name wherever the runner fetches from npm", () => {
    for (const { run } of PACKAGE_MANAGERS) {
      const [runner, target] = run
      expect(runner === "pnpm exec" || target === "@noverax/courier-studio").toBe(true)
    }
  })

  it("falls back to npm's words for a manager the setup does not offer", () => {
    expect(managerOf("yarn")).toBe(PACKAGE_MANAGERS[0])
    expect(managerOf("yarn").run.join(" ")).toBe("npx @noverax/courier-studio")
  })
})
