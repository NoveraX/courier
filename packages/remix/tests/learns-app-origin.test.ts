/**
 * The app's origin is never learned from a request a React Router route
 * serves: React Router hands the route no socket, and a request's Host is
 * whoever sends it chooses. Studio's Vite plugin names the dev server the
 * moment it starts.
 */
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import { courierHandler } from "../src/index";

/* A source whose endpoint no mark opens: the call is refused before anything is sent. */
const { endpoint } = courier();
const api = defineApi({ baseURL: "http://127.0.0.1:9", endpoints: { ping: endpoint.get("ping") } });
const handler = courierHandler({ sources: { api } });

afterEach(() => {
  setAppOrigin(undefined);
});

describe("a React Router route and the app's origin", () => {
  it("learns nothing, whatever the Host names", async () => {
    for (const host of ["localhost:5173", "127.0.0.1:5173", "[::1]:5173"]) {
      const request = new Request(`http://${host}/api/request?_s=api&_m=ping`, {
        headers: { host },
      });
      await handler({ request }).catch(() => undefined);
    }

    expect(getAppOrigin()).toBeUndefined();
  });
});
