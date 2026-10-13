/**
 * The reads of the project's code carry the token of the project each
 * Studio runs for, found in its `.courier` folder for every question — a
 * Studio started again, or another project's, is asked with its own — and
 * none for a Studio the settings name, for a project outside the
 * workspace, which Studio refuses in words a person acts on.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StudioTarget } from "../src/projects/studio-targets";
import { projectReads } from "../src/studio/project-reads";
import { studioTokenFor } from "../src/studio/studio-token";
import { StudioTokenRefusal } from "../src/studio/studio-token-refusal";

const TOKEN = "k".repeat(43);
const presented: (string | undefined)[] = [];
let server: Server;
let studio: string;
let root: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "courier-vscode-reads-"));
  mkdirSync(join(root, ".courier"));
  writeFileSync(join(root, ".courier", "studio-token"), `${TOKEN}\n`);
  server = createServer((req, res) => {
    req.resume();
    const token = req.headers["x-courier-studio-token"];
    presented.push(typeof token === "string" ? token : undefined);
    const allowed = token === TOKEN;
    res.writeHead(allowed ? 200 : 401, { "content-type": "application/json" });
    res.end(JSON.stringify(allowed ? { groups: [], sites: [] } : { error: "token" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  studio = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

describe("the reads of the project's code", () => {
  it("present the token of the project the Studio asked runs for", async () => {
    const shop = { root, name: "shop", workspace: root };
    const targets = async (): Promise<StudioTarget[]> => [{ project: shop, studio }];
    const reads = projectReads((asked) => studioTokenFor(asked, targets));
    presented.length = 0;

    expect(await reads.fetchGroups(studio)).toEqual([]);
    expect(await reads.fetchSites(studio, "shop", "orders.place")).toEqual([]);
    expect(presented).toEqual([TOKEN, TOKEN]);
  });

  it("present none for a Studio the settings name, which refuses and says why", async () => {
    const targets = async (): Promise<StudioTarget[]> => [{ studio }];
    const reads = projectReads((asked) => studioTokenFor(asked, targets));
    presented.length = 0;

    await expect(reads.fetchDefinitions(studio)).rejects.toBeInstanceOf(StudioTokenRefusal);
    expect(presented).toEqual([undefined]);
  });
});
