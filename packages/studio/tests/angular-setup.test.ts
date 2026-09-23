/**
 * `setupCourierStudio()` for Angular.
 *
 * A browser bundle sees neither courier.config nor `COURIER_STUDIO_URL`, and
 * the setup took no options, so an Angular app could reach a Studio on a
 * non-default address only by writing the global slot by hand.
 */
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
