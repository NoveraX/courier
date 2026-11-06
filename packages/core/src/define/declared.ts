/**
 * A type the project declares, or `never` for one it does not. A project
 * that declares neither the DOM library nor Node's types — TypeScript 6's
 * default of `types: []`, beside a `lib` of ECMAScript alone — has no
 * `FormData`, `Blob`, `ReadableStream` or `URLSearchParams`: they are an
 * `any` to the declarations that name them, and a conditional type whose
 * `extends` names such an `any`, or a type parameter constrained by it,
 * takes whatever it is given. Wrapped, the test is no conditional on it.
 *
 * @example
 * ```ts
 * type Form = Declared<FormData>; // FormData, or never where it is not declared
 * ```
 */
export type Declared<T> = [0] extends [1 & T] ? never : T;
