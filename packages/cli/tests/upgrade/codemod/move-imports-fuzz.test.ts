/**
 * The import mover on files drawn at random — names imported with and
 * without `as`, as types and as values, one declaration or two, the new
 * module imported already or not, names bound again inside, the new name
 * taken — each checked for what holds of any file: it still parses, a
 * second run changes nothing, its strings and comments are as they were,
 * and no moved name is left on its old module.
 */
import { describe, expect, it } from "vitest";

import { parseSource } from "../../../src/source/parse-source";
import { programOf, walk } from "../../../src/upgrade/codemod/ast";
import { namedImports } from "../../../src/upgrade/codemod/imports";
import { type MovedName, moveImports } from "../../../src/upgrade/codemod/move-imports";
import { applyEdits } from "../../../src/upgrade/codemod/text-edits";
import { seededRandom } from "../../helpers/seeded-random";

const ROOT = "@noverax/courier";
const REALTIME = "@noverax/courier/realtime";
const MOVES: readonly MovedName[] = [
  { from: ROOT, name: "AuthError", to: REALTIME },
  { from: ROOT, name: "ForbiddenError", to: REALTIME },
  { from: ROOT, name: "TimeoutError", to: REALTIME, as: "RealtimeTimeoutError" },
];
const NAMES = ["AuthError", "ForbiddenError", "TimeoutError", "createCaller", "HTTPError"];

function drawFile(next: (below: number) => number): string {
  const pick = <T>(items: readonly T[]): T => items[next(items.length)] as T;
  const locals: string[] = [];
  const lines: string[] = [];
  const quote = pick(['"', "'"]);
  const semi = pick([";", ""]);
  for (let declaration = 0; declaration <= next(2); declaration++) {
    const typeDeclaration = next(7) === 0;
    const specs = NAMES.filter(() => next(2) === 0).flatMap((name) => {
      const local = next(5) === 0 ? `${name}Alias${declaration}` : name;
      /* A file binds each name once: a second import of it would not compile. */
      if (locals.includes(local)) return [];
      locals.push(local);
      const typed = !typeDeclaration && next(5) === 0 ? "type " : "";
      return [`${typed}${local === name ? name : `${name} as ${local}`}`];
    });
    if (specs.length === 0) continue;
    lines.push(
      `import ${typeDeclaration ? "type " : ""}{ ${specs.join(", ")} } from ${quote}${ROOT}${quote}${semi}`,
    );
  }
  if (next(3) === 0) lines.push(`import { subscribeSSE } from ${quote}${REALTIME}${quote}${semi}`);
  if (next(10) === 0) lines.push("const RealtimeTimeoutError = 1;");
  for (const local of locals) {
    lines.push(
      pick([
        `new ${local}()${semi}`,
        `if (error instanceof ${local}) {}`,
        `const held${lines.length} = { ${local} }${semi}`,
        `report(error.${local})${semi}`,
        `log("${local}")${semi} // ${local}`,
        `let typed${lines.length}: ${local}${semi}`,
        `function shadow${lines.length}() { const ${local} = 1; return ${local}; }`,
      ]),
    );
  }
  return `${lines.join("\n")}\n`;
}

/* The strings and comments a file holds, in order: what a codemod never changes. */
function literals(text: string): string[] {
  const parsed = parseSource("file.ts", text);
  const found: string[] = parsed.comments.map((comment) => comment.value);
  walk(programOf(parsed.program), ({ node, ancestors }) => {
    const inImport = ancestors.some((each) => /^(Import|Export)/.test(each.type));
    if (node.type === "Literal" && typeof node.value === "string" && !inImport)
      found.push(node.value);
  });
  return found;
}

function migrate(text: string): string {
  const parsed = parseSource("file.ts", text);
  return applyEdits(text, moveImports({ program: programOf(parsed.program), text }, MOVES));
}

describe("moveImports on files drawn at random", () => {
  it("leaves a file that parses, migrates once, keeps strings and comments, and moves every name", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const text = drawFile(seededRandom(seed));
      const after = migrate(text);
      const parsed = parseSource("file.ts", after);
      const left = namedImports(programOf(parsed.program), new Set([ROOT])).filter((each) =>
        MOVES.some((move) => move.name === each.imported),
      );

      expect(parsed.problem, `seed ${seed}:\n${text}\n---\n${after}`).toBeNull();
      expect(migrate(after), `seed ${seed}`).toBe(after);
      expect(literals(after), `seed ${seed}`).toEqual(literals(text));
      expect(
        left.map((each) => each.imported),
        `seed ${seed}`,
      ).toEqual([]);
    }
  });
});
