/**
 * The check of where a page's session goes, when it fails to load, is
 * asked for again by the next call: one chunk the network dropped does not
 * refuse every call with a session until the page is loaded anew.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";

vi.mock("../../src/capabilities/registry", () => import("../../src/browser/capabilities/registry"));
let loads = 0;
vi.mock("../../src/session/transport", async (importOriginal) => {
  loads += 1;
  if (loads === 1) throw new Error("Failed to fetch dynamically imported module");
  return importOriginal();
});

const { endpoint } = courier();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a page whose check of its session's transport failed to load once", () => {
  it("loads it again for the next call, which goes", async () => {
    vi.stubGlobal("document", { cookie: "access_token=made-up-token" });
    const sent = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", sent);
    const caller = createCaller(
      defineApi({
        name: "accounts",
        baseURL: "http://localhost:8080",
        session: { bearer: "access_token" },
        endpoints: { me: endpoint.get("me") },
      }),
    );

    const refused = await caller.me().catch((error: unknown) => error);
    await caller.me();

    /* The test's loader wraps what the import failed with; a browser rejects with it as it is. */
    const failure =
      refused instanceof Error && refused.cause instanceof Error ? refused.cause : refused;
    expect(String(failure)).toContain("Failed to fetch dynamically imported module");
    expect(loads).toBe(2);
    expect(sent).toHaveBeenCalledOnce();
  });
});
