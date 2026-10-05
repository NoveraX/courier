/**
 * How Studio loads a courier.config or courier.mocks file written in
 * JavaScript that Node would import natively — an .mjs or .cjs file, a .js
 * file in a "type": "module" package, a CommonJS .js file: every load
 * evaluates it afresh, so an edit to it is seen by the next load instead of
 * the value it held when it was first imported. A CommonJS file runs as Node
 * runs it, with its module.exports as its default export, a process that
 * required it itself keeping the module it got, and is transpiled when Node
 * cannot run it, as the runtime's loader transpiles it; an ES module file is
 * evaluated as a TypeScript one is. What a CommonJS file requires is Node's,
 * and stays as Node first ran it; a JSON module is read afresh by every load.
 */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadCourierConfigFile, loadCourierMocksFile } from "@noverax/courier-studio-core/config";
import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";
import { type LoadedCourierConfig, loadCourierConfig } from "../src/server/config-loader";
import { isRecord } from "../src/server/mocks-edit/is-record";

interface EntryCase {
  /** What the case is, for the test's name. */
  label: string;
  /** The entry's file name in the project root. */
  file: string;
  /** The `type` of the project's package.json; none is written when absent. */
  packageType?: "module" | "commonjs";
  /** The entry's source, exporting `value`. */
  source: (value: string) => string;
}

const esm = (value: string): string => `export default ${value};\n`;
const commonjs = (value: string): string => `module.exports = ${value};\n`;
const configOf = (baseURL: string): string =>
  `{ sources: { api: { baseURL: ${JSON.stringify(baseURL)} } } }`;

const CONFIG_CASES: EntryCase[] = [
  { label: "a courier.config.mjs", file: "courier.config.mjs", source: esm },
  {
    label: "a courier.config.js in a type: module package",
    file: "courier.config.js",
    packageType: "module",
    source: esm,
  },
  { label: "a courier.config.cjs", file: "courier.config.cjs", source: commonjs },
  {
    label: "a CommonJS courier.config.js",
    file: "courier.config.js",
    packageType: "commonjs",
    source: commonjs,
  },
];

const MOCKS_CASES: EntryCase[] = [
  { label: "a courier.mocks.mjs", file: "courier.mocks.mjs", source: esm },
  {
    label: "a courier.mocks.js in a type: module package",
    file: "courier.mocks.js",
    packageType: "module",
    source: esm,
  },
  { label: "a courier.mocks.cjs", file: "courier.mocks.cjs", source: commonjs },
  {
    label: "a CommonJS courier.mocks.js",
    file: "courier.mocks.js",
    packageType: "commonjs",
    source: commonjs,
  },
];

/** A global a sloppy-mode config assigns without declaring it. */
const SLOPPY_GLOBAL = "courierTestSloppyBaseURL";

/** Node's require cache, which what a CommonJS entry requires is left in. */
const NODE_REQUIRE_CACHE = createRequire(import.meta.url).cache;

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-javascript-entries-")));
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, SLOPPY_GLOBAL);
  for (const file of Object.keys(NODE_REQUIRE_CACHE)) {
    if (file.startsWith(dir)) Reflect.deleteProperty(NODE_REQUIRE_CACHE, file);
  }
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

function writeProject({ packageType }: EntryCase): void {
  if (packageType !== undefined) {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: packageType }));
  }
}

function writeFiles(files: Record<string, string>): void {
  for (const [name, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), contents);
  }
}

function baseURLOf(loaded: LoadedCourierConfig): unknown {
  const api: unknown = loaded.config.sources.api;
  assert(isRecord(api), "sources.api is not an object");
  return api.baseURL;
}

/** The config the mocks file's `apiMock` holds. */
function mockedConfigOf(loaded: LoadedCourierConfig): unknown {
  const declared = loaded.mocks.entries.apiMock;
  assert(isRecord(declared), "apiMock is not an object");
  return declared.config;
}

describe("loadCourierConfig on a JavaScript config", () => {
  it.each(CONFIG_CASES)("sees an edit of $label on the next load", async (entry) => {
    writeProject(entry);
    const file = join(dir, entry.file);
    writeFileSync(file, entry.source(configOf("https://v1.example.com")));
    const first = await loadCourierConfig(dir);

    writeFileSync(file, entry.source(configOf("https://v2.example.com")));
    const second = await loadCourierConfig(dir);

    expect(baseURLOf(first)).toBe("https://v1.example.com");
    expect(baseURLOf(second)).toBe("https://v2.example.com");
  });
});

