/**
 * Removing an imported API through Studio, end to end on a real Studio,
 * with its declaration in courier.config.ts: the change shown and made
 * before the files go, which leaves the config as it was before the import;
 * a save between preview and removal; a config that would still import a
 * file the removal takes, which Studio puts back; a removal that leaves the
 * config alone; and callers the change is refused to.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

const CACHE = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");

const API =
  'import { courier, defineApi, defineGroup } from "@noverax/courier/define";\n' +
  "const { endpoint } = courier();\n" +
  'const users = defineGroup({ prefix: "users", endpoints: { getAll: endpoint.get("").response<{ id: number }[]>() } });\n' +
  'export const api = defineApi({ baseURL: "https://api.example", groups: { users } });\n';

const CONFIG = 'import { api } from "./src/api";\n\nexport default {\n  sources: { api },\n};\n';

const IMPORT = {
  sourceName: "petstore",
  spec: parseSpec(
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Pets", version: "1" },
      servers: [{ url: "https://pets.example" }],
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
  ),
  options: { type: "openapi", outputDir: "src/gen", sourceName: "petstore" },
  importType: "raw",
};

const SOURCE = "src/gen/petstore/source.ts";

let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
});

/* A server compiled from src/ alone: the config passes on the object written where the server imports it. */
const PASSING_ON = 'export { default } from "./src/courier/config";\n';
const IN_SRC = 'import { api } from "../api";\n\nexport default {\n  sources: { api },\n};\n';

function start(layout: "plain" | "in-src" = "plain"): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  root = realpathSync(mkdtempSync(join(CACHE, "config-undeclare ")));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "api.ts"), API);
  writeFileSync(join(root, "courier.config.ts"), layout === "plain" ? CONFIG : PASSING_ON);
  if (layout === "in-src") {
    mkdirSync(join(root, "src", "courier"));
    writeFileSync(join(root, "src", "courier", "config.ts"), IN_SRC);
  }
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}

async function post(url: string, path: string, body: unknown, origin: string | null = url) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...tokenHeader(studio),
  };
  if (origin) headers.origin = origin;
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/* The import written and declared, as the wizard leaves it. */
async function declared(layout: "plain" | "in-src" = "plain"): Promise<string> {
  const url = await start(layout);
  expect((await post(url, "/api/apis/write", IMPORT)).status).toBe(200);
  const preview = await post(url, "/api/apis/declare/preview", IMPORT);
  const applied = await post(url, "/api/apis/declare/apply", {
    ...IMPORT,
    baseHash: preview.body.baseHash,
  });
  expect(applied.body).toMatchObject({ status: "applied" });
  return url;
}

function config(): string {
  return readFileSync(join(root, "courier.config.ts"), "utf8");
}

async function preview(url: string, origin: string | null = url) {
  const shown = await post(url, "/api/apis/imports/remove/preview", { name: "petstore" }, origin);
  const plan = shown.body.plan as { digest: string };
  const change = shown.body.config as { status: string; baseHash?: string; code?: string } | null;
  return { plan, change, body: shown.body };
}

describe("removing an import courier.config.ts declares", () => {
  it("shows the change to the config, makes it, then removes the files", async () => {
    const url = await declared();
    const { plan, change } = await preview(url);
    expect(change).toMatchObject({ status: "ready", configFile: "courier.config.ts" });

    const removed = await post(url, "/api/apis/imports/remove", {
      name: "petstore",
      planDigest: plan.digest,
      configBaseHash: change?.baseHash,
    });

    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({
      undeclaredFrom: "courier.config.ts",
      importDeclared: false,
      configImports: [],
    });
    expect(config()).toBe(CONFIG);
    expect(existsSync(join(root, SOURCE))).toBe(false);
    const after = await post(url, "/api/apis/imports/remove/preview", { name: "petstore" });
    expect(after.status).toBe(404);
  }, 30_000);

  it("takes the import out where the config's object is written, when the config passes it on", async () => {
    const url = await declared("in-src");
    const { plan, change } = await preview(url);
    expect(change).toMatchObject({ status: "ready", configFile: "src/courier/config.ts" });

    const removed = await post(url, "/api/apis/imports/remove", {
      name: "petstore",
      planDigest: plan.digest,
      configBaseHash: change?.baseHash,
    });

    expect(removed.body).toMatchObject({
      undeclaredFrom: "src/courier/config.ts",
      importDeclared: false,
    });
    expect(readFileSync(join(root, "src/courier/config.ts"), "utf8")).toBe(IN_SRC);
    expect(config()).toBe(PASSING_ON);
    expect(existsSync(join(root, SOURCE))).toBe(false);
  }, 30_000);

  it("removes nothing when the config was saved after the preview", async () => {
    const url = await declared();
    const { plan, change } = await preview(url);
    const saved = `${config()}// saved meanwhile\n`;
    writeFileSync(join(root, "courier.config.ts"), saved);

    const removed = await post(url, "/api/apis/imports/remove", {
      name: "petstore",
      planDigest: plan.digest,
      configBaseHash: change?.baseHash,
    });

    expect(removed.status).toBe(409);
    expect(removed.body).toMatchObject({ code: "CONFIG_STALE" });
    expect(config()).toBe(saved);
    expect(existsSync(join(root, SOURCE))).toBe(true);
  }, 30_000);

  it("puts the config back and removes nothing while it would still import a file that goes", async () => {
    const url = await declared();
    const kept = `import "./src/gen/petstore/source";\n${config()}`;
    writeFileSync(join(root, "courier.config.ts"), kept);
    const { plan, change } = await preview(url);
    expect(change).toMatchObject({ status: "ready" });

    const removed = await post(url, "/api/apis/imports/remove", {
      name: "petstore",
      planDigest: plan.digest,
      configBaseHash: change?.baseHash,
    });

    expect(removed.status).toBe(409);
    expect(removed.body).toMatchObject({ code: "CONFIG_NOT_CHANGED" });
    expect(removed.body.error).toBe(
      `Once changed, courier.config.ts still imports src/gen/petstore/pets/index.ts, ${SOURCE}, which the removal takes, so Studio put courier.config.ts back as it was. No file was removed.`,
    );
    expect(config()).toBe(kept);
    expect(existsSync(join(root, SOURCE))).toBe(true);
  }, 30_000);

  it("leaves the config as it is when the removal is not asked to change it", async () => {
    const url = await declared();
    const before = config();
    const { plan } = await preview(url);

    const removed = await post(url, "/api/apis/imports/remove", {
      name: "petstore",
      planDigest: plan.digest,
    });

    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ importDeclared: true });
    expect(removed.body.configImports).toContain(SOURCE);
    expect(config()).toBe(before);
  }, 30_000);

  it("shows a caller that is not a browser page the change to make by hand, and refuses to make it", async () => {
    const url = await declared();
    const before = config();
    const { plan, change } = await preview(url, null);
    expect(change).toMatchObject({ status: "manual", code: "NOT_LOCAL_PEER" });

    const removed = await post(
      url,
      "/api/apis/imports/remove",
      { name: "petstore", planDigest: plan.digest, configBaseHash: "x" },
      null,
    );

    expect(removed.status).toBe(403);
    expect(config()).toBe(before);
    expect(existsSync(join(root, SOURCE))).toBe(true);
  }, 30_000);
});
