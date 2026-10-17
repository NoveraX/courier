/**
 * The app's origin, learned from a request an Astro route serves. Astro
 * tells no port, so the address it reports must be this machine's; one it
 * cannot report, or another machine's, teaches nothing.
 */
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import { courierHandler } from "../src/index";

/* A source whose endpoint no mark opens: the call is refused before anything is sent. */
const { endpoint } = courier();
const api = defineApi({ baseURL: "http://127.0.0.1:9", endpoints: { ping: endpoint.get("ping") } });
const handler = courierHandler({ sources: { api } });

const context = (host: string, clientAddress?: string) => ({
  request: new Request("http://localhost/api/request?_s=api&_m=ping", { headers: { host } }),
  ...(clientAddress !== undefined && { clientAddress }),
});

afterEach(() => {
  setAppOrigin(undefined);
});

describe("an Astro route learning the app's origin", () => {
  it("learns from this machine", async () => {
    await handler(context("127.0.0.1:4321", "127.0.0.1")).catch(() => undefined);

    expect(getAppOrigin()).toBe("http://127.0.0.1:4321");
  });

  it("learns nothing from another machine, or where Astro reports no address", async () => {
    await handler(context("localhost:4321", "192.168.1.20")).catch(() => undefined);
    await handler(context("localhost:4321")).catch(() => undefined);

    expect(getAppOrigin()).toBeUndefined();
  });
});
