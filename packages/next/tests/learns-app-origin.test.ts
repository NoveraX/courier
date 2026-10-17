/**
 * The app's origin, learned from a request a Next.js route serves. Next
 * gives every request a URL on `localhost` and its own port, whatever Host
 * it came with: a Host of this machine's on that port teaches it, by the
 * name the Host gives; a Host on another port teaches nothing.
 */
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { apiRoute } from "../src/api-route";
import { sseRoute } from "../src/sse-route";

/* A source whose endpoint no mark opens: the call is refused before anything is sent. */
const { endpoint } = courier();
const api = defineApi({ baseURL: "http://127.0.0.1:9", endpoints: { ping: endpoint.get("ping") } });
const route = apiRoute({ sources: { api } });
const stream = sseRoute({ sources: { api } });

/* A request as Next hands it to a route of the dev server on port 3116. */
function asNextGives(host: string): NextRequest {
  return new NextRequest("http://localhost:3116/api/request?_s=api&_m=ping", {
    headers: { host },
  });
}

afterEach(() => {
  setAppOrigin(undefined);
});

describe("a Next.js route learning the app's origin", () => {
  it("learns localhost, 127.0.0.1 and [::1] on the port Next serves on", async () => {
    for (const host of ["localhost:3116", "127.0.0.1:3116", "[::1]:3116"]) {
      setAppOrigin(undefined);
      await route.GET(asNextGives(host)).catch(() => undefined);

      expect(getAppOrigin()).toBe(`http://${host}`);
    }
  });

  it("learns the same from a stream's route, and from a write", async () => {
    await stream.GET(asNextGives("127.0.0.1:3116")).catch(() => undefined);
    expect(getAppOrigin()).toBe("http://127.0.0.1:3116");

    setAppOrigin(undefined);
    const write = new NextRequest("http://localhost:3116/api/request?_s=api&_m=ping", {
      method: "POST",
      headers: { host: "[::1]:3116", "content-type": "application/json" },
      body: "{}",
    });
    await route.POST(write).catch(() => undefined);
    expect(getAppOrigin()).toBe("http://[::1]:3116");
  });

  it("learns nothing from a Host on another port, or one another machine could answer for", async () => {
    for (const host of ["127.0.0.1:7990", "localhost:7990", "0.0.0.0:3116", "evil.example:3116"]) {
      await route.GET(asNextGives(host)).catch(() => undefined);
    }

    expect(getAppOrigin()).toBeUndefined();
  });
});
