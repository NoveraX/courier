import { createTerminalStyle } from "@noverax/courier/internal";
import { describe, expect, it } from "vitest";

import type { GitState } from "../../src/preflight/git-state";
import { goAhead } from "../../src/preflight/go-ahead";
import type { Questions } from "../../src/questions/questions";
import type { SetupEnd } from "../../src/report/setup-report";
import { textReport } from "../../src/report/text-report";
import { scripted } from "../questions/scripted-questions";

const WORDS = {
  question: "Set Courier up?",
  unasked: "Nothing was changed: --yes.",
  declined: "No.",
};
const DIRTY: GitState = { kind: "dirty", paths: ["src/app.ts"], count: 1 };

/* Where a run ends, as it tells it: one that cannot ask, or one whose questions a test answers. */
function unattended(questions?: Questions) {
  const ends: SetupEnd[] = [];
  const text = textReport(createTerminalStyle(0, false), () => undefined);
  const io = {
    questions,
    toolOutput: "stdout" as const,
    report: {
      ...text,
      end(end: SetupEnd) {
        ends.push(end);
      },
    },
  };
  return { ends, io };
}

describe("goAhead", () => {
  it("refuses, with --yes, a project whose changes git has not committed", async () => {
    const { ends, io } = unattended();

    expect(await goAhead({ yes: true }, io, WORDS, DIRTY)).toBe(false);
    expect(ends).toEqual([
      expect.objectContaining({
        kind: "refused",
        code: "GIT_DIRTY",
        said: expect.stringContaining("--allow-dirty"),
      }),
    ]);
  });

  it("goes ahead with --yes and --allow-dirty, with a clean project, and outside a repository", async () => {
    const { ends, io } = unattended();
    const outside: GitState = { kind: "unknown", why: "it is not in a git repository" };

    expect(await goAhead({ yes: true, "allow-dirty": true }, io, WORDS, DIRTY)).toBe(true);
    expect(await goAhead({ yes: true }, io, WORDS, { kind: "clean" })).toBe(true);
    expect(await goAhead({ yes: true }, io, WORDS, outside)).toBe(true);
    expect(ends).toEqual([]);
  });

  it("says first what git has where nobody can answer and --yes was not passed, and asks for it otherwise", async () => {
    const dirty = unattended();
    const clean = unattended();

    expect(await goAhead({}, dirty.io, WORDS, DIRTY)).toBe(false);
    expect(await goAhead({}, clean.io, WORDS, { kind: "clean" })).toBe(false);
    expect(dirty.ends[0]).toMatchObject({ code: "GIT_DIRTY" });
    expect(clean.ends[0]).toMatchObject({ code: "CONFIRMATION_REQUIRED", said: WORDS.unasked });
  });

  it("asks the person at a terminal, a project git has changes in too, and says why where they say no", async () => {
    const yes = scripted([true]);
    const no = unattended(scripted([false]));

    expect(await goAhead({}, unattended(yes).io, WORDS, DIRTY)).toBe(true);
    expect(await goAhead({}, no.io, WORDS, { kind: "clean" })).toBe(false);
    expect(yes.asked).toEqual([{ kind: "confirm", message: "Set Courier up?", initial: true }]);
    expect(no.ends).toEqual([{ kind: "refused", code: "DECLINED", said: WORDS.declined }]);
  });
});
