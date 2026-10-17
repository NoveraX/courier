import { codeMatches, type SourceScan, scanSource } from "./source-scan";

/** A name an import binds: what the module exports under it — `default`, or `*` for the module itself — and the name the file gives it. */
export interface ImportBinding {
  readonly imported: string;
  readonly local: string;
}

/** A module a file loads in its code, the names it binds, and where the statement is. */
export interface ModuleImport {
  readonly specifier: string;
  readonly bindings: readonly ImportBinding[];
  /** `import … from` and `import "…"`; else `import()` or `require()`, which may run later than the file. */
  readonly static: boolean;
  readonly start: number;
  readonly end: number;
}

const NAME = "[A-Za-z_$][\\w$]*";
const SPECIFIER = `(["'])([^"'\\n]+)`;
const STATIC = new RegExp(
  `\\bimport\\s+(?!type\\s)([^;"'\`]*?)\\s*\\bfrom\\s*${SPECIFIER}\\2`,
  "g",
);
const EXPORTED = new RegExp(
  `\\bexport\\s+(?!type\\s)(?:\\*(?:\\s+as\\s+${NAME})?|\\{[^}]*\\})\\s*from\\s*${SPECIFIER}\\1`,
  "g",
);
const BARE = new RegExp(`\\bimport\\s*${SPECIFIER}\\1`, "g");
const LOADED = `(?:await\\s+import|require)\\s*\\(\\s*${SPECIFIER}\\2\\s*\\)`;
const DESTRUCTURED = new RegExp(`\\b(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*${LOADED}`, "g");
const WHOLE = new RegExp(`\\b(?:const|let|var)\\s+(${NAME})\\s*=\\s*${LOADED}`, "g");
const THEN = new RegExp(
  `\\bimport\\s*\\(\\s*${SPECIFIER}\\1\\s*\\)\\s*\\.then\\s*\\(\\s*(?:async\\s*)?\\(\\s*\\{([^}]*)\\}`,
  "g",
);
const CALLED = new RegExp(`\\b(?:import|require)\\s*\\(\\s*${SPECIFIER}\\1\\s*\\)`, "g");

