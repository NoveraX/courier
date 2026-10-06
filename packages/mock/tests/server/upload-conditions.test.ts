/**
 * @vitest-environment node
 *
 * Upload conditions on a running mock: request bodies arrive no faster than
 * the speed set, and the progress of a slow one is reported under the id
 * its answer carries; an upload over the size limit is refused with 413
 * before it is read, one holding a file of a type not taken with 415; a
 * route's own limit and types hold for that route alone.
 */
import { request as httpRequest } from "node:http";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAutoMockServer } from "../../src/auto/create-auto-server";
import type { UploadProgress } from "../../src/server/route-types";

const { endpoint } = courier();

const api = defineApi({
  baseURL: "http://api.test",
  groups: {
    files: defineGroup({
      prefix: "/files",
      endpoints: {
        create: endpoint.post("").variables<FormData>().response<{ files: number }>(),
        avatar: endpoint.post("/avatar").variables<FormData>().response<{ files: number }>(),
        note: endpoint.post("/note").variables<{ text: string }>().response<{ ok: boolean }>(),
      },
    }),
  },
});

let handled = 0;
const server = createAutoMockServer({
  source: api,
  port: 0,
  log: false,
  maxUploadBytes: 4 * 1024 * 1024,
  overrides: (mock) => {
    const count = ({ variables }: { variables: unknown }) => {
      handled += 1;
      const values = Object.values(variables as Record<string, unknown>).flat();
      return { files: values.filter((value) => value instanceof File).length };
    };
    mock("files", "create").returns(count);
    mock("files", "avatar").returns(count);
    mock("files", "note").resolves({ ok: true });
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

function formWith(...files: File[]): FormData {
  const form = new FormData();
  for (const file of files) form.append("file", file);
  return form;
}

const file = (bytes: number, name = "a.bin", type = "application/octet-stream") =>
  new File([new Uint8Array(bytes)], name, { type });

/* A raw upload whose length is declared and whose body is written in parts, as a browser's is. */
function upload(path: string, bytes: number, headers: Record<string, string>) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest(`${url}${path}`, {
      method: "POST",
      headers: { "content-length": String(bytes), ...headers },
    });
    req.on("response", (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    const part = Buffer.alloc(64 * 1024, 120);
    let sent = 0;
    const write = (): void => {
      while (sent < bytes) {
        const size = Math.min(part.length, bytes - sent);
        sent += size;
        if (!req.write(part.subarray(0, size))) return void req.once("drain", write);
      }
      req.end();
    };
    write();
  });
}

describe("the speed request bodies arrive at", () => {
  it("holds an upload to it: 64 KB at 512 Kbps takes a second", async () => {
    server.networkState.mergeConfig({ uploads: { bandwidth: 512 } });

    const started = performance.now();
    const res = await fetch(`${url}/files`, { method: "POST", body: formWith(file(64 * 1024)) });
    const took = performance.now() - started;

    expect(res.status).toBe(200);
    expect(took).toBeGreaterThan(950);
  });

  it("leaves an upload as fast as it comes when unset", async () => {
    const started = performance.now();
    await fetch(`${url}/files`, { method: "POST", body: formWith(file(64 * 1024)) });

    expect(performance.now() - started).toBeLessThan(500);
  });

  it("is counted in the request's duration, which runs from its arrival", async () => {
    server.networkState.mergeConfig({ uploads: { bandwidth: 512 } });

    await fetch(`${url}/files`, { method: "POST", body: formWith(file(64 * 1024)) });

    expect(server.history.at(-1)?.duration).toBeGreaterThan(950);
  });

  it("has the progress of a slow body reported, under the id its answer carries", async () => {
    server.networkState.mergeConfig({ uploads: { bandwidth: 1024 } });
    const reports: Array<[string, UploadProgress]> = [];
    const starts: string[] = [];
    server.requestHooks.onUpload = (id, progress) => reports.push([id, progress]);
    server.requestHooks.onStart = (id) => starts.push(id);
    const body = formWith(file(192 * 1024));
    const size = (await new Response(body).blob()).size;

    await upload("/files", size, {
      "content-type": new Response(body).headers.get("content-type") ?? "",
    }).catch(() => undefined);
    Reflect.deleteProperty(server.requestHooks, "onUpload");
    Reflect.deleteProperty(server.requestHooks, "onStart");

    expect(reports.length).toBeGreaterThanOrEqual(2);
    expect(new Set(reports.map(([id]) => id))).toEqual(new Set(starts));
    expect(reports[0]?.[1]).toMatchObject({ httpMethod: "POST", path: "/files", group: "files" });
    expect(reports.every(([, report]) => report.total === size)).toBe(true);
    const received = reports.map(([, report]) => report.received);
    expect(received).toEqual([...received].sort((a, b) => a - b));
  });

  it("reports nothing for a body that arrives within a quarter second", async () => {
    const reports: unknown[] = [];
    server.requestHooks.onUpload = (_id, progress) => reports.push(progress);

    await fetch(`${url}/files`, { method: "POST", body: formWith(file(1024)) });
    Reflect.deleteProperty(server.requestHooks, "onUpload");

    expect(reports).toEqual([]);
  });
});

describe("the size limit on uploads", () => {
  it("refuses an upload over it with 413 before reading it, naming both sizes", async () => {
    server.networkState.mergeConfig({ uploads: { maxBytes: 64 * 1024 } });

    const res = await upload("/files", 2 * 1024 * 1024, { "content-type": "application/pdf" });

    expect(res.status).toBe(413);
    expect(JSON.parse(res.body)).toEqual({
      error: "The upload is 2 MB, over the 64 KB the mock takes",
    });
    expect(handled).toBe(0);
  });

  it("refuses one that does not declare its size once it passes the limit", async () => {
    server.networkState.mergeConfig({ uploads: { maxBytes: 64 * 1024 } });
    const parts = Array.from({ length: 8 }, () => new Uint8Array(32 * 1024));
    const stream = new ReadableStream({
      pull(controller) {
        const part = parts.shift();
        if (part) controller.enqueue(part);
        else controller.close();
      },
    });

    const res = await fetch(`${url}/files`, {
      method: "POST",
      body: stream,
      headers: { "content-type": "application/octet-stream" },
      duplex: "half",
    } as RequestInit);

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "The upload is over the 64 KB the mock takes" });
  });

  it("takes an upload up to it", async () => {
    server.networkState.mergeConfig({ uploads: { maxBytes: 64 * 1024 } });

    const res = await fetch(`${url}/files`, { method: "POST", body: formWith(file(32 * 1024)) });

    expect(await res.json()).toEqual({ files: 1 });
  });

  it("cannot raise the most the mock reads", async () => {
    server.networkState.mergeConfig({ uploads: { maxBytes: 64 * 1024 * 1024 } });

    const res = await upload("/files", 5 * 1024 * 1024, { "content-type": "application/pdf" });

    expect(res.status).toBe(413);
    expect(JSON.parse(res.body)).toEqual({
      error: "The request body is larger than 4 MB, the most this mock reads",
    });
  });

  it("leaves JSON to the mock's own limit for JSON", async () => {
    server.networkState.mergeConfig({ uploads: { maxBytes: 1024 } });

    const res = await fetch(`${url}/files/note`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "x".repeat(4096) }),
    });

    expect(res.status).toBe(200);
  });
});

