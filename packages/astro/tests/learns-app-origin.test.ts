/**
 * The app's origin is never learned from a request an Astro route serves:
 * Astro hands the route no socket, and a request's Host is whoever sends it
 * chooses. Studio's Vite plugin names the dev server the moment it starts.
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

describe("an Astro route and the app's origin", () => {
  it("learns nothing from a request, whatever Host it names or wherever it came from", async () => {
    await handler(context("127.0.0.1:4321", "127.0.0.1")).catch(() => undefined);
    await handler(context("localhost:4321")).catch(() => undefined);

    expect(getAppOrigin()).toBeUndefined();
  });
});
