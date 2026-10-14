/**
 * A page that calls an endpoint nothing marks for it is answered as for a
 * name the source does not define, in development as in production; only
 * the server's own log says why, while developing, once for each endpoint.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { courier, defineApi } from "../src/define/index";
import type { Context } from "../src/http-client/types";
import { executeRequest } from "../src/utils/execute";

const { endpoint } = courier();

const api = defineApi({
  baseURL: "https://api.example.com",
  endpoints: { health: endpoint.get("health").expose(), audit: endpoint.get("audit") },
});

async function fromPage(method: string) {
  const response = (await executeRequest(
    { api } as never,
    { source: "api", method } as never,
    {
      res: new Response(),
      proxyMethod: "POST",
      req: new Request("https://app.example.com/api/request", { method: "POST" }),
    } as Context & { res: Response },
  )) as Response;
  return { status: response.status, body: await response.text() };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ok: true })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a page's call to an endpoint nothing marks", () => {
  it("is answered as an unknown name is, and the log names the fix while developing", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const refused = await fromPage("audit");
    const unknown = await fromPage("nothing");
    await fromPage("audit");

    expect(refused).toEqual({ status: 400, body: unknown.body.replace("[nothing]", "[audit]") });
    const said = warn.mock.calls.flat().map(String).join("\n");
    expect(
      said.match(/\[api\]\[audit\]: a page called it, and nothing marks it \.expose\(\)/g),
    ).toHaveLength(1);
    expect(said).toContain(
      "Mark it where it is defined if a page may call it, and write the routes again.",
    );
  });

  it("says nothing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    expect((await fromPage("audit")).status).toBe(400);
    expect(warn.mock.calls.flat().map(String).join("\n")).not.toContain("nothing marks it");
  });

  it("is run where the endpoint is marked", async () => {
    expect((await fromPage("health")).status).toBe(200);
  });
});
