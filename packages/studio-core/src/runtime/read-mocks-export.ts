/**
 * The mocks a `courier.mocks.*` module declares, read from its namespace: the
 * default export, which must be an object. A module with no statements
 * declares none, and so does one whose default export is `undefined`, which
 * is how a file switches its mocks off:
 * `export default enabled ? defineMocks({ ... }) : undefined`. An ES module
 * with only named exports is a mistake worth naming, since those would
 * otherwise pass for mocks.
 *
 * The default is read as the module set it, even through the loader's
 * default-export interop, which would hand the whole namespace in place of a
 * default that is `undefined`. A CommonJS module that the loader transpiled —
 * one Node could not run — has no namespace of its own: its `module.exports`
 * is its default, as Node's import makes it, so an object neither marked
 * `__esModule` nor an ES module namespace, and with no `default`, is read
 * whole.
 *
 * @param namespace - The module's namespace object, or a CommonJS module's `module.exports`
 * @param file - The file, for the error message
 * @returns The declared mocks by key
 * @throws When an ES module has no default export, or the mocks are neither an
 *   object nor `undefined`
 * @example
 * ```ts
 * readMocksExport({ default: { apiMock: { source: api } } }, file); // → { apiMock: { source: api } }
 * readMocksExport({ default: undefined }, file); // → {}
 * ```
 */
export function readMocksExport(namespace: unknown, file: string): Record<string, unknown> {
  const exports = typeof namespace === "object" && namespace !== null ? namespace : {};
  const declared = Object.getOwnPropertyDescriptor(exports, "default");
  if (declared === undefined) return readWithoutDefault(exports, file);
  const mocks: unknown = declared.get ? declared.get.call(exports) : declared.value;
  return mocks === undefined ? {} : checkedMocks(mocks, file);
}

function readWithoutDefault(exports: object, file: string): Record<string, unknown> {
  if (isCommonJsExports(exports)) return checkedMocks(exports, file);
  if (Object.keys(exports).length === 0) return {};
  throw new Error(`${file} has no default export; export default defineMocks({ ... })`);
}

/* A transpiled ES module is marked `__esModule`, and one Node imported is a
   namespace object; `module.exports` is neither. */
function isCommonJsExports(exports: object): boolean {
  if (Object.hasOwn(exports, "__esModule")) return false;
  return Object.prototype.toString.call(exports) !== "[object Module]";
}

function checkedMocks(mocks: unknown, file: string): Record<string, unknown> {
  if (isMocksObject(mocks)) return mocks;
  throw new Error(
    `${file} must export an object of mocks by key: export default defineMocks({ ... })`,
  );
}

function isMocksObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
