/**
 * The app's origin, learned from a request a Next.js route serves: the
 * address Next records as its server starts, which no request changes.
 * Where a Next version records none, the URL Next gives every request, on
 * the name and port it serves on whatever Host the request came with.
 */
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRoute } from "../src/api-route";
import { sseRoute } from "../src/sse-route";

/* A source whose endpoint no mark opens: the call is refused before anything is sent. */
const { endpoint } = courier();
const api = defineApi({ baseURL: "http://127.0.0.1:9", endpoints: { ping: endpoint.get("ping") } });
const route = apiRoute({ sources: { api } });
const stream = sseRoute({ sources: { api } });

/* A request as Next hands it to a route of the dev server on port 3116, under whatever headers it came with. */
function asNextGives(
  headers: Record<string, string>,
  served = "http://localhost:3116",
): NextRequest {
  return new NextRequest(`${served}/api/request?_s=api&_m=ping`, { headers });
}

afterEach(() => {
  setAppOrigin(undefined);
  vi.unstubAllEnvs();
});

describe("a Next.js route learning the app's origin", () => {
  it("learns the address Next recorded as its server started, whatever scheme a client's X-Forwarded-Proto gave the URL", async () => {
    vi.stubEnv("__NEXT_PRIVATE_ORIGIN", "http://127.0.0.1:3116");

    await route
      .GET(
        asNextGives(
          { host: "localhost:3116", "x-forwarded-proto": "https" },
          "https://localhost:3116",
        ),
      )
      .catch(() => undefined);

    expect(getAppOrigin()).toBe("http://127.0.0.1:3116");
  });

  it("learns the origin Next serves on, whatever the request's headers name", async () => {
    for (const headers of [
      { host: "localhost:3116" },
      { host: "evil.example:4444" },
      { host: "localhost:7990", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" },
    ]) {
      setAppOrigin(undefined);
      await route.GET(asNextGives(headers)).catch(() => undefined);

      expect(getAppOrigin()).toBe("http://localhost:3116");
    }
  });

  it("learns localhost for a dev server on 127.0.0.1, as Next names this machine's loopback", async () => {
    await route
      .GET(asNextGives({ host: "[::1]:3116" }, "http://127.0.0.1:3116"))
      .catch(() => undefined);

    expect(getAppOrigin()).toBe("http://localhost:3116");
  });

  it("learns the same from a stream's route, and from a write", async () => {
    await stream.GET(asNextGives({ host: "evil.example" })).catch(() => undefined);
    expect(getAppOrigin()).toBe("http://localhost:3116");

    setAppOrigin(undefined);
    const write = new NextRequest("http://localhost:3116/api/request?_s=api&_m=ping", {
      method: "POST",
      headers: { host: "evil.example", "content-type": "application/json" },
      body: "{}",
    });
    await route.POST(write).catch(() => undefined);
    expect(getAppOrigin()).toBe("http://localhost:3116");
  });
});
