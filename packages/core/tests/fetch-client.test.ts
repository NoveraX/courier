/**
 * The standalone fetch client, `@noverax/courier/fetch`, on the wire: the
 * URL it builds from its base, the headers and body it sends, the verb, and
 * how it reads an answer — a text body, a failure whose body is not JSON,
 * and a request that ran out of time.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { HTTPError } from "../src/errors";
import { createFetch } from "../src/fetch";

interface Sent {
  method: string;
  url: string;
  headers: Headers;
  body: string;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/* Record each request fetch is handed, and answer it with `response`. */
function recording(response: () => Response = () => Response.json({ ok: true })): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", async (input: Request | URL | string, init?: RequestInit) => {
    const request = new Request(input, init);
    sent.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: await request.text(),
    });
    return response();
  });
  return sent;
}

describe("the URL", () => {
  it("joins the base and the path with one slash, whichever of them has it", async () => {
    const sent = recording();

    await createFetch({ baseURL: "https://api.example/v1" }).get("users");
    await createFetch({ baseURL: "https://api.example/v1/" }).get("/users");

    expect(sent.map((request) => request.url)).toEqual([
      "https://api.example/v1/users",
      "https://api.example/v1/users",
    ]);
  });

  it("carries the search parameters", async () => {
    const sent = recording();

    await createFetch({ baseURL: "https://api.example" }).get("/users", {
      searchParams: { page: "2", q: "a b" },
    });

    expect(sent[0]?.url).toBe("https://api.example/users?page=2&q=a+b");
  });
});

describe("the request", () => {
  it("sends each verb by its HTTP name", async () => {
    const sent = recording();
    const client = createFetch({ baseURL: "https://api.example" });

    await client.put("/a");
    await client.patch("/a");
    await client.del("/a");

    expect(sent.map((request) => request.method)).toEqual(["PUT", "PATCH", "DELETE"]);
  });

  it("sends JSON with its content type", async () => {
    const sent = recording();

    await createFetch({ baseURL: "https://api.example" }).post("/users", { json: { name: "Ada" } });

    expect(sent[0]?.body).toBe('{"name":"Ada"}');
    expect(sent[0]?.headers.get("content-type")).toBe("application/json");
  });

  it("lets a call's headers override the client's, from a record or a Headers", async () => {
    const sent = recording();
    const client = createFetch({
      baseURL: "https://api.example",
      headers: { "x-app": "studio", authorization: "Bearer default" },
    });

    await client.get("/a", { headers: { authorization: "Bearer call" } });
    await client.get("/a", { headers: new Headers({ authorization: "Bearer headers" }) });

    expect(
      sent.map((request) => [request.headers.get("x-app"), request.headers.get("authorization")]),
    ).toEqual([
      ["studio", "Bearer call"],
      ["studio", "Bearer headers"],
    ]);
  });
});

describe("the answer", () => {
  it("is read as text when asked", async () => {
    recording(() => new Response("plain", { headers: { "content-type": "text/plain" } }));

    await expect(
      createFetch({ baseURL: "https://api.example" }).get<string>("/a", { responseType: "text" }),
    ).resolves.toBe("plain");
  });

  it("rejects a failure with its status and the body the upstream explained it with, JSON or not", async () => {
    recording(
      () =>
        new Response("Bad gateway: upstream down", {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
    );

    const error = await createFetch({ baseURL: "https://api.example" })
      .get("/a")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HTTPError);
    expect(error).toMatchObject({ status: 502, data: "Bad gateway: upstream down" });
  });

  it("rejects a request that ran out of time as one that got no answer", async () => {
    vi.stubGlobal(
      "fetch",
      (_input: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );

    const error = await createFetch({ baseURL: "https://api.example", timeout: 20 })
      .get("/slow")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HTTPError);
    expect(error).toMatchObject({ status: 0, data: { code: "TIMEOUT" } });
  });
});
