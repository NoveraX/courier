/**
 * Checking a declared import for updates, over Studio's own API.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";

let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-update-check-")));
  mkdirSync(join(root, "src"));
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function start(config: string): Promise<string> {
  writeFileSync(join(root, "courier.config.ts"), config);
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({ port: 0, host: "127.0.0.1", projectRoot: root, onReady: resolve, onError: reject });
  });
}

async function post(url: string, path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

describe("an import declared with a field of the wrong kind", () => {
  const CONFIG = `export default {
  sources: { api: { baseURL: "https://api.example" } },
  imports: { x: { importType: "url", type: "openapi", from: 5, outputDir: "src/api" } },
};\n`;

  it("fails the config load, naming the field, instead of reaching the routes", async () => {
    const url = await start(CONFIG);

    const checked = await post(url, "/api/apis/imports/check-updates", { name: "x" });

    expect(checked.status).not.toBe(500);
    expect(JSON.stringify(checked.body)).toContain("courier.config.imports.x.from is a number, not an http or https URL");
  });
});
