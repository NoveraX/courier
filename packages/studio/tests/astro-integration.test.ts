/**
 * The Studio Astro integration, against the context of Astro's config hook.
 *
 * It asked for an injection stage Astro does not have, so nothing was ever
 * injected.
 */
import { describe, expect, it, vi } from "vitest";

import { courierStudio as astroStudio } from "../src/plugins/astro";

describe("courierStudio() for Astro", () => {
  it("adds the Studio Vite plugin under astro dev", () => {
    const updateConfig = vi.fn();

    astroStudio().hooks["astro:config:setup"]({ command: "dev", updateConfig });

    expect(updateConfig).toHaveBeenCalledWith({
      vite: { plugins: [expect.objectContaining({ name: "courier-studio" })] },
    });
  });

  it("leaves builds alone", () => {
    const updateConfig = vi.fn();

    astroStudio().hooks["astro:config:setup"]({ command: "build", updateConfig });

    expect(updateConfig).not.toHaveBeenCalled();
  });
});
