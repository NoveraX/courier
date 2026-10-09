import { styleFor } from "@noverax/courier/internal";
import { describe, expect, it } from "vitest";

import type { Terminal } from "../src/add-courier";
import { wantsMcp } from "../src/wants-mcp";

function terminalThat(interactive: boolean): Terminal {
  return { interactive, style: styleFor(undefined), print: () => undefined };
}

describe("wantsMcp", () => {
  it("follows --mcp and --no-mcp without asking", async () => {
    const at = terminalThat(true);

    expect(await wantsMcp({ mcp: true }, at)).toBe(true);
    expect(await wantsMcp({ mcp: false }, at)).toBe(false);
  });

  it("leaves the MCP server out, without asking, where no one can answer, with --yes, and with --dry-run", async () => {
    expect(await wantsMcp({}, terminalThat(false))).toBe(false);
    expect(await wantsMcp({ yes: true }, terminalThat(true))).toBe(false);
    expect(await wantsMcp({ "dry-run": true }, terminalThat(true))).toBe(false);
  });
});
