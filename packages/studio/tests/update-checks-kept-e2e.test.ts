/**
 * A page opened after an update check shows its outcome: Studio keeps the
 * last check of each import and sends it with the imports list to every
 * page that connects — up to date, an update available once the published
 * specification changes, and why a check failed.
 */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { io as connect } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeSpecHash } from "../src/apis";
import { IMPORTS_STATE_VERSION, recordImport, saveImportsState } from "../src/apis/imports-state";
import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

const CACHE = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");

function specText(version: string): string {
  return JSON.stringify({ openapi: "3.1.0", info: { title: "Pets", version }, paths: {} });
}

let root: string;
let studio: StudioServer | undefined;
let specServer: Server | undefined;
let published = specText("1");

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  published = specText("1");
  specServer = createServer((_req, res) => {
    if (published === "") res.writeHead(500).end();
    else res.writeHead(200, { "content-type": "application/json" }).end(published);
  });
  await new Promise<void>((resolve) => specServer?.listen(0, "127.0.0.1", resolve));
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  await new Promise((resolve) => specServer?.close(resolve));
  vi.restoreAllMocks();
  if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
});

/* A project that imported `pets` from the spec server, generated from version 1. */
function start(): Promise<string> {
  const address = specServer?.address();
  if (address === null || address === undefined || typeof address === "string") {
    throw new Error("the spec server is not listening");
  }
  const from = `http://127.0.0.1:${address.port}/pets.json`;
  mkdirSync(CACHE, { recursive: true });
  root = realpathSync(mkdtempSync(join(CACHE, "update-checks ")));
  writeFileSync(
    join(root, "courier.config.ts"),
    `export default { sources: { api: { baseURL: "https://api.example" } }, imports: { pets: { importType: "url", type: "openapi", from: "${from}", outputDir: "src/api" } } };\n`,
  );
  const specHash = computeSpecHash(parseSpec(specText("1")));
  const now = new Date().toISOString();
  const entry = { specHash, fetchedAt: now, lastSyncedAt: now, dir: "src/api/pets", files: {} };
  saveImportsState(
    root,
    recordImport({ version: IMPORTS_STATE_VERSION, imports: {}, applied: [] }, "pets", entry),
  );
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

async function check(url: string, path: "check-all" | "check-updates"): Promise<void> {
  await fetch(`${url}/api/apis/imports/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url, ...tokenHeader(studio) },
    body: JSON.stringify(path === "check-all" ? {} : { name: "pets" }),
  });
}

/* The imports list a page opened now is sent first. */
async function listOnOpening(url: string): Promise<Array<Record<string, unknown>>> {
  const page = connect(`${url}/ui`, { transports: ["websocket"], autoConnect: false });
  const first = new Promise<Array<Record<string, unknown>>>((resolve) => {
    page.once("registry:updated", (list: { sources: Array<Record<string, unknown>> }) =>
      resolve(list.sources),
    );
  });
  page.connect();
  try {
    return await first;
  } finally {
    page.disconnect();
  }
}

describe("a page opened after an update check", () => {
  it("shows the import up to date, then an update once the published specification changes", async () => {
    const url = await start();

    await check(url, "check-all");
    const before = await listOnOpening(url);
    published = specText("2");
    await check(url, "check-updates");
    const after = await listOnOpening(url);

    expect(before).toEqual([
      expect.objectContaining({
        name: "pets",
        check: expect.objectContaining({ status: "up-to-date" }),
      }),
    ]);
    expect(after).toEqual([
      expect.objectContaining({
        name: "pets",
        check: expect.objectContaining({ status: "updates-available" }),
      }),
    ]);
  }, 30_000);

  it("shows why the last check failed", async () => {
    const url = await start();
    published = "";

    await check(url, "check-all");
    const [pets] = await listOnOpening(url);

    expect(pets?.check).toMatchObject({ status: "error", error: expect.stringContaining("500") });
  }, 30_000);
});
