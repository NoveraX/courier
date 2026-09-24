/**
 * The snippet a build plugin injects: none, and no config read, when
 * injection is off; the connection to the configured Studio otherwise.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadStudioUrl } from "../src/plugins/core/load-studio-url";
import { resolveSnippet } from "../src/plugins/core/resolve-snippet";

vi.mock("../src/plugins/core/load-studio-url", () => ({
  loadStudioUrl: vi.fn(async () => "http://localhost:7123"),
}));

afterEach(() => {
  vi.mocked(loadStudioUrl).mockClear();
  vi.unstubAllEnvs();
});

describe("resolveSnippet", () => {
  it("reads no config when the plugin turns injection off", async () => {
    const snippet = await resolveSnippet("vite", { enabled: false });

    expect(snippet).toBeNull();
    expect(loadStudioUrl).not.toHaveBeenCalled();
  });

  it("reads no config in a production build", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const snippet = await resolveSnippet("vite");

    expect(snippet).toBeNull();
    expect(loadStudioUrl).not.toHaveBeenCalled();
  });

  it("connects to the Studio the config names when injection is on", async () => {
    const snippet = await resolveSnippet("vite", { enabled: true });

    expect(loadStudioUrl).toHaveBeenCalledTimes(1);
    expect(snippet).toContain("http://localhost:7123");
  });
});
