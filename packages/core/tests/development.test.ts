/**
 * The library where there is no `process` at all — a browser loading it as
 * native ESM without a bundler, a Worker without Node compatibility.
 *
 * `defineApi` read `process.env.NODE_ENV` unguarded and threw a
 * ReferenceError there, so an application could not define a single API.
 * The proxy's origin check read it the same way.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { isOriginAccepted } from "../src/adapter/origin-policy";
import { courier, defineApi, defineGroup } from "../src/define";
import { studioHooks } from "../src/studio";
import { isDevelopment } from "../src/utils/development";

const { endpoint } = courier();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  studioHooks.onSourceDefined = undefined;
});

/** Run `fn` with no `process` in scope, as a browser runs it. */
function withoutProcess<TResult>(fn: () => TResult): TResult {
  vi.stubGlobal("process", undefined);
  try {
    return fn();
  } finally {
    vi.unstubAllGlobals();
  }
}

describe("where there is no process", () => {
  it("defines an API", () => {
    const users = defineGroup({ prefix: "users", endpoints: { list: endpoint.get("") } });

    const api = withoutProcess(() => defineApi({ baseURL: "https://api.example", groups: { users } }));

    expect(api.options.baseURL).toBe("https://api.example");
  });

  it("is not taken for development", () => {
    expect(withoutProcess(isDevelopment)).toBe(false);
  });

  it("does not let a loopback origin through, as only development does", () => {
    const accepted = withoutProcess(() =>
      isOriginAccepted("http://localhost:5173", "https://app.example.com"),
    );

    expect(accepted).toBe(false);
  });
});

describe("where NODE_ENV says", () => {
  it("is development outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isDevelopment()).toBe(true);
  });

  it("is not development in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isDevelopment()).toBe(false);
  });

  it("tells Studio about a source defined in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const defined = vi.fn();
    studioHooks.onSourceDefined = defined;

    defineApi({ baseURL: "https://api.example", endpoints: {} });

    expect(defined).toHaveBeenCalledWith(expect.anything(), "https://api.example");
  });
});
