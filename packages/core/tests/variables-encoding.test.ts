/**
 * One encoder writes a call's variables into its request. A record goes as
 * JSON, or — when one of its fields holds a file — as a form, written as
 * OpenAPI writes `multipart/form-data` by default; a read sends a record, or
 * a form's text fields, in its address. What no form of the request carries
 * is refused before anything is sent, with where it sits and not what it
 * holds: nothing is lost on the way without a word.
 */
import type { IncomingMessage } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { isConfigurationError } from "../src/errors";
import { sendJson, startUpstream, type Upstream } from "./helpers/middleware-upstream";
import { boundaryIn, type ReadPart, readParts } from "./helpers/multipart-fixtures";

const { endpoint } = courier();

let upstream: Upstream | undefined;
const bodies: Array<{ type: string; bytes: Uint8Array<ArrayBuffer> }> = [];

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
  bodies.length = 0;
});

async function bodyOf(req: IncomingMessage): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
}

/** A caller of `endpoints` whose upstream keeps each body it is sent. */
async function client(endpoints: Record<string, unknown>) {
  upstream = await startUpstream((req, res) => {
    void bodyOf(req).then((bytes) => {
      bodies.push({ type: req.headers["content-type"] ?? "", bytes });
      sendJson(res, 200, {});
    });
  });
  return createCaller(
    defineApi({ name: "api", baseURL: upstream.url, endpoints } as Parameters<typeof defineApi>[0]),
  ) as unknown as Record<string, (variables?: unknown) => Promise<unknown>>;
}

/** The parts of the form the upstream got, read as its content type says. */
async function sentParts(index = 0): Promise<Array<Omit<ReadPart, "bytes"> & { text: string }>> {
  const body = bodies[index];
  const boundary = boundaryIn(body?.type ?? "");
  if (body === undefined || boundary === undefined) throw new Error(`no form: ${body?.type}`);
  const parts = await readParts(new Blob([body.bytes]).stream(), boundary);
  return parts.map(({ bytes, ...head }) => ({ ...head, text: new TextDecoder().decode(bytes) }));
}

async function refusalOf(call: Promise<unknown> | undefined): Promise<Error> {
  const refusal: unknown = await call?.catch((error: unknown) => error);
  expect(isConfigurationError(refusal)).toBe(true);
  expect(refusal).toMatchObject({ code: "VARIABLE_NOT_ENCODABLE" });
  expect(upstream?.seen).toHaveLength(0);
  return refusal as Error;
}