describe("loadCourierConfig on a JavaScript mocks file", () => {
  it.each(MOCKS_CASES)("sees an edit of $label on the next load", async (entry) => {
    writeProject(entry);
    writeFileSync(join(dir, "courier.config.ts"), esm(configOf("https://api.example.com")));
    const file = join(dir, entry.file);
    writeFileSync(file, entry.source("{ before: {} }"));
    const first = await loadCourierConfig(dir);

    writeFileSync(file, entry.source("{ after: {} }"));
    const second = await loadCourierConfig(dir);

    expect(first.mocks.entries).toEqual({ before: {} });
    expect(second.mocks.entries).toEqual({ after: {} });
    expect(second.mocks).toMatchObject({ file, error: null });
  });
});

describe("loadCourierConfig on a CommonJS config, as Node runs it", () => {
  it("runs a courier.config.cjs in sloppy mode, its top-level this its exports", async () => {
    writeFileSync(
      join(dir, "courier.config.cjs"),
      `${SLOPPY_GLOBAL} = "https://sloppy.example.com";\nthis.sources = { api: { baseURL: ${SLOPPY_GLOBAL} } };\n`,
    );

    const loaded = await loadCourierConfig(dir);

    expect(baseURLOf(loaded)).toBe("https://sloppy.example.com");
  });

  it("lets a courier.config.cjs return at its top level", async () => {
    writeFileSync(
      join(dir, "courier.config.cjs"),
      `module.exports = ${configOf("https://api.example.com")};\nif (module.exports.sources) return;\nmodule.exports = {};\n`,
    );

    const loaded = await loadCourierConfig(dir);

    expect(baseURLOf(loaded)).toBe("https://api.example.com");
  });

  it("takes a CommonJS config's whole module.exports as its default, as the runtime does", async () => {
    const file = join(dir, "courier.config.cjs");
    writeFileSync(
      file,
      `Object.defineProperty(exports, "__esModule", { value: true });\nexports.default = ${configOf("https://api.example.com")};\n`,
    );

    const failure = await loadCourierConfig(dir).catch((error: unknown) => error);
    const runtime = await loadCourierConfigFile(file);

    expect(String(failure)).toContain("courier.config.sources is required");
    expect(runtime.config.sources).toBeUndefined();
  });

  it("hands a courier.mocks.cjs that requires the courier.config.cjs the config Studio loaded, afresh after an edit", async () => {
    const file = join(dir, "courier.config.cjs");
    writeFileSync(file, commonjs(configOf("https://v1.example.com")));
    writeFileSync(
      join(dir, "courier.mocks.cjs"),
      'module.exports = { apiMock: { config: require("./courier.config.cjs") } };\n',
    );
    const first = await loadCourierConfig(dir);

    writeFileSync(file, commonjs(configOf("https://v2.example.com")));
    const second = await loadCourierConfig(dir);

    expect(mockedConfigOf(first)).toBe(first.config);
    expect(mockedConfigOf(second)).toBe(second.config);
    expect(baseURLOf(second)).toBe("https://v2.example.com");
  });

  it("hands a courier.mocks.ts the courier.config.cjs Studio loaded, afresh after an edit", async () => {
    const file = join(dir, "courier.config.cjs");
    writeFileSync(file, commonjs(configOf("https://v1.example.com")));
    writeFileSync(
      join(dir, "courier.mocks.ts"),
      'import config from "./courier.config.cjs";\nexport default { apiMock: { config } };\n',
    );
    const first = await loadCourierConfig(dir);

    writeFileSync(file, commonjs(configOf("https://v2.example.com")));
    const second = await loadCourierConfig(dir);

    expect(mockedConfigOf(first)).toBe(first.config);
    expect(mockedConfigOf(second)).toBe(second.config);
    expect(baseURLOf(second)).toBe("https://v2.example.com");
  });
});

