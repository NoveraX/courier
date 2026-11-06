import { styleFor } from "@noverax/courier/internal";
import { describe, expect, it } from "vitest";

import type { Questions } from "../src/questions/questions";
import { textReport } from "../src/report/text-report";
import type { SetupIO } from "../src/setup-io";
import { wantsMcp } from "../src/wants-mcp";
import { scripted } from "./questions/scripted-questions";

function terminalThat(questions: Questions | undefined): SetupIO {
  return {
    questions,
    report: textReport(styleFor(undefined), () => undefined),
    toolOutput: "stdout",
  };
}

describe("wantsMcp", () => {
  it("follows --mcp and --no-mcp without asking", async () => {
    const at = terminalThat(scripted([]));

    expect(await wantsMcp({ mcp: true }, at)).toBe(true);
    expect(await wantsMcp({ mcp: false }, at)).toBe(false);
  });

  it("asks the person at the terminal, no where they pick nothing", async () => {
    const questions = scripted([true]);

    expect(await wantsMcp({}, terminalThat(questions))).toBe(true);
    expect(questions.asked).toEqual([
      {
        kind: "confirm",
        message: "Offer the API's reads to AI agents in your editor, over MCP?",
        initial: false,
      },
    ]);
  });

  it("leaves the MCP server out, without asking, where no one can answer, with --yes, and with --dry-run", async () => {
    expect(await wantsMcp({}, terminalThat(undefined))).toBe(false);
    expect(await wantsMcp({ yes: true }, terminalThat(scripted([])))).toBe(false);
    expect(await wantsMcp({ "dry-run": true }, terminalThat(scripted([])))).toBe(false);
  });
});