/* `a, b as c, type d` — or, destructured, `a, b: c` — as bindings; a type and a rest are left out. */
function listed(list: string, rename: RegExp): ImportBinding[] {
  return list
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "" && !part.startsWith("type ") && !part.startsWith("..."))
    .flatMap((part) => {
      const renamed = rename.exec(part);
      if (renamed)
        return [{ imported: (renamed[1] ?? "").replace(/["']/g, ""), local: renamed[2] ?? "" }];
      const plain = new RegExp(`^(${NAME})(?:\\s*=[\\s\\S]*)?$`).exec(part);
      return plain?.[1] ? [{ imported: plain[1], local: plain[1] }] : [];
    });
}

/**
 * The names a destructuring pattern binds: `{ default: config, sources }`
 * read as `default` bound to `config`, and `sources` to itself.
 *
 * @param list - The pattern's text, inside its braces
 * @returns The bindings
 * @example
 * ```ts
 * destructured("default: config"); // [{ imported: "default", local: "config" }]
 * ```
 */
export function destructured(list: string): ImportBinding[] {
  return listed(list, COLON);
}

const AS = new RegExp(`^(${NAME}|"[^"]*"|'[^']*')\\s+as\\s+(${NAME})$`);
const COLON = new RegExp(`^(${NAME})\\s*:\\s*(${NAME})(?:\\s*=[\\s\\S]*)?$`);

/* What `import X, * as Y, { a as b } from` binds. */
function clauseBindings(clause: string): ImportBinding[] {
  const braces = /\{([^}]*)\}/.exec(clause);
  const found = braces ? listed(braces[1] ?? "", AS) : [];
  for (const part of clause.replace(/\{[^}]*\}/, "").split(",")) {
    const name = part.trim();
    const whole = new RegExp(`^\\*\\s*as\\s+(${NAME})$`).exec(name);
    if (whole?.[1]) found.push({ imported: "*", local: whole[1] });
    else if (new RegExp(`^${NAME}$`).test(name)) found.push({ imported: "default", local: name });
  }
  return found;
}

/**
 * Every module a file loads in its code — `import … from`, `import "…"`,
 * `export … from`, `import()` and `require()` — with the names each binds: an `import()`
 * or `require()` destructured, given a name, or followed by `.then` with a
 * destructured parameter. A load written in a comment or a string is not one.
 *
 * @param scan - The scanned file
 * @returns The imports, in no particular order
 * @example
 * ```ts
 * importsOf(scan).find((each) => each.specifier === "@noverax/courier")?.bindings;
 * // [{ imported: "registerSources", local: "registerSources" }]
 * ```
 */
export function importsOf(scan: SourceScan): ModuleImport[] {
  const found: ModuleImport[] = [];
  const add = (
    match: RegExpExecArray,
    specifier: string,
    bindings: ImportBinding[],
    isStatic: boolean,
  ) => {
    const start = match.index;
    if (found.some((each) => each.start <= start && start < each.end)) return;
    found.push({ specifier, bindings, static: isStatic, start, end: start + match[0].length });
  };
  for (const match of codeMatches(scan, STATIC))
    add(match, match[3] ?? "", clauseBindings(match[1] ?? ""), true);
  for (const match of codeMatches(scan, BARE)) add(match, match[2] ?? "", [], true);
  for (const match of codeMatches(scan, EXPORTED)) add(match, match[2] ?? "", [], true);
  for (const match of codeMatches(scan, DESTRUCTURED))
    add(match, match[3] ?? "", destructured(match[1] ?? ""), false);
  for (const match of codeMatches(scan, WHOLE))
    add(match, match[3] ?? "", [{ imported: "*", local: match[1] ?? "" }], false);
  for (const match of codeMatches(scan, THEN))
    add(match, match[2] ?? "", destructured(match[3] ?? ""), false);
  for (const match of codeMatches(scan, CALLED)) add(match, match[2] ?? "", [], false);
  return found;
}

/* A name as a pattern: `$` is a character of names, and of patterns. */
function namePattern(name: string): string {
  return name.replace(/[$.]/g, (char) => (char === "." ? "\\s*\\.\\s*" : "\\$"));
}

/**
 * Every place the code uses a name — or calls it — outside the statements
 * that import it; a property of another object of that name is not a use.
 *
 * @param scan - The scanned file
 * @param imports - The file's imports
 * @param name - The name, or `module.member` for a member of a module imported whole
 * @param call - Whether only a call counts
 * @returns The index of each use
 * @example
 * ```ts
 * usesOf(scan, importsOf(scan), "attachRuntime", true).length; // 1 for `await attachRuntime();`
 * ```
 */
export function usesOf(
  scan: SourceScan,
  imports: readonly ModuleImport[],
  name: string,
  call: boolean,
): number[] {
  const pattern = new RegExp(
    `(?<![\\w$.])${namePattern(name)}(?![\\w$])${call ? "\\s*\\(" : ""}`,
    "g",
  );
  return codeMatches(scan, pattern)
    .map((match) => match.index)
    .filter((at) => !imports.some((each) => each.start <= at && at < each.end));
}

/**
 * Whether a file uses — or calls — what a module exports, imported under
 * any name, or as a member of the module imported whole.
 *
 * @param scan - The scanned file
 * @param imports - The file's imports
 * @param module - Whether a specifier names the module
 * @param exported - The export: `courierHandler`, `default`
 * @param call - Whether only a call counts
 * @returns Whether it does
 * @example
 * ```ts
 * usesExport(scan, importsOf(scan), (spec) => spec === "@noverax/courier-next", "apiRoute", true);
 * ```
 */
export function usesExport(
  scan: SourceScan,
  imports: readonly ModuleImport[],
  module: (specifier: string) => boolean,
  exported: string,
  call: boolean,
): boolean {
  return imports
    .filter((each) => module(each.specifier))
    .flatMap((each) => each.bindings)
    .some((binding) => {
      if (binding.imported === exported)
        return usesOf(scan, imports, binding.local, call).length > 0;
      return (
        binding.imported === "*" &&
        usesOf(scan, imports, `${binding.local}.${exported}`, call).length > 0
      );
    });
}

/**
 * Whether a file's code loads a module: an import of it written in a
 * comment or a string does not count.
 *
 * @param text - The file
 * @param specifier - The module, as the file names it
 * @returns Whether it does; `false` where the file's brackets do not pair
 * @example
 * ```ts
 * loads('import { courier } from "./courier/routes";', "./courier/routes"); // true
 * ```
 */
export function loads(text: string, specifier: string): boolean {
  const scan = scanSource(text);
  return scan !== undefined && importsOf(scan).some((each) => each.specifier === specifier);
}

/**
 * Whether a file binds a name at all: an import gives it, or the code
 * declares it — a const, a function, a class, a name destructured. A
 * name a comment or a string holds is not bound.
 *
 * @param scan - The scanned file
 * @param name - The name
 * @returns Whether it is bound
 * @example
 * ```ts
 * binds(scan, "courier"); // true where the file imports `{ courier }` from anywhere
 * ```
 */
export function binds(scan: SourceScan, name: string): boolean {
  const imported = importsOf(scan).some((each) =>
    each.bindings.some((binding) => binding.local === name),
  );
  const exact = name.replace(/\$/g, "\\$");
  const declared = new RegExp(
    `\\b(?:(?:const|let|var|function|class)\\s+${exact}(?![\\w$])|(?:const|let|var)\\s*[{[][^}\\]]*(?<![\\w$.])${exact}(?![\\w$]))`,
    "g",
  );
  return imported || codeMatches(scan, declared).length > 0;
}