/** A TypeScript module Node's type stripping cannot run: it declares an enum. */
const ENUM_BASE =
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the template is the fixture's source code, written out as text
  'enum Scheme {\n  Https = "https",\n}\nexport const baseURL: string = `${Scheme.Https}://api.example.com`;\n';

const TYPED_BASE = 'export const baseURL: string = "https://api.example.com";\n';

const REQUIRES_BASE = (specifier: string): string =>
  `const { baseURL } = require(${JSON.stringify(specifier)});\nmodule.exports = { sources: { api: { baseURL } } };\n`;

const FALLBACK_CASES: Array<{ label: string; config: string; files: Record<string, string> }> = [
  {
    label: "a CommonJS courier.config.js that requires TypeScript by an extensionless path",
    config: "courier.config.js",
    files: {
      "package.json": JSON.stringify({ type: "commonjs" }),
      "courier.config.js": REQUIRES_BASE("./src/base"),
      "src/base.ts": TYPED_BASE,
    },
  },
  {
    label: "a courier.config.cjs that requires TypeScript through a tsconfig path alias",
    config: "courier.config.cjs",
    files: {
      "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
      "courier.config.cjs": REQUIRES_BASE("@/base"),
      "src/base.ts": TYPED_BASE,
    },
  },
  {
    label: "a courier.config.cjs that requires TypeScript Node cannot strip",
    config: "courier.config.cjs",
    files: { "courier.config.cjs": REQUIRES_BASE("./src/base.ts"), "src/base.ts": ENUM_BASE },
  },
  {
    label: "a courier.config.cjs written with ES module syntax",
    config: "courier.config.cjs",
    files: { "courier.config.cjs": esm(configOf("https://api.example.com")) },
  },
  {
    label: "a CommonJS courier.config.js with a top-level await",
    config: "courier.config.js",
    files: {
      "package.json": JSON.stringify({ type: "commonjs" }),
      "courier.config.js":
        'const baseURL = await Promise.resolve("https://api.example.com");\nmodule.exports = { sources: { api: { baseURL } } };\n',
    },
  },
];

describe("loadCourierConfig on a CommonJS entry Node cannot run, as the runtime transpiles it", () => {
  it.each(FALLBACK_CASES)("loads $label", async ({ config, files }) => {
    writeFiles(files);

    const loaded = await loadCourierConfig(dir);
    const runtime = await loadCourierConfigFile(join(dir, config));

    expect(baseURLOf(loaded)).toBe("https://api.example.com");
    expect(runtime.config.sources.api).toEqual({ baseURL: "https://api.example.com" });
  });

  it("loads a courier.mocks.cjs written with export default, as the mock worker does", async () => {
    writeFileSync(join(dir, "courier.config.ts"), esm(configOf("https://api.example.com")));
    const file = join(dir, "courier.mocks.cjs");
    writeFileSync(file, "export default { apiMock: { port: 1 } };\n");

    const loaded = await loadCourierConfig(dir);
    const worker = await loadCourierMocksFile(file);

    expect(loaded.mocks).toMatchObject({ entries: { apiMock: { port: 1 } }, error: null });
    expect(worker.mocks).toEqual({ apiMock: { port: 1 } });
  });

  it("loads a courier.mocks.cjs Node cannot run, its module.exports its mocks, as the mock worker does", async () => {
    writeFileSync(join(dir, "courier.config.ts"), esm(configOf("https://api.example.com")));
    const file = join(dir, "courier.mocks.cjs");
    writeFileSync(
      file,
      "const port = await Promise.resolve(1);\nmodule.exports = { apiMock: { port } };\n",
    );

    const loaded = await loadCourierConfig(dir);
    const worker = await loadCourierMocksFile(file);

    expect(loaded.mocks).toMatchObject({ entries: { apiMock: { port: 1 } }, error: null });
    expect(worker.mocks).toEqual({ apiMock: { port: 1 } });
  });

  it("sees a module a courier.mocks.cjs requires stop throwing on the next load", async () => {
    writeFileSync(join(dir, "courier.config.ts"), esm(configOf("https://api.example.com")));
    writeFileSync(join(dir, "port.mjs"), "export const port = notDefinedYet;\n");
    writeFileSync(
      join(dir, "courier.mocks.cjs"),
      'const { port } = require("./port.mjs");\nmodule.exports = { apiMock: { port } };\n',
    );
    const first = await loadCourierConfig(dir);

    writeFileSync(join(dir, "port.mjs"), "export const port = 1;\n");
    const second = await loadCourierConfig(dir);

    expect(String(first.mocks.error)).toContain("notDefinedYet is not defined");
    expect(second.mocks).toMatchObject({ entries: { apiMock: { port: 1 } }, error: null });
  });

  it("sees a module a courier.config.cjs requires stop throwing on the next load", async () => {
    writeFileSync(join(dir, "base.mjs"), "export const baseURL = notDefinedYet;\n");
    writeFileSync(join(dir, "courier.config.cjs"), REQUIRES_BASE("./base.mjs"));
    const failure = await loadCourierConfig(dir).catch((error: unknown) => error);

    writeFileSync(join(dir, "base.mjs"), 'export const baseURL = "https://api.example.com";\n');
    const loaded = await loadCourierConfig(dir);

    expect(String(failure)).toContain("notDefinedYet is not defined");
    expect(baseURLOf(loaded)).toBe("https://api.example.com");
  });
});

