/**
 * @vitest-environment node
 *
 * Uploads to a mock, at the paths its source declares: a form's fields and
 * files reach the handler as a Courier server's do, a body over the mock's
 * limit is refused with 413 before it is all read, a form that does not
 * parse with 400, and a client that stops sending leaves the mock serving.
 */
import { request as httpRequest } from "node:http";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint } = courier();
const Received = z.object({ fields: z.record(z.string(), z.unknown()) });

const api = defineApi({
  baseURL: "http://api.test",
  groups: {
    files: defineGroup({
      prefix: "/files",
      endpoints: {
        create: endpoint.post("").variables<FormData>().response(Received),
        avatar: endpoint.post("/avatar").variables<FormData>().response(Received),
      },
    }),
  },
});

/* What the handler received: each field, a file as its name, type and size. */
function received(variables: unknown) {
  const show = (value: unknown): unknown =>
    value instanceof File ? { name: value.name, type: value.type, size: value.size } : value;
  const fields = Object.entries(variables as Record<string, unknown>).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.map(show) : show(value),
  ]);
  return { fields: Object.fromEntries(fields) };
}

const server = createAutoMockServer({
  source: api,
  port: 0,
  log: false,
  maxBodyBytes: 2048,
  maxUploadBytes: 64 * 1024,
  overrides: (mock) => {
    mock("files", "create").returns((ctx) => received(ctx.variables));
    mock("files", "avatar").returns((ctx) => received(ctx.variables));
  },
});

let url: string;
beforeAll(async () => {
  url = (await server.start()).url;
});
afterAll(async () => {
  await server.stop();
});

const post = (path: string, body: BodyInit, headers?: Record<string, string>) =>
  fetch(`${url}${path}`, { method: "POST", body, ...(headers && { headers }) });

/* A raw request whose body is written chunk by chunk, with no length declared. */
function stream(path: string, chunks: string[], { gapMs = 0, abortAfter = Infinity } = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest(`${url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "transfer-encoding": "chunked" },
    });
    req.on("response", (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    const send = (index: number): void => {
      if (index >= abortAfter) {
        req.destroy();
      } else if (index === chunks.length) {
        req.end();
      } else {
        req.write(chunks[index]);
        setTimeout(() => send(index + 1), gapMs);
      }
    };
    send(0);
  });
}

describe("an upload to a mock", () => {
  it("reaches the handler: its fields, and each file with its name, type and size", async () => {
    const form = new FormData();
    form.append("title", "Q3 report");
    form.append("file", new File(["%PDF-1.7"], "q3.pdf", { type: "application/pdf" }));

    const res = await post("/files", form);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      fields: { title: "Q3 report", file: { name: "q3.pdf", type: "application/pdf", size: 8 } },
    });
  });

  it("keeps an empty file that was chosen, and many files sent under one name, in order", async () => {
    const form = new FormData();
    form.append("files", new File([], ".gitkeep"));
    for (const name of ["a.txt", "b.txt", "c.txt"]) form.append("files", new File([name], name));

    const res = await post("/files/avatar", form);

    const { fields } = await res.json();
    expect(
      fields.files.map((file: { name: string; size: number }) => [file.name, file.size]),
    ).toEqual([
      [".gitkeep", 0],
      ["a.txt", 5],
      ["b.txt", 5],
      ["c.txt", 5],
    ]);
  });

  it("keeps a file's name as sent, unicode and dots included: the mock writes no file", async () => {
    const form = new FormData();
    form.append("file", new File(["x"], "отчёт 2026 ✓.pdf"));
    form.append("evil", new File(["x"], "../../etc/passwd"));

    const { fields } = await (await post("/files", form)).json();

    expect([fields.file.name, fields.evil.name]).toEqual(["отчёт 2026 ✓.pdf", "../../etc/passwd"]);
  });

  it("refuses an upload over the mock's limit with 413, saying the limit", async () => {
    const form = new FormData();
    form.append("file", new File(["x".repeat(65 * 1024)], "big.bin"));

    const res = await post("/files", form);

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: "The request body is larger than 64 KB, the most this mock reads",
    });
  });

  it("refuses JSON over its limit with 413 before it is all sent", async () => {
    const chunks = Array.from({ length: 8 }, () => "x".repeat(512));

    const { status } = await stream("/api/files/create", ['{"note":"', ...chunks, '"}']);

    expect(status).toBe(413);
  });

  it("refuses a form that does not parse with 400", async () => {
    const res = await post("/files", "--wrong\r\nContent-Disposition: form-data\r\n\r\nx", {
      "content-type": "multipart/form-data; boundary=right",
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "The form body could not be read" });
  });

  it("reads a form sent url-encoded as fields", async () => {
    const res = await post("/files", new URLSearchParams({ title: "Q3", tags: "a" }));

    expect(await res.json()).toEqual({ fields: { title: "Q3", tags: "a" } });
  });

  it("waits for a slow upload, and serves on when a client stops sending", async () => {
    const slow = await stream("/api/files/create", ['{"note":', '"slow"', "}"], { gapMs: 150 });
    await stream("/api/files/create", ['{"note":', '"cut', "off"], { abortAfter: 2 }).catch(
      () => undefined,
    );
    const after = await post("/files", new URLSearchParams({ title: "still here" }));

    expect(slow.status).toBe(200);
    expect(after.status).toBe(200);
  });

  it("is logged when refused, with its status and why, as any request is", async () => {
    const errors: Array<[number, string]> = [];
    const before = server.requestHooks.onError;
    server.requestHooks.onError = (_id, status, message) => {
      errors.push([status, message]);
    };
    const form = new FormData();
    form.append("file", new File(["x".repeat(65 * 1024)], "big.bin"));

    await post("/files", form);
    if (before) server.requestHooks.onError = before;
    else Reflect.deleteProperty(server.requestHooks, "onError");

    expect(errors).toEqual([
      [413, "The request body is larger than 64 KB, the most this mock reads"],
    ]);
    expect(server.history.at(-1)).toMatchObject({ group: "files", method: "create" });
    expect(server.history.at(-1)?.error?.message).toMatch(/larger than 64 KB/);
  });
});