describe("the types of file uploads may hold", () => {
  it("refuse a form holding a file of another type with 415, naming it", async () => {
    server.networkState.mergeConfig({ uploads: { accept: ["image/*", ".pdf"] } });
    const form = formWith(file(10, "a.png", "image/png"), file(10, "notes.txt", "text/plain"));

    const res = await fetch(`${url}/files`, { method: "POST", body: form });

    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({
      error: "notes.txt (text/plain) is not a type the mock takes: image/*, .pdf",
    });
    expect(handled).toBe(0);
  });

  it("take a form whose every file is of one, and one with no file at all", async () => {
    server.networkState.mergeConfig({ uploads: { accept: ["image/*", ".pdf"] } });
    const fields = new FormData();
    fields.append("title", "Q3");

    const files = await fetch(`${url}/files`, {
      method: "POST",
      body: formWith(file(10, "a.png", "image/png"), file(10, "Q3.PDF", "")),
    });
    const none = await fetch(`${url}/files`, { method: "POST", body: fields });

    expect(await files.json()).toEqual({ files: 2 });
    expect(none.status).toBe(200);
  });
});

describe("a route's own upload conditions", () => {
  it("hold for that route alone", async () => {
    server.networkState.mergeConfig({
      routeOverrides: [
        {
          routeId: "files:avatar",
          enabled: true,
          uploads: { maxBytes: 1024, accept: ["image/*"] },
        },
      ],
    });

    const avatar = await fetch(`${url}/files/avatar`, {
      method: "POST",
      body: formWith(file(4096, "me.png", "image/png")),
    });
    const other = await fetch(`${url}/files`, {
      method: "POST",
      body: formWith(file(4096, "notes.txt", "text/plain")),
    });

    expect(avatar.status).toBe(413);
    expect(other.status).toBe(200);
  });

  it("are logged refused under one id, with the status and why", async () => {
    server.networkState.mergeConfig({ uploads: { accept: ["image/*"] } });
    const starts: string[] = [];
    const errors: Array<[string, number, string]> = [];
    server.requestHooks.onStart = (id) => starts.push(id);
    server.requestHooks.onError = (id, status, message) => errors.push([id, status, message]);

    await fetch(`${url}/files`, {
      method: "POST",
      body: formWith(file(10, "a.txt", "text/plain")),
    });
    Reflect.deleteProperty(server.requestHooks, "onStart");
    Reflect.deleteProperty(server.requestHooks, "onError");

    expect(errors).toEqual([
      [starts[0], 415, "a.txt (text/plain) is not a type the mock takes: image/*"],
    ]);
  });
});
