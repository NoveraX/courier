/**
 * The key a source carries its name under, from `Symbol.for`, so that a
 * copy of Courier loaded twice reads the name the other wrote. `defineApi`
 * writes it; `source-name.ts` reads it, and stamps another over it, in a
 * module of its own: Next.js keeps in a module every export any page of an
 * app takes, and a page of definitions alone reads no source's name.
 */
export const SOURCE_NAME_KEY: unique symbol = Symbol.for("courier.source.name");
