/**
 * Uploads sent to a mock client in process meet the upload conditions as a
 * mock server's do: one over the size limit fails with 413, one holding a
 * file of a type not taken with 415, and one an `interrupt` cuts off with
 * the 502 a dropped connection stands for — each before the handler runs,
 * with the `{ error }` the server answers it with.
 */
import { HTTPError } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { createMockClient } from "../src/create-mock-client";
import type { NetworkConfig } from "../src/types";

const { endpoint } = courier();

const files = defineGroup({
  prefix: "files",
  endpoints: {
    upload: endpoint.post("").variables<FormData>().response<{ ok: boolean }>(),
    avatar: endpoint.post("avatar").variables<FormData>().response<{ ok: boolean }>(),
    putRaw: endpoint.put("raw").variables<Blob>().response<{ ok: boolean }>(),
    search: endpoint.post("search").variables<URLSearchParams>().response<unknown>(),
  },
});
const api = defineApi({ baseURL: "http://placeholder.invalid", groups: { files } });

function clientUnder(network: NetworkConfig) {
  const handled: unknown[] = [];
  const { client, mock } = createMockClient<typeof api>({ network });
  for (const name of ["upload", "avatar", "putRaw"] as const) {
    mock("files", name).returns(({ variables }) => {
      handled.push(variables);
      return { ok: true };
    });
  }
  mock("files", "search").returns(({ variables }) => variables);
  return { client, handled };
}

const formWith = (file: File): FormData => {
  const form = new FormData();
  form.append("file", file);
  return form;
};

const failureOf = (call: Promise<unknown>) => call.catch((error: unknown) => error);

describe("a mock client's upload conditions", () => {
  it("fail an upload over the size limit with 413, as the encoded form's size", async () => {
    const { client, handled } = clientUnder({ uploads: { maxBytes: 1024 } });

    const failure = await failureOf(
      client.files.upload(formWith(new File([new Uint8Array(2048)], "a.bin"))),
    );

    expect(failure).toBeInstanceOf(HTTPError);
    expect(failure).toMatchObject({
      status: 413,
      data: {
        error: expect.stringMatching(/^The upload is 2\.\d KB, over the 1 KB the mock takes$/),
      },
    });
    expect(handled).toEqual([]);
  });

  it("fail one holding a file of a type not taken with 415", async () => {
    const { client } = clientUnder({ uploads: { accept: ["image/*"] } });

    const failure = await failureOf(
      client.files.upload(formWith(new File(["x"], "notes.txt", { type: "text/plain" }))),
    );

    expect(failure).toMatchObject({
      status: 415,
      data: { error: "notes.txt (text/plain) is not a type the mock takes: image/*" },
    });
  });

  it("hold a raw upload to the limit and types, by its size and type", async () => {
    const { client, handled } = clientUnder({ uploads: { maxBytes: 64, accept: ["image/*"] } });

    const png = new Blob([new Uint8Array(32)], { type: "image/png" });
    await expect(client.files.putRaw(png)).resolves.toEqual({ ok: true });
    const big = await failureOf(
      client.files.putRaw(new Blob([new Uint8Array(65)], { type: "image/png" })),
    );

    expect(handled).toEqual([png]);
    expect(big).toMatchObject({ status: 413 });
  });

  it("apply a route's own limit to that route alone", async () => {
    const { client } = clientUnder({
      routeOverrides: [{ routeId: "files:avatar", enabled: true, uploads: { maxBytes: 64 } }],
    });
    const form = () => formWith(new File([new Uint8Array(512)], "me.png", { type: "image/png" }));

    await expect(client.files.upload(form())).resolves.toEqual({ ok: true });
    expect(await failureOf(client.files.avatar(form()))).toMatchObject({ status: 413 });
  });

  it("fail an upload an interrupt cuts off with a 502, before the handler runs", async () => {
    const { client, handled } = clientUnder({ errorRate: 1, faultTypes: ["interrupt"] });

    const failure = await failureOf(client.files.upload(formWith(new File(["x"], "a.txt"))));

    expect(failure).toMatchObject({
      status: 502,
      data: { error: "Upload Interrupted (simulated)" },
    });
    expect(handled).toEqual([]);
  });
});

describe("a form a mock client is sent URL-encoded", () => {
  it("reaches the handler as its fields, as one sent to a mock server does", async () => {
    const { client } = clientUnder({});

    const fields = await client.files.search(
      new URLSearchParams([
        ["q", "q3"],
        ["tag", "a"],
        ["tag", "b"],
      ]),
    );

    expect(fields).toEqual({ q: "q3", tag: ["a", "b"] });
  });
});
