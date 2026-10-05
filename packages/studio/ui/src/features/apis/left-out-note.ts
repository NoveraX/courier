/**
 * What the wizard says of the endpoints left out in Select: the `imports`
 * entry cannot keep that selection, so Manage lists them as endpoints to add.
 *
 * @param leftOut - How many endpoints were left out
 * @returns The note
 * @example
 * ```ts
 * leftOutNote(2); // → "You left 2 endpoints out in Select. The imports entry cannot keep …"
 * ```
 */
export function leftOutNote(leftOut: number): string {
  const count = leftOut === 1 ? "1 endpoint" : `${leftOut} endpoints`;
  return `You left ${count} out in Select. The imports entry cannot keep that selection, so Manage lists ${leftOut === 1 ? "that one" : "those"} as endpoints you can add.`;
}
