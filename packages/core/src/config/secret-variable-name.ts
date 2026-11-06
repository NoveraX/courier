/* Capitals, digits and `_`, not starting with a digit, 256 characters at most. */
const NAME = /^[A-Z_][A-Z0-9_]{0,255}$/;

/**
 * Whether a name is one a secret's `{ env }` reference gives the variable
 * that holds it: capitals, digits and `_`, not starting with a digit, up to
 * 256 characters — `ORDERS_SPEC_TOKEN`. A credential pasted where the name
 * goes mixes in lower case or a symbol and is no such name, so Studio's
 * server, `courier-studio import`, the import wizard and the editor all
 * refuse it by this one rule, rather than take it for a name and say it
 * back.
 *
 * @param name - The name, as given
 * @returns Whether it is one
 * @example
 * ```ts
 * isSecretVariableName("ORDERS_SPEC_TOKEN"); // → true
 * isSecretVariableName("t0k3n-made-up"); // → false
 * ```
 */
export function isSecretVariableName(name: string): boolean {
  return NAME.test(name);
}
