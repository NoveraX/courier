/**
 * Studio's setup on its page, for the package manager picked: the one
 * command that sets it up, the scripts it adds that start Studio and the
 * app, and the words for doing it by hand — Studio started by the
 * package's full name wherever the runner would fetch from npm, the
 * project's own copy otherwise.
 */
import { describe, expect, it } from "vitest"

import { managerOf, PACKAGE_MANAGERS } from "@/site/studio-landing/setup/setup-data"

describe("Studio's setup for a package manager", () => {
  it("sets Studio up with the one command, and starts it and the app with the scripts it adds", () => {
    expect(managerOf("npm")).toMatchObject({
      setup: ["npx", "@noverax/create-courier"],
      studio: "npm run studio",
      dev: "npm run dev",
    })
    expect(managerOf("pnpm").setup.join(" ")).toBe("pnpm create @noverax/courier")
    expect(managerOf("yarn").setup.join(" ")).toBe("yarn create @noverax/courier")
    expect(managerOf("bun").setup.join(" ")).toBe("bun create @noverax/courier")
  })

  it("adds and starts Studio by hand, by its full package name wherever the runner fetches from npm", () => {
    expect(managerOf("pnpm")).toMatchObject({
      add: "pnpm add -D",
      run: ["pnpm exec", "courier-studio"],
    })
    for (const { run } of PACKAGE_MANAGERS) {
      const [runner, target] = run
      expect(
        runner === "pnpm exec" || runner === "yarn" || target === "@noverax/courier-studio"
      ).toBe(true)
    }
  })

  it("falls back to npm's words for a manager the setup does not offer", () => {
    expect(managerOf("deno")).toBe(PACKAGE_MANAGERS[0])
  })
})
