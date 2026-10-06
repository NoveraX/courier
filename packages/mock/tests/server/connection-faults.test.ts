/**
 * @vitest-environment node
 *
 * Faults of a request's connection and status on a running mock: an
 * `interrupt` cuts an upload off halfway, a status fault is answered with
 * its reason and the headers a server sends with it, and a route fails with
 * the statuses it names.
 */
import { request as httpRequest } from "node:http";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAutoMockServer } from "../../src/auto/create-auto-server";
import type { FaultType } from "../../src/types";

const { endpoint } = courier();

const api = defineApi({
  baseURL: "http://api.test",
  groups: {
    files: defineGroup({
      prefix: "/files",
      endpoints: {
        list: endpoint.get("").response<string[]>(),
        create: endpoint.post("").variables<FormData>().response<{ ok: boolean }>(),
      },
    }),
  },
});

let handled = 0;
const server = createAutoMockServer({
  source: api,
  port: 0,
  log: false,
  overrides: (mock) => {
    mock("files", "list").resolves([]);
    mock("files", "create").returns(() => {
      handled += 1;
      return { ok: true };
    });
  },
});

let url: string;
beforeAll(async () => {
  url = (await server.start()).url;
});
afterAll(async () => {
  await server.stop();
});
afterEach(() => {
  server.networkState.setConfig(undefined);
  handled = 0;
});

const failEvery = (faults: FaultType[]) =>
  server.networkState.mergeConfig({ errorRate: 1, faultTypes: faults });

/* An upload written in parts, which tells how far it got before its connection ended. */
function upload(bytes: number) {
  return new Promise<{ status?: number | undefined; error?: string | undefined; sent: number }>(
    (resolve) => {
      let sent = 0;
      const req = httpRequest(`${url}/files`, {
        method: "POST",
        headers: { "content-length": String(bytes), "content-type": "application/octet-stream" },
      });
      req.on("response", (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode, sent }));
      });
      req.on("error", (error: NodeJS.ErrnoException) => resolve({ error: error.code, sent }));
      const part = Buffer.alloc(16 * 1024, 120);
      const write = (): void => {
        while (sent < bytes && !req.destroyed) {
          sent += part.length;
          if (!req.write(part)) return void req.once("drain", write);
        }
        if (!req.destroyed) req.end();
      };
      write();
    },
  );
}

describe("an interrupt", () => {
  it("drops an upload's connection halfway, with no answer, and the mock serves on", async () => {
    failEvery(["interrupt"]);

    const result = await upload(4 * 1024 * 1024);
    const interrupted = server.history.at(-1);
    server.networkState.setConfig(undefined);
    const after = await fetch(`${url}/files`);

    expect(result.status).toBeUndefined();
    expect(["ECONNRESET", "EPIPE"]).toContain(result.error);
    expect(handled).toBe(0);
    expect(interrupted).toMatchObject({ group: "files", method: "create" });
    expect(interrupted?.error?.message).toBe("Upload Interrupted (simulated)");
    expect(after.status).toBe(200);
  });

  it("drops a request with no body as a reset does", async () => {
    failEvery(["interrupt"]);

    const failure = await fetch(`${url}/files`).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(TypeError);
  });

  it("answers a request that came over no socket with a 502", async () => {
    failEvery(["interrupt"]);

    const res = await server.app.request("/files", { method: "POST", body: new FormData() });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Upload Interrupted (simulated)" });
  });
});

describe("a status fault", () => {
  it("is answered with its reason, and Retry-After with a 429", async () => {
    failEvery(["429"]);

    const res = await fetch(`${url}/files`);

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(await res.json()).toEqual({ error: "HTTP 429 Too Many Requests (simulated)" });
  });

  it("is answered with a bearer challenge with a 401, which no browser prompts for", async () => {
    failEvery(["401"]);

    const res = await fetch(`${url}/files`);

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Bearer realm="mock"');
  });

  it("is the one a route names, though the global mix names none", async () => {
    server.networkState.mergeConfig({
      routeOverrides: [
        { routeId: "files:create", enabled: true, errorRate: 1, faultTypes: ["413", "415"] },
      ],
    });

    const statuses = new Set<number>();
    for (let i = 0; i < 20; i += 1) {
      statuses.add((await fetch(`${url}/files`, { method: "POST", body: new FormData() })).status);
    }
    const list = await fetch(`${url}/files`);

    expect(statuses).toEqual(new Set([413, 415]));
    expect(list.status).toBe(200);
  });

  it("is decided once per request: an upload is read whole, then answered with it", async () => {
    failEvery(["503"]);
    server.networkState.mergeConfig({ uploads: { bandwidth: 2048 } });

    const started = performance.now();
    const res = await fetch(`${url}/files`, {
      method: "POST",
      body: new Blob([new Uint8Array(64 * 1024)], { type: "application/octet-stream" }),
    });

    expect(res.status).toBe(503);
    expect(performance.now() - started).toBeGreaterThan(200);
  });
});
