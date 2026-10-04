/**
 * A courier.config that does not load is said in the terminal in one line,
 * as the UI says it, with the file named relative to the project. The
 * terminal got the whole error instead: its stack, and every file the load
 * had read, by absolute path, with its hash — 34 lines for one typo.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../../src/server/create-studio-server";
import type { StudioServer } from "../../src/server/types";

let root: string;
let studio: StudioServer | undefined;
let warned: string[];
let told: string[];

beforeEach(() => {
  warned = [];
  told = [];
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warned.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    told.push(args.map(String).join(" "));
  });
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-load-failure-")));
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("a courier.config with a syntax error", () => {
  it("is reported in one line naming the file as the project names it", async () => {
    writeFileSync(join(root, "courier.config.ts"), "export default { sources: { a: 1 b: 2 } };\n");
    const url = await new Promise<string>((resolve, reject) => {
      studio = createStudioServer({
        port: 0,
        host: "127.0.0.1",
        projectRoot: root,
        onReady: resolve,
        onError: reject,
      });
    });

    /* A display route answers once the first load has an outcome. */
    await fetch(`${url}/api/apis/imports/check-all`, {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: "{}",
    });

    const report = warned.find((line) => line.includes("courier.config did not load"));
    expect(report).toBeDefined();
    expect(report).toContain("courier.config.ts:1:");
    expect(report?.split("\n")).toHaveLength(1);
    expect(report).not.toContain(root);
    expect(warned.join("\n")).not.toContain("depHashes");
  });
});

/* Started on the project as it is; resolves once the first load has an outcome. */
async function started(): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
  await fetch(`${url}/api/apis/imports/check-all`, {
    method: "POST",
    headers: { origin: url, "content-type": "application/json" },
    body: "{}",
  });
  return url;
}

describe("a courier.config fixed after it failed", () => {
  it("is said to load again, once", async () => {
    const config = join(root, "courier.config.ts");
    writeFileSync(config, "export default { sources: { a: 1 b: 2 } };\n");
    await started();

    writeFileSync(config, "export default { sources: {} };\n");
    await vi.waitFor(() => expect(told.join("\n")).toContain("courier.config.ts loads again"), {
      timeout: 5_000,
      interval: 50,
    });

    expect(told.filter((line) => line.includes("loads again"))).toHaveLength(1);
  });
});

describe("a courier.config with a key Courier does not read", () => {
  it("names the key, as a misspelling is", async () => {
    writeFileSync(
      join(root, "courier.config.ts"),
      "export default { sources: {}, studo: { port: 1 } };\n",
    );

    await started();

    expect(warned.join("\n")).toContain("courier.config.ts has keys Courier does not read: studo");
  });
});
