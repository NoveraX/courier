/**
 * The modules one published module imports, by the specifier it names:
 * static imports, re-exports and dynamic imports of a literal path — the
 * ones a bundler follows — and the calls a bundler reads as an import
 * though no import names it: `import.meta.glob` of a path,
 * `new URL(path, import.meta.url)` for an asset or a worker,
 * `require.resolve` and `import.meta.resolve` of a path, and webpack's
 * `require.ensure` of a list of them. A built module has no type imports
 * left.
 *
 * @param {typeof import("typescript")} ts - The TypeScript compiler, whose scanner and parser read the imports
 * @param {string} code - The module's JavaScript
 * @returns {string[]} The specifiers, in the order they appear
 * @example
 * importsOf(ts, 'import { a } from "./a.js"; new Worker(new URL("./b.js", import.meta.url));'); // ["./a.js", "./b.js"]
 */
export function importsOf(ts, code) {
  const named = ts
    .preProcessFile(code, true, true)
    .importedFiles.map((file) => ({ at: file.pos, specifier: file.fileName }));
  const read = importCallsOf(ts, code).flatMap((call) => call.paths);
  return [...named, ...read].sort((a, b) => a.at - b.at).map((each) => each.specifier);
}

/**
 * The calls of one published module that import what a bundler cannot
 * tell by name as it builds: a dynamic import, a `require()`, a
 * `require.resolve`, an `import.meta.resolve`, a `require.ensure` or a
 * `new URL(…, import.meta.url)` whose argument is no string, an
 * `import.meta.glob` of no string or of a pattern, and a context of a
 * folder, webpack's `import.meta.webpackContext` or `require.context`,
 * which takes in each module of the folder its expression matches. A
 * bundler leaves such an import to run as it is, or takes in whatever the
 * folder it names holds, and no check of the modules a page reaches sees
 * where it leads.
 *
 * @param {typeof import("typescript")} ts - The TypeScript compiler, whose parser reads the calls
 * @param {string} code - The module's JavaScript
 * @returns {{ kind: string, line: number, pattern?: true }[]} Each call, the line it is on, and whether it names its modules by a pattern
 * @example
 * computedImportsOf(ts, "const at = './a.js';\nawait import(at);"); // [{ kind: "import", line: 2 }]
 */
export function computedImportsOf(ts, code) {
  return importCallsOf(ts, code)
    .filter((call) => call.computed || call.pattern)
    .map(({ kind, line, pattern }) => ({ kind, line, ...(pattern && { pattern }) }));
}

/* What a glob reads as a pattern rather than as one path, as Vite's and webpack's read it. */
const GLOB_PATTERN = /[*?[\]{}]|^!/;

/* An address with a scheme of its own, which is fetched as it is, not built in. */
const SCHEME = /^[a-z][\w+.-]*:/i;

/* Each call that imports, with the paths it names as strings a bundler follows — those of a
   dynamic import and a `require()` the scanner reads already — and whether it names any by no
   string, or by a pattern. */
function importCallsOf(ts, code) {
  const file = ts.createSourceFile(
    "module.js",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const calls = [];
  const visit = (node) => {
    const call = importCallOf(ts, node);
    if (call !== undefined) {
      calls.push({
        ...call,
        line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return calls;
}

function importCallOf(ts, node) {
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    const [first] = node.arguments;
    if (callee.kind === ts.SyntaxKind.ImportKeyword) return named(ts, "import", first, false);
    if (isName(ts, callee, "require")) return named(ts, "require", first, false);
    if (isMember(ts, callee, "glob", (object) => isImportMeta(ts, object))) {
      return globbed(ts, first);
    }
    if (isMember(ts, callee, "resolve", (object) => isName(ts, object, "require"))) {
      return named(ts, "require.resolve", first, true);
    }
    if (isMember(ts, callee, "resolve", (object) => isImportMeta(ts, object))) {
      return named(ts, "import.meta.resolve", first, true);
    }
    if (isMember(ts, callee, "ensure", (object) => isName(ts, object, "require"))) {
      return ensured(ts, first);
    }
    if (isMember(ts, callee, "webpackContext", (object) => isImportMeta(ts, object))) {
      return contexted(ts, "import.meta.webpackContext", first);
    }
    if (isMember(ts, callee, "context", (object) => isName(ts, object, "require"))) {
      return contexted(ts, "require.context", first);
    }
  }
  if (ts.isNewExpression(node) && isName(ts, node.expression, "URL")) {
    const [first, base] = node.arguments ?? [];
    if (base !== undefined && isMember(ts, base, "url", (object) => isImportMeta(ts, object))) {
      if (first !== undefined && ts.isStringLiteralLike(first) && SCHEME.test(first.text)) {
        return undefined;
      }
      return named(ts, "new URL", first, true);
    }
  }
  return undefined;
}

/* A call that names one module: followed where its argument is a string and `follows` says the
   scanner did not read it already, and computed where it is no string. */
function named(ts, kind, argument, follows) {
  if (argument === undefined || !ts.isStringLiteralLike(argument)) {
    return { kind, paths: [], computed: true };
  }
  return { kind, paths: follows ? [pathOf(argument)] : [], computed: false };
}

/* `import.meta.glob` of a path, a pattern, or a list of them. */
function globbed(ts, argument) {
  const given =
    argument !== undefined && ts.isArrayLiteralExpression(argument)
      ? [...argument.elements]
      : [argument];
  const strings = given.filter((each) => each !== undefined && ts.isStringLiteralLike(each));
  const paths = strings.filter((each) => !GLOB_PATTERN.test(each.text));
  return {
    kind: "import.meta.glob",
    paths: paths.map(pathOf),
    computed: strings.length < given.length,
    pattern: paths.length < strings.length,
  };
}

/* webpack's `require.ensure` of the modules a later `require` takes, by a list of their paths. */
function ensured(ts, argument) {
  if (argument === undefined || !ts.isArrayLiteralExpression(argument)) {
    return named(ts, "require.ensure", argument, true);
  }
  const strings = argument.elements.filter((each) => ts.isStringLiteralLike(each));
  return {
    kind: "require.ensure",
    paths: strings.map(pathOf),
    computed: strings.length < argument.elements.length,
  };
}

/* A context of a folder: every module in it that its expression matches, a pattern whatever it is
   given, and none a bundler can tell where the folder is no string. */
function contexted(ts, kind, folder) {
  const literal = folder !== undefined && ts.isStringLiteralLike(folder);
  return { kind, paths: [], computed: !literal, pattern: literal };
}

function pathOf(literal) {
  return { at: literal.getStart(), specifier: literal.text };
}

function isName(ts, node, name) {
  return ts.isIdentifier(node) && node.text === name;
}

function isMember(ts, node, name, isObject) {
  return (
    ts.isPropertyAccessExpression(node) && node.name.text === name && isObject(node.expression)
  );
}

function isImportMeta(ts, node) {
  return (
    ts.isMetaProperty(node) &&
    node.keywordToken === ts.SyntaxKind.ImportKeyword &&
    node.name.text === "meta"
  );
}
