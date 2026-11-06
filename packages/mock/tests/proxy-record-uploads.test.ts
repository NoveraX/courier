/**
 * @vitest-environment node
 *
 * A record that holds a file goes through the proxy as a record upload. A
 * mock reads one as a Courier server does, and gives its handler what a
 * direct call to the mock gives it: the form a direct call sends for the
 * record. It holds one to its limits as it holds a form — over its upload
 * limit refused with 413, its text over the limit JSON is held to with 413,
 * a file of a type it does not take with 415 — and one that does not parse
 * with 400, as a Courier server refuses it.
 */
import { createCaller, createProxyCaller, HTTPError } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { RECORD_UPLOAD_TYPE, routesOf } from "@noverax/courier/internal";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint } = courier();

interface Report {
  title: string;
  pages: number;
  tags: string[];
  meta: { draft: boolean };
  cover: File;
  scans: File[];
}

function reportsApi(baseURL: string) {
  return defineApi({
    baseURL,
    expose: true,
    groups: {
      reports: defineGroup({
        prefix: "/reports",
        endpoints: {
          create: endpoint.post("").variables<Report>().response<unknown>(),
          note: endpoint
            .post("/note")
            .variables<{ title: string; pages: number }>()
            .response<unknown>(),
        },
      }),
    },
  });
}

/* What the handler received: each field, a file as its name, type and size. */
function received(variables: unknown): unknown {
  const show = (value: unknown): unknown =>
    value instanceof File ? { name: value.name, type: value.type, size: value.size } : value;
  const fields = Object.entries(variables as Record<string, unknown>).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.map(show) : show(value),
  ]);
  return Object.fromEntries(fields);
}

let handled = 0;
const server = createAutoMockServer({
  source: reportsApi("http://api.test"),
  port: 0,
  log: false,
  maxBodyBytes: 2048,
  maxUploadBytes: 64 * 1024,
  overrides: (mock) => {
    mock("reports", "create").returns(({ variables }) => {
      handled += 1;
      return received(variables);
    });
    mock("reports", "note").returns(({ variables }) => {
      handled += 1;
      return variables;
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

const proxied = () =>
  createProxyCaller(routesOf(reportsApi("http://api.test"), "api"), {
    proxyPath: { http: `${url}/api/request` },
  });

const report = ({ coverBytes = 8, title = "Q3 report" } = {}): Report => ({
  title,
  pages: 3,
  tags: ["draft", "q3"],
  meta: { draft: true },
  cover: new File(["x".repeat(coverBytes)], "q3.pdf", { type: "application/pdf" }),
  scans: [
    new File(["a"], "a.png", { type: "image/png" }),
    new File(["bb"], "b.png", { type: "image/png" }),
  ],
});

const failureOf = (call: Promise<unknown>) => call.catch((error: unknown) => error);

/* A record upload written by hand, its parts in the order given. */
function recordUpload(...parts: [name: string, value: string][]): RequestInit {
  const written = parts.map(
    ([name, value]) => `--b\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  );
  return {
    method: "POST",
    headers: { "content-type": `${RECORD_UPLOAD_TYPE}; boundary=b` },
    body: `${written.join("")}--b--\r\n`,
  };
}

describe("a record that holds a file, through the proxy to a mock", () => {
  it("reaches the handler as it does from a direct call: as the form a direct call sends", async () => {
    const fromProxy = await proxied().reports.create(report());
    const fromDirect = await createCaller(reportsApi(url)).reports.create(report());

    expect(fromProxy).toEqual(fromDirect);
    expect(fromProxy).toEqual({
      title: "Q3 report",
      pages: "3",
      tags: ["draft", "q3"],
      meta: '{"draft":true}',
      cover: { name: "q3.pdf", type: "application/pdf", size: 8 },
      scans: [
        { name: "a.png", type: "image/png", size: 1 },
        { name: "b.png", type: "image/png", size: 2 },
      ],
    });
  });

  it("carries its call's options: a .raw call is answered with the response around the data", async () => {
    const response = await proxied().raw.reports.create(report());

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({ title: "Q3 report", pages: "3" });
  });

  it("over the mock's upload limit is refused 413 before its handler runs, saying the limit", async () => {
    const failure = await failureOf(proxied().reports.create(report({ coverBytes: 65 * 1024 })));

    expect(failure).toBeInstanceOf(HTTPError);
    expect(failure).toMatchObject({
      status: 413,
      data: {
        success: false,
        message: "The request body is larger than 64 KB, the most this mock reads",
      },
    });
    expect(handled).toBe(0);
  });

  it("is held to the limit JSON is held to for its record's text, as a form's text is", async () => {
    const failure = await failureOf(proxied().reports.create(report({ title: "x".repeat(4096) })));

    expect(failure).toMatchObject({ status: 413, data: { success: false } });
    expect(handled).toBe(0);
  });

  it("holding a file of a type the mock does not take is refused 415, as a form is", async () => {
    server.networkState.mergeConfig({ uploads: { accept: ["image/*"] } });

    const failure = await failureOf(proxied().reports.create(report()));

    expect(failure).toMatchObject({
      status: 415,
      data: {
        success: false,
        message: "q3.pdf (application/pdf) is not a type the mock takes: image/*",
      },
    });
    expect(handled).toBe(0);
  });
});

describe("a record upload written by hand", () => {
  it("that does not parse is refused 400, with the reason a Courier server gives", async () => {
    const res = await fetch(
      `${url}/api/request?_s=api&_g=reports&_m=create`,
      recordUpload(["_options", "{}"]),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      message: "A record upload holds no _variables part after its options",
    });
    expect(handled).toBe(0);
  });

  it("that holds no file reaches the handler as JSON does, as a direct call sends it", async () => {
    const variables = { title: "Q3", pages: 3 };

    const res = await fetch(
      `${url}/api/request?_s=api&_g=reports&_m=note`,
      recordUpload(["_options", "{}"], ["_variables", JSON.stringify({ variables, files: [] })]),
    );

    expect(await res.json()).toEqual(await proxied().reports.note(variables));
    expect(await proxied().reports.note(variables)).toEqual(variables);
  });
});
