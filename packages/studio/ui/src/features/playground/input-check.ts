import type { SchemaField } from "@noverax/courier-studio-core";

import type { ValidationIssue } from "@/store/types";
import { stripComments } from "./jsonc-helpers";

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

function missingField(value: unknown, fields: readonly SchemaField[]): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const top = fields.filter((f) => f.required && !f.path.includes(".") && !f.path.includes("["));
  return top.find((f) => !(f.path in value))?.path;
}

/**
 * What the Variables editor's status line says: the JSON is invalid, a
 * field the schema requires is missing, or it is valid — against the
 * schema's required fields when Studio knows them.
 *
 * @param text - The editor's text
 * @param fields - The fields the endpoint's schema declares, when known
 * @param name - The endpoint's name, for the label
 * @returns The status
 * @example
 * ```ts
 * variablesCheckOf("{}", [{ path: "sku", type: "string", required: true }], "orders.create");
 * // { tone: "warn", label: 'Missing required field "sku"' }
 * ```
 */
export function variablesCheckOf(
  text: string,
  fields: readonly SchemaField[] | undefined,
  name: string,
): InputCheck {
  if (text.trim() === "") return { tone: "ok", label: "Empty · sent without variables" };
  const read = problemOf(text);
  if ("problem" in read) return { tone: "err", label: `Invalid JSON · ${read.problem}` };
  if (!fields) return { tone: "ok", label: "Valid JSON" };
  const missing = missingField(read.value, fields);
  if (missing) return { tone: "warn", label: `Missing required field "${missing}"` };
  return { tone: "ok", label: `Valid · every field ${name} requires is set` };
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
