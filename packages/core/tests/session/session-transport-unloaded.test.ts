/**
 * Where the check of where a page's session goes does not load — a
 * deployment took its chunk away, a policy kept it out — a call that
 * would carry the session over plain HTTP sends nothing: it fails with
 * why the check did not load, before any attempt a retry could repeat.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";

vi.mock("../../src/capabilities/registry", () => import("../../src/browser/capabilities/registry"));
vi.mock("../../src/session/transport", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

const { endpoint } = courier();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a page whose check of its session's transport did not load", () => {
  it("sends nothing over plain HTTP, and refuses the call once", async () => {
    vi.stubGlobal("document", { cookie: "" });
    const sent = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", sent);
    const api = defineApi({
      name: "accounts",
      baseURL: "http://api.example.com",
      session: { cookies: ["sid"] },
      endpoints: { me: endpoint.get("me").retry({ limit: 3, delay: 1, backoff: "fixed" }) },
    });

    const refused = await createCaller(api)
      .me()
      .catch((error: unknown) => error);

    /* The test's loader wraps what the import failed with; a browser rejects with it as it is. */
    const failure =
      refused instanceof Error && refused.cause instanceof Error ? refused.cause : refused;
    expect(String(failure)).toContain("Failed to fetch dynamically imported module");
    expect(sent).not.toHaveBeenCalled();
  });

  it("sends the call to a path on the page's own origin, which asks no more of where it goes", async () => {
    vi.stubGlobal("document", { cookie: "" });
    const sent = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", sent);
    const api = defineApi({
      name: "accounts",
      baseURL: "/api",
      session: { cookies: ["sid"] },
      endpoints: { me: endpoint.get("me") },
    });

    await createCaller(api).me();

    expect(sent).toHaveBeenCalledOnce();
  });

  it("sends the call over HTTPS, which asks no more of where it goes", async () => {
    vi.stubGlobal("document", { cookie: "" });
    const sent = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", sent);
    const api = defineApi({
      name: "accounts",
      baseURL: "https://api.example.com",
      session: { cookies: ["sid"] },
      endpoints: { me: endpoint.get("me") },
    });

    await createCaller(api).me();

    expect(sent).toHaveBeenCalledOnce();
  });
});
