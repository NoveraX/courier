/**
 * The extension's reads of Studio, against a Studio that answers as the
 * real one does: where the project's code calls and declares its endpoints
 * and where its groups write them are read with the project's token, which
 * Studio asks for; a Studio that refuses for want of it is said so in words
 * a person acts on, and an older Studio without a route is read as having
 * found none.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { fetchDefinitions, fetchGroups, fetchSites } from "../src/studio/studio-api";
import { StudioTokenRefusal, TOKEN_NEEDED } from "../src/studio/studio-token-refusal";

const TOKEN = "t".repeat(43);
const SITE = {
  file: "src/cart.ts",
  path: "/work/shop/src/cart.ts",
  line: 4,
  column: 9,
  code: "await api.orders.place(cart)",
};
const seen: { path: string | undefined; token: string | undefined }[] = [];
let older = false;
let server: Server;
let studio: string;

/* Studio's code routes: refused without the project's token, absent from an older Studio. */
function answerOf(req: IncomingMessage): { status: number; body: unknown } {
  if (older) return { status: 404, body: { error: "Studio has no API route" } };
  if (req.headers["x-courier-studio-token"] !== TOKEN) {
    return { status: 401, body: { error: "token", code: "STUDIO_TOKEN_REQUIRED" } };
  }
  if (req.url === "/api/editor/sites") return { status: 200, body: { sites: [SITE] } };
  return { status: 200, body: { definitions: [], groups: [] } };
}

beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      const token = req.headers["x-courier-studio-token"];
      seen.push({ path: req.url, token: typeof token === "string" ? token : undefined });
      const { status, body } = answerOf(req);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  studio = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

beforeEach(() => {
  seen.length = 0;
  older = false;
});

describe("the reads of the project's code", () => {
  it("present the project's token", async () => {
    expect(await fetchSites(studio, "shop", "orders.place", TOKEN)).toEqual([SITE]);
    expect(await fetchDefinitions(studio, TOKEN)).toEqual([]);
    expect(await fetchGroups(studio, TOKEN)).toEqual([]);

    expect(seen).toEqual([
      { path: "/api/editor/sites", token: TOKEN },
      { path: "/api/editor/definitions", token: TOKEN },
      { path: "/api/editor/groups", token: TOKEN },
    ]);
  });

  it("say, in words a person acts on, that Studio refused for want of the token", async () => {
    const refusals = await Promise.all([
      fetchSites(studio, "shop", "orders.place").catch((error: unknown) => error),
      fetchDefinitions(studio).catch((error: unknown) => error),
      fetchGroups(studio, "not-the-token").catch((error: unknown) => error),
    ]);

    for (const refusal of refusals) {
      expect(refusal).toBeInstanceOf(StudioTokenRefusal);
      expect(refusal).toHaveProperty("message", TOKEN_NEEDED);
    }
    expect(TOKEN_NEEDED).toContain(".courier/studio-token");
    expect(seen.map((each) => each.token)).toEqual([undefined, undefined, "not-the-token"]);
  });

  it("read an older Studio, without the routes, as having found none", async () => {
    older = true;

    expect(await fetchDefinitions(studio)).toEqual([]);
    expect(await fetchGroups(studio)).toEqual([]);
  });
});
