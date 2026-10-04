/**
 * Whether two ids name the same record, whatever their JavaScript type.
 *
 * An id arrives from a URL as a string while a record may hold it as a number
 * — or the reverse — and comparing with `===` finds neither: every by-id
 * route would answer 404 for records keyed "1" or "007", and a PUT would
 * create a second record beside the one it means to replace.
 *
 * @param stored - The record's id
 * @param wanted - The id asked for
 * @returns Whether they are the same id
 * @example
 * sameId(1, "1"); // true
 * sameId("007", "7"); // false
 */
export function sameId(stored: unknown, wanted: unknown): boolean {
  if (stored === wanted) return true;
  const comparable = (value: unknown) => typeof value === "string" || typeof value === "number";
  return comparable(stored) && comparable(wanted) && String(stored) === String(wanted);
}
