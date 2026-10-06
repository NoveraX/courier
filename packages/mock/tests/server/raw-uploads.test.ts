/**
 * @vitest-environment node
 *
 * A file sent as the whole body — a direct call made with a `Blob`, an
 * `ArrayBuffer` or a typed array — reaches a mock's handler as a `Blob` of
 * its type; JSON sent with no type, as a `fetch` of a string sends it, is
 * still read as JSON.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAutoMockServer } from "../../src/auto/create-auto-server";

const { endpoint } = courier();

const api = defineApi({
  baseURL: "http://api.test",
  groups: {
    files: defineGroup({
      prefix: "/files",
      endpoints: {
        create: endpoint.post("").variables<Blob>().response<unknown>(),
        put: endpoint.put("/raw").variables<Blob>().response<unknown>(),
        replace: endpoint.put("/:id").variables<{ id: number }>().response<unknown>(),
        named: endpoint.post("/named").variables<unknown>().response<unknown>(),
      },
    }),
  },
});

/* What a handler received: a Blob as its type and size, anything else as it is. */
const seen = ({ variables }: { variables: unknown }) =>
  variables instanceof Blob
    ? { blob: { type: variables.type, size: variables.size } }
    : { value: variables };

const server = createAutoMockServer({
  source: api,
  port: 0,
  log: false,
  maxBodyBytes: 1024,
  overrides: (mock) => {
    mock("files", "create").returns(seen);
    mock("files", "put").returns(seen);
    mock("files", "replace").returns(seen);
    mock("files", "named").returns(seen);
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
});

const send = (path: string, init: RequestInit) => fetch(`${url}${path}`, init);

describe("a file sent as the whole body", () => {
  it("reaches the handler as a Blob of its type and size", async () => {
    const res = await send("/files", {
      method: "POST",
      body: new Blob([new Uint8Array(2048)], { type: "image/png" }),
    });

    expect(await res.json()).toEqual({ blob: { type: "image/png", size: 2048 } });
  });

  it("is a Blob at a path the source declares, a PUT included", async () => {
    const res = await send("/files/raw", {
      method: "PUT",
      body: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
    });

    expect(await res.json()).toEqual({ blob: { type: "application/pdf", size: 8 } });
  });

  it("is a Blob with no type when its bytes came with none and are not JSON", async () => {
    const res = await send("/files", { method: "POST", body: new Uint8Array([0xff, 0x00, 0x7b]) });

    expect(await res.json()).toEqual({ blob: { type: "", size: 3 } });
  });

  it("is refused with 400 at a path whose own values it has no fields for", async () => {
    const res = await send("/files/7", {
      method: "PUT",
      body: new Blob(["x"], { type: "application/octet-stream" }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/raw bytes.*send the file in a form/);
  });

  it("is refused at the proxy route, which a proxy client sends JSON or a form to", async () => {
    const res = await send("/api/request?_s=api&_g=files&_m=create", {
      method: "POST",
      body: new Blob(["x"], { type: "image/png" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "The proxy takes JSON or a form; send a file in a form",
    });
  });

  it("is held to the types the mock takes", async () => {
    server.networkState.mergeConfig({ uploads: { accept: ["image/*"] } });

    const res = await send("/files", {
      method: "POST",
      body: new Blob(["PK"], { type: "application/zip" }),
    });

    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({
      error: "An upload of application/zip is not a type the mock takes: image/*",
    });
  });
});

describe("JSON sent with no type", () => {
  it("is read as JSON, as a fetch of a string sends it", async () => {
    const res = await send("/files/named", { method: "POST", body: '{"title":"Q3"}' });

    expect(await res.json()).toEqual({ value: { title: "Q3" } });
  });

  it("is plain text kept as a Blob when it is not JSON", async () => {
    const res = await send("/files/named", { method: "POST", body: "plain words" });

    expect(await res.json()).toEqual({ blob: { type: "text/plain", size: 11 } });
  });

  it("is refused with 413 past the mock's limit for JSON", async () => {
    const res = await send("/files/named", {
      method: "POST",
      body: JSON.stringify({ text: "x".repeat(2048) }),
    });

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: "The request body is larger than 1 KB, the most this mock reads",
    });
  });
});
