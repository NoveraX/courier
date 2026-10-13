/**
 * An apply takes only the plan the user saw and only the steps the user
 * allowed in it. A digest from another plan, a confirmation the plan does
 * not ask for, a malformed consent, or consent hidden under `__proto__` is
 * refused with 400 or 409, and nothing changes.
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import { readGeneratedFile } from "../src/server/import-files/generated-header";
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
        post: {
          operationId: "createPet",
          tags: ["pets"],
          responses: { "200": { description: "ok" } },
        },
      },
    },
  }),
);
const CONFIG =
  'export default { sources: { api: { baseURL: "https://api.example" } }, imports: { pets: { importType: "file", type: "openapi", outputDir: "src/api" }, cats: { importType: "file", type: "openapi", outputDir: "src/api", sourceName: "cats" } } };\n';
const PETS = {
  sourceName: "pets",
  spec: SPEC,
  options: { type: "openapi", outputDir: "src/api", sourceName: "pets" },
};
const CATS = {
  sourceName: "cats",
  spec: SPEC,
  options: { type: "openapi", outputDir: "src/api", sourceName: "cats" },
};
const PETS_INDEX = "src/api/pets/index.ts";
const PETS_SOURCE = "src/api/pets/source.ts";
const HAND = "hand-written\n";

let scratch: string;
let root: string;
let studio: StudioServer | undefined;
let url: string;

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-b2-consent-")));
  root = join(scratch, "proj");
  mkdirSync(join(scratch, "outside"));
  writeFileSync(join(scratch, "outside/keep.ts"), "keep\n");
  put("courier.config.ts", CONFIG);
  put("package.json", '{ "name": "mine" }\n');
  url = await start();
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(scratch, { recursive: true, force: true });
});

function put(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
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

function digestOf(reply: { body: Record<string, unknown> }): string {
  const plan = reply.body.plan;
  if (
    typeof plan !== "object" ||
    plan === null ||
    !("digest" in plan) ||
    typeof plan.digest !== "string"
  ) {
    throw new Error(`no plan in ${JSON.stringify(reply.body)}`);
  }
  return plan.digest;
}

/* The write that waits for consent to replace a hand-written index.ts, and its digest. */
async function pendingPetsWrite(): Promise<string> {
  put(PETS_INDEX, HAND);
  const asked = await post("/api/apis/write", PETS);
  expect(asked.body).toMatchObject({ code: "NEEDS_CONFIRMATION" });
  return digestOf(asked);
}

describe("a digest from another plan", () => {
  it("another import's digest → 409 PLAN_STALE, nothing changed", async () => {
    const digest = await pendingPetsWrite();
    put("src/api/cats/index.ts", HAND);
    const catsDigest = digestOf(await post("/api/apis/write", CATS));
    expect(catsDigest).not.toBe(digest);
    const before = snapshot();

    const reply = await post("/api/apis/write", {
      ...PETS,
      planDigest: catsDigest,
      confirm: [PETS_INDEX],
    });

    expect({ status: reply.status, code: reply.body.code }).toEqual({
      status: 409,
      code: "PLAN_STALE",
    });
    expect(snapshot()).toEqual(before);
  }, 20_000);

  it("the same import with other options than declared, quoting its plan → 409 DECLARATION_MISMATCH, nothing changed", async () => {
    const digest = await pendingPetsWrite();
    const before = snapshot();
    const flat = { ...PETS, options: { ...PETS.options, groupBy: "single" } };

    const reply = await post("/api/apis/write", {
      ...flat,
      planDigest: digest,
      confirm: [PETS_INDEX],
    });

    expect({ status: reply.status, code: reply.body.code }).toEqual({
      status: 409,
      code: "DECLARATION_MISMATCH",
    });
    expect(snapshot()).toEqual(before);
  }, 20_000);

  it("a removal preview's digest quoted by a write → 409 PLAN_STALE", async () => {
    await pendingPetsWrite();
    const removalDigest = digestOf(
      await post("/api/apis/imports/remove/preview", { name: "pets" }),
    );
    const before = snapshot();

    const reply = await post("/api/apis/write", {
      ...PETS,
      planDigest: removalDigest,
      confirm: [PETS_INDEX],
    });

    expect(reply.status).toBe(409);
    expect(snapshot()).toEqual(before);
  }, 20_000);

  it("an update preview's digest quoted by a removal, and a write's by an update → 409 PLAN_STALE", async () => {
    expect((await post("/api/apis/write", PETS)).status).toBe(200);
    put(PETS_SOURCE, `${read(PETS_SOURCE)}// mine\n`);
    const updateDigest = digestOf(
      await post("/api/apis/update/preview", { name: "pets", newSpec: SPEC }),
    );
    const before = snapshot();

    const removal = await post("/api/apis/imports/remove", {
      name: "pets",
      planDigest: updateDigest,
    });
    const update = await post("/api/apis/update/apply", {
      name: "pets",
      newSpec: SPEC,
      planDigest: digestOf(await post("/api/apis/imports/remove/preview", { name: "pets" })),
      confirm: [PETS_SOURCE],
    });

    expect([removal.status, removal.body.code]).toEqual([409, "PLAN_STALE"]);
    expect(update.status).toBeGreaterThanOrEqual(400);
    expect(snapshot()).toEqual(before);
  }, 20_000);

  it.each([[""], ["0".repeat(64)], ["not a digest"]])(
    "planDigest %j → 409 PLAN_STALE",
    async (planDigest) => {
      await pendingPetsWrite();
      const before = snapshot();

      const reply = await post("/api/apis/write", { ...PETS, planDigest, confirm: [PETS_INDEX] });

      expect({ status: reply.status, code: reply.body.code }).toEqual({
        status: 409,
        code: "PLAN_STALE",
      });
      expect(snapshot()).toEqual(before);
    },
    20_000,
  );
});