describe("a record that holds a file", () => {
  it("goes as a form, the file a part of its own and the path filled from its field", async () => {
    const api = await client({
      cover: endpoint
        .post(":bookId/cover")
        .variables<{ bookId: string; title: string; file: File }>(),
    });

    await api.cover?.({
      bookId: "b7",
      title: "Dune",
      file: new File(["png"], "cover.png", { type: "image/png" }),
    });

    expect(upstream?.seen[0]?.url).toBe("/b7/cover");
    expect(bodies[0]?.type).toMatch(/^multipart\/form-data; boundary=/);
    expect(await sentParts()).toEqual([
      { name: "title", filename: undefined, type: undefined, text: "Dune" },
      { name: "file", filename: "cover.png", type: "image/png", text: "png" },
    ]);
  });

  it("writes each value as OpenAPI's multipart defaults do, a list as a part for each item", async () => {
    const api = await client({ save: endpoint.post("save").variables<Record<string, unknown>>() });

    await api.save?.({
      photos: [new Blob(["a"]), new Blob(["b"])],
      tags: ["x", "y"],
      meta: { size: 3, labels: ["big"] },
      count: 2,
      flag: true,
      at: new Date("2026-11-06T00:00:00.000Z"),
      bytes: new Uint8Array([104, 105]),
      left: undefined,
      none: null,
    });

    expect((await sentParts()).map(({ name, filename, text }) => [name, filename, text])).toEqual([
      ["photos", "blob", "a"],
      ["photos", "blob", "b"],
      ["tags", undefined, "x"],
      ["tags", undefined, "y"],
      ["meta", undefined, '{"size":3,"labels":["big"]}'],
      ["count", undefined, "2"],
      ["flag", undefined, "true"],
      ["at", undefined, "2026-11-06T00:00:00.000Z"],
      ["bytes", "blob", "hi"],
    ]);
  });

  it("writes each field as JSON writes it inside the record, which is what a proxy call carries", async () => {
    class Stamp {
      constructor(readonly text: string) {}
      toJSON(): string {
        return this.text;
      }
    }
    class Listed {
      constructor(readonly items: string[]) {}
      toJSON(): string[] {
        return this.items;
      }
    }
    const api = await client({ save: endpoint.post("save").variables<Record<string, unknown>>() });

    await api.save?.({
      cover: new Blob(["png"]),
      publishedAt: new Stamp("2026-01-02T03:04:05.000Z"),
      price: new Stamp("12.50"),
      tags: new Listed(["a", "b"]),
      onDone: function onDone() {
        return "made-up-secret-in-source";
      },
      count: Number.NaN,
      limit: Number.POSITIVE_INFINITY,
      when: new Date("not a date"),
      mark: Symbol("mark"),
      list: [1, Number.NaN, () => 1, "x"],
    });

    const parts = (await sentParts()).map(({ name, text }) => [name, text]);
    expect(parts).toEqual([
      ["cover", "png"],
      ["publishedAt", "2026-01-02T03:04:05.000Z"],
      ["price", "12.50"],
      ["tags", "a"],
      ["tags", "b"],
      ["list", "1"],
      ["list", "x"],
    ]);
    expect(new TextDecoder().decode(bodies[0]?.bytes)).not.toContain("made-up-secret-in-source");
  });

  it.each([
    ["beside a file", { cover: new Blob(["png"]), value: 12n }, "variables.value is a BigInt"],
    [
      "in an object beside a file",
      { cover: new Blob(["png"]), meta: { value: 12n } },
      "variables.meta.value is a BigInt",
    ],
    ["in a body of JSON", { meta: { value: 12n } }, "variables.meta.value is a BigInt"],
  ])(
    "refuses a BigInt %s, which JSON does not write, where it sits",
    async (_, variables, said) => {
      const api = await client({
        save: endpoint.post("save").variables<Record<string, unknown>>(),
      });

      const refusal = await refusalOf(api.save?.(variables));

      expect(refusal.message).toContain(said);
      expect(refusal.message).not.toContain("12");
    },
  );

  it("goes as a form for a QUERY too, which asks with a body", async () => {
    const api = await client({ find: endpoint.query("find").variables<{ image: Blob }>() });

    await api.find?.({ image: new Blob(["jpg"]) });

    expect(upstream?.seen[0]?.method).toBe("QUERY");
    expect(bodies[0]?.type).toMatch(/^multipart\/form-data/);
  });

  it("refuses a file deeper than a field, which a form would send as JSON", async () => {
    const api = await client({ save: endpoint.post("save").variables<Record<string, unknown>>() });

    const refusal = await refusalOf(
      api.save?.({ file: new Blob(["a"]), meta: { avatar: new Blob(["b"]) } }),
    );

    expect(refusal.message).toContain("variables.meta.avatar is binary data");
    expect(refusal.message).toContain("give the file a field of its own");
  });

  it("refuses a stream inside it, which no form's part is", async () => {
    const api = await client({ save: endpoint.post("save").variables<Record<string, unknown>>() });

    const refusal = await refusalOf(
      api.save?.({ file: new Blob(["a"]), body: new Blob(["b"]).stream() }),
    );

    expect(refusal.message).toContain("variables.body is a stream");
  });
});

