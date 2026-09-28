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
    const snippet = await resolveSnippet({
      framework: "vite",
      options: { enabled: false },
      development: true,
    });

    expect(snippet).toBeNull();
    expect(loadStudioUrl).not.toHaveBeenCalled();
  });

  it("reads no config when NODE_ENV is production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const snippet = await resolveSnippet({ framework: "vite", development: true });

    expect(snippet).toBeNull();
    expect(loadStudioUrl).not.toHaveBeenCalled();
  });

  it("reads no config when the bundler builds for production", async () => {
    const snippet = await resolveSnippet({ framework: "webpack", development: false });

    expect(snippet).toBeNull();
    expect(loadStudioUrl).not.toHaveBeenCalled();
  });

  it("connects a production build when the plugin says so", async () => {
    const snippet = await resolveSnippet({
      framework: "webpack",
      options: { enabled: true },
      development: false,
    });

    expect(snippet).toContain('attachRuntime("webpack-browser")');
  });

  it("connects to the Studio the config names when injection is on", async () => {
    const snippet = await resolveSnippet({ framework: "vite", development: true });

    expect(loadStudioUrl).toHaveBeenCalledTimes(1);
    expect(snippet).toContain("http://localhost:7123");
  });
});