describe("a confirmation the plan does not ask for", () => {
  it.each([
    ["a file outside the import", ["package.json"]],
    ["a file the plan writes without asking", [PETS_SOURCE]],
    ["the scratch sibling", ["../outside/keep.ts"]],
    ["an absolute path", ["/etc/passwd"]],
    ["a climbing spelling of a pending path", ["src/api/pets/../../../package.json"]],
    ["another spelling of the pending path", ["./src/api/pets/index.ts"]],
    ["the pending path in other letter case", ["SRC/api/pets/index.ts"]],
    ["another import's pending path", ["src/api/cats/index.ts"]],
    ["an empty path", [""]],
    ["__proto__", ["__proto__"]],
    ["the pending path and one outside", [PETS_INDEX, "package.json"]],
  ])(
    "%s → 400 CONFIRMATION_NOT_IN_PLAN, nothing changed",
    async (_label, confirm) => {
      const digest = await pendingPetsWrite();
      const before = snapshot();

      const reply = await post("/api/apis/write", { ...PETS, planDigest: digest, confirm });

      expect({ status: reply.status, code: reply.body.code }).toEqual({
        status: 400,
        code: "CONFIRMATION_NOT_IN_PLAN",
      });
      expect(snapshot()).toEqual(before);
    },
    20_000,
  );

  it("the pending path twice is taken once: the file is replaced and backed up once", async () => {
    const digest = await pendingPetsWrite();

    const reply = await post("/api/apis/write", {
      ...PETS,
      planDigest: digest,
      confirm: [PETS_INDEX, PETS_INDEX],
    });

    expect(reply.status).toBe(200);
    expect((reply.body.written as string[]).filter((path) => path === PETS_INDEX)).toHaveLength(1);
    expect(readGeneratedFile(read(PETS_INDEX)).header?.import).toBe("pets");
    expect(read(`${String(reply.body.backupDir)}/${PETS_INDEX}`)).toBe(HAND);
  }, 20_000);
});

describe("malformed consent", () => {
  const MALFORMED: Array<[string, Record<string, unknown>]> = [
    ["confirm of numbers", { confirm: [1] }],
    ["confirm of null", { confirm: [null] }],
    ["confirm of objects", { confirm: [{ path: PETS_INDEX }] }],
    ["confirm of arrays", { confirm: [[PETS_INDEX]] }],
    ["confirm as a string", { confirm: PETS_INDEX }],
    ["confirm as an object", { confirm: { 0: PETS_INDEX } }],
    ["confirm as null", { confirm: null }],
    ["planDigest as a number", { planDigest: 123 }],
    ["planDigest as null", { planDigest: null }],
    ["planDigest as an array", { planDigest: ["x"] }],
  ];

  it.each(MALFORMED)(
    "write with %s → 400, nothing changed",
    async (_label, consent) => {
      const digest = await pendingPetsWrite();
      const before = snapshot();

      const reply = await post("/api/apis/write", {
        ...PETS,
        planDigest: digest,
        confirm: [PETS_INDEX],
        ...consent,
      });

      expect(reply.status).toBe(400);
      expect(snapshot()).toEqual(before);
    },
    20_000,
  );

  it.each(MALFORMED)(
    "update, manage and remove with %s → 400, nothing changed",
    async (_label, consent) => {
      expect((await post("/api/apis/write", PETS)).status).toBe(200);
      put(PETS_SOURCE, `${read(PETS_SOURCE)}// mine\n`);
      const updateDigest = digestOf(
        await post("/api/apis/update/preview", { name: "pets", newSpec: SPEC }),
      );
      const manageBody = { name: "pets", spec: SPEC, toRemove: { pets: ["createPet"] } };
      const manageDigest = digestOf(await post("/api/apis/manage/preview", manageBody));
      const removeDigest = digestOf(
        await post("/api/apis/imports/remove/preview", { name: "pets" }),
      );
      const before = snapshot();

      const replies = [
        await post("/api/apis/update/apply", {
          name: "pets",
          newSpec: SPEC,
          planDigest: updateDigest,
          ...consent,
        }),
        await post("/api/apis/manage/apply", {
          ...manageBody,
          planDigest: manageDigest,
          ...consent,
        }),
        await post("/api/apis/imports/remove", {
          name: "pets",
          planDigest: removeDigest,
          ...consent,
        }),
      ];

      expect(replies.map((reply) => reply.status)).toEqual([400, 400, 400]);
      expect(snapshot()).toEqual(before);
    },
    30_000,
  );
});

