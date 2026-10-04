/**
 * `setupCourierStudio()` for Angular.
 *
 * A browser bundle sees neither courier.config nor `COURIER_STUDIO_URL`, so
 * the setup takes the Studio address as an option, rather than leaving an
 * Angular app to write the global slot by hand.
 *
 * esbuild, which Angular builds with, drops an import only from a branch it
 * can see is dead, so the production check guards the runtime's import
 * itself: an early return ahead of it would still have `ng build` write the
 * runtime and the Socket.IO client out as chunks nothing loads.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { afterEach, describe, expect, it, vi } from "vitest";

const attachRuntime = vi.fn();
vi.mock("@noverax/courier-studio-core/runtime", () => ({ attachRuntime }));

const { setupCourierStudio } = await import("../src/plugins/angular");

const STUDIO_URL_KEY = Symbol.for("courier.studio.url");

afterEach(() => {
  attachRuntime.mockReset();
  vi.unstubAllEnvs();
  delete (globalThis as Record<symbol, unknown>)[STUDIO_URL_KEY];
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("setupCourierStudio()", () => {
  it("connects to the Studio address it is given", async () => {
    setupCourierStudio({ studioUrl: "http://localhost:7000" });
    await settle();

    expect((globalThis as Record<symbol, unknown>)[STUDIO_URL_KEY]).toBe("http://localhost:7000");
    expect(attachRuntime).toHaveBeenCalledWith("angular-browser");
  });

  it("does nothing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    setupCourierStudio({ studioUrl: "http://localhost:7000" });
    await settle();

    expect(attachRuntime).not.toHaveBeenCalled();
    expect((globalThis as Record<symbol, unknown>)[STUDIO_URL_KEY]).toBeUndefined();
  });
});

/**
 * Bundles an app that calls the setup the way Angular's builder does: esbuild,
 * code splitting on, and minified in production, which makes esbuild define
 * `process.env.NODE_ENV` as `"production"`.
 */
async function angularBundle(production: boolean): Promise<string[]> {
  const dir = mkdtempSync(join(tmpdir(), "courier-angular-"));
  try {
    const setup = fileURLToPath(new URL("../src/plugins/angular.ts", import.meta.url));
    writeFileSync(
      join(dir, "main.ts"),
      `import { setupCourierStudio } from ${JSON.stringify(setup)};\nsetupCourierStudio();\nconsole.log("app");\n`,
    );
    const result = await build({
      entryPoints: [join(dir, "main.ts")],
      bundle: true,
      splitting: true,
      format: "esm",
      platform: "browser",
      minify: production,
      outdir: join(dir, "dist"),
      write: false,
      logLevel: "silent",
    });
    return result.outputFiles.map((file) => file.text);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("setupCourierStudio() in an esbuild bundle", () => {
  it("emits the runtime as a chunk of a development build", async () => {
    const files = await angularBundle(false);

    expect(files.some((file) => file.includes("courier.studio.url"))).toBe(true);
  });

  it("emits nothing but the app in a production build", async () => {
    const files = await angularBundle(true);

    expect(files).toHaveLength(1);
    expect(files[0]).toContain('console.log("app")');
    expect(files[0]).not.toContain("courier-studio-core");
  });
});
