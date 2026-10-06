/**
 * A mock Studio runs for a source it generated answers every endpoint of it
 * — a map, a string and an empty answer among them, as a Petstore import
 * has them — rather than 404 "No mock" for each endpoint whose type the
 * generator wrote without a schema to make an answer up from. Run as Studio
 * runs it, in its worker.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { generateCode } from "../src/apis/generator";
import { parseSpec } from "../src/apis/parser";
import {
  createProcessManager,
  type ProcessManagerEvents,
} from "../src/server/mock-manager/process-manager";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const json = (schema: unknown) => ({ content: { "application/json": { schema } } });
const Pet = {
  type: "object",
  required: ["name"],
  properties: { id: { type: "integer" }, name: { type: "string" } },
};

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Petstore", version: "1" },
    servers: [{ url: "https://petstore.example/api/v3" }],
    paths: {
      "/pet": {
        post: {
          operationId: "addPet",
          tags: ["pet"],
          requestBody: json(Pet),
          responses: { "200": { description: "ok", ...json(Pet) } },
        },
      },
      "/pet/{petId}": {
        get: {
          operationId: "getPetById",
          tags: ["pet"],
          parameters: [{ name: "petId", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "ok", ...json(Pet) } },
        },
      },
      "/store/inventory": {
        get: {
          operationId: "getInventory",
          tags: ["store"],
          responses: {
            "200": {
              description: "ok",
              ...json({ type: "object", additionalProperties: { type: "integer" } }),
            },
          },
        },
      },
      "/user/login": {
        get: {
          operationId: "loginUser",
          tags: ["user"],
          parameters: [{ name: "username", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "ok", ...json({ type: "string" }) } },
        },
      },
      "/user/logout": {
        get: {
          operationId: "logoutUser",
          tags: ["user"],
          responses: { default: { description: "done" } },
        },
      },
    },
  }),
);

/** A project under the repository's node_modules, so its files resolve the workspace packages. */
function project(): string {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(join(cache, "generated-mock-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  for (const file of generateCode(SPEC, { type: "openapi", outputDir: "src/api" }, "petstore")) {
    mkdirSync(dirname(join(root, file.path)), { recursive: true });
    writeFileSync(join(root, file.path), file.content);
  }
  writeFileSync(
    join(root, "courier.mocks.ts"),
    'import { defineMocks, defineMockServer } from "@noverax/courier-mock";\n' +
      'import { petstore } from "./src/api/petstore/source";\n' +
      'export default defineMocks({ petMock: defineMockServer({ source: petstore, log: "silent" }) });\n',
  );
  return join(root, "courier.mocks.ts");
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

async function started(): Promise<string> {
  const events = {
    onReady: vi.fn(),
    onError: vi.fn(),
    onStopped: vi.fn(),
    onExited: vi.fn(),
    onEvent: vi.fn(),
  } satisfies ProcessManagerEvents;
  const pm = createProcessManager(events, {
    transformCacheDirectory: () => null,
    storeFile: () => null,
  });
  cleanups.push(() => pm.dispose());
  const port = await freePort();
  pm.spawn({
    serverId: "petMock",
    mocksFile: project(),
    mockKey: "petMock",
    port,
    strictPort: true,
    avoidPorts: [],
  });
  await vi.waitFor(() => expect(events.onReady).toHaveBeenCalled(), { timeout: 20_000 });
  return `http://127.0.0.1:${port}/api/v3`;
}

describe("a mock of a generated Petstore source", () => {
  it("answers every endpoint: a record, a map, a string, and nothing", async () => {
    const url = await started();

    const pet = await fetch(`${url}/pet/1`);
    const inventory = await fetch(`${url}/store/inventory`);
    const login = await fetch(`${url}/user/login?username=ada`);
    const logout = await fetch(`${url}/user/logout`);

    expect([pet.status, inventory.status, login.status, logout.status]).toEqual([
      200, 200, 200, 200,
    ]);
    expect(await pet.json()).toMatchObject({ id: 1 });
    const counts: Record<string, unknown> = await inventory.json();
    expect(Object.keys(counts).length).toBeGreaterThan(0);
    expect(Object.values(counts).every((count) => Number.isInteger(count))).toBe(true);
    expect(typeof (await login.json())).toBe("string");
    expect(await logout.json()).toBeNull();
  }, 40_000);
});
