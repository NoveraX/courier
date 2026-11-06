import { describe, expect, it } from "vitest";

import { ToolOutputReader } from "../../src/apply/tool-output";
import { SETUP_LIMITS } from "../../src/limits";

function linesOf(chunks: readonly string[]): string[] {
  const lines: string[] = [];
  const reader = new ToolOutputReader((line) => lines.push(line));
  for (const chunk of chunks) reader.push(chunk);
  reader.end();
  return lines;
}

describe("ToolOutputReader", () => {
  it("hands each line over whole, however the chunks cut it, without its line end", () => {
    expect(linesOf(["src/a.ts(1,2): err", "or TS2322: x\r", "\n  more\nlast"])).toEqual([
      "src/a.ts(1,2): error TS2322: x",
      "  more",
      "last",
    ]);
  });

  it("hands over empty lines, and nothing for output that ends with its line end", () => {
    expect(linesOf(["a\n\nb\n"])).toEqual(["a", "", "b"]);
  });

  it("cuts a line past the longest one read whole, and reads the next one from its start", () => {
    const long = "x".repeat(SETUP_LIMITS.lineChars + 10);

    const lines = linesOf([long.slice(0, 1000), `${long.slice(1000)}\nnext\n`]);

    expect(lines.map((line) => line.length)).toEqual([SETUP_LIMITS.lineChars, 4]);
    expect(lines[1]).toBe("next");
  });

  it("keeps only the end of what was printed", () => {
    const reader = new ToolOutputReader();

    for (let at = 0; at < 100; at++)
      reader.push(`${String(at).padStart(3, "0")}${"-".repeat(4096)}\n`);

    expect(reader.tail.length).toBe(SETUP_LIMITS.tailChars);
    expect(reader.tail.endsWith(`099${"-".repeat(4096)}\n`)).toBe(true);
  });
});
