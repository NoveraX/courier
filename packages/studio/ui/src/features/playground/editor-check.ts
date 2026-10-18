import type { RequestEntry, ValidationIssue } from "@/store/types";
import type { CatalogEndpoint, PlaygroundHistoryEntry } from "@/store/types-ui";
import { fieldsWithDefaults } from "./defaulted-fields";
import { headersCheckOf, type InputCheck, refusedCheckOf, variablesCheckOf } from "./input-check";
import { parseJsonc } from "./jsonc-helpers";

/** What the Playground's request editors hold, and how the request goes. */
interface EditorState {
  readonly tab: "variables" | "headers";
  readonly variables: string;
  readonly headers: string;
  /** The variables go as a multipart form, in place of the JSON. */
  readonly asForm: boolean;
}

/** The variables the input schema refused when they were last sent, and what it said of them. */
interface Refusal {
  readonly variables: string;
  readonly issues: readonly ValidationIssue[];
}

/**
 * The variables an endpoint's last send had refused by its input schema,
 * when it was, and what the schema said of them.
 *
 * @param shown - The endpoint's last send, when there is one
 * @param row - The request it made, when Studio holds it
 * @returns The refusal, or `undefined` when the variables were not refused
 * @example
 * ```ts
 * refusalOf(shown, row)?.issues; // [{ path: "category", message: "Invalid option…" }]
 * ```
 */
export function refusalOf(
  shown: PlaygroundHistoryEntry | null,
  row: RequestEntry | undefined,
): Refusal | undefined {
  if (!shown || row?.validated?.variables !== "failed") return undefined;
  return { variables: shown.variables, issues: row.error?.validationIssues ?? [] };
}

/* The same variables, however the text lays them out. */
function sameVariables(text: string, sent: string): boolean {
  const [now, then] = [parseJsonc(text), parseJsonc(sent)];
  if (!now.ok || !then.ok) return text.trim() === sent.trim();
  return JSON.stringify(now.value) === JSON.stringify(then.value);
}

/**
 * What the status line under the open editor says: the headers' check, the
 * form's note, the refusal of the variables the input schema refused when
 * they were last sent, or the variables checked against the endpoint's
 * fields — a field its `.defaults()` fills in asked of no one.
 *
 * @param editors - The editors, which one is open, and whether a form goes instead
 * @param def - The endpoint's definition
 * @param name - The endpoint's name, `group.method`
 * @param refused - The variables the last send had refused, when it was
 * @returns The status
 * @example
 * ```ts
 * editorCheckOf({ tab: "variables", variables: "{}", headers: "{}", asForm: false }, def, "news.byGroup");
 * ```
 */
export function editorCheckOf(
  editors: EditorState,
  def: CatalogEndpoint,
  name: string,
  refused?: Refusal,
): InputCheck {
  if (editors.tab === "headers") return headersCheckOf(editors.headers);
  if (editors.asForm) {
    return { tone: "ok", label: "Sent as multipart form data in place of the variables" };
  }
  if (refused && sameVariables(editors.variables, refused.variables)) {
    return refusedCheckOf(refused.issues);
  }
  const fields = fieldsWithDefaults(def.variablesFields, def.variablesDefaults);
  return variablesCheckOf(editors.variables, fields, name);
}
