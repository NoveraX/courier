/**
 * The Studio webpack plugin, against a compiler holding webpack's normalized
 * entries.
 */
import { describe, expect, it } from "vitest";

import { courierStudio as webpackStudio } from "../src/plugins/webpack";

type EntryFunction = () => Promise<Record<string, unknown>>;

describe("courierStudio() for webpack", () => {
  it("connects the main entry in webpack's normalized form", async () => {
    const compiler = {
      options: { entry: { main: { import: ["./src/main.js"] } } as unknown, target: "web" },
    };

    webpackStudio({ enabled: true }).apply(compiler);
    const entries = await (compiler.options.entry as EntryFunction)();

    const main = entries.main as { import: string[] };
    expect(main.import).toHaveLength(2);
    expect(main.import[1]).toBe("./src/main.js");
  });
});
