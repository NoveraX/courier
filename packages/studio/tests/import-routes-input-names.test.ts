/**
 * The file-changing routes refuse an output directory, a source name or an
 * import name that could put a file anywhere but the import's own folder,
 * and change nothing on the way: every refusal is a 400 with the project
 * and its surroundings exactly as they were.
 */
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseSync } from "oxc-parser";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Pets", version: "1" },
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          tags: ["pets"],
          responses: { "200": { description: "ok" } },
        },
      },
    },
  }),
);
const CONFIG_NO_IMPORTS =
  'export default { sources: { api: { baseURL: "https://api.example" } } };\n';
const CONFIG_PETS =
  'export default { sources: { api: { baseURL: "https://api.example" } }, imports: { pets: { importType: "file", type: "openapi", outputDir: "src/api" } } };\n';

let scratch: string;
let root: string;
let studio: StudioServer | undefined;
let url: string;

function put(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function start(): Promise<string> {
  return new Promise((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}

async function post(
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url, ...tokenHeader(studio) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  return {
    status: response.status,
    body: typeof payload === "object" && payload !== null ? { ...payload } : {},
  };
}

/* Every entry under the scratch directory, the project and what lies beside it, without following links. */
function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (absolute: string, relative: string): void => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const path = join(absolute, entry.name);
      const shown = relative === "" ? entry.name : `${relative}/${entry.name}`;
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) out[shown] = `link:${readlinkSync(path)}`;
      else if (stats.isDirectory()) {
        out[shown] = "dir";
        walk(path, shown);
      } else if (stats.isFile()) {
        out[shown] = `file:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
      } else out[shown] = "other";
    }
  };
  walk(scratch, "");
  return out;
}

function makeScratch(config: string): void {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-b2-names-")));
  root = join(scratch, "proj");
  mkdirSync(join(scratch, "outside"));
  writeFileSync(join(scratch, "outside/keep.ts"), "keep\n");
  put("courier.config.ts", config);
  put("package.json", '{ "name": "mine" }\n');
}

async function stop(): Promise<void> {
  await studio?.close();
  studio = undefined;
  rmSync(scratch, { recursive: true, force: true });
}

const LONG_NAME = "a".repeat(300);
const LONG_PATH = `src/${`${"b".repeat(200)}/`.repeat(8)}api`;

/* Directories the contract refuses: [label, outputDir]. */
const REFUSED_OUTPUT_DIRS: Array<[string, string]> = [
  ["absolute", "/tmp/courier-b2-abs"],
  ["the scratch sibling", "../outside"],
  ["drive-lettered", "C:/api"],
  ["drive-relative", "c:api"],
  ["drive with backslashes", "C:\\api"],
  ["UNC with backslashes", "\\\\server\\share\\api"],
  ["UNC with slashes", "//server/share/api"],
  ["parent", ".."],
  ["climbing", "src/../../outside"],
  ["climbing with backslashes", "src\\..\\..\\outside"],
  ["NUL", "src/a\u0000b"],
  ["colon (NTFS stream)", "src/api:stream"],
  ["less-than", "src/a<b"],
  ["greater-than", "src/a>b"],
  ["double quote", 'src/a"b'],
  ["pipe", "src/a|b"],
  ["question mark", "src/a?b"],
  ["asterisk", "src/a*b"],
  ["trailing dot inside", "src/api./x"],
  ["trailing space inside", "src/api /x"],
  ["trailing dot", "src/api."],
  ["device CON", "src/con"],
  ["device NUL upper", "src/NUL"],
  ["device COM1", "src/com1"],
  ["device LPT9 with extension", "src/lpt9.txt"],
  ["device AUX with extension", "aux.d/api"],
  ["device CONIN$", "src/CONIN$"],
  ["device COM superscript one", "src/COM\u00b9"],
  ["short name", "src/GIT~1"],
  ["short name at the root", "PROGRA~1/api"],
  [".git", ".git"],
  [".git/hooks", ".git/hooks"],
  ["nested .git", "src/.git"],
  [".GIT upper", ".GIT"],
  [".git. trailing dot", ".git."],
  ["node_modules", "node_modules"],
  ["Node_Modules mixed case", "Node_Modules/x"],
  ["nested node_modules", "src/node_modules/api"],
  [".courier", ".courier"],
  [".courier/backups", ".courier/backups"],
  ["empty", ""],
  ["only spaces", "   "],
  ["control character", "src/a\u0001b"],
  ["component longer than a file name may be", `src/${LONG_NAME}`],
  ["path longer than PATH_MAX", LONG_PATH],
];

describe("POST /api/apis/write refuses an output directory the contract refuses", () => {
  beforeAll(async () => {
    makeScratch(CONFIG_NO_IMPORTS);
    url = await start();
  });
  afterAll(stop);
  beforeEach(() => void vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it.each(REFUSED_OUTPUT_DIRS)(
    "%s → 400, nothing changed",
    async (_label, outputDir) => {
      const before = snapshot();

      const reply = await post("/api/apis/write", {
        sourceName: "pets",
        spec: SPEC,
        options: { type: "openapi", outputDir, sourceName: "pets" },
      });

      expect
        .soft(
          { status: reply.status, code: reply.body.code },
          JSON.stringify(reply.body).slice(0, 300),
        )
        .toEqual({
          status: 400,
          code: "INVALID_IMPORT",
        });
      expect.soft(snapshot()).toEqual(before);
    },
    20_000,
  );
});

describe("POST /api/apis/layout refuses the same output directories and reads nothing", () => {
  beforeAll(async () => {
    makeScratch(CONFIG_NO_IMPORTS);
    url = await start();
  });
  afterAll(stop);

  it.each(REFUSED_OUTPUT_DIRS)("%s → 400 with the field", async (_label, outputDir) => {
    const before = snapshot();

    const reply = await post("/api/apis/layout", { importName: "pets", outputDir });

    expect({ status: reply.status, field: reply.body.field }).toEqual({
      status: 400,
      field: "outputDir",
    });
    expect(snapshot()).toEqual(before);
  });
});

/* Names from which the layout derives the import's folder: [label, name]. */
const HOSTILE_NAMES: Array<[string, string]> = [
  ["parent", ".."],
  ["climbing", "../../outside"],
  ["absolute", "/etc/passwd"],
  ["drive", "C:\\Windows"],
  ["UNC", "\\\\server\\share"],
  ["slash", "a/b"],
  ["NUL", "a\u0000b"],
  ["colon", "a:b"],
  ["forbidden characters", 'a<>"|?*b'],
  ["trailing dot", "pets."],
  ["trailing space", "pets "],
  ["device", "con"],
  ["device with extension", "nul.txt"],
  ["short name", "GIT~1"],
  [".git", ".git"],
  ["node_modules", "node_modules"],
  [".courier", ".courier"],
  ["__proto__", "__proto__"],
  ["constructor", "constructor"],
  ["NFD", "cafe\u0301"],
  ["very long", "x".repeat(5000)],
];

/* Where every file of the write went, relative to the project, and the folder the reply says it used. */
function writtenPaths(reply: { body: Record<string, unknown> }): string[] {
  const written = reply.body.written;
  return Array.isArray(written) ? written.map(String) : [];
}

describe("POST /api/apis/write with a hostile import name or source name", () => {
  beforeEach(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    makeScratch(CONFIG_NO_IMPORTS);
    url = await start();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await stop();
  });

  it.each(HOSTILE_NAMES)(
    "options.sourceName %s → refused, or written only in src/api/<kebab binding>/",
    async (_label, name) => {
      const before = snapshot();

      const reply = await post("/api/apis/write", {
        sourceName: "pets",
        spec: SPEC,
        options: { type: "openapi", outputDir: "src/api", sourceName: name },
      });

      if (reply.status !== 200) {
        expect.soft(reply.status, JSON.stringify(reply.body).slice(0, 300)).toBe(400);
        expect.soft(snapshot()).toEqual(before);
        return;
      }
      const layout = await post("/api/apis/layout", {
        importName: "pets",
        outputDir: "src/api",
        sourceName: name,
      });
      const dir = String(layout.body.dir);
      expect(dir).toMatch(/^src\/api\/[a-z0-9_][a-z0-9_-]*$/);
      expect(writtenPaths(reply).every((path) => path.startsWith(`${dir}/`))).toBe(true);
      const changed = Object.keys(snapshot()).filter((path) => !(path in before));
      expect(
        changed.filter(
          (path) =>
            !path.startsWith(`proj/${dir}`) &&
            !path.startsWith("proj/.courier") &&
            path !== "proj/src" &&
            path !== "proj/src/api",
        ),
      ).toEqual([]);
      expect(readFileSync(join(scratch, "outside/keep.ts"), "utf8")).toBe("keep\n");
    },
    20_000,
  );

  it.each(HOSTILE_NAMES)(
    "import key %s (no options.sourceName) → refused, or written only in src/api/<kebab binding>/",
    async (_label, name) => {
      const before = snapshot();

      const reply = await post("/api/apis/write", {
        sourceName: name,
        spec: SPEC,
        options: { type: "openapi", outputDir: "src/api" },
      });

      if (reply.status !== 200) {
        expect.soft(reply.status, JSON.stringify(reply.body).slice(0, 300)).toBe(400);
        expect.soft(snapshot()).toEqual(before);
        return;
      }
      const layout = await post("/api/apis/layout", { importName: name, outputDir: "src/api" });
      const dir = String(layout.body.dir);
      expect(dir).toMatch(/^src\/api\/[a-z0-9_][a-z0-9_-]*$/);
      expect(writtenPaths(reply).every((path) => path.startsWith(`${dir}/`))).toBe(true);
      const state: unknown = JSON.parse(
        readFileSync(join(root, ".courier/imports-state.json"), "utf8"),
      );
      expect(state).toMatchObject({ imports: {} });
      const record = (state as { imports: Record<string, { dir: string }> }).imports;
      expect(Object.hasOwn(record, name)).toBe(true);
      expect(record[name]?.dir).toBe(dir);
    },
    20_000,
  );
});

describe("the import key is written into each file's first line", () => {
  beforeEach(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    makeScratch(CONFIG_NO_IMPORTS);
    url = await start();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await stop();
  });

  it.each([
    ["LINE SEPARATOR", "pets\u2028export const injected = 1;//"],
    ["PARAGRAPH SEPARATOR", "pets\u2029export const injected = 1;//"],
  ])(
    "a key holding %s is refused or kept inside the comment line",
    async (_label, name) => {
      const reply = await post("/api/apis/write", {
        sourceName: name,
        spec: SPEC,
        options: { type: "openapi", outputDir: "src/api", sourceName: "pets" },
      });

      if (reply.status !== 200) {
        expect(reply.status).toBe(400);
        return;
      }
      const source = readFileSync(join(root, "src/api/pets/source.ts"), "utf8");
      /* JavaScript ends a line comment at U+2028 and U+2029 as well as at \n. */
      const declared = parseSync("source.ts", source).program.body.flatMap((statement) =>
        statement.type === "ExportNamedDeclaration" &&
        statement.declaration?.type === "VariableDeclaration"
          ? statement.declaration.declarations.map((d) =>
              d.id.type === "Identifier" ? d.id.name : "",
            )
          : [],
      );
      expect.soft(declared).not.toContain("injected");
      expect.soft(source.split("\n")[0]).not.toMatch(/[\u2028\u2029]/);
    },
    20_000,
  );
});

describe("routes that name an import only look it up", () => {
  beforeAll(async () => {
    makeScratch(CONFIG_PETS);
    url = await start();
  });
  afterAll(stop);

  const NAMES = [
    "__proto__",
    "constructor",
    "hasOwnProperty",
    "toString",
    "../pets",
    "pets/..",
    "PETS",
    "pets\u0000",
    "cafe\u0301",
  ];
  const ROUTES: Array<[string, (name: string) => unknown]> = [
    ["/api/apis/update/preview", (name) => ({ name, newSpec: SPEC })],
    ["/api/apis/update/apply", (name) => ({ name, newSpec: SPEC, planDigest: "0".repeat(64) })],
    ["/api/apis/manage/preview", (name) => ({ name, spec: SPEC, toAdd: { pets: ["listPets"] } })],
    [
      "/api/apis/manage/apply",
      (name) => ({ name, spec: SPEC, toAdd: { pets: ["listPets"] }, planDigest: "0".repeat(64) }),
    ],
    ["/api/apis/imports/remove/preview", (name) => ({ name })],
    ["/api/apis/imports/remove", (name) => ({ name, planDigest: "0".repeat(64) })],
  ];
  const CASES = ROUTES.flatMap(([route, body]) =>
    NAMES.map((name): [string, string, unknown] => [route, name, body(name)]),
  );

  it.each(CASES)(
    "%s with name %j → 404, nothing changed",
    async (route, _name, body) => {
      const before = snapshot();

      const reply = await post(route, body);

      expect(reply.status).toBe(404);
      expect(snapshot()).toEqual(before);
    },
    20_000,
  );

  it.each([
    ["/api/apis/update/preview", { name: "", newSpec: SPEC }],
    ["/api/apis/imports/remove/preview", { name: "" }],
    ["/api/apis/imports/remove", { name: "" }],
    ["/api/apis/update/preview", { name: 1, newSpec: SPEC }],
    ["/api/apis/manage/preview", { name: ["pets"], spec: SPEC }],
    ["/api/apis/write", { sourceName: ["pets"], spec: SPEC, options: { outputDir: "src/api" } }],
    ["/api/apis/write", { sourceName: "pets", spec: SPEC, options: { outputDir: ["src/api"] } }],
    [
      "/api/apis/write",
      { sourceName: "pets", spec: SPEC, options: { outputDir: "src/api", sourceName: 7 } },
    ],
    ["/api/apis/layout", { importName: "pets", outputDir: 7 }],
  ])(
    "%s with a malformed name %j → 400",
    async (route, body) => {
      const before = snapshot();

      const reply = await post(route, body);

      expect(reply.status).toBe(400);
      expect(snapshot()).toEqual(before);
    },
    20_000,
  );
});

describe("an import declared in courier.config with a refused directory", () => {
  beforeEach(() => void vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(async () => {
    vi.restoreAllMocks();
    await stop();
  });

  it.each([["/tmp/courier-b2-declared"], ["../outside"], [".git"], ["node_modules/x"], ["C:/api"]])(
    "outputDir %s → update, manage and write refuse with 400, nothing changed",
    async (outputDir) => {
      makeScratch(
        CONFIG_PETS.replace('outputDir: "src/api"', `outputDir: ${JSON.stringify(outputDir)}`),
      );
      url = await start();
      const before = snapshot();

      const replies = [
        await post("/api/apis/update/preview", { name: "pets", newSpec: SPEC }),
        await post("/api/apis/update/apply", {
          name: "pets",
          newSpec: SPEC,
          planDigest: "0".repeat(64),
        }),
        await post("/api/apis/manage/preview", {
          name: "pets",
          spec: SPEC,
          toAdd: { pets: ["listPets"] },
        }),
        await post("/api/apis/manage/apply", {
          name: "pets",
          spec: SPEC,
          toAdd: { pets: ["listPets"] },
          planDigest: "0".repeat(64),
        }),
        await post("/api/apis/write", {
          sourceName: "pets",
          spec: SPEC,
          options: { type: "openapi", outputDir, sourceName: "pets" },
        }),
      ];

      expect(replies.map((reply) => reply.status)).toEqual([400, 400, 400, 400, 400]);
      expect(snapshot()).toEqual(before);
    },
    30_000,
  );
});

describe("unicode spellings of one directory", () => {
  beforeEach(() => void vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(async () => {
    vi.restoreAllMocks();
    await stop();
  });

  it("takes an NFD outputDir for the NFC one the config declares, and records the NFC spelling", async () => {
    makeScratch(CONFIG_PETS.replace('outputDir: "src/api"', 'outputDir: "src/caf\u00e9"'));
    url = await start();

    const reply = await post("/api/apis/write", {
      sourceName: "pets",
      spec: SPEC,
      options: { type: "openapi", outputDir: "src/cafe\u0301", sourceName: "pets" },
    });

    expect(reply.status).toBe(200);
    expect(writtenPaths(reply).every((path) => path.startsWith("src/caf\u00e9/pets/"))).toBe(true);
    const state = JSON.parse(readFileSync(join(root, ".courier/imports-state.json"), "utf8")) as {
      imports: Record<string, { dir: string }>;
    };
    expect(state.imports.pets?.dir).toBe("src/caf\u00e9/pets");
  }, 20_000);
});
