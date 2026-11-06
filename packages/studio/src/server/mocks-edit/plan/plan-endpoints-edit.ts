import type { ParsedSource } from "@noverax/courier-cli/devkit";
import type { ObjectExpression } from "oxc-parser";

import { MocksEditRefusal } from "../mocks-edit-refusal";
import type { TextEdit } from "../types";
import { applyEdits } from "./apply-edits";
import { countLineTerminators } from "./count-line-terminators";
import { detectStyle } from "./detect-style";
import { isPureInsertion } from "./is-pure-insertion";
import { planListInsertion } from "./list-insertion";
import { type EndpointsList, endpointsListOf } from "./mock-endpoints-list";
import { quoteString } from "./quote-string";
import { readEditable } from "./read-editable";
import { rejectPlan } from "./reject-plan";

/** The endpoints to add to one mock's list, and the mocks file it is declared in. */
export interface EndpointsPlanInput {
  /** The mocks file's name in the project root, and its text as read for the edit. */
  existing: { name: string; text: string };
  /** The mock's key in the mocks object. */
  key: string;
  /** The endpoints to add, as `group.method`; those the list holds already are left out. */
  add: readonly string[];
}

/** The mocks file as the edit writes it, and the insertions that produce it. */
export interface EndpointsPlan {
  text: string;
  edits: TextEdit[];
  /** The list as it was, and as the edit leaves it. */
  before: string[];
  after: string[];
}

/**
 * Plan adding endpoints to the list a mock answers: the `endpoints` array
 * of its `defineMockServer({ ... })` in the object `courier.mocks.ts`
 * exports. Text in, the file as written and the insertions out; nothing is
 * read from disk or run. The edit only ever adds text — each name appended
 * to the array as its layout has them, quoted as the file quotes — and is
 * read back and checked to hold the list it means before it is returned.
 *
 * Studio edits only what it can read in full: a mock declared as a plain
 * property, a call of `defineMockServer` imported from the mock package with
 * one object literal, and an `endpoints` array of string literals.
 *
 * @param input - The mocks file, the mock, and the endpoints to add
 * @returns The file as written, the insertions, and the list before and after
 * @throws {MocksEditRefusal} `MOCK_NOT_FOUND`, `MOCK_NOT_LITERAL`, `MOCK_ANSWERS_ALL` or
 *   `ENDPOINTS_NOT_LITERAL` when Studio should leave the edit to the user;
 *   what `readEditable` refuses for a file it cannot read
 * @example
 * ```ts
 * planEndpointsEdit({ existing, key: "shop", add: ["orders.refund"] }).after;
 * // → ["orders.list", "orders.refund"]
 * ```
 */
export function planEndpointsEdit(input: EndpointsPlanInput): EndpointsPlan {
  const { name, text } = input.existing;
  const file = readEditable(name, text);
  if (file.located.kind !== "object") {
    throw new MocksEditRefusal(
      "MOCK_NOT_FOUND",
      `${name} exports no mocks object to find ${input.key} in.`,
    );
  }
  const list = endpointsListOf(file.parsed, file.located.object, input.key, file.imports);
  const added = [...new Set(input.add)].filter((endpoint) => !list.names.includes(endpoint));
  const edits =
    added.length === 0 ? [] : insertionsFor(file.parsed, file.located.object, list, added);
  const planned = applyEdits(text, edits);
  const plan = { text: planned, edits, before: list.names, after: [...list.names, ...added] };
  checkPlan(input, plan);
  return plan;
}

function insertionsFor(
  parsed: ParsedSource,
  mocks: ObjectExpression,
  { array }: EndpointsList,
  added: readonly string[],
): TextEdit[] {
  const { text, comments, commentEnds } = parsed;
  const style = detectStyle(parsed, mocks);
  const code = text.trimEnd();
  const singleLineFile = countLineTerminators(code, 0, code.length) === 0;
  const items = array.elements.flatMap((element) => (element === null ? [] : [element]));
  /* Quoted as the list quotes the names it holds, and as the file quotes otherwise. */
  const opening = items[0] === undefined ? undefined : text[items[0].start];
  const quote = opening === "'" || opening === '"' ? opening : style.quote;
  return planListInsertion(
    { open: array.start, close: array.end - 1, items },
    { text, comments, commentEnds, style, singleLineFile },
    () => added.map((name) => quoteString(name, quote)),
  );
}

/* The planned text read back: only insertions, and the mock's list as meant. */
function checkPlan(input: EndpointsPlanInput, plan: EndpointsPlan): void {
  const { name, text } = input.existing;
  const audit = { fileName: name, entries: [{ key: input.key }] };
  if (!isPureInsertion(text, plan.text, plan.edits)) {
    rejectPlan(audit, "its edits are not pure insertions that produce the planned text");
  }
  const written = readEditable(name, plan.text);
  if (written.located.kind !== "object")
    rejectPlan(audit, "the written file exports no mocks object");
  const listed = endpointsListOf(
    written.parsed,
    written.located.object,
    input.key,
    written.imports,
  );
  if (listed.names.join("\n") !== plan.after.join("\n")) {
    rejectPlan(audit, `the written list of ${input.key} is not the one planned`);
  }
}