describe("loadCourierConfig beside a process that required the config itself", () => {
  it("leaves that process the courier.config.cjs module it got", async () => {
    const file = join(dir, "courier.config.cjs");
    writeFileSync(file, commonjs(configOf("https://api.example.com")));
    const hostRequire = createRequire(join(dir, "next.config.js"));
    const hosts: unknown = hostRequire("./courier.config.cjs");

    const loaded = await loadCourierConfig(dir);

    expect(hostRequire("./courier.config.cjs")).toBe(hosts);
    expect(baseURLOf(loaded)).toBe("https://api.example.com");
  });
});

describe("loadCourierConfig on the modules Node's require cache holds", () => {
  it("keeps a TypeScript module a courier.config.cjs requires as Node first ran it, apart from the one a courier.mocks.ts imports", async () => {
    const base = (baseURL: string): string =>
      `export const base = { baseURL: ${JSON.stringify(baseURL)} };\n`;
    writeFileSync(join(dir, "base.ts"), base("https://v1.example.com"));
    writeFileSync(
      join(dir, "courier.config.cjs"),
      'const { base } = require("./base.ts");\nmodule.exports = { sources: { api: { baseURL: base.baseURL } }, base };\n',
    );
    writeFileSync(
      join(dir, "courier.mocks.ts"),
      'import { base } from "./base";\nexport default { apiMock: { base } };\n',
    );
    const first = await loadCourierConfig(dir);

    writeFileSync(join(dir, "base.ts"), base("https://v2.example.com"));
    const second = await loadCourierConfig(dir);

    const mocked = second.mocks.entries.apiMock;
    assert(isRecord(mocked), "apiMock is not an object");
    const firstMocked = first.mocks.entries.apiMock;
    assert(isRecord(firstMocked), "apiMock is not an object");
    expect(firstMocked.base).not.toBe(Reflect.get(first.config, "base"));
    expect(baseURLOf(second)).toBe("https://v1.example.com");
    expect(mocked.base).toEqual({ baseURL: "https://v2.example.com" });
  });

  it("hands a courier.mocks.cjs that requires the config Node's own evaluation of it", async () => {
    const file = join(dir, "courier.config.ts");
    writeFileSync(file, esm(configOf("https://v1.example.com")));
    writeFileSync(
      join(dir, "courier.mocks.cjs"),
      'const { default: config } = require("./courier.config.ts");\nmodule.exports = { apiMock: { config } };\n',
    );
    const first = await loadCourierConfig(dir);

    writeFileSync(file, esm(configOf("https://v2.example.com")));
    const second = await loadCourierConfig(dir);

    const mocked = mockedConfigOf(second);
    assert(isRecord(mocked), "the mocked config is not an object");
    expect(mockedConfigOf(first)).not.toBe(first.config);
    expect(baseURLOf(second)).toBe("https://v2.example.com");
    expect(mocked.sources).toEqual({ api: { baseURL: "https://v1.example.com" } });
  });

  it("reads a JSON module the config imports afresh on the next load", async () => {
    const json = join(dir, "endpoints.json");
    writeFileSync(json, JSON.stringify({ baseURL: "https://v1.example.com" }));
    writeFileSync(
      join(dir, "courier.config.ts"),
      'import endpoints from "./endpoints.json";\nexport default { sources: { api: { baseURL: endpoints.baseURL } } };\n',
    );
    const first = await loadCourierConfig(dir);

    writeFileSync(json, JSON.stringify({ baseURL: "https://v2.example.com" }));
    const second = await loadCourierConfig(dir);

    expect(baseURLOf(first)).toBe("https://v1.example.com");
    expect(baseURLOf(second)).toBe("https://v2.example.com");
    expect(second.deps).toContain(json);
  });

  it("reads a JSON module a courier.config.cjs requires afresh on the next load", async () => {
    const json = join(dir, "endpoints.json");
    writeFileSync(json, JSON.stringify({ baseURL: "https://v1.example.com" }));
    writeFileSync(join(dir, "courier.config.cjs"), REQUIRES_BASE("./endpoints.json"));
    const first = await loadCourierConfig(dir);

    writeFileSync(json, JSON.stringify({ baseURL: "https://v2.example.com" }));
    const second = await loadCourierConfig(dir);

    expect(baseURLOf(first)).toBe("https://v1.example.com");
    expect(baseURLOf(second)).toBe("https://v2.example.com");
  });

  it("leaves a JSON module required before the load as that process got it", async () => {
    const json = join(dir, "endpoints.json");
    writeFileSync(json, JSON.stringify({ baseURL: "https://api.example.com" }));
    writeFileSync(join(dir, "courier.config.cjs"), REQUIRES_BASE("./endpoints.json"));
    const hostRequire = createRequire(join(dir, "next.config.js"));
    const hosts: unknown = hostRequire("./endpoints.json");

    await loadCourierConfig(dir);

    expect(hostRequire("./endpoints.json")).toBe(hosts);
  });
});

