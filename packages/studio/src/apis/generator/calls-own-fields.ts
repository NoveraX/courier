import { parseSource } from "@noverax/courier-cli/devkit";
import { referencedNames } from "../manage/referenced-names";

/* What a module declares to check an object whose fields include a name every object inherits. */
const OWN_FIELDS = "_ownFields";

/**
 * Whether code Studio wrote calls `_ownFields`, which the module it goes
 * into then declares. Read from the code as it was written, so a module
 * declares the function exactly when it calls it: a field written as a
 * reference alone — `ThingSchema`, whose specification set an object with
 * a field `constructor` beside the reference — calls none, and neither
 * does a key or a pattern that spells the name. Code that never spells it
 * is not parsed.
 *
 * @param code - Statements Studio wrote, without the function's own declaration, or one expression in parentheses
 * @returns Whether the code refers to `_ownFields`; code that cannot be read back is taken to
 * @example
 * ```ts
 * callsOwnFields("export const ThingSchema = _ownFields(z.looseObject({ constructor: z.string() }));"); // → true
 * callsOwnFields("export const BoxSchema = z.looseObject({ thing: ThingSchema });"); // → false
 * ```
 */
export function callsOwnFields(code: string): boolean {
  if (!code.includes(OWN_FIELDS)) return false;
  const parsed = parseSource("code.ts", code);
  /* Declared when in doubt: a function nothing calls is all a wrong guess costs, where a missing one fails the module. */
  if (parsed.problem !== null) return true;
  return referencedNames(parsed.program.body).has(OWN_FIELDS);
}
