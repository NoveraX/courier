import { describe, expect, it } from "vitest";

import { parseSource } from "../../../src/source/parse-source";
import { programOf } from "../../../src/upgrade/codemod/ast";
import { type MovedName, moveImports } from "../../../src/upgrade/codemod/move-imports";
import { applyEdits } from "../../../src/upgrade/codemod/text-edits";

const ROOT = "@noverax/courier";
const REALTIME = "@noverax/courier/realtime";

/* The realtime errors moving out of the package's root, and its timeout taking a name of its own. */
const MOVES: readonly MovedName[] = [
  { from: ROOT, name: "AuthError", to: REALTIME },
  { from: ROOT, name: "ForbiddenError", to: REALTIME },
  { from: ROOT, name: "TimeoutError", to: REALTIME, as: "RealtimeTimeoutError" },
  { from: REALTIME, name: "TimeoutError", to: REALTIME, as: "RealtimeTimeoutError" },
  { from: REALTIME, name: "SSESubscription", to: REALTIME, as: "Subscription" },
];

function moved(text: string, moves: readonly MovedName[] = MOVES): string {
  const parsed = parseSource("file.ts", text);
  if (parsed.problem !== null) throw new Error(parsed.problem.message);
  return applyEdits(text, moveImports({ program: programOf(parsed.program), text }, moves));
}

describe("moveImports", () => {
  it("moves a name to its new module beside the old declaration, the rest of it left as written", () => {
    expect(moved('import { AuthError, createCaller } from "@noverax/courier";\n')).toBe(
      'import { createCaller } from "@noverax/courier";\nimport { AuthError } from "@noverax/courier/realtime";\n',
    );
  });

  it("puts a new declaration in the place of one that has nothing left", () => {
    expect(moved("import { AuthError } from '@noverax/courier'\nnew AuthError()\n")).toBe(
      "import { AuthError } from '@noverax/courier/realtime'\nnew AuthError()\n",
    );
  });

  it("renames every reference where the file binds the name once, keys and exported names kept", () => {
    const text = `import { TimeoutError } from "@noverax/courier";

const errors = { TimeoutError, other: TimeoutError };
if (error instanceof TimeoutError) report(error.TimeoutError, "TimeoutError"); // TimeoutError
type Kind = TimeoutError | typeof TimeoutError;
export { TimeoutError };
`;

    expect(moved(text)).toBe(`import { RealtimeTimeoutError } from "@noverax/courier/realtime";

const errors = { TimeoutError: RealtimeTimeoutError, other: RealtimeTimeoutError };
if (error instanceof RealtimeTimeoutError) report(error.TimeoutError, "TimeoutError"); // TimeoutError
type Kind = RealtimeTimeoutError | typeof RealtimeTimeoutError;
export { RealtimeTimeoutError as TimeoutError };
`);
  });

  it("imports a renamed name under its old one where the file binds that name again, or writes the new one", () => {
    const shadowed =
      'import { TimeoutError } from "@noverax/courier";\nfunction f() { class TimeoutError {} return new TimeoutError(); }\n';
    const taken =
      'import { TimeoutError } from "@noverax/courier";\nconst RealtimeTimeoutError = 1;\n';

    expect(moved(shadowed)).toBe(
      'import { RealtimeTimeoutError as TimeoutError } from "@noverax/courier/realtime";\nfunction f() { class TimeoutError {} return new TimeoutError(); }\n',
    );
    expect(moved(taken)).toContain(
      'import { RealtimeTimeoutError as TimeoutError } from "@noverax/courier/realtime";',
    );
  });

  it("keeps the binding of a name imported with as", () => {
    expect(
      moved('import { TimeoutError as Timeout } from "@noverax/courier";\nnew Timeout();\n'),
    ).toBe(
      'import { RealtimeTimeoutError as Timeout } from "@noverax/courier/realtime";\nnew Timeout();\n',
    );
  });

  it("adds to the file's declaration of the new module, on one line or on lines of their own", () => {
    const oneLine =
      'import { AuthError } from "@noverax/courier";\nimport { subscribeSSE } from "@noverax/courier/realtime";\n';
    const lines =
      'import { AuthError, createCaller } from "@noverax/courier";\nimport {\n  subscribeSSE,\n  tracked,\n} from "@noverax/courier/realtime";\n';

    expect(moved(oneLine)).toBe(
      'import { subscribeSSE, AuthError } from "@noverax/courier/realtime";\n',
    );
    expect(moved(lines)).toBe(
      'import { createCaller } from "@noverax/courier";\nimport {\n  subscribeSSE,\n  tracked,\n  AuthError,\n} from "@noverax/courier/realtime";\n',
    );
  });

  it("keeps types types: a declaration of types alone, and type before a name among values", () => {
    expect(
      moved(
        'import type { SSESubscription } from "@noverax/courier/realtime";\nlet s: SSESubscription;\n',
      ),
    ).toBe(
      'import type { Subscription } from "@noverax/courier/realtime";\nlet s: Subscription;\n',
    );
    expect(moved('import { type AuthError, createCaller } from "@noverax/courier";\n')).toBe(
      'import { createCaller } from "@noverax/courier";\nimport type { AuthError } from "@noverax/courier/realtime";\n',
    );
    expect(moved('import { type AuthError, ForbiddenError } from "@noverax/courier";\n')).toBe(
      'import { type AuthError, ForbiddenError } from "@noverax/courier/realtime";\n',
    );
  });

  it("keeps the names a file exports from a module, and a default it imports beside them", () => {
    expect(moved('export { TimeoutError, createCaller } from "@noverax/courier";\n')).toBe(
      'export { createCaller } from "@noverax/courier";\nexport { RealtimeTimeoutError as TimeoutError } from "@noverax/courier/realtime";\n',
    );
    expect(moved('import Courier, { AuthError } from "@noverax/courier";\n')).toBe(
      'import Courier from "@noverax/courier";\nimport { AuthError } from "@noverax/courier/realtime";\n',
    );
  });

  it("changes nothing the second time, nor in a file that imports none of the names", () => {
    const once = moved(
      'import { AuthError, TimeoutError, createCaller } from "@noverax/courier";\nnew TimeoutError();\n',
    );
    const other = 'import { createCaller } from "@noverax/courier";\nconst TimeoutError = 1;\n';

    expect(moved(once)).toBe(once);
    expect(moved(other)).toBe(other);
  });
});
