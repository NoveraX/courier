import type { ParsedSource } from "@noverax/courier-cli/devkit";
import type { Directive, Statement } from "oxc-parser";
import {
  collectModuleBindings,
  type ModuleBindings,
} from "../../server/mocks-edit/plan/module-bindings";
import { aboveStatement } from "./above-statement";
import { referencedNames } from "./referenced-names";

/* A name as code writes one, to read what added code calls. */
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

interface Helper {
  statement: Directive | Statement;
  binds: string[];
  references: Set<string>;
}

/**
 * The helpers a generated file declares after its declaration that code
 * added from it calls and the file on disk lacks — `_ownFields`, with the
 * type it names, for an endpoint whose variables have a field named like a
 * member every object inherits — and what each of those calls in turn.
 * Each comes with its comments, as the generator wrote them; helpers it
 * wrote one after another stay one after another, as a function's
 * overloads must.
 *
 * @param generated - The generated file, parsed
 * @param after - Where its declaration ends
 * @param code - The code added from it
 * @param bound - What the file on disk binds already
 * @returns The helpers' text, or `""` when the added code needs none
 * @example
 * ```ts
 * helpersNeeded(parseSource("index.ts", generated), declaration.end, addedCode, bindings);
 * ```
 */
export function helpersNeeded(
  generated: ParsedSource,
  after: number,
  code: string,
  bound: ModuleBindings,
): string {
  const helpers = generated.program.body
    .filter((statement) => statement.start >= after)
    .map((statement) => helperOf(generated, statement))
    .filter((helper) => helper.binds.length > 0);
  const used = new Set(code.match(IDENTIFIER) ?? []);
  const needed = new Set<Helper>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const helper of helpers) {
      if (needed.has(helper) || !helper.binds.some((name) => used.has(name) && !bound.has(name)))
        continue;
      needed.add(helper);
      for (const name of helper.references) used.add(name);
      grew = true;
    }
  }
  return joined(
    generated,
    helpers.filter((helper) => needed.has(helper)),
  );
}

function helperOf(generated: ParsedSource, statement: Directive | Statement): Helper {
  const binds = collectModuleBindings({ ...generated.program, body: [statement] });
  return { statement, binds: [...binds.keys()], references: referencedNames(statement) };
}

/* The helpers' text: between two the generator wrote one after another, what it wrote between them. */
function joined(generated: ParsedSource, helpers: readonly Helper[]): string {
  const { body } = generated.program;
  let text = "";
  helpers.forEach(({ statement }, at) => {
    const previous = helpers[at - 1]?.statement;
    const next = previous === undefined ? undefined : body[body.indexOf(previous) + 1];
    if (previous !== undefined && next === statement) {
      text += generated.text.slice(previous.end, statement.end);
      return;
    }
    const start = aboveStatement(generated, statement.start);
    text += `${text === "" ? "" : "\n\n"}${generated.text.slice(start, statement.end)}`;
  });
  return text;
}
