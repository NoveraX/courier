/**
 * The source of a closure that takes an endpoint's variables apart. A name
 * it takes that every object inherits — `constructor`, `__proto__` — is
 * read from a copy of the variables' own fields with no prototype: read
 * from the variables, a field the caller left out gave the inherited
 * member, and `function Object()…` was sent. The copy is made only then,
 * so every other closure reads as it always did.
 *
 * @param pattern - The destructuring pattern's entries, without braces
 * @param call - The call the closure makes with what it took
 * @param ownCopy - Whether the pattern takes a name every object inherits
 * @returns The closure's source
 * @example
 * ```ts
 * destructuringClosure("dryRun, ...body", 'http.put("items", body)', false);
 * // '(http, { dryRun, ...body }) => http.put("items", body)'
 * ```
 */
export function destructuringClosure(pattern: string, call: string, ownCopy: boolean): string {
  if (!ownCopy) return `(http, { ${pattern} }) => ${call}`;
  /* Through `globalThis`: a parameter named `Object` the pattern binds would be read here before it is bound. */
  const copy = "globalThis.Object.assign(globalThis.Object.create(null), vars)";
  return `(http, vars) => { const { ${pattern} } = ${copy}; return ${call}; }`;
}
