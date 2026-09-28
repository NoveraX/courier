import { stripComments } from "./jsonc-helpers";

/** What the Variables and Headers editors hold, read as values. */
export interface RequestValues {
  /** The variables, or `undefined` when the editor is empty */
  variables: unknown;
  headers: Record<string, string>;
}

export type RequestValuesResult =
  | { ok: true; values: RequestValues }
  | { ok: false; problem: string };

type JsoncResult = { ok: true; value: unknown } | { ok: false };

/**
 * Read the Variables and Headers editors as the request they describe.
 *
 * Both hold JSON with comments. An editor left empty holds nothing: no
 * variables, no headers. Text that does not parse is a problem to show,
 * never a request without the values it was meant to carry: sending it
 * without them would answer a different request than the one written.
 *
 * @param variables - The Variables editor's text
 * @param headers - The Headers editor's text
 * @returns The values, or the problem that keeps them from being sent
 *
 * @example
 * ```ts
 * readRequestValues('{ "id": 1 }', "{}"); // → { ok: true, values: { variables: { id: 1 }, headers: {} } }
 * readRequestValues('{ "id": ', "{}"); // → { ok: false, problem: "Variables are not valid JSON" }
 * ```
 */
export function readRequestValues(variables: string, headers: string): RequestValuesResult {
  const parsedVariables = readJsonc(variables);
  if (!parsedVariables.ok) return { ok: false, problem: "Variables are not valid JSON" };
  const parsedHeaders = readJsonc(headers);
  if (!parsedHeaders.ok) return { ok: false, problem: "Headers are not valid JSON" };
  const headerValues = parsedHeaders.value ?? {};
  if (!isStringRecord(headerValues)) {
    return { ok: false, problem: "Headers must be an object of string values" };
  }
  return { ok: true, values: { variables: parsedVariables.value, headers: headerValues } };
}

function readJsonc(text: string): JsoncResult {
  if (text.trim() === "") return { ok: true, value: undefined };
  try {
    const value: unknown = JSON.parse(stripComments(text));
    return { ok: true, value };
  } catch {
    /* The parse error is the answer: the caller reports the text as invalid. */
    return { ok: false };
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((field: unknown) => typeof field === "string")
  );
}
