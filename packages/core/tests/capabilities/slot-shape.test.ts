/**
 * The shape of a registry's slots, read the way the contract's guard reads
 * it, on registries written for the test: a line for each member of each
 * type the slots reach, so that a change shows as the lines it changed. A
 * type's members are a set, and their order changes no line; the order of
 * one name's overloads is read, as a call resolves them in it. A `typeof`
 * or an `import()` type is refused, as the walk would read no further.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { slotShape } from "../helpers/slot-shape";

let home: string;

/* A registry whose slot reaches a type two steps down, as `session` reaches `CallSession`. */
function registry(session: string, call: string): ReturnType<typeof slotShape> {
  writeFileSync(
    join(home, "registry.ts"),
    `import type { Session } from "./session";\nexport interface ServerCapabilities { session?: Session }\n`,
  );
  writeFileSync(join(home, "session.ts"), `import type { Call } from "./call";\n${session}\n`);
  writeFileSync(join(home, "call.ts"), call);
  return slotShape(join(home, "registry.ts"), home);
}

const SESSION = `export interface Session {
  /** Served first. */
  served(call: Call): boolean;
  lend(call: Call, name: string): Call | undefined;
  lend(call: Call): Call;
}`;
const CALL =
  "export interface Call { readonly headers: string[]; fetchInit?: { mode: string; cache: string } }";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "courier-slot-shape-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("the shape of a registry's slots", () => {
  it("is a line for each member, overloads of one name together in their order", () => {
    expect(registry(SESSION, CALL)).toEqual({
      lines: [
        "Call: interface Call",
        "Call.fetchInit: fetchInit?: { cache: string; mode: string; };",
        "Call.headers: readonly headers: string[];",
        "ServerCapabilities: interface ServerCapabilities",
        "ServerCapabilities.session: session?: Session;",
        "Session: interface Session",
        "Session.lend: lend(call: Call, name: string): Call | undefined; lend(call: Call): Call;",
        "Session.served: served(call: Call): boolean;",
      ],
      refused: [],
    });
  });

  it("changes no line where members, an inner type's too, are put in another order, or a comment changes", () => {
    const reordered = SESSION.replace(
      "/** Served first. */\n  served(call: Call): boolean;\n",
      "",
    ).replace("}", "  // Served last.\n  served(call: Call): boolean;\n}");
    const inner =
      "export interface Call { fetchInit?: { cache: string; mode: string }; readonly headers: string[] }";

    expect(registry(reordered, inner)).toEqual(registry(SESSION, CALL));
  });

  it("changes the line of a member two types down that turns from optional to required", () => {
    const before = registry(SESSION, CALL).lines;
    const after = registry(SESSION, CALL.replace("fetchInit?:", "fetchInit:")).lines;

    expect(after.filter((line) => !before.includes(line))).toEqual([
      "Call.fetchInit: fetchInit: { cache: string; mode: string; };",
    ]);
  });

  it("changes the line of a name whose overloads change their order", () => {
    const swapped = SESSION.replace(
      "  lend(call: Call, name: string): Call | undefined;\n  lend(call: Call): Call;",
      "  lend(call: Call): Call;\n  lend(call: Call, name: string): Call | undefined;",
    );

    expect(registry(swapped, CALL).lines).not.toEqual(registry(SESSION, CALL).lines);
  });

  it("walks a folder named with backslashes, as Windows names it, as one named with slashes", () => {
    const named = registry(SESSION, CALL);

    expect(slotShape(join(home, "registry.ts"), home.replaceAll("/", "\\"))).toEqual(named);
  });

  it("refuses a typeof and an import() type, which it would read no further", () => {
    const session = `import type { lendIt } from "./call";\nexport interface Session { lend: typeof lendIt; other: import("./call").Call }`;
    const call =
      "export interface Call { headers: string[] }\nexport function lendIt(call: Call): Call { return call; }";

    expect(registry(session, call).refused).toEqual([
      "Session reads typeof lendIt: write the slot's type out",
      'Session reads import("./call").Call: write the slot\'s type out',
    ]);
  });
});
