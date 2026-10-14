/**
 * A multipart proxy call names its endpoint in the URL, and its body holds
 * the call's options and the caller's own fields.
 *
 * The caller's fields never route the call: a form that follows the Laravel
 * and Rails convention of `_method=PUT` is not routed to a method called
 * "PUT", a field named `_source` or `_group` does not re-route it, and one
 * named `_options` is not read as the call's options.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { sendWebResponse, toWebRequest } from "../src/node";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { parseRequestPayload } from "../src/utils/request-payload";

let upstream: Server;
let app: Server;
let proxyURL: string;

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(async () => {
  upstream = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", async () => {
      const form = await new Response(Buffer.concat(chunks), {
        headers: { "content-type": String(req.headers["content-type"]) },
      }).formData();
      const parts = [...form.entries()].map(([name, value]) =>
        typeof value === "string" ? `${name}=${value}` : name,
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ parts }));
    });
  });
  const { endpoint } = courier();
  const files = defineGroup({ prefix: "files", endpoints: { upload: endpoint.post("") } });
  registerSources({
    api: defineApi({ expose: true, baseURL: await listen(upstream), groups: { files } }),
  });

  const handler = createHandler();
  app = createServer(async (req, res) => {
    await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
  });
  proxyURL = `${await listen(app)}/api/request`;
});

afterEach(async () => {
  _resetSourcesForTests();
  for (const server of [app, upstream]) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

function upload(field: string, value: string): Promise<{ parts: string[] }> {
  const routes = { source: "api", endpoints: { "files.upload": { type: "mutation" } } } as const;
  const client = createProxyCaller(routes, { proxyPath: { http: proxyURL } }) as unknown as {
    files: { upload: (form: FormData) => Promise<{ parts: string[] }> };
  };
  const form = new FormData();
  form.append(field, value);
  form.append("file", new File(["abc"], "a.txt", { type: "text/plain" }));
  return client.files.upload(form);
}

describe("a caller's field named like a routing field", () => {
  it.each(["_method", "_source", "_group"])(
    "reaches the upstream as %s, routing untouched",
    async (field) => {
      const result = await upload(field, "PUT");

      expect(result.parts).toEqual([`${field}=PUT`, "file"]);
    },
  );

  it("reaches the upstream as _options and is not read as the call's options", async () => {
    const result = await upload("_options", JSON.stringify({ stream: true }));

    expect(result.parts).toEqual(['_options={"stream":true}', "file"]);
  });
});

describe("parseRequestPayload", () => {
  it("reads a group named as the empty string as no group", () => {
    const parsed = parseRequestPayload({ source: "api", group: "", method: "upload" });

    expect(parsed).toMatchObject({ source: "api", group: undefined, method: "upload" });
  });
});
