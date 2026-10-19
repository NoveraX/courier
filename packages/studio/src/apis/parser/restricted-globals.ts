/* What the global object holds by the language's own definition: its values, functions,
   constructors and namespaces, the annex's `escape` and `unescape`, and `Intl`. */
const RESTRICTED_GLOBALS: ReadonlySet<string> = new Set([
  "AggregateError",
  "Array",
  "ArrayBuffer",
  "AsyncDisposableStack",
  "Atomics",
  "BigInt",
  "BigInt64Array",
  "BigUint64Array",
  "Boolean",
  "DataView",
  "Date",
  "DisposableStack",
  "Error",
  "EvalError",
  "FinalizationRegistry",
  "Float16Array",
  "Float32Array",
  "Float64Array",
  "Function",
  "Infinity",
  "Int16Array",
  "Int32Array",
  "Int8Array",
  "Intl",
  "Iterator",
  "JSON",
  "Map",
  "Math",
  "NaN",
  "Number",
  "Object",
  "Promise",
  "Proxy",
  "RangeError",
  "ReferenceError",
  "Reflect",
  "RegExp",
  "Set",
  "SharedArrayBuffer",
  "String",
  "SuppressedError",
  "Symbol",
  "SyntaxError",
  "TypeError",
  "URIError",
  "Uint16Array",
  "Uint32Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "WeakMap",
  "WeakRef",
  "WeakSet",
  "decodeURI",
  "decodeURIComponent",
  "encodeURI",
  "encodeURIComponent",
  "escape",
  "globalThis",
  "isFinite",
  "isNaN",
  "parseFloat",
  "parseInt",
  "undefined",
  "unescape",
]);

/**
 * Tell whether a name is one of the language's own globals, which a local
 * binding would shadow: a parameter bound as `Date` hides the global from
 * the code beside it, and Biome's recommended rules refuse the binding.
 *
 * @param name - A parameter's name, as the specification writes it
 * @returns Whether the global object holds a member of that name by definition
 * @example
 * ```ts
 * isRestrictedGlobal("Date"); // true
 * isRestrictedGlobal("date"); // false
 * ```
 */
export function isRestrictedGlobal(name: string): boolean {
  return RESTRICTED_GLOBALS.has(name);
}