describe("__proto__ keys in the body", () => {
  it("consent under __proto__ is not consent: 409 NEEDS_CONFIRMATION, nothing changed", async () => {
    const digest = await pendingPetsWrite();
    const before = snapshot();
    const body = `{"sourceName":"pets","spec":${JSON.stringify(SPEC)},"options":${JSON.stringify(PETS.options)},"__proto__":{"planDigest":"${digest}","confirm":["${PETS_INDEX}"]}}`;

    const reply = await post("/api/apis/write", body);

    expect({ status: reply.status, code: reply.body.code }).toEqual({
      status: 409,
      code: "NEEDS_CONFIRMATION",
    });
    expect(snapshot()).toEqual(before);
  }, 20_000);

  it("the whole request under __proto__ → 400, nothing changed", async () => {
    const before = snapshot();
    const body = `{"__proto__":${JSON.stringify(PETS)}}`;

    const reply = await post("/api/apis/write", body);

    expect(reply.status).toBe(400);
    expect(snapshot()).toEqual(before);
  }, 20_000);

  it("options under options.__proto__ are ignored: the write stays in src/api/pets", async () => {
    const before = snapshot();
    const options = `{"type":"openapi","outputDir":"src/api","sourceName":"pets","__proto__":{"outputDir":"../outside","sourceName":"evil","groupBy":"single"}}`;
    const body = `{"sourceName":"pets","spec":${JSON.stringify(SPEC)},"options":${options}}`;

    const reply = await post("/api/apis/write", body);

    expect(reply.status).toBe(200);
    expect((reply.body.written as string[]).every((path) => path.startsWith("src/api/pets/"))).toBe(
      true,
    );
    expect(readFileSync(join(scratch, "outside/keep.ts"), "utf8")).toBe("keep\n");
    expect(
      Object.keys(snapshot()).filter(
        (path) =>
          !(path in before) && !path.startsWith("proj/src") && !path.startsWith("proj/.courier"),
      ),
    ).toEqual([]);
  }, 20_000);

  it("a removal's digest under __proto__ is not quoted: 409 PLAN_NOT_SEEN, nothing changed", async () => {
    expect((await post("/api/apis/write", PETS)).status).toBe(200);
    const digest = digestOf(await post("/api/apis/imports/remove/preview", { name: "pets" }));
    const before = snapshot();

    const reply = await post(
      "/api/apis/imports/remove",
      `{"name":"pets","__proto__":{"planDigest":"${digest}"}}`,
    );

    expect({ status: reply.status, code: reply.body.code }).toEqual({
      status: 409,
      code: "PLAN_NOT_SEEN",
    });
    expect(snapshot()).toEqual(before);
  }, 20_000);

  it.each([
    ["toAdd", `{"__proto__":["listPets"]}`],
    ["toRemove", `{"__proto__":["listPets"]}`],
    ["toAdd", `{"constructor":["listPets"]}`],
    ["toRemove", `{"../../x":["listPets"]}`],
  ])(
    "manage %s %s → no file outside src/api/pets changes",
    async (field, groups) => {
      expect((await post("/api/apis/write", PETS)).status).toBe(200);
      const body = `{"name":"pets","spec":${JSON.stringify(SPEC)},"${field}":${groups}}`;
      const before = snapshot();

      const preview = await post("/api/apis/manage/preview", body);
      const planDigest = preview.status === 200 ? digestOf(preview) : "0".repeat(64);
      const apply = await post(
        "/api/apis/manage/apply",
        `${body.slice(0, -1)},"planDigest":"${planDigest}"}`,
      );

      expect([200, 400, 404, 409]).toContain(preview.status);
      expect([200, 400, 404, 409]).toContain(apply.status);
      const after = snapshot();
      const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
        (path) =>
          before[path] !== after[path] &&
          !path.startsWith("proj/src/api/pets/") &&
          !path.startsWith("proj/.courier"),
      );
      expect(changed).toEqual([]);
    },
    20_000,
  );

  it("selectedEndpoints with a __proto__ group writes only in src/api/pets", async () => {
    const body = `{"sourceName":"pets","spec":${JSON.stringify(SPEC)},"options":{"type":"openapi","outputDir":"src/api","sourceName":"pets","selectedEndpoints":{"__proto__":["listPets"],"pets":["listPets"]}}}`;

    const reply = await post("/api/apis/write", body);

    expect(reply.status).toBe(200);
    expect((reply.body.written as string[]).every((path) => path.startsWith("src/api/pets/"))).toBe(
      true,
    );
  }, 20_000);
});