describe("variables JSON would lose", () => {
  it.each([
    ["a Set", { tags: new Set(["secret-tag"]) }, "variables.tags is a Set"],
    ["a Map", { seen: new Map([["secret-key", 1]]) }, "variables.seen is a Map"],
    ["a file deeper than a field", { meta: { avatar: new Blob(["b"]) } }, "variables.meta.avatar"],
    ["bytes in a list", [new Uint8Array([1])], "variables[0] is binary data"],
  ])(
    "are refused, %s named by where it sits and not by what it holds",
    async (_, variables, said) => {
      const api = await client({ save: endpoint.post("save").variables<unknown>() });

      const refusal = await refusalOf(api.save?.(variables));

      expect(refusal.message).toContain(said);
      expect(refusal.message).not.toContain("secret");
    },
  );

  it.each([
    ["in a field beside a file", true, "variables.meta.self is the value it sits in"],
    ["in a body of JSON", false, "variables.meta.self is the value it sits in"],
  ])("refuse a value inside itself %s, named where it points back", async (_, file, said) => {
    const meta: Record<string, unknown> = { secret: "made-up-secret" };
    meta.self = meta;
    const api = await client({ save: endpoint.post("save").variables<Record<string, unknown>>() });

    const refusal = await refusalOf(
      api.save?.({ ...(file && { cover: new Blob(["png"]) }), meta }),
    );

    expect(refusal.message).toContain(said);
    expect(refusal.message).not.toContain("made-up-secret");
  });

  it("refuse a value inside itself through a list, named by the item that points back", async () => {
    const meta: Record<string, unknown> = {};
    meta.items = [{ name: "a" }, meta];
    const api = await client({ save: endpoint.post("save").variables<Record<string, unknown>>() });

    const refusal = await refusalOf(api.save?.({ cover: new Blob(["png"]), meta }));

    expect(refusal.message).toContain("variables.meta.items[1] is the value it sits in");
  });

  it("send a value met on two paths twice, as JSON writes it: it is no cycle", async () => {
    const shared = { n: 1 };
    const api = await client({ save: endpoint.post("save").variables<Record<string, unknown>>() });

    await api.save?.({
      cover: new Blob(["png"]),
      pair: { x: shared, y: shared },
      list: [shared, shared],
    });

    expect((await sentParts()).map(({ name, text }) => [name, text])).toEqual([
      ["cover", "png"],
      ["pair", '{"x":{"n":1},"y":{"n":1}}'],
      ["list", '{"n":1}'],
      ["list", '{"n":1}'],
    ]);
  });

  it("are written as their own toJSON says, not looked into", async () => {
    class Money {
      readonly #cache = new Map<string, string>();
      constructor(readonly cents: number) {}
      toJSON(): string {
        return `${this.#cache.size}${this.cents / 100} EUR`;
      }
    }
    const api = await client({ pay: endpoint.post("pay").variables<{ amount: Money }>() });

    await api.pay?.({ amount: new Money(1250) });

    expect(new TextDecoder().decode(bodies[0]?.bytes)).toBe('{"amount":"012.5 EUR"}');
  });
});

describe("variables a read sends in its address", () => {
  it("are a form's text fields, as a browser sends a form whose method is GET", async () => {
    const api = await client({ find: endpoint.get("find").variables<FormData>() });
    const form = new FormData();
    form.append("q", "boots");
    form.append("size", "41");
    form.append("size", "42");

    await api.find?.(form);

    expect(upstream?.seen[0]?.url).toBe("/find?q=boots&size=41&size=42");
  });

  it.each([
    ["a file in a record", { q: "x", file: new Blob(["a"]) }, "variables.file is binary data"],
    ["a file in a list", { files: [new Blob(["a"])] }, "variables.files[0] is binary data"],
  ])("refuse %s, which an address cannot hold", async (_, variables, said) => {
    const api = await client({ find: endpoint.get("find").variables<unknown>() });

    const refusal = await refusalOf(api.find?.(variables));

    expect(refusal.message).toContain(said);
    expect(refusal.message).toContain("an address holds text");
  });

  it("refuse a Set, which the address would hold as {}", async () => {
    const api = await client({ find: endpoint.get("find").variables<unknown>() });

    const refusal = await refusalOf(api.find?.({ tags: new Set(["a"]) }));

    expect(refusal.message).toContain("variables.tags is a Set");
  });

  it("refuse a file in a form", async () => {
    const api = await client({ find: endpoint.get("find").variables<FormData>() });
    const form = new FormData();
    form.append("photo", new Blob(["a"]), "a.png");

    const refusal = await refusalOf(api.find?.(form));

    expect(refusal.message).toContain("variables.photo is a file");
  });
});
