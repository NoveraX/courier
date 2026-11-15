import { withVariableDefaults } from "@noverax/courier/internal";

import type { ValidationIssue } from "@/store/types";
import type { CatalogEndpoint } from "@/store/types-ui";
import { stripComments } from "./jsonc-helpers";
import { type OutlineProblem, outlineProblemOf } from "./outline-check";

/** What the editor's status line says about its text, and in what tone. */
export interface InputCheck {
  tone: "ok" | "warn" | "err";
  label: string;
}

/* The parse error, when the text is not JSON once its comments are gone. */
function problemOf(text: string): { value: unknown } | { problem: string } {
  try {
    return { value: JSON.parse(stripComments(text)) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { problem: message.replace(/^JSON\.parse: /, "") };
  }
}

function problemLabel(problem: OutlineProblem): string {
  const root = problem.path === "";
  switch (problem.kind) {
    case "missing":
      return `Missing required field "${problem.path}"`;
    case "type":
      return root
        ? `Variables expect ${problem.expected}, got ${problem.got}`
        : `"${problem.path}" expects ${problem.expected}, got ${problem.got}`;
    case "forms":
      return root
        ? `Variables fit none of the ${problem.count} forms their schema takes`
        : `"${problem.path}" fits none of the ${problem.count} forms it takes`;
  }
}

/**
 * What the Variables editor's status line says: the JSON is invalid, a
 * part of it does not fit what the endpoint's schema takes — a value of
 * another type, one an enum does not list, a field it requires left out —
 * or it is valid: against the schema's types and required fields when
 * Studio can read them, with what `.defaults()` fills in.
 *
 * @param text - The editor's text
 * @param def - What Studio knows of the endpoint's variables: what their schema takes, and their defaults
 * @param name - The endpoint's name, for the label
 * @returns The status
 * @example
 * ```ts
 * variablesCheckOf('{ "orderId": 1 }', def, "charges.create");
 * // { tone: "warn", label: '"orderId" expects string, got number' }
 * ```
 */
export function variablesCheckOf(
  text: string,
  def: Pick<CatalogEndpoint, "variablesOutline" | "variablesDefaults">,
  name: string,
): InputCheck {
  if (text.trim() === "") return { tone: "ok", label: "Empty · sent without variables" };
  const read = problemOf(text);
  if ("problem" in read) return { tone: "err", label: `Invalid JSON · ${read.problem}` };
  if (!def.variablesOutline) return { tone: "ok", label: "Valid JSON" };
  const variables = withVariableDefaults(def.variablesDefaults, read.value);
  const problem = outlineProblemOf(variables, def.variablesOutline);
  if (problem) return { tone: "warn", label: problemLabel(problem) };
  return { tone: "ok", label: `Valid · matches the types and required fields of ${name}` };
}

/**
 * What the Headers editor's status line says: invalid JSON, a value that
 * is not a string, or valid.
 *
 * @param text - The editor's text
 * @returns The status
 * @example
 * ```ts
 * headersCheckOf('{ "x-trace": 1 }'); // { tone: "err", label: "Every header's value must be a string" }
 * ```
 */
export function headersCheckOf(text: string): InputCheck {
  if (text.trim() === "") return { tone: "ok", label: "No headers" };
  const read = problemOf(text);
  if ("problem" in read) return { tone: "err", label: `Invalid JSON · ${read.problem}` };
  const value = read.value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { tone: "err", label: "Headers must be an object" };
  }
  if (!Object.values(value).every((v: unknown) => typeof v === "string")) {
    return { tone: "err", label: "Every header's value must be a string" };
  }
  return { tone: "ok", label: "Valid JSON · sent with the call" };
}

/**
 * What the Variables editor's status line says while it holds the
 * variables the input schema refused when they were last sent: the first
 * field it refused, and what it said of it.
 *
 * @param issues - What the schema said of the variables
 * @returns The status
 * @example
 * ```ts
 * refusedCheckOf([{ path: "category", message: "Invalid option" }]);
 * // { tone: "err", label: "Refused by the input schema · category — Invalid option" }
 * ```
 */
export function refusedCheckOf(issues: readonly ValidationIssue[]): InputCheck {
  const [first] = issues;
  const said = first ? ` · ${first.path || "the variables"} — ${first.message}` : "";
  return { tone: "err", label: `Refused by the input schema${said}` };
}