describe("loadCourierConfig on an ES module config, as it evaluates TypeScript", () => {
  it("has CommonJS's require, exports and __dirname, and an arguments object, in scope in a courier.config.mjs", async () => {
    writeFileSync(
      join(dir, "courier.config.mjs"),
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the template is the fixture's source code, written out as text
      "export default { sources: { api: { baseURL: `${typeof require}:${typeof exports}:${typeof __dirname}:${typeof arguments}` } } };\n",
    );

    const loaded = await loadCourierConfig(dir);

    expect(baseURLOf(loaded)).toBe("function:object:string:object");
  });

  it("leaves a courier.config.mjs no top-level this, as Node does", async () => {
    const file = join(dir, "courier.config.mjs");
    writeFileSync(file, "export default { sources: { api: { baseURL: typeof this } } };\n");

    const loaded = await loadCourierConfig(dir);
    const runtime = await loadCourierConfigFile(file);

    expect(baseURLOf(loaded)).toBe("undefined");
    expect(runtime.config.sources.api).toEqual({ baseURL: "undefined" });
  });

  it("hands a courier.config.mjs the default of a CommonJS module marked __esModule", async () => {
    writeFileSync(
      join(dir, "base-url.cjs"),
      'Object.defineProperty(exports, "__esModule", { value: true });\nexports.default = function baseURL() {};\n',
    );
    writeFileSync(
      join(dir, "courier.config.mjs"),
      'import baseURL from "./base-url.cjs";\nexport default { sources: { api: { baseURL: typeof baseURL } } };\n',
    );

    const loaded = await loadCourierConfig(dir);

    expect(baseURLOf(loaded)).toBe("function");
  });
});

describe("a courier.config.cjs written as an ES module", () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "courier-esm-cjs-")));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("is transpiled without Node warning of an ES module it could not load", async () => {
    const warnings: string[] = [];
    const onWarning = (warning: Error) => warnings.push(warning.message);
    process.on("warning", onWarning);
    try {
      writeFileSync(join(root, "courier.config.cjs"), esm(configOf("https://esm.example")));

      const loaded = await loadCourierConfig(root);

      expect(baseURLOf(loaded)).toBe("https://esm.example");
      expect(warnings.filter((message) => message.includes("ES module"))).toEqual([]);
    } finally {
      process.off("warning", onWarning);
    }
  });
});
