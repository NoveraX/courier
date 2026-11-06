/**
 * A page and a React Native app check where their session goes as each
 * call is made, as a server does. Over plain HTTP across the public
 * internet they send nothing unless the API's session allows it; a host
 * of a private network is reached over HTTP as ever. The core is loaded
 * as a page's bundle takes it, with the registry's stand-in.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";

vi.mock("../../src/capabilities/registry", () => import("../../src/browser/capabilities/registry"));

const { endpoint } = courier();
const sent = vi.fn(async () => Response.json({}));

function api(baseURL: string, allowHttp = false) {
  return defineApi({
    name: "accounts",
    baseURL,
    session: { bearer: "access_token", ...(allowHttp && { allowHttp: true }) },
    endpoints: { me: endpoint.get("me") },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  sent.mockClear();
});

describe.each([
  ["a page", () => vi.stubGlobal("document", { cookie: "access_token=made-up-token" })],
  ["a React Native app", () => vi.stubGlobal("navigator", { product: "ReactNative" })],
])("%s", (_runtime, become) => {
  it("sends no session over plain HTTP across the public internet", async () => {
    become();
    vi.stubGlobal("fetch", sent);

    const refused = await createCaller(api("http://api.example.com"))
      .me()
      .catch((error: unknown) => error);

    expect(refused).toMatchObject({ code: "SESSION_INSECURE_TRANSPORT" });
    expect(String(refused)).toContain(
      "accounts.me: http://api.example.com is reached over plain HTTP",
    );
    expect(sent).not.toHaveBeenCalled();
  });

  it.each([" http://api.example.com", "\thttp://api.example.com", "ht\ttp://api.example.com"])(
    "sends no session to %j, which the address parser reads as plain HTTP",
    async (baseURL) => {
      become();
      vi.stubGlobal("fetch", sent);

      const refused = await createCaller(api(baseURL))
        .me()
        .catch((error: unknown) => error);

      expect(refused).toMatchObject({ code: "SESSION_INSECURE_TRANSPORT" });
      expect(sent).not.toHaveBeenCalled();
    },
  );

  it("sends it where the API's session allows plain HTTP", async () => {
    become();
    vi.stubGlobal("fetch", sent);

    await createCaller(api("http://api.example.com", true)).me();

    expect(sent).toHaveBeenCalledOnce();
  });

  it("sends it over plain HTTP to a host of a private network", async () => {
    become();
    vi.stubGlobal("fetch", sent);

    await createCaller(api("http://localhost:8080")).me();

    expect(sent).toHaveBeenCalledOnce();
  });
});

describe("a page served over plain HTTP", () => {
  function onPage(): void {
    vi.stubGlobal("document", { cookie: "access_token=made-up-token" });
    vi.stubGlobal("location", new URL("http://app.example.com/account"));
    vi.stubGlobal("fetch", sent);
  }

  it.each(["//api.example.com", "/\t/api.example.com"])(
    "sends no session to %j, which takes the page's scheme to another host",
    async (baseURL) => {
      onPage();

      const refused = await createCaller(api(baseURL))
        .me()
        .catch((error: unknown) => error);

      expect(refused).toMatchObject({ code: "SESSION_INSECURE_TRANSPORT" });
      expect(sent).not.toHaveBeenCalled();
    },
  );

  it("sends it to a path on its own origin, which the browser decides for itself", async () => {
    onPage();

    await createCaller(api("/api")).me();

    expect(sent).toHaveBeenCalledOnce();
  });
});
