/**
 * Courier Studio's commands run in a terminal with each argument whole,
 * whatever it holds: an address with a query, a path with spaces or a
 * quote — single quotes on macOS and Linux, double quotes on Windows.
 */
import { describe, expect, it } from "vitest";

import { shellWord } from "../src/generate/studio-cli";

describe("an argument for the terminal", () => {
  it("stays as it is when the shell reads it as one word", () => {
    expect(shellWord("import")).toBe("import");
    expect(shellWord("@noverax/courier-studio")).toBe("@noverax/courier-studio");
    expect(shellWord("origin/main", "linux")).toBe("origin/main");
  });

  it("is quoted whole on macOS and Linux, a quote of its own kept", () => {
    expect(shellWord("https://api.example/openapi.json?v=1&x=2", "darwin")).toBe(
      "'https://api.example/openapi.json?v=1&x=2'",
    );
    expect(shellWord("/work/my shop/it's.yaml", "linux")).toBe("'/work/my shop/it'\\''s.yaml'");
  });

  it("is quoted whole on Windows, a double quote doubled", () => {
    expect(shellWord('C:\\work\\my "shop".yaml', "win32")).toBe('"C:\\work\\my ""shop"".yaml"');
  });
});
