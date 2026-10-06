/**
 * A form as a mock's handler receives it: each field by name, a file the
 * `File` itself, a field sent more than once a list in the order sent.
 */
export type MockFormFields = Record<string, FormDataEntryValue | FormDataEntryValue[]>;

/**
 * A form as a mock answers from it — the same whether it arrived over HTTP
 * or was passed to a mock client in-process, so a handler written once
 * serves both.
 *
 * @param form - The form
 * @returns Its fields
 * @example
 * ```ts
 * formFields(form); // { title: "Q3", files: [File, File] }
 * ```
 */
export function formFields(form: FormData): MockFormFields {
  const fields = new Map<string, FormDataEntryValue | FormDataEntryValue[]>();
  for (const [key, value] of form.entries()) {
    const earlier = fields.get(key);
    fields.set(
      key,
      earlier === undefined ? value : [...(Array.isArray(earlier) ? earlier : [earlier]), value],
    );
  }
  /* `fromEntries` keeps a field called `__proto__` a field. */
  return Object.fromEntries(fields);
}

/**
 * Variables as a mock's handler receives them: a form as its fields, any
 * other value as it is.
 *
 * @param variables - What the call was made with
 * @returns What the handler is given
 * @example
 * ```ts
 * handlerVariables({ id: 1 }); // { id: 1 }
 * ```
 */
export function handlerVariables(variables: unknown): unknown {
  return typeof FormData !== "undefined" && variables instanceof FormData
    ? formFields(variables)
    : variables;
}
