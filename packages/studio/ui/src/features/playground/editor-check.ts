import type { CatalogEndpoint } from "@/store/types-ui";
import { fieldsWithDefaults } from "./defaulted-fields";
import { headersCheckOf, type InputCheck, variablesCheckOf } from "./input-check";

/** What the Playground's request editors hold, and how the request goes. */
interface EditorState {
  readonly tab: "variables" | "headers";
  readonly variables: string;
  readonly headers: string;
  /** The variables go as a multipart form, in place of the JSON. */
  readonly asForm: boolean;
}

/**
 * What the status line under the open editor says: the headers' check, the
 * form's note, or the variables checked against the endpoint's fields — a
 * field its `.defaults()` fills in asked of no one.
 *
 * @param editors - The editors, which one is open, and whether a form goes instead
 * @param def - The endpoint's definition
 * @param name - The endpoint's name, `group.method`
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
): InputCheck {
  if (editors.tab === "headers") return headersCheckOf(editors.headers);
  if (editors.asForm) {
    return { tone: "ok", label: "Sent as multipart form data in place of the variables" };
  }
  const fields = fieldsWithDefaults(def.variablesFields, def.variablesDefaults);
  return variablesCheckOf(editors.variables, fields, name);
}
